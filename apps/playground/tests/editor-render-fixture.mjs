import { access, cp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createFixture } from "./native-fixture.mjs";
import { proofComponents, proofPage, proofPresets, proofRenderPage } from "./editor-proof-data.mjs";

// Synthetic installed Components, never supplied by a request. This fixture
// probes the host renderer before the editor depends on it.
export async function createRenderFixture() {
  const root = await createFixture();
  // Reuse the host's installed public router package; do not bundle a second
  // router/context or import private host routing internals.
  const hostRequire = createRequire(
    await realpath(
      fileURLToPath(
        new URL(
          "../../../packages/plugin/node_modules/@emdash-cms/admin/package.json",
          import.meta.url,
        ),
      ),
    ),
  );
  const router = dirname(hostRequire.resolve("@tanstack/react-router/package.json"));
  await mkdir(resolve(root, "src/components"), { recursive: true });
  await mkdir(resolve(root, "src/assets"), { recursive: true });
  await mkdir(resolve(root, "src/proof"), { recursive: true });
  // Borrow an installed font only inside the disposable host. No font download
  // or font binary is added to the repository or shipped with the packages.
  const fonts = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  let font;
  for (const path of fonts) {
    try {
      await access(path);
      font = path;
      break;
    } catch {
      /* try the next installed font */
    }
  }
  if (!font) throw new Error("The native font proof requires installed Arial or DejaVu Sans.");
  await cp(font, resolve(root, "src/assets/proof.ttf"));
  await cp(
    fileURLToPath(
      new URL("../../../packages/plugin/src/admin/preview-channel.ts", import.meta.url),
    ),
    resolve(root, "src/proof-channel.ts"),
  );
  // Compile the installed Hero's actual markup/styles in the synthetic host,
  // adding only the same preview-only selection marker as the proof Components.
  const hero = await readFile(
    new URL("../../../packages/components/src/Hero.astro", import.meta.url),
    "utf8",
  );
  const files = {
    "src/components/ProofHero.astro": hero
      .replace('from "./tokens"', 'from "@kodlab/kerna-components"')
      .replace("  block: Block;", "  block: Block;\n  preview?: boolean;")
      .replace(
        "  id={props.id}",
        "  id={props.id}\n  data-kerna-id={Astro.props.preview ? props.id : undefined}",
      ),
    "src/proof/landing.astro": `---
export const prerender = false;
return new Response("Fixture setup is in progress.", { status: 503 });
---`,
    "src/proof-data.ts": `
import { components } from "@kodlab/kerna-components/registry";
import { createDesignSystem } from "@kodlab/kerna-core";
export const registry = { ...components, ...${JSON.stringify(proofComponents)} };
export const system = createDesignSystem(registry, {});
export const page = ${JSON.stringify(proofPage)};
export const renderPage = ${JSON.stringify(proofRenderPage)};
export const presets = ${JSON.stringify(proofPresets)};
`,
    "src/proof-state.ts": `export const state = { active: 0, completed: 0, maximum: 0, previews: 0 };`,
    "src/components/ProofWork.astro": `---
import { state } from "../proof-state";
const { mode } = Astro.props;
state.active++;
state.maximum = Math.max(state.maximum, state.active);
try {
  if (mode === "sync") {
    const until = performance.now() + 10_250;
    while (performance.now() < until) { /* finite trusted synchronous work */ }
  }
  if (mode === "async") await new Promise(resolve => setTimeout(resolve, 12_000));
} finally {
  state.active--;
  state.completed++;
}
---
<p>{mode === "large" ? "😀".repeat(1_000_001) : "Trusted render settled"}</p>
`,
    "src/middleware.ts": `
import { defineMiddleware } from "astro:middleware";
import { renderPreview } from "@kodlab/kerna";
import { state } from "./proof-state";
// A body keeps Astro from rerouting an empty 404 through its error page.
const reject = (status) => Response.json({ error: "Preview request rejected" }, { status, headers: { "Cache-Control": "private, no-store" } });
export const onRequest = defineMiddleware(async ({ request, locals, url }, next) => {
  if (url.pathname !== "/_emdash/api/proof-render") return next();
  if (!locals.user || locals.user.role < 30) return reject(403);
  if (request.method === "GET")
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return reject(405);
  if (request.headers.get("X-EmDash-Request") !== "1" ||
      (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin))
    return reject(403);
  const mode = url.searchParams.get("mode") ?? "fast";
  if (!["sync", "async", "large", "fast"].includes(mode)) return reject(400);
  locals.proofMode = mode;
  const started = performance.now();
  const response = await renderPreview(next, request.signal);
  response.headers.set("X-Proof-Render-Milliseconds", String(performance.now() - started));
  return response;
});
`,
    "src/proof/render.astro": `---
import Work from "../components/ProofWork.astro";
export const prerender = false;
---
<!doctype html><html lang="en"><head><title>Work proof</title></head><body><Work mode={Astro.locals.proofMode} /></body></html>
`,
    "src/assets/proof.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="#123456" d="M0 0h16v16H0z"/></svg>`,
    "src/components/ProofChild.astro": `---
import image from "../assets/proof.svg";
const { block, preview } = Astro.props;
---
<article data-kerna-id={preview ? block.props.id : undefined} class="proof-child"><h2>{block.props.title}</h2><p>{block.props.count}</p><img src={image.src} alt="Synthetic square" width="16" height="16" /></article>
<style>
@font-face { font-family: ProofLocal; src: url("../assets/proof.ttf") format("truetype"); font-display: swap; }
.proof-child { border: 7px solid var(--proof-ink); padding: 13px; font-family: ProofLocal, sans-serif; }
</style>
`,
    "src/components/ProofBlock.astro": `---
import Child from "./ProofChild.astro";
import Hero from "./ProofHero.astro";
const { block, preview } = Astro.props;
const renderers = { ProofText: Child, Hero };
const Component = renderers[block.type];
if (!Component && block.type !== "ProofColumns") throw new Error("Missing fixture renderer: " + block.type);
---
{Component ? <Component block={block} preview={preview} /> : <div data-kerna-id={preview ? block.props.id : undefined} class="proof-parent">{["left", "right"].map((slot) => (block.props[slot] ?? []).map((child) => <Astro.self block={child} preview={preview} />))}</div>}
<style>.proof-parent { display: grid; gap: 19px; }</style>
`,
    "src/components/ProofDocument.astro": `---
import Block from "./ProofBlock.astro";
import { renderPage as initialPage } from "../proof-data";
import { frameBridge } from "@kodlab/kerna/preview";
import { state } from "../proof-state";
const { page = initialPage, preview: previewData } = Astro.props;
const { binding, nonce } = previewData ?? {};
const preview = !!binding;
if (preview) state.previews++;
const policy = "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline' " + Astro.url.origin + "; img-src data: " + Astro.url.origin + "; font-src data: " + Astro.url.origin + "; connect-src 'none'; form-action 'none'; base-uri " + Astro.url.origin;
---
<!doctype html><html lang="en"><head><meta charset="utf-8" />{preview && <meta http-equiv="Content-Security-Policy" content={policy} />}<base href={new URL("/proof-public", Astro.url).href} /><title>Renderer proof</title><style is:inline>:root{--proof-ink:#123456}</style></head><body><main>{page.content.map((block) => <Block block={block} preview={preview} />)}</main>{preview && <script is:inline data-kerna-bridge={binding.token} nonce={nonce} set:html={"(" + frameBridge.toString() + ")(" + JSON.stringify(binding) + ");"} />}</body></html>
`,
    "src/pages/proof-public.astro": `---
import Document from "../components/ProofDocument.astro";
---
<Document />
`,
  };
  for (const [path, text] of Object.entries(files)) await writeFile(resolve(root, path), text);
  const config = await readFile(resolve(root, "astro.config.mjs"), "utf8");
  await writeFile(
    resolve(root, "astro.config.mjs"),
    config
      .replace(
        'import { designSystem, presets } from "./src/kerna.ts";',
        'import { registry, system, presets } from "./src/proof-data.ts";',
      )
      .replace(
        'import { kernaAstro } from "@kodlab/kerna/astro";',
        'import { kernaAstro } from "@kodlab/kerna/astro";\nimport { registry, system } from "./src/proof-data.ts";',
      )
      .replace(
        'kernaAstro({ document: "./src/components/KernaPageDocument.astro", components, designSystem })',
        'kernaAstro({ document: "./src/components/ProofDocument.astro", components: registry, designSystem: system })',
      )
      .replace(
        "kerna({ designSystem, presets })",
        "kerna({ components: registry, designSystem: system, presets })",
      )
      .replace(
        "integrations: [",
        `integrations: [{
      name: "kerna-native-render-proof",
      hooks: { "astro:config:setup": ({ injectRoute }) => {
        injectRoute({ pattern: "/_emdash/api/proof-render", entrypoint: "./src/proof/render.astro", prerender: false });
        injectRoute({ pattern: "/__kerna-task13-proof", entrypoint: "./src/proof/landing.astro", prerender: false });
      } },
    },`,
      )
      .replace(
        'output: "server",',
        'output: "server",\n  vite: { resolve: { alias: { "@tanstack/react-router": ' +
          JSON.stringify(router) +
          ' } } },\n  security: { allowedDomains: [{ hostname: "127.0.0.1", protocol: "http" }] },\n  build: { inlineStylesheets: "never" },',
      ),
  );
  return root;
}
