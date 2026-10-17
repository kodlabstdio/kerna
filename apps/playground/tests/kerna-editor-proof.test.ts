/// <reference types="node" />
import { expect, onTestFinished, test } from "vite-plus/test";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import {
  api,
  buildHost,
  client,
  createFixture,
  createLifecycle,
  createPage,
  page,
  setup,
  startHost,
} from "./native-fixture.mjs";
import { createRenderFixture } from "./editor-render-fixture.mjs";
import { proofBinding, proofPage, proofRenderPage } from "./editor-proof-data.mjs";
import { packFixture } from "./packed-fixture.mjs";

test("private native preview rejects denied requests before render admission", async () => {
  const lifecycle = createLifecycle();
  onTestFinished(() => lifecycle.stop());
  const root = await createRenderFixture();
  const host = await startHost(root, false, lifecycle);
  const { admin, editor } = await setup(host.origin);
  const created = await api(admin, "content/kerna_pages", {
    slug: "private-proof",
    data: { title: "Private proof", page: proofPage },
  });
  const body = { id: created.item.id, page: proofPage, binding: proofBinding };
  const path = "/_emdash/api/kerna-preview";
  // Native smoke: real session enforcement and request-marker forwarding.
  // The request/validation matrix runs in memory in plugin/tests/astro.test.ts.
  const denied = [
    [await client(host.origin)(path, body), 401],
    [await admin(path, body, "POST", { "X-EmDash-Request": null }), 403],
  ] as const;
  for (const [response, status] of denied) {
    const text = await response.text();
    expect(response.status, `${status}: ${text}\n${host.logs()}`).toBe(status);
    expect(text).not.toContain("Nested Block");
  }
  // Only the disposable fixture's role changes. No session or developer data is read.
  const db = new DatabaseSync(resolve(root, "data.db"));
  try {
    db.exec("UPDATE users SET role = 20");
    const forbidden = await editor(path, body);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).not.toContain("Nested Block");
  } finally {
    db.exec("UPDATE users SET role = 50");
    db.close();
  }
  expect((await (await admin("/_emdash/api/proof-state")).json()).previews).toBe(0);
  const accepted = await editor(path, body);
  expect(accepted.status).toBe(200);
  const html = await accepted.text();
  expect(html).toContain("Nested Block");
  expect(html).not.toContain('id="emdash-toolbar"');
  expect(accepted.headers.get("Cache-Control")).toContain("no-store");
  const image = html.match(/<img\b[^>]*src="([^"]+)"/)![1]!.replaceAll("&amp;", "&");
  const svg = await client(host.origin)(image, undefined, "GET", {
    Origin: "null",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Site": "cross-site",
  });
  expect(svg.status, await svg.text()).toBe(200);
  const state = await (await admin("/_emdash/api/proof-state")).json();
  expect(state.previews).toBe(1);
  const documents = await Promise.all(
    ["Session A", "Session B"].map(async (title) => {
      const page = structuredClone(proofPage);
      page.content[0]!.props.left[0]!.props.title = title;
      const response = await admin(path, { ...body, page });
      expect(response.status).toBe(200);
      return response.text();
    }),
  );
  expect(documents[0]).toContain("Session A");
  expect(documents[0]).not.toContain("Session B");
  expect(documents[1]).toContain("Session B");
  expect(documents[1]).not.toContain("Session A");
  const empty = await admin(path, { ...body, page: { ...proofPage, content: [] } });
  expect(empty.status).toBe(200);
  expect(await empty.text()).toContain("<main></main>");
  const anonymousPage = await client(host.origin)(`/_emdash/api/content/kerna_pages/${body.id}`);
  expect(anonymousPage.status).toBe(401);
  expect(await anonymousPage.text()).not.toContain("Nested Block");
  const missingPage = await editor("/_emdash/api/content/kerna_pages/missing");
  expect(missingPage.status).toBe(404);
}, 120_000);

// Exercise the native draft boundary before enabling editor Save. The fixture
// owns fresh data and sessions; it never reads the developer's host database.
test("editor prerequisite: native drafts reject stale and simultaneous writers", async () => {
  const lifecycle = createLifecycle();
  onTestFinished(() => lifecycle.stop());
  const root = await createFixture();
  const host = await startHost(root, false, lifecycle);
  const { admin, editor } = await setup(host.origin);
  const id = await createPage(admin, "editor-proof", "Original Page");
  const path = `content/kerna_pages/${id}`;
  const original = await api(admin, path);
  expect(original._rev).toBeTypeOf("string");
  expect(original._rev.length).toBeGreaterThan(0);
  const saved = await api(
    admin,
    path,
    {
      _rev: original._rev,
      data: { page: page("Saved draft") },
    },
    "PUT",
  );
  expect(saved._rev).not.toBe(original._rev);
  const reopened = await api(editor, path);
  expect(reopened.item.data.page).toEqual(page("Saved draft"));
  expect(reopened.item.status).toBe("draft");
  expect(reopened._rev).toBe(saved._rev);

  const stale = await admin(
    `/_emdash/api/${path}`,
    {
      _rev: original._rev,
      data: { page: page("Stale writer") },
    },
    "PUT",
  );
  expect(stale.status).toBe(409);
  expect((await stale.json()).error.code).toBe("CONFLICT");
  expect((await api(admin, path)).item.data.page).toEqual(page("Saved draft"));

  // Distinct native sessions, the same server revision and competing content.
  const writes = await Promise.all(
    [admin, editor].map((request, index) =>
      request(
        `/_emdash/api/${path}`,
        {
          _rev: reopened._rev,
          data: { page: page(`Writer ${index}`) },
        },
        "PUT",
      ),
    ),
  );
  expect(writes.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
  const winner = writes.findIndex((response) => response.status === 200);
  const loser = writes.find((response) => response.status === 409)!;
  expect((await loser.json()).error.code).toBe("CONFLICT");
  const final = await api(admin, path);
  expect(final.item.data.page).toEqual(page(`Writer ${winner}`));
  expect(final.item.status).toBe("draft");
  expect(final._rev).not.toBe(reopened._rev);
  const anonymous = await client(host.origin)("/kerna/editor-proof");
  expect(anonymous.status).toBe(404);
  expect(await anonymous.text()).not.toContain(`Writer ${winner}`);
}, 120_000);

// Integration boundary: only an installed package and compiled Astro host can
// establish development/production CSS, nested output and served asset parity.
test("host-compiled native route preview preserves nested production CSS and assets", async () => {
  const lifecycle = createLifecycle();
  onTestFinished(() => lifecycle.stop());
  const root = await createRenderFixture();
  await packFixture(root);
  const host = await startHost(root, false, lifecycle);
  const { admin } = await setup(host.origin, 30_000);
  const item = await api(admin, "content/kerna_pages", {
    slug: "nested",
    data: { title: "Nested proof", page: proofRenderPage },
  });
  const body = { id: item.item.id, page: proofRenderPage, binding: proofBinding };
  const preview = await admin("/_emdash/api/kerna-preview", body);
  expect(preview.status).toBe(200);
  const html = await preview.text();
  expect(html).toContain('data-kerna-id="child"');
  expect(html).toContain("--proof-ink:#123456");
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).not.toContain('id="emdash-toolbar"');
  expect(html).toContain('http-equiv="Content-Security-Policy"');
  expect(html).toContain("connect-src 'none'");
  const styles = async (text: string, origin: string) => {
    const inline = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
      .map((match) => match[1])
      .join("\n");
    const links = [...text.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g)].filter((match) =>
      match[0].includes('rel="stylesheet"'),
    );
    const external = await Promise.all(
      links.map(async (match) => {
        const response = await client(origin)(match[1]);
        expect(response.status).toBe(200);
        return response.text();
      }),
    );
    return inline + external.join("\n");
  };
  const devCss = await styles(html, host.origin);
  const asset = async (text: string, origin: string) => {
    const src = text.match(/<img\b[^>]*src="([^"]+)"/)?.[1];
    if (!src) return false;
    const response = await client(origin)(src);
    return response.status === 200 && (await response.text()).includes("#123456");
  };
  const devAsset = await asset(html, host.origin);
  await host.stop();
  await buildHost(root, lifecycle);
  const production = await startHost(root, true, lifecycle);
  const published = await client(production.origin)("/proof-public");
  expect(published.status).toBe(200);
  const publicHtml = await published.text();
  const publicCss = await styles(publicHtml, production.origin);
  const productionPreview = await admin.at(production.origin)(
    "/_emdash/api/kerna-preview",
    body,
    "POST",
    { Origin: production.origin },
  );
  expect(productionPreview.status).toBe(200);
  const productionHtml = await productionPreview.text();
  for (const output of [html, productionHtml, publicHtml]) {
    expect(output).toContain("Nested Block");
    expect(output).toContain("New text");
    expect(output).toContain("Welcome");
    expect(output.match(/<main\b/g)).toHaveLength(1);
  }
  for (const output of [html, productionHtml])
    expect(output).toContain('data-kerna-component="Hero"');
  for (const output of [html, productionHtml]) {
    for (const id of ["parent", "child", "preset-text", "preset-hero"])
      expect(output).toContain(`data-kerna-id="${id}"`);
  }
  // Identical semantic body from the shared host renderer, except for
  // preview-only selection/component markers and the private channel bootstrap.
  const bodyMarkup = (output: string) =>
    output
      .match(/<main>[\s\S]*?<\/main>/)![0]
      .replace(/ data-kerna-id="[^"]+"/g, "")
      .replace(/ data-kerna-component="[^"]+"/g, "");
  expect(bodyMarkup(productionHtml)).toBe(bodyMarkup(publicHtml));
  expect(productionHtml).not.toContain('id="emdash-toolbar"');
  expect(productionPreview.headers.get("Content-Security-Policy")).toContain("frame-ancestors");
  expect(publicHtml).not.toContain("data-kerna-id");
  expect(publicHtml).not.toContain("data-kerna-component");
  expect(publicHtml).not.toContain("<script");
  const productionCss = await styles(productionHtml, production.origin);
  const localFont = async (css: string, origin: string, opaqueFrame = false) => {
    const url = css.match(/url\(["']?([^\s)"']+\.ttf(?:\?[^\s)"']*)?)["']?\)/)?.[1];
    expect(url, "Host compilation must retain the nested Component's local font").toBeTruthy();
    const response = await client(origin)(
      url!,
      undefined,
      "GET",
      opaqueFrame ? { Origin: "null" } : {},
    );
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0, 1, 0, 0]));
    if (opaqueFrame)
      expect(
        response.headers.get("Access-Control-Allow-Origin"),
        "The sandboxed preview's opaque origin needs CORS permission to load the compiled local font",
      ).toBe("*");
    return bytes.byteLength > 1_000;
  };
  expect(await localFont(publicCss, production.origin)).toBe(true);
  expect(await localFont(productionCss, production.origin, true)).toBe(true);
  expect(productionHtml).toContain("<title>Renderer proof</title>");
  expect(productionHtml).toContain(`<base href="${production.origin}/proof-public"`);
  expect(productionHtml.match(/<script\b/g)).toHaveLength(1);
  expect(productionHtml).toMatch(/<script[^>]*nonce="[^"]+"/);
  // Compare the actual nested style, not just a scope attribute on unstyled HTML.
  const nestedStyle = (css: string) => css.includes(".proof-child") && /border:\s*7px/.test(css);
  const evidence = {
    publicProduction: {
      nestedStyle: nestedStyle(publicCss),
      asset: await asset(publicHtml, production.origin),
    },
    previewDevelopment: { nestedStyle: nestedStyle(devCss), asset: devAsset },
    previewProduction: {
      nestedStyle: nestedStyle(productionCss),
      asset: await asset(productionHtml, production.origin),
    },
  };
  console.info(JSON.stringify(evidence));
  expect(evidence).toEqual({
    publicProduction: { nestedStyle: true, asset: true },
    previewDevelopment: { nestedStyle: true, asset: true },
    previewProduction: { nestedStyle: true, asset: true },
  });
}, 120_000);
