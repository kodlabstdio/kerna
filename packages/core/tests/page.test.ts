import { describe, expect, test } from "vite-plus/test";
import {
  MAX_PAGE_BYTES,
  readPage,
  validatePage,
  type Block,
  type ComponentRegistry,
  type DesignTokens,
  type Page,
} from "../src/index.ts";

const components: ComponentRegistry = {
  Hero: {
    label: "Hero",
    variants: ["centered", "split"],
    fields: {
      title: { type: "text", required: true },
      background: { type: "token", tokenType: "color", required: true },
      count: { type: "number" },
      visible: { type: "boolean" },
    },
    slots: {},
  },
  Columns: {
    label: "Columns",
    variants: ["equal", "wide-left"],
    fields: { gap: { type: "token", tokenType: "spacing", required: true } },
    slots: {
      left: { accepts: ["Hero"], min: 1, max: 2 },
      right: { accepts: ["Hero", "Columns"], min: 0, max: 2 },
    },
  },
};

const tokens: DesignTokens = {
  "color.background": { type: "color", value: "#ffffff" },
  "spacing.md": { type: "spacing", value: "16px" },
};

function hero(id = "hero"): Block {
  return {
    type: "Hero",
    props: { id, variant: "centered", title: "Hello", background: { token: "color.background" } },
  };
}

function columns(): Block {
  return {
    type: "Columns",
    props: {
      id: "columns",
      variant: "equal",
      gap: { token: "spacing.md" },
      left: [hero()],
      right: [],
    },
  };
}

function page(...content: Block[]): Page {
  return { formatVersion: 1, root: { props: {} }, content };
}

const validate = (input: unknown) => validatePage(input, components, tokens);

describe("Page format", () => {
  test("accepts empty Pages and Blocks within declared Slots", () => {
    expect(validate(page())).toEqual([]);
    expect(validate(page(columns()))).toEqual([]);
  });

  test("requires the current format version", () => {
    expect(validate({ ...page(), formatVersion: 99 })).toContainEqual(
      expect.objectContaining({ code: "format_version", field: "formatVersion" }),
    );
  });

  test.each(
    [null, [], "page", {}, { ...page(), content: {} }, { ...page(), root: null }].map((input) => ({
      input,
    })),
  )("rejects malformed Page input: %j", ({ input }) =>
    expect(validate(input).length).toBeGreaterThan(0),
  );

  test.each([null, {}, { type: "Hero" }, { type: "Hero", props: null }])(
    "rejects malformed Blocks: %j",
    (block) => expect(validate({ ...page(), content: [block] }).length).toBeGreaterThan(0),
  );

  test("requires globally unique, non-empty Block ids", () => {
    expect(validate(page(hero("")))).toContainEqual(expect.objectContaining({ field: "id" }));
    expect(validate(page(hero(), columns()))).toContainEqual(
      expect.objectContaining({ code: "duplicate_id", blockId: "hero", field: "id" }),
    );
  });

  test("rejects unknown Components and lists available ones", () => {
    const block = hero();
    block.type = "Unknown";
    expect(validate(page(block))).toContainEqual(
      expect.objectContaining({ code: "component", blockId: "hero", allowed: ["Hero", "Columns"] }),
    );
  });

  test("rejects a third Block level without descending further", () => {
    const outer = columns();
    const inner = columns();
    inner.props.id = "inner";
    outer.props.right = [inner];
    expect(validate(page(outer))).toContainEqual(
      expect.objectContaining({ code: "depth", blockId: "hero", field: "left" }),
    );
  });

  test("rejects incompatible Slot children with accepted Components", () => {
    const block = columns();
    block.props.left = [columns()];
    expect(validate(page(block))).toContainEqual(
      expect.objectContaining({ code: "slot_component", field: "left", allowed: ["Hero"] }),
    );
  });

  test.each(
    [undefined, null, [], [hero("a"), hero("b"), hero("c")], "invalid"].map((left) => ({ left })),
  )("enforces Slot shape and child count: %j", ({ left }) => {
    const block = columns();
    block.props.left = left;
    expect(validate(page(block))).toContainEqual(
      expect.objectContaining({ blockId: "columns", field: "left" }),
    );
  });

  test("omitted optional Slots are empty", () => {
    const block = columns();
    delete block.props.right;
    expect(validate(page(block))).toEqual([]);
  });

  test("null is not an empty optional Slot", () => {
    const block = columns();
    block.props.right = null;
    expect(validate(page(block))).toContainEqual(
      expect.objectContaining({ code: "slot", field: "right" }),
    );
  });

  test("validates root metadata without accepting arbitrary styling", () => {
    expect(validate({ ...page(), root: { props: { title: "Landing" } } })).toEqual([]);
    expect(validate({ ...page(), root: { props: { title: 42 } } })).toContainEqual(
      expect.objectContaining({ code: "field_type", field: "title" }),
    );
    expect(validate({ ...page(), root: { props: { css: "color:red" } } })).toContainEqual(
      expect.objectContaining({ code: "unknown_field", field: "css" }),
    );
  });

  test("prototype property names are not registered Components", () => {
    const block = hero();
    block.type = "toString";
    expect(validate(page(block))).toContainEqual(expect.objectContaining({ code: "component" }));
  });

  test("unknown Variants list the available alternatives", () => {
    const block = hero();
    block.props.variant = "custom";
    expect(validate(page(block))).toContainEqual(
      expect.objectContaining({
        blockId: "hero",
        field: "variant",
        allowed: ["centered", "split"],
      }),
    );
  });

  test.each([
    "#fff",
    { token: "missing" },
    { token: "spacing.md" },
    { token: "color.background", css: "red" },
  ])("token fields accept only references of the declared type: %j", (background) => {
    const block = hero();
    block.props.background = background;
    expect(validate(page(block))).toContainEqual(
      expect.objectContaining({
        code: "token",
        blockId: "hero",
        field: "background",
        allowed: ["color.background"],
      }),
    );
  });

  test.each([
    { title: undefined },
    { title: 12 },
    { count: "12" },
    { count: Infinity },
    { visible: "yes" },
  ])("validates content field types: %j", (props) => {
    const block = hero();
    Object.assign(block.props, props);
    expect(validate(page(block)).length).toBeGreaterThan(0);
  });

  test("accepts optional scalar fields with their declared types", () => {
    const block = hero();
    Object.assign(block.props, { count: 0, visible: false });
    expect(validate(page(block))).toEqual([]);
  });

  test("rejects undeclared fields, CSS and legacy free-form zones", () => {
    const block = hero();
    block.props.style = "color:red";
    expect(validate(page(block))).toContainEqual(
      expect.objectContaining({ code: "unknown_field", blockId: "hero", field: "style" }),
    );
    expect(validate({ ...page(), zones: {} })).toContainEqual(
      expect.objectContaining({ code: "unknown_field", field: "zones" }),
    );
  });

  test("measures the 1 MB budget in UTF-8 bytes, including the exact boundary", () => {
    const input = page(hero());
    input.content[0]!.props.title = "";
    const overhead = new TextEncoder().encode(JSON.stringify(input)).byteLength;
    input.content[0]!.props.title = "a".repeat(MAX_PAGE_BYTES - overhead);
    expect(validate(input)).toEqual([]);
    input.content[0]!.props.title += "é";
    expect(validate(input)).toEqual([
      expect.objectContaining({
        code: "size",
        actualBytes: MAX_PAGE_BYTES + 2,
        maxBytes: MAX_PAGE_BYTES,
      }),
    ]);
  });

  test("non-serializable input is a readable error", () => {
    const input = page();
    input.root.props.loop = input;
    expect(validate(input)).toContainEqual(expect.objectContaining({ code: "json" }));
  });
});

describe("reading and migration", () => {
  test.each([undefined, 0, 1])(
    "reads format version %j without mutating the input",
    (formatVersion) => {
      const input = { ...page(hero()), formatVersion };
      const before = JSON.stringify(input);
      expect(readPage(input, components, tokens)).toEqual({ ok: true, page: page(hero()) });
      expect(JSON.stringify(input)).toBe(before);
    },
  );

  test("rejects future or invalid versions instead of guessing a migration", () => {
    for (const formatVersion of [2, -1, "1", null]) {
      expect(readPage({ ...page(), formatVersion }, components, tokens)).toEqual({
        ok: false,
        errors: [expect.objectContaining({ code: "format_version" })],
      });
    }
  });

  test("validates legacy input after migration", () => {
    expect(readPage({ root: { props: {} }, content: [null] }, components, tokens).ok).toBe(false);
    expect(readPage(null, components, tokens).ok).toBe(false);
  });
});
