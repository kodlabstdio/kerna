import { Role, type RoleLevel } from "@emdash-cms/auth";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { components } from "@kodlab/kerna-components/registry";
import { createDesignSystem } from "@kodlab/kerna-core";
import { describe, expect, it, vi } from "vite-plus/test";
import { kernaAstro } from "../src/astro/index.ts";
import { admitPreview } from "../src/astro/runtime.ts";

const designSystem = createDesignSystem(components, {});
const page = { formatVersion: 1, root: { props: {} }, content: [] };
const binding = { token: "a".repeat(64), session: "session-1", generation: 1 };
const configuration = { components, designSystem };
function context(body: unknown, role: RoleLevel = Role.EDITOR, contentExists = true) {
  const request = new Request("http://localhost/_emdash/api/kerna-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
    body: JSON.stringify(body),
  });
  return {
    request,
    url: new URL(request.url),
    locals: {
      user: { role },
      emdash: { handleContentGet: vi.fn(async () => ({ success: contentExists })) },
    },
  };
}

describe("production Astro preview admission", () => {
  it("rejects unauthorized users before parsing or rendering", async () => {
    const next = vi.fn(async () => new Response("rendered"));
    const response = await admitPreview(
      context({ broken: true }, Role.SUBSCRIBER),
      next,
      configuration,
    );
    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requires an exact request envelope and an existing native Page", async () => {
    const next = vi.fn(async () => new Response("rendered"));
    expect((await admitPreview(context({ id: "page" }), next, configuration)).status).toBe(400);
    const unavailable = context({ id: "page", page, binding }, Role.EDITOR, false);
    expect((await admitPreview(unavailable, next, configuration)).status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("validates the Page before host rendering and admits a valid draft", async () => {
    const next = vi.fn(async () => new Response("<html>static host render</html>"));
    const invalid = context({ id: "page", page: { unsafe: true }, binding });
    expect((await admitPreview(invalid, next, configuration)).status).toBe(422);
    expect(next).not.toHaveBeenCalled();
    const valid = context({ id: "page", page, binding });
    const response = await admitPreview(valid, next, configuration);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const preview = (
      valid.locals as typeof valid.locals & {
        kernaPreview?: { page: unknown; binding: unknown; nonce: string };
      }
    ).kernaPreview;
    expect(preview).toMatchObject({ page, binding });
    expect(preview?.nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(await response.text()).toContain("static host render");
  });

  it("enforces the request stream cap", async () => {
    const request = new Request("http://localhost/_emdash/api/kerna-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
      body: "x".repeat(1_004_097),
    });
    const response = await admitPreview(
      {
        request,
        url: new URL(request.url),
        locals: {
          user: { role: Role.EDITOR },
          emdash: { handleContentGet: async () => ({ success: true }) },
        },
      },
      async () => new Response("rendered"),
      configuration,
    );
    expect(response.status).toBe(413);
  });
});

describe("production Astro integration paths", () => {
  it("writes its generated route beneath file URLs containing encoded spaces", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kerna astro paths "));
    const root = join(parent, "host site");
    const cache = join(root, ".astro cache");
    await mkdir(root, { recursive: true });
    const addMiddleware = vi.fn();
    const injectRoute = vi.fn();
    try {
      await kernaAstro({ document: "src/components/Page Document.astro", ...configuration }).hooks[
        "astro:config:setup"
      ]({
        config: { root: pathToFileURL(`${root}/`), cacheDir: pathToFileURL(`${cache}/`) },
        addMiddleware,
        injectRoute,
      });
      const route = await readFile(join(cache, "kerna", "preview.astro"), "utf8");
      expect(route).toContain(join(root, "src/components/Page Document.astro"));
      expect(injectRoute).toHaveBeenCalledWith({
        pattern: "/_emdash/api/kerna-preview",
        entrypoint: join(cache, "kerna", "preview.astro"),
        prerender: false,
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
