import { beforeEach, expect, test, vi } from "vite-plus/test";
import { createCollection, createField, fetchCollections, fetchFields } from "@emdash-cms/admin";
import { setupKerna } from "../src/admin/setup.ts";

vi.mock("@emdash-cms/admin", () => ({
  createCollection: vi.fn(),
  createField: vi.fn(),
  fetchCollections: vi.fn(),
  fetchFields: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

test("setup creates the collection and required fields, then becomes a no-op", async () => {
  vi.mocked(fetchCollections).mockResolvedValue([]);
  vi.mocked(fetchFields).mockResolvedValue([]);
  expect(await setupKerna()).toBe("created");
  expect(createCollection).toHaveBeenCalledWith(
    expect.objectContaining({ slug: "kerna_pages", supports: ["drafts", "revisions", "preview"] }),
  );
  expect(createField).toHaveBeenCalledTimes(2);
  vi.mocked(fetchCollections).mockResolvedValue([
    { slug: "kerna_pages", supports: ["drafts", "revisions", "preview"] },
  ] as Awaited<ReturnType<typeof fetchCollections>>);
  vi.mocked(fetchFields).mockResolvedValue([
    { slug: "title", type: "string", required: true },
    { slug: "page", type: "json", required: true },
  ] as Awaited<ReturnType<typeof fetchFields>>);
  expect(await setupKerna()).toBe("existing");
  expect(createCollection).toHaveBeenCalledTimes(1);
  expect(createField).toHaveBeenCalledTimes(2);
});

test("a failed field creation can resume without recreating the collection", async () => {
  vi.mocked(fetchCollections).mockResolvedValue([
    { slug: "kerna_pages", supports: ["drafts", "revisions", "preview"] },
  ] as Awaited<ReturnType<typeof fetchCollections>>);
  vi.mocked(fetchFields).mockResolvedValue([
    { slug: "title", type: "string", required: true },
  ] as Awaited<ReturnType<typeof fetchFields>>);
  vi.mocked(createField).mockRejectedValueOnce(new Error("Temporary failure"));
  await expect(setupKerna()).rejects.toThrow("Temporary failure");
  vi.mocked(createField).mockResolvedValueOnce({} as Awaited<ReturnType<typeof createField>>);
  expect(await setupKerna()).toBe("created");
  expect(createCollection).not.toHaveBeenCalled();
  expect(createField).toHaveBeenLastCalledWith(
    "kerna_pages",
    expect.objectContaining({ slug: "page" }),
  );
});

test("an incompatible existing field produces a repairable error without overwriting data", async () => {
  vi.mocked(fetchCollections).mockResolvedValue([
    { slug: "kerna_pages", supports: ["drafts", "revisions", "preview"] },
  ] as Awaited<ReturnType<typeof fetchCollections>>);
  vi.mocked(fetchFields).mockResolvedValue([
    { slug: "page", type: "string", required: true },
  ] as Awaited<ReturnType<typeof fetchFields>>);
  await expect(setupKerna()).rejects.toThrow("page");
  expect(createField).not.toHaveBeenCalled();
});
