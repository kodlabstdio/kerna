import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const playground = fileURLToPath(new URL("../", import.meta.url));

function fixtureEnvironment() {
  const env = { ...process.env };
  // Vitest exports DEV=1/PROD=""/MODE=test. Astro's private-env transform
  // would inline those strings before Vite's production booleans, silently
  // removing production-only auth/CSP branches from a real host build.
  for (const key of [
    "DEV",
    "PROD",
    "MODE",
    "BASE_URL",
    "SSR",
    "VITEST",
    "VITEST_MODE",
    "VITEST_POOL_ID",
    "VITEST_WORKER_ID",
  ])
    delete env[key];
  return env;
}

// Register with the runner before asynchronous work; closing also rejects late work.
export function createLifecycle() {
  const stops = new Set();
  let closed = false;
  return {
    /**
     * @param {string} command
     * @param {string[]} args
     * @param {import("node:child_process").SpawnOptions} [options]
     * @returns {{ child: import("node:child_process").ChildProcess, stop: () => Promise<void> }}
     */
    spawn(command, args, options) {
      if (closed) throw new Error("Fixture lifecycle is closed");
      const child = spawn(command, args, options);
      let stopping;
      const stop = () => {
        if (stopping) return stopping;
        if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
        stopping = (async () => {
          const exited = once(child, "exit");
          child.kill("SIGTERM");
          const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
          try {
            await exited;
          } finally {
            clearTimeout(timeout);
          }
        })();
        return stopping;
      };
      stops.add(stop);
      child.once("exit", () => stops.delete(stop));
      return { child, stop };
    },
    async stop() {
      closed = true;
      await Promise.all([...stops].map((stop) => stop()));
    },
  };
}

// Copy only the public host inputs. Never copy a database, sessions or uploads.
export async function createFixture() {
  await mkdir(resolve(playground, ".astro"), { recursive: true });
  const root = await mkdtemp(resolve(playground, ".astro/native-"));
  for (const name of ["src", "seed", "package.json", "tsconfig.json"]) {
    await cp(resolve(playground, name), resolve(root, name), { recursive: true });
  }
  await symlink(resolve(playground, "node_modules"), resolve(root, "node_modules"));
  await writeFile(resolve(root, "astro.config.mjs"), await fixtureConfig());
  return root;
}

async function fixtureConfig() {
  const config = await readFile(resolve(playground, "astro.config.mjs"), "utf8");
  // Supported EmDash option: the offline fixture uses system fonts, avoiding
  // the admin font provider's build-time Google download. Host code is unchanged.
  return config.replace("emdash({", "emdash({\n      fonts: false,\n      updateCheck: false,");
}

export async function startHost(root, production = false, lifecycle = createLifecycle(), port = 0) {
  // Public fixture fonts only. This is host HTTP configuration, never private
  // preview/API CORS. The Node standalone adapter does not add it itself.
  const fontHeaders = `function fontHeaders(request, response) {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (/^\\/(?:src\\/assets\\/proof\\.ttf|_astro\\/proof\\.[\\w-]+\\.ttf)$/.test(path))
      response.setHeader('Access-Control-Allow-Origin', '*');
  }`;
  const script = production
    ? `const {startServer}=await import('./dist/server/entry.mjs');
       const host=startServer();
       ${fontHeaders}
       host.server.server.prependListener('request', fontHeaders);
       host.server.server.on('listening',()=>console.log('FIXTURE_ORIGIN=http://127.0.0.1:'+host.server.server.address().port));
       process.on('SIGTERM',async()=>{await host.server.stop();process.exit()});`
    : `const {dev}=await import(${JSON.stringify(resolve(playground, "node_modules/astro/dist/core/index.js"))});
       const {readFile}=await import('node:fs/promises');
       ${fontHeaders}
       const server=await dev({root:process.cwd(),server:{host:'127.0.0.1',port:${port}},
         vite:{plugins:[{name:'fixture-public-fonts',configureServer(server){
           // Astro's dev Fetch Metadata boundary denies opaque-origin assets.
           // Deliver these two explicitly public fixture files before that
           // boundary, without exposing source modules or changing its policy.
           const http=server.httpServer;
           const handlers=http.listeners('request');
           for(const handler of handlers) http.removeListener('request',handler);
           http.on('request',async(req,res)=>{
             const next=()=>{for(const handler of handlers) handler.call(http,req,res)};
             const path=new URL(req.url,'http://localhost').pathname;
             const files=new Map([
               ['/@fs'+process.cwd()+'/src/assets/proof.svg',['proof.svg','image/svg+xml']],
               ['/src/assets/proof.ttf',['proof.ttf','font/ttf']],
             ]);
             const file=files.get(path);
             if(!file || !['GET','HEAD'].includes(req.method)) return next();
             try {
               const bytes=await readFile(process.cwd()+'/src/assets/'+file[0]);
               fontHeaders(req,res);
               res.setHeader('Content-Type',file[1]);
               res.setHeader('Cache-Control','no-cache');
               res.end(req.method==='HEAD'?undefined:bytes);
             } catch { next(); }
           });
         }}]}});
       console.log('FIXTURE_ORIGIN=http://127.0.0.1:'+server.address.port);
       process.on('SIGTERM',async()=>{await server.stop();process.exit()});`;
  const { child, stop } = lifecycle.spawn(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      cwd: root,
      // Astro deliberately omits its HTTP middleware under VITEST. This child
      // is a real host process, not a component test environment.
      env: {
        ...fixtureEnvironment(),
        NODE_ENV: production ? "production" : "development",
        ASTRO_NODE_AUTOSTART: "disabled",
        ASTRO_TELEMETRY_DISABLED: "1",
        ASTRO_DISABLE_UPDATE_CHECK: "true",
        TMPDIR: root,
        HOST: "127.0.0.1",
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  try {
    const origin = await new Promise((accept, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Host startup timed out: ${output}`)),
        60_000,
      );
      const read = (chunk) => {
        output += chunk.toString();
        const match = output.match(/FIXTURE_ORIGIN=(http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          accept(match[1]);
        }
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Host exited ${code}: ${output}`));
      });
    });
    return {
      origin,
      stop,
      logs: () => output.replace(/_preview=[^\s"<>]+/g, "_preview=[redacted]"),
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function buildHost(root, lifecycle = createLifecycle()) {
  const { child, stop } = lifecycle.spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const {build}=await import(${JSON.stringify(resolve(playground, "node_modules/astro/dist/core/index.js"))});await build({root:process.cwd()});`,
    ],
    {
      cwd: root,
      env: {
        ...fixtureEnvironment(),
        NODE_ENV: "production",
        ASTRO_TELEMETRY_DISABLED: "1",
        ASTRO_DISABLE_UPDATE_CHECK: "true",
        TMPDIR: root,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 90_000);
  try {
    const [code] = await once(child, "exit");
    if (code !== 0) throw new Error(`Production build failed: ${output}`);
  } finally {
    clearTimeout(timeout);
    await stop();
  }
}

export function client(origin, cookie = "", timeoutMs = 10_000) {
  const send = async (path, body, method = body === undefined ? "GET" : "POST", overrides = {}) => {
    const headers = new Headers();
    if (cookie) headers.set("Cookie", cookie);
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      headers.set("X-EmDash-Request", "1");
    }
    for (const [name, value] of Object.entries(overrides)) {
      if (value === null) headers.delete(name);
      else headers.set(name, value);
    }
    const request = new Request(new URL(path, origin), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!cookie && (request.headers.has("Cookie") || request.headers.has("Authorization"))) {
      throw new Error("Anonymous/preview client acquired credentials");
    }
    const response = await fetch(request);
    // Headers alone do not finish the request; consume under the same deadline.
    const bytes = await response.arrayBuffer();
    return new Response(response.status === 204 || response.status === 304 ? null : bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  // Carry only this synthetic fixture's in-memory session across its dev/build
  // restart. No developer database or persisted session is read.
  return Object.assign(send, { at: (nextOrigin) => client(nextOrigin, cookie, timeoutMs) });
}

export async function api(request, path, body, method) {
  const response = await request(`/_emdash/api/${path}`, body, method);
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${method ?? "POST"} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result.data;
}

export async function setup(origin, timeoutMs = 10_000) {
  const response = await client(origin)("/_emdash/api/setup/dev-bypass?content=0", {});
  if (!response.ok)
    throw new Error(`Native setup failed: ${response.status} ${await response.text()}`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("Native setup did not establish an admin session");
  const admin = client(origin, cookie, timeoutMs);
  await api(admin, "schema/collections", {
    slug: "kerna_pages",
    label: "Kerna Pages",
    labelSingular: "Kerna Page",
    supports: ["drafts", "revisions", "preview"],
    urlPattern: "/kerna/{slug}",
  });
  for (const field of [
    { slug: "title", label: "Title", type: "string", required: true },
    { slug: "page", label: "Page", type: "json", required: true },
  ])
    await api(admin, "schema/collections/kerna_pages/fields", field);
  // A distinct session exercises authenticated edit mode, never reused by preview.
  const editorResponse = await client(origin)("/_emdash/api/auth/dev-bypass", {});
  if (!editorResponse.ok) throw new Error("Native editor session failed");
  const editorCookie = editorResponse.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!editorCookie || editorCookie === cookie) throw new Error("Editor session must be separate");
  return { admin, editor: client(origin, `${editorCookie}; emdash-edit-mode=true`, timeoutMs) };
}

export function page(title, id = "hero") {
  return {
    formatVersion: 1,
    root: { props: {} },
    content: [{ type: "Hero", props: { id, variant: "centered", title } }],
  };
}

export async function createPage(admin, slug, title, id) {
  const result = await api(admin, "content/kerna_pages", {
    slug,
    data: { title, page: page(title, id) },
  });
  return result.item.id;
}
