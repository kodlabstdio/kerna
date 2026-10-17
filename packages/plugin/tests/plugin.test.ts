import { afterEach, expect, test, vi } from "vite-plus/test";
import { ContentRepository, ContentSaveRejectedError, HookPipeline } from "emdash";
import { createPlugin, kerna } from "../src/index.ts";

// These checks submit the full Page and never query storage.
const contextOptions = {
  db: {} as NonNullable<ConstructorParameters<typeof HookPipeline>[1]>["db"],
};

const page = { formatVersion: 1, root: { props: {} }, content: [] };

afterEach(() => vi.restoreAllMocks());

// Retained Pages use the native content accessor, including its collection SEO lookup.
function retainedPagePipeline(data: Record<string, unknown> | null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue({ has_seo: 0 }),
  };
  const db = { selectFrom: vi.fn().mockReturnValue(query) };
  const stored =
    data === null
      ? null
      : {
          id: "saved-page",
          type: "kerna_pages",
          slug: "saved-page",
          status: "draft",
          data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
  const read = vi
    .spyOn(ContentRepository.prototype, "findById")
    .mockResolvedValue(stored as Awaited<ReturnType<ContentRepository["findById"]>>);
  return {
    pipeline: new HookPipeline([createPlugin()], { db: db as unknown as typeof contextOptions.db }),
    read,
  };
}

test("the native descriptor is serializable and the loader can instantiate it", () => {
  const descriptor = kerna();
  expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  expect(descriptor.adminPages).toEqual([
    { path: "/setup", label: "Kerna", icon: "squares-four" },
    { path: "/editor", label: "Edit Pages", icon: "article" },
  ]);
  expect(createPlugin(descriptor.options).id).toBe(descriptor.id);
});

test("the private editor configuration route is Editor-only and server-owned", () => {
  const plugin = createPlugin({
    presets: {
      Hero: { type: "Hero", props: { id: "site", variant: "centered", title: "Welcome" } },
    },
  });
  expect(plugin.routes.config).toMatchObject({
    methods: ["GET"],
    permission: "schema:read",
    request: { body: "none" },
  });
  expect(plugin.routes.config.public).not.toBe(true);
  expect(plugin.routes.config.handler).toBeTypeOf("function");
});

test("valid Pages and unrelated content pass through the production hook pipeline", async () => {
  const pipeline = new HookPipeline([createPlugin()], contextOptions);
  expect(
    (await pipeline.runContentBeforeSave({ title: "Page", page }, "kerna_pages", true)).content,
  ).toEqual({ title: "Page", page });
  expect((await pipeline.runContentBeforeSave({ title: "Post" }, "posts", true)).content).toEqual({
    title: "Post",
  });
});

test.each([
  undefined,
  null,
  {},
  { ...page, formatVersion: 99 },
  { ...page, content: [{ type: "Unknown", props: { id: "bad", variant: "x" } }] },
])("invalid Kerna Pages abort the hook pipeline: %j", async (input) => {
  const pipeline = new HookPipeline([createPlugin()], contextOptions);
  await expect(
    pipeline.runContentBeforeSave({ page: input }, "kerna_pages", true),
  ).rejects.toBeInstanceOf(ContentSaveRejectedError);
});

test.each([page, { root: { props: {} }, content: [] }])(
  "a valid retained Page leaves a partial write and stored data unchanged: %j",
  async (retained) => {
    const data = { title: "Original", page: retained };
    const before = structuredClone(data);
    const { pipeline, read } = retainedPagePipeline(data);
    const partial = { title: "Renamed" };
    const result = await pipeline.runContentBeforeSave(partial, "kerna_pages", false, "saved-page");
    expect(read).toHaveBeenCalledExactlyOnceWith("kerna_pages", "saved-page");
    expect(result.content).toBe(partial);
    expect(result.content).toEqual({ title: "Renamed" });
    expect(data).toEqual(before);
  },
);

test.each([{ page: null }, { page: { ...page, formatVersion: 99 } }, {}, null])(
  "an invalid or missing retained Page aborts a partial write: %j",
  async (data) => {
    const { pipeline, read } = retainedPagePipeline(data);
    await expect(
      pipeline.runContentBeforeSave({ title: "Renamed" }, "kerna_pages", false, "saved-page"),
    ).rejects.toBeInstanceOf(ContentSaveRejectedError);
    expect(read).toHaveBeenCalledExactlyOnceWith("kerna_pages", "saved-page");
  },
);

test("creating without a Page aborts without reading storage", async () => {
  const { pipeline, read } = retainedPagePipeline({ page });
  await expect(
    pipeline.runContentBeforeSave({ title: "Missing Page" }, "kerna_pages", true),
  ).rejects.toBeInstanceOf(ContentSaveRejectedError);
  expect(read).not.toHaveBeenCalled();
});

test("a retained Page storage failure aborts rather than accepting the partial write", async () => {
  const { pipeline, read } = retainedPagePipeline({ page });
  const failure = new Error("Page storage unavailable");
  read.mockRejectedValueOnce(failure);
  await expect(
    pipeline.runContentBeforeSave({ title: "Renamed" }, "kerna_pages", false, "saved-page"),
  ).rejects.toBe(failure);
});

test("submitted and retained invalid Pages preserve the same core error path and message", async () => {
  const invalid = { ...page, content: [{ type: "Unknown", props: { id: "bad", variant: "x" } }] };
  const { pipeline } = retainedPagePipeline({ page: invalid });
  const [submitted, retained] = await Promise.allSettled([
    pipeline.runContentBeforeSave({ page: invalid }, "kerna_pages", false, "saved-page"),
    pipeline.runContentBeforeSave({ title: "Renamed" }, "kerna_pages", false, "saved-page"),
  ]);
  expect(submitted.status).toBe("rejected");
  expect(retained.status).toBe("rejected");
  if (submitted.status === "rejected" && retained.status === "rejected") {
    expect(retained.reason).toBeInstanceOf(ContentSaveRejectedError);
    expect(retained.reason.message).toBe(submitted.reason.message);
    expect(retained.reason.message).toContain("content[0].type");
    expect(retained.reason.message).toContain("Unknown");
  }
});
