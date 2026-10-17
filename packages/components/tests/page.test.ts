import { expect, test } from "vite-plus/test";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { createComponentRegistry, createDesignSystem } from "@kodlab/kerna-core";
import { components } from "../src/registry";
import Page from "../src/Page.astro";
import Synthetic from "./Synthetic.astro";

const designSystem = createDesignSystem(components, {});
const hero = (id = "first", props = {}) => ({
  type: "Hero",
  props: { id, variant: "centered", title: "Hello", ...props },
});
const page = (content = [hero()]) => ({ formatVersion: 1, root: { props: {} }, content });
const render = async (input: unknown, system = designSystem, preview = false) => {
  const container = await AstroContainer.create();
  return container.renderToString(Page, { props: { page: input, designSystem: system, preview } });
};

test("compiles Page and Hero through Astro", async () => {
  const html = await render(page());
  expect(html).not.toContain("data-kerna-component");
  expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/);
});

test("editor preview markers are opt-in and absent from public output", async () => {
  const preview = await render(page(), designSystem, true);
  expect(preview).toContain('data-kerna-component="Hero"');
  expect(preview).toContain('data-kerna-id="first"');
  const published = await render(page());
  expect(published).not.toContain("data-kerna-component");
  expect(published).not.toContain("data-kerna-id");
});

test("host-registered Astro renderer receives nested Slot content", async () => {
  const registry = createComponentRegistry([
    ...Object.entries(components).map(([name, definition]) => ({ name, ...definition })),
    {
      name: "Frame",
      label: "Frame",
      variants: ["plain"],
      fields: {},
      slots: { content: { accepts: ["Hero"], min: 0, max: 4 } },
    },
  ]);
  const system = createDesignSystem(registry, {});
  const nested: unknown = {
    formatVersion: 1,
    root: { props: {} },
    content: [
      {
        type: "Frame",
        props: {
          id: "frame",
          variant: "plain",
          content: [hero("nested", { title: "Nested heading" })],
        },
      },
    ],
  };
  const container = await AstroContainer.create();
  const html = await container.renderToString(Page, {
    props: {
      page: nested,
      designSystem: system,
      registry,
      renderers: { Frame: Synthetic },
      preview: true,
    },
  });
  expect(html).toContain('data-synthetic="Frame"');
  expect(html).toContain('data-kerna-component="Frame"');
  expect(html).toContain('data-kerna-component="Hero"');
  expect(html).toMatch(/<h1[^>]*>Nested heading<\/h1>/);
  staticHtml(html);
});

function staticHtml(html: string) {
  expect(html).not.toMatch(
    /<script\b|<astro-island\b|\bclient:|\son\w+=|(?:javascript|vbscript):/i,
  );
}

function fallback(html: string) {
  expect(html).toContain("<p>This Page is unavailable.</p>");
  expect(html).not.toContain("data-kerna-component");
  expect(html).not.toContain("PRIVATE");
  staticHtml(html);
}

test("renders both Variants and headings in stored order without hydration", async () => {
  const html = await render(page([hero("left", { variant: "left" }), hero("centered")]));
  expect([...html.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1])).toEqual([
    "left",
    "centered",
  ]);
  expect(html).toContain('data-variant="left"');
  expect(html).toContain('data-variant="centered"');
  expect(html.match(/<h1\b/g)).toHaveLength(2);
  staticHtml(html);
});

test("escapes hostile title, description and ID as text", async () => {
  const hostile = '<script>alert("PRIVATE")</script>&<img src=x onerror=alert(1)>';
  const html = await render(
    page([hero('id" onclick="bad', { title: hostile, description: hostile })]),
  );
  expect(html).not.toMatch(/<script\b|<img\b|\sonclick="bad/);
  expect(html.match(/&lt;script&gt;/g)).toHaveLength(2);
  expect(html).toContain("&amp;");
  expect(html).toContain('id="id&quot; onclick=&quot;bad"');
});

test.each([undefined, "", "Description"])("description state: %s", async (description) => {
  const html = await render(
    page([hero("first", description === undefined ? {} : { description })]),
  );
  expect(html.match(/<p\b/g)?.length ?? 0).toBe(description ? 1 : 0);
  if (description) expect(html).toContain(">Description</p>");
});

test.each(["", "   "])("preserves currently valid title %j", async (title) => {
  const html = await render(page([hero("first", { title })]));
  expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
  expect(html).not.toContain("unavailable");
});

test("valid empty Page renders neither Hero nor fallback", async () => {
  const html = await render(page([]));
  expect(html).not.toMatch(/<section|<h1|<p/);
  staticHtml(html);
});

test("emits distinct token declarations and references; omitted fields inherit", async () => {
  const system = createDesignSystem(components, {
    "colors.ink": { type: "color", value: "#162524" },
    "colors-ink": { type: "color", value: "#ffffff" },
    colors_2e_ink: { type: "color", value: "#eeeeee" },
    body: { type: "typography", value: "Georgia, serif" },
    space: { type: "spacing", value: "2rem" },
  });
  const html = await render(
    page([
      hero("tokens", {
        foreground: { token: "colors.ink" },
        background: { token: "colors-ink" },
        typography: { token: "body" },
        spacing: { token: "space" },
      }),
      hero("inherited"),
    ]),
    system,
  );
  expect(html).toContain(
    ":root{--kerna-colors_2e_ink:#162524;--kerna-colors-ink:#ffffff;--kerna-colors_5f_2e_5f_ink:#eeeeee",
  );
  expect(html).toContain("color:var(--kerna-colors_2e_ink)");
  expect(html).toContain("background-color:var(--kerna-colors-ink)");
  expect(html).toContain("font-family:var(--kerna-body)");
  expect(html).toContain("padding:var(--kerna-space)");
  expect(html.match(/<section id="inherited"[^>]*>/)?.[0]).toContain('style=""');
});

test.each([undefined, 0])("read migration %s does not mutate input", async (formatVersion) => {
  const input = { ...page(), formatVersion };
  const before = structuredClone(input);
  expect(await render(input)).toContain("<section");
  expect(input).toEqual(before);
});

test.each([
  null,
  [],
  { ...page(), root: [] },
  { ...page(), root: { props: null } },
  { ...page(), content: {} },
  "{malformed",
  { ...page(), formatVersion: 2 },
  page([hero("valid", { title: "PRIVATE" }), { ...hero(), type: "Unknown" }]),
  page([hero("valid", { title: "PRIVATE" }), hero("bad", { variant: "unknown" })]),
  page([hero("valid", { title: "PRIVATE" }), hero("bad", { foreground: { token: "missing" } })]),
  page([hero("valid", { title: "PRIVATE" }), hero("bad", { title: null })]),
])("invalid stored Page falls back as a whole: %#", async (input) => {
  fallback(await render(input));
});

test("disabled Component and Variant fall back", async () => {
  fallback(await render(page(), createDesignSystem(components, {}, {})));
  fallback(await render(page(), createDesignSystem(components, {}, { Hero: ["left"] })));
});

test("wrong token type falls back without partial content", async () => {
  const system = createDesignSystem(components, {
    space: { type: "spacing", value: "2rem" },
  });
  fallback(
    await render(
      page([hero("valid", { title: "PRIVATE" }), hero("bad", { foreground: { token: "space" } })]),
      system,
    ),
  );
});

test.each([999_998, 1_000_000, 1_000_001])("UTF-8 byte boundary %i", async (bytes) => {
  const input = page([hero("large", { title: "é" }), hero("last", { title: "Last" })]);
  const overhead = new TextEncoder().encode(JSON.stringify(input)).length;
  input.content[0]!.props.title += "x".repeat(bytes - overhead);
  expect(new TextEncoder().encode(JSON.stringify(input)).length).toBe(bytes);
  const started = performance.now();
  const html = await render(input);
  console.info(
    `Page ${bytes} UTF-8 bytes rendered in ${(performance.now() - started).toFixed(1)}ms`,
  );
  if (bytes > 1_000_000) fallback(html);
  else {
    expect(html).toContain(input.content[0]!.props.title);
    expect(html).toMatch(/<h1[^>]*>Last<\/h1>/);
    expect(html.indexOf('id="large"')).toBeLessThan(html.indexOf('id="last"'));
    expect(html).not.toContain("unavailable");
    staticHtml(html);
  }
});

test("unsafe trusted token configuration throws its private diagnostic", async () => {
  const system = createDesignSystem(components, {
    ink: { type: "color", value: "red; color: blue" },
  });
  await expect(render(page(), system)).rejects.toThrow("Unsafe CSS value");
});
