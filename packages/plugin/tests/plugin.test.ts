import { expect, test } from "vite-plus/test";
import { ContentSaveRejectedError, HookPipeline } from "emdash";
import { createPlugin, kerna } from "../src/index.ts";

// These checks submit the full Page and never query storage.
const contextOptions = {
  db: {} as NonNullable<ConstructorParameters<typeof HookPipeline>[1]>["db"],
};

const page = { formatVersion: 1, root: { props: {} }, content: [] };

test("the native descriptor is serializable and the loader can instantiate it", () => {
  const descriptor = kerna();
  expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  expect(createPlugin(descriptor.options).id).toBe(descriptor.id);
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
