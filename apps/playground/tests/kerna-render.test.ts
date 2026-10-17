/// <reference types="node" />
import { expect, onTestFinished, test } from "vite-plus/test";
import { createServer } from "node:http";
import { rm } from "node:fs/promises";
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

// Integration boundary: native signing, published snapshots and storage failure
// isolation must hold through EmDash's real routing and content repository.
test("native publication and preview keep drafts out of anonymous responses", async () => {
  const lifecycle = createLifecycle();
  onTestFinished(() => lifecycle.stop());
  const root = await createFixture();
  let host: Awaited<ReturnType<typeof startHost>> | undefined;
  try {
    host = await startHost(root, false, lifecycle);
    const { admin, editor } = await setup(host.origin);
    const anonymous = client(host.origin);
    const preview = client(host.origin);
    const published = await createPage(admin, "published", "Published marker");
    const draft = await createPage(admin, "draft", "PRIVATE draft marker");
    await api(admin, `content/kerna_pages/${published}/publish`, {});
    await api(
      admin,
      `content/kerna_pages/${published}`,
      {
        data: { title: "Newer draft", page: page("PRIVATE newer marker") },
      },
      "PUT",
    );
    const publishedPreview = await api(admin, `content/kerna_pages/${published}/preview-url`, {});
    const draftPreview = await api(admin, `content/kerna_pages/${draft}/preview-url`, {});
    const publicPage = async () => {
      const response = await anonymous("/kerna/published");
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Published marker");
      expect(html).toContain("<header>");
      expect(html).toContain("<main>");
      expect(html).not.toContain("PRIVATE");
      expect(html).not.toContain("Preview — unpublished changes");
    };
    const previewPage = async () => {
      const response = await preview(publishedPreview.url);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("PRIVATE newer marker");
      expect(html).toContain("Preview — unpublished changes");
    };
    await publicPage();
    await previewPage();
    await publicPage();
    await previewPage();
    const hidden = await anonymous("/kerna/draft");
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).not.toContain("PRIVATE");
    expect(await (await preview(draftPreview.url)).text()).toContain("PRIVATE draft marker");
    expect(await (await editor("/kerna/published")).text()).toContain("PRIVATE newer marker");

    const expired = await api(admin, `content/kerna_pages/${published}/preview-url`, {
      expiresIn: -1,
    });
    const wrongEntry = new URL(draftPreview.url, host.origin).search;
    await api(admin, "schema/collections", {
      slug: "other_pages",
      label: "Other Pages",
      supports: ["drafts", "revisions", "preview"],
    });
    const other = await api(admin, "content/other_pages", { slug: "other", data: {} });
    // EmDash 1.2 generates IDs with no API to choose one. Align only this
    // disposable row identity; preview signing and authorization remain native.
    const identities = new DatabaseSync(resolve(root, "data.db"));
    try {
      identities
        .prepare("UPDATE ec_other_pages SET id = ? WHERE id = ?")
        .run(published, other.item.id);
      expect(
        identities.prepare("SELECT id FROM ec_other_pages WHERE id = ?").get(published)?.id,
      ).toBe(published);
    } finally {
      identities.close();
    }
    const wrongCollection = await api(admin, `content/other_pages/${published}/preview-url`, {});
    expect(new URL(wrongCollection.url, host.origin).pathname).toBe(`/other_pages/${published}`);
    const matching = new URL(publishedPreview.url, host.origin);
    const token = matching.searchParams.get("_preview")!;
    matching.searchParams.set("_preview", `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`);
    for (const query of [
      matching.search,
      new URL(expired.url, host.origin).search,
      wrongEntry,
      new URL(wrongCollection.url, host.origin).search,
    ]) {
      const response = await preview(`/kerna/published${query}`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Published marker");
      expect(html).not.toContain("PRIVATE");
      expect(html).not.toContain("Preview — unpublished changes");
      const hiddenResponse = await preview(
        `/kerna/draft${query === wrongEntry ? new URL(publishedPreview.url, host.origin).search : query}`,
      );
      expect(hiddenResponse.status).toBe(404);
      expect(await hiddenResponse.text()).not.toContain("PRIVATE");
    }

    for (const slug of ["missing", "%25", "%20"]) {
      const response = await anonymous(`/kerna/${slug}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("This Page is unavailable.");
    }

    const invalid = await createPage(admin, "invalid", "Stored invalid");
    await api(admin, `content/kerna_pages/${invalid}/publish`, {});
    // EmDash 1.2 stores live field values in ec_<collection>. The native
    // beforeSave hook correctly rejects corruption, so read-failure fixtures
    // alone use this localized SQLite seam. Auth and queries remain native.
    const db = new DatabaseSync(resolve(root, "data.db"));
    try {
      db.prepare("UPDATE ec_kerna_pages SET page = ? WHERE id = ?").run(
        JSON.stringify({ ...page("PRIVATE invalid"), formatVersion: 999 }),
        invalid,
      );
      const response = await anonymous("/kerna/invalid");
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<p>This Page is unavailable.</p>");
      expect(html).not.toContain("PRIVATE");
      expect(html).not.toContain("data-kerna-component");

      // Fail only the entry table: settings, menus, auth and schema survive.
      db.exec("ALTER TABLE ec_kerna_pages RENAME COLUMN slug TO fixture_unavailable_slug");
      try {
        const failure = await anonymous("/kerna/published");
        expect(failure.status).toBe(500);
        const body = await failure.text();
        expect(body).toContain("<p>This Page is unavailable.</p>");
        expect(body).toContain("<header>");
        expect(body).toContain("EmDash");
        expect(body).not.toMatch(/PRIVATE|SQLITE|no such column|fixture_unavailable_slug/);
        expect((await admin("/_emdash/api/settings")).status).toBe(200);
        expect((await admin("/_emdash/api/menus")).status).toBe(200);
      } finally {
        db.exec("ALTER TABLE ec_kerna_pages RENAME COLUMN fixture_unavailable_slug TO slug");
      }
    } finally {
      db.close();
    }
    await api(admin, `content/kerna_pages/${published}/publish`, {});
    expect(await (await anonymous("/kerna/published")).text()).toContain("PRIVATE newer marker");
    await api(admin, `content/kerna_pages/${published}/unpublish`, {});
    const unpublished = await anonymous("/kerna/published");
    expect(unpublished.status).toBe(404);
    expect(await unpublished.text()).not.toContain("PRIVATE");

    const staticPage = await createPage(admin, "static", "Static Hero");
    await api(admin, `content/kerna_pages/${staticPage}/publish`, {});
    await host.stop();
    await buildHost(root, lifecycle);
    const production = await startHost(root, true, lifecycle);
    try {
      for (const [slug, expected] of [
        ["static", "Static Hero"],
        ["invalid", "This Page is unavailable."],
      ]) {
        const response = await client(production.origin)(`/kerna/${slug}`);
        expect(response.status).toBe(200);
        const html = await response.text();
        expectMainContent(html, slug!, expected!);
        expect(html).toContain("<header>");
        expect(html).toContain("<main>");
        expectStaticHtml(html);
        expect(html).not.toContain("PRIVATE");
      }
    } finally {
      await production.stop();
    }
  } catch (error) {
    if (host) console.error(host.logs());
    throw error;
  } finally {
    await lifecycle.stop();
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);

function expectMainContent(html: string, slug: string, expected: string) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  expect(main).toBeDefined();
  if (slug === "static") {
    const hero = main!.match(/<section\b(?=[^>]*\bid="hero")[^>]*>([\s\S]*?)<\/section>/i)?.[1];
    expect(hero).toBeDefined();
    expect(hero).toMatch(/<h1\b[^>]*>Static Hero<\/h1>/);
    expect(main).not.toContain("data-kerna-component");
  } else {
    expect(main).toContain(`<p>${expected}</p>`);
    expect(main).not.toContain("data-kerna-component");
  }
}

function expectStaticHtml(html: string) {
  // Inspect original spans; only a validated JSON-LD body is exempt from markup checks.
  const forbiddenMarkup = /<astro-island\b|\bclient:|\son\w+\s*=|(?:javascript|vbscript)\s*:/i;
  const scripts = /<\/?script\b/gi;
  let cursor = 0;
  let script: RegExpExecArray | null;
  while ((script = scripts.exec(html))) {
    expect(html.slice(cursor, script.index)).not.toMatch(forbiddenMarkup);
    // The fixture emits only this shape. Reject extra/duplicate attributes,
    // including src and misleading data-type attributes, rather than guessing.
    const opening = html
      .slice(script.index)
      .match(
        /^<script[\t\n\f\r ]+type[\t\n\f\r ]*=[\t\n\f\r ]*(["'])application\/ld\+json\1[\t\n\f\r ]*>/i,
      );
    expect(opening).not.toBeNull();
    const bodyStart = script.index + opening![0].length;
    const closing = /<\/script\b/gi;
    closing.lastIndex = bodyStart;
    const end = closing.exec(html);
    expect(end).not.toBeNull();
    const boundary = html.slice(end!.index).match(/^<\/script[\t\n\f\r ]*>/i);
    expect(boundary).not.toBeNull();
    const body = html.slice(bodyStart, end!.index);
    // HTML comment escapes can change how browsers recognize script boundaries.
    expect(body).not.toContain("<!--");
    expect(() => JSON.parse(body)).not.toThrow();
    cursor = end!.index + boundary![0].length;
    scripts.lastIndex = cursor;
  }
  expect(html.slice(cursor)).not.toMatch(forbiddenMarkup);
}

const jsonLd = '<script type="application/ld+json">{"name":"Page"}</script>';

test.each([
  ["plain static HTML", "<main><h1>Static Hero</h1></main>"],
  ["JSON-LD", jsonLd],
  ["multiple JSON-LD scripts", `${jsonLd}<main>Page</main>${jsonLd}`],
  ["whitespace closing tag", '<script type="application/ld+json">{}</script \n\t>'],
  ["case and attribute whitespace", "<SCRIPT\nTYPE = 'application/ld+json' >{}</SCRIPT>"],
  [
    "script-looking JSON strings",
    '<script type="application/ld+json">{"text":"<script>example <astro-island> client:load onclick= javascript: vbscript: <\\/script>"}</script>',
  ],
])("static HTML assertion accepts %s", (_name, html) => {
  expect(() => expectStaticHtml(html)).not.toThrow();
});

test.each([
  ["inline script", "<script>alert(1)</script>"],
  ["inline script with whitespace closing tag", "<script>alert(1)</script >"],
  ["external script", '<script src="/client.js"></script>'],
  ["external JSON-LD", '<script type="application/ld+json" src="/client.js">{}</script>'],
  ["boolean src", '<script type="application/ld+json" src>{}</script>'],
  ["misleading data-type", '<script data-type="application/ld+json">{}</script>'],
  ["type inside another attribute", `<script title='type="application/ld+json"'>{}</script>`],
  ["duplicate type", '<script type="text/javascript" type="application/ld+json">{}</script>'],
  [
    "reversed duplicate type",
    '<script type="application/ld+json" type="text/javascript">{}</script>',
  ],
  ["mismatched quotes", `<script type="application/ld+json'>{}</script>`],
  ["missing opening boundary", '<script type="application/ld+json" {} </script>'],
  ["missing closing tag", '<script type="application/ld+json">{}'],
  ["incomplete closing tag", '<script type="application/ld+json">{}</script'],
  ["closing tag attributes", '<script type="application/ld+json">{}</script extra>'],
  ["self-closing script", '<script type="application/ld+json"/>'],
  ["stray closing tag", "<main></script ></main>"],
  ["stray opening tag", "<script"],
  ["invalid JSON", '<script type="application/ld+json">alert(1)</script>'],
  ["empty JSON", '<script type="application/ld+json"></script>'],
  [
    "literal closing tag in JSON",
    '<script type="application/ld+json">{"text":"</script >"}</script>',
  ],
  ["HTML script escape", '<script type="application/ld+json">{"text":"<!--<script>"}</script>'],
  ["executable script after JSON-LD", `${jsonLd}<script>alert(1)</script >`],
  ["Astro island", "<astro-island></astro-island>"],
  ["client directive", '<div client:load="true"></div>'],
  ["event handler", '<img onerror = "alert(1)">'],
  ["JavaScript URL", '<a href="javascript:alert(1)">Link</a>'],
  ["VBScript URL", '<a href="VBSCRIPT :msgbox(1)">Link</a>'],
])("static HTML assertion rejects %s", (_name, html) => {
  expect(() => expectStaticHtml(html)).toThrow();
  // Check both sides of an allowed body so skipping JSON cannot hide markup.
  expect(() => expectStaticHtml(`${jsonLd}${html}`)).toThrow();
  expect(() => expectStaticHtml(`${html}${jsonLd}`)).toThrow();
});

test("production assertion rejects a title without the Hero inside main", () => {
  expect(() =>
    expectMainContent("<title>Static Hero</title><main></main>", "static", "Static Hero"),
  ).toThrow();
  expect(() =>
    expectMainContent(
      '<section id="hero" data-kerna-component="Hero"><h1>Static Hero</h1></section><main></main>',
      "static",
      "Static Hero",
    ),
  ).toThrow();
});

// Real-time contract: real HTTP requests must abort while headers or body stall.
// Each case exercises the client's 500ms deadline; a fake clock cannot prove
// native HTTP cancellation. The test timeout also bounds setup and teardown.
test.each(["headers", "body"])("HTTP deadline bounds stalled %s", async (phase) => {
  let received = false;
  const server = createServer((_request, response) => {
    received = true;
    if (phase === "body") {
      response.writeHead(200);
      response.write("unfinished");
    }
  });
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  await expect(client(`http://127.0.0.1:${address.port}`, "", 500)("/")).rejects.toThrow();
  expect(received).toBe(true);
});

test("lifecycle stops owned startup children and rejects late work", async () => {
  const lifecycle = createLifecycle();
  onTestFinished(() => lifecycle.stop());
  const { child } = lifecycle.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  expect(child.pid).toBeTypeOf("number");
  await Promise.all([lifecycle.stop(), lifecycle.stop()]);
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  expect(() => lifecycle.spawn(process.execPath, ["-e", ""])).toThrow(
    "Fixture lifecycle is closed",
  );
});
