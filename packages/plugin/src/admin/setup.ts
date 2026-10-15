import { createCollection, createField, fetchCollections, fetchFields } from "@emdash-cms/admin";

const collection = "kerna_pages";
const fields = [
  { slug: "title", label: "Title", type: "string" as const, required: true },
  {
    slug: "page",
    label: "Page",
    type: "json" as const,
    required: true,
    defaultValue: { formatVersion: 1, root: { props: {} }, content: [] },
  },
];

export async function setupKerna(): Promise<"created" | "existing"> {
  const existing = (await fetchCollections()).find((item) => item.slug === collection);
  if (
    existing &&
    !["drafts", "revisions", "preview"].every((support) => existing.supports.includes(support))
  ) {
    throw new Error(
      "The kerna_pages collection needs drafts, revisions and preview enabled in EmDash's schema settings. Then retry setup.",
    );
  }
  if (!existing)
    await createCollection({
      slug: collection,
      label: "Kerna Pages",
      labelSingular: "Kerna Page",
      icon: "squares-four",
      supports: ["drafts", "revisions", "preview"],
      urlPattern: "/kerna/{slug}",
    });
  const saved = await fetchFields(collection);
  // Check compatibility before creating anything else in an existing collection.
  for (const field of fields) {
    const current = saved.find((item) => item.slug === field.slug);
    if (current && (current.type !== field.type || !current.required)) {
      throw new Error(
        `The kerna_pages.${field.slug} field must be a required ${field.type} field. Correct it in EmDash's schema settings, then retry setup.`,
      );
    }
  }
  const missing = fields.filter((field) => !saved.some((item) => item.slug === field.slug));
  for (const field of missing) await createField(collection, field);
  return existing && !missing.length ? "existing" : "created";
}
