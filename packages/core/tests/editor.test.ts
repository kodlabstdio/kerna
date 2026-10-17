import { describe, expect, test, vi } from "vite-plus/test";
import {
  applyPageOperation,
  inspectBlockPresets,
  insertBlockPreset,
  getRootBlockDestination,
  MAX_PAGE_BYTES,
  type Block,
  type BlockDestination,
  type ComponentRegistry,
  type Operation,
  type Page,
} from "../src/index.ts";

const components: ComponentRegistry = {
  Hero: {
    label: "Hero",
    variants: ["centered", "split"],
    fields: {
      title: { type: "text", required: true },
      color: { type: "token", tokenType: "color" },
    },
    slots: {},
  },
  Columns: {
    label: "Columns",
    variants: ["equal"],
    fields: {},
    slots: {
      left: { accepts: ["Hero"], min: 1, max: 2 },
      right: { accepts: ["Hero", "Columns"], min: 0, max: 2 },
    },
  },
};
const tokens = { ink: { type: "color" as const, value: "#000" } };
const rules = { components, tokens };
const hero = (id = "h"): Block => ({
  type: "Hero",
  props: { id, variant: "centered", title: "Site-owned content", color: { token: "ink" } },
});
const columns = (): Block => ({
  type: "Columns",
  props: { id: "c", variant: "equal", left: [hero("l")], right: [hero("r")] },
});
const page = (...content: Block[]): Page => ({
  formatVersion: 1,
  root: { props: { title: "Page title" } },
  content,
});
const end: BlockDestination = { container: { kind: "root" }, position: { kind: "end" } };
const slot = (name = "right"): BlockDestination => ({
  container: { kind: "slot", parentId: "c", slot: name },
  position: { kind: "end" },
});
const presets = () => ({ Hero: hero("preset-h"), Columns: columns() });
const edit = (value: unknown): Operation => ({
  id: "edit",
  kind: "editField",
  blockId: "h",
  field: "title",
  change: { kind: "set", value },
});

describe("site-owned Block presets", () => {
  test("reports missing, invalid and disabled presets independently", () => {
    const input = { Hero: hero(), Columns: { type: "Columns", props: {} }, Disabled: hero() };
    const before = structuredClone(input);
    const result = inspectBlockPresets(input, rules);
    expect(result.Hero).toEqual({ ok: true, block: hero() });
    expect(result.Columns).toMatchObject({ ok: false, errors: [{ code: "invalid_preset" }] });
    expect(result.Disabled).toMatchObject({ ok: false, errors: [{ code: "disabled_component" }] });
    expect(inspectBlockPresets({ Hero: hero() }, rules).Columns).toMatchObject({
      ok: false,
      errors: [{ code: "missing_preset" }],
    });
    expect(input).toEqual(before);
    if (result.Hero?.ok) result.Hero.block.props.title = "Changed copy";
    expect(input).toEqual(before);
  });

  test.each([
    ["wrong Component", { ...hero(), type: "Columns" }],
    ["required content", { type: "Hero", props: { id: "p", variant: "centered" } }],
    ["Variant", { ...hero(), props: { ...hero().props, variant: "free" } }],
    ["token", { ...hero(), props: { ...hero().props, color: { token: "missing" } } }],
  ])("rejects invalid preset %s without inventing values", (_name, preset) => {
    expect(inspectBlockPresets({ Hero: preset }, rules).Hero).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_preset" }],
    });
  });

  test("diagnoses non-JSON presets without executing getters or affecting valid presets", () => {
    const getter = vi.fn(() => hero());
    const input = Object.defineProperty({ Columns: columns() }, "Hero", {
      enumerable: true,
      get: getter,
    });
    expect(inspectBlockPresets(input, rules)).toMatchObject({
      Hero: { ok: false, errors: [{ code: "invalid_preset" }] },
      Columns: { ok: true },
    });
    const cyclic = hero();
    cyclic.props.title = cyclic;
    expect(inspectBlockPresets({ Hero: cyclic }, rules).Hero).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_preset" }],
    });
    expect(getter).not.toHaveBeenCalled();
  });

  test.each<[string, Block, string]>([
    [
      "missing required Slot child",
      { type: "Columns", props: { id: "c", variant: "equal" } },
      "slot_count",
    ],
    [
      "duplicate template IDs",
      {
        type: "Columns",
        props: { id: "c", variant: "equal", left: [hero("same")], right: [hero("same")] },
      },
      "duplicate_id",
    ],
    [
      "third level",
      {
        type: "Columns",
        props: { id: "outer", variant: "equal", left: [hero("outer-child")], right: [columns()] },
      },
      "depth",
    ],
    [
      "size",
      {
        type: "Columns",
        props: {
          id: "c",
          variant: "equal",
          left: [
            { ...hero("l"), props: { ...hero("l").props, title: "é".repeat(MAX_PAGE_BYTES / 2) } },
          ],
        },
      },
      "size",
    ],
  ])("refuses a preset with %s before requesting IDs", (_name, block, code) => {
    const generateId = vi.fn(() => "new");
    expect(
      insertBlockPreset({
        page: page(),
        presets: { Columns: block },
        component: "Columns",
        destination: end,
        generateId,
        ...rules,
      }),
    ).toMatchObject({
      ok: false,
      errors: [
        {
          code: "invalid_preset",
          validationErrors: expect.arrayContaining([expect.objectContaining({ code })]),
        },
      ],
    });
    expect(generateId).not.toHaveBeenCalled();
  });

  test("rejects a disabled nested Component even when its parent is enabled", () => {
    expect(
      inspectBlockPresets(presets(), { ...rules, components: { Columns: components.Columns! } })
        .Columns,
    ).toMatchObject({
      ok: false,
      errors: [
        {
          code: "invalid_preset",
          validationErrors: expect.arrayContaining([
            expect.objectContaining({ code: "component" }),
          ]),
        },
      ],
    });
  });

  test("clones complete nested presets and regenerates all IDs on each insertion", () => {
    const input = { page: page(hero()), presets: presets() };
    const before = structuredClone(input);
    let id = 0;
    const generateId = vi.fn(() => `new-${++id}`);
    const first = insertBlockPreset({
      ...input,
      ...rules,
      component: "Columns",
      destination: end,
      generateId,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.block).toEqual({
      type: "Columns",
      props: {
        id: "new-1",
        variant: "equal",
        left: [hero("new-2")],
        right: [hero("new-3")],
      },
    });
    expect(first.page.content).toEqual([hero(), first.block]);
    expect(first.page.root).toEqual(input.page.root);
    const second = insertBlockPreset({
      ...input,
      ...rules,
      page: first.page,
      component: "Columns",
      destination: end,
      generateId,
    });
    expect(second.ok).toBe(true);
    expect(generateId).toHaveBeenCalledTimes(6);
    first.block.props.left = [];
    expect(input).toEqual(before);
  });

  test("returns a failure if the injected ID generator throws, retaining all inputs", () => {
    const input = { page: page(), presets: presets() };
    const before = structuredClone(input);
    const generateId = vi.fn(() => {
      throw new Error("No ID available");
    });
    expect(
      insertBlockPreset({ ...input, ...rules, component: "Hero", destination: end, generateId }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_id" }] });
    expect(generateId).toHaveBeenCalledTimes(1);
    expect(input).toEqual(before);
  });

  test.each(["", "  ", "h", "l"])(
    "rejects generated empty/colliding ID %j without retries",
    (id) => {
      const input = { page: page(hero(), columns()), presets: presets() };
      const before = structuredClone(input);
      const generateId = vi.fn(() => id);
      expect(
        insertBlockPreset({ ...input, ...rules, component: "Hero", destination: end, generateId }),
      ).toMatchObject({
        ok: false,
        errors: [{ code: "invalid_id" }],
      });
      expect(generateId).toHaveBeenCalledTimes(1);
      expect(input).toEqual(before);
    },
  );

  test("rejects duplicate generated IDs within the new subtree", () => {
    const generateId = vi.fn(() => "new");
    expect(
      insertBlockPreset({
        page: page(),
        presets: presets(),
        ...rules,
        component: "Columns",
        destination: end,
        generateId,
      }),
    ).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_id" }],
    });
    expect(generateId).toHaveBeenCalledTimes(2);
  });

  test("revalidates the preset against current enabled Variants and Components", () => {
    const generateId = vi.fn(() => "new");
    const input = {
      page: page(),
      presets: presets(),
      ...rules,
      component: "Hero",
      destination: end,
      generateId,
    };
    expect(
      insertBlockPreset({ ...input, components: { Columns: components.Columns! } }),
    ).toMatchObject({ ok: false, errors: [{ code: "disabled_component" }] });
    expect(
      insertBlockPreset({
        ...input,
        components: { ...components, Hero: { ...components.Hero!, variants: ["split"] } },
      }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_preset" }] });
    expect(insertBlockPreset({ ...input, presets: {} })).toMatchObject({
      ok: false,
      errors: [{ code: "missing_preset" }],
    });
    expect(generateId).not.toHaveBeenCalled();
  });
});

describe("top-level insertion destination", () => {
  test.each([null, "h", "c", "l", "r"])(
    "resolves selection %j using the containing root",
    (selectedBlockId) => {
      const current = page(hero(), columns(), hero("last"));
      const result = getRootBlockDestination({ page: current, selectedBlockId, ...rules });
      expect(result).toEqual({
        ok: true,
        destination:
          selectedBlockId === null
            ? end
            : {
                container: { kind: "root" },
                position: { kind: "after", blockId: selectedBlockId === "h" ? "h" : "c" },
              },
      });
      if (!result.ok) return;
      const inserted = insertBlockPreset({
        page: current,
        presets: presets(),
        component: "Hero",
        destination: result.destination,
        generateId: () => "new",
        ...rules,
      });
      expect(inserted.ok).toBe(true);
      if (inserted.ok)
        expect(inserted.page.content.map((b) => b.props.id)).toEqual(
          selectedBlockId === null
            ? ["h", "c", "last", "new"]
            : selectedBlockId === "h"
              ? ["h", "new", "c", "last"]
              : ["h", "c", "new", "last"],
        );
    },
  );

  test("does not silently append for a stale selection", () => {
    expect(
      getRootBlockDestination({ page: page(), selectedBlockId: "gone", ...rules }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_selection" }] });
    expect(getRootBlockDestination({ page: page(), selectedBlockId: null, ...rules })).toEqual({
      ok: true,
      destination: end,
    });
  });
});

describe("human Page candidate mutations", () => {
  test.each<[Operation, string[]]>([
    [{ id: "a", kind: "addBlock", block: hero("new"), destination: end }, ["h", "c", "b", "new"]],
    [{ id: "r", kind: "removeBlock", blockId: "c" }, ["h", "b"]],
    [{ id: "m", kind: "moveBlock", blockId: "h", destination: end }, ["c", "b", "h"]],
    [
      {
        id: "m",
        kind: "moveBlock",
        blockId: "b",
        destination: { ...end, position: { kind: "before", blockId: "h" } },
      },
      ["b", "h", "c"],
    ],
  ])("applies $kind at root without changing inputs", (operation, ids) => {
    const input = { page: page(hero(), columns(), hero("b")), operation, ...rules };
    const before = structuredClone(input);
    const result = applyPageOperation(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.content.map((b) => b.props.id)).toEqual(ids);
    expect(input).toEqual(before);
  });

  test("adds, reorders and removes Slot children through the same candidate boundary", () => {
    const original = page(columns());
    const added = insertBlockPreset({
      page: original,
      presets: presets(),
      component: "Hero",
      destination: slot(),
      generateId: () => "new",
      ...rules,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const moved = applyPageOperation({
      page: added.page,
      operation: { id: "m", kind: "moveBlock", blockId: "r", destination: slot() },
      ...rules,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect((moved.page.content[0]!.props.right as Block[]).map((b) => b.props.id)).toEqual([
      "new",
      "r",
    ]);
    const removed = applyPageOperation({
      page: moved.page,
      operation: { id: "r", kind: "removeBlock", blockId: "r" },
      ...rules,
    });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.page.content[0]!.props.right).toEqual([hero("new")]);
    expect(original).toEqual(page(columns()));
  });

  test.each<[Operation, string, unknown]>([
    [edit("Updated"), "title", "Updated"],
    [{ id: "v", kind: "changeVariant", blockId: "h", variant: "split" }, "variant", "split"],
    [
      {
        id: "t",
        kind: "editField",
        blockId: "h",
        field: "color",
        change: { kind: "set", value: { token: "ink" } },
      },
      "color",
      { token: "ink" },
    ],
    [
      { id: "u", kind: "editField", blockId: "h", field: "color", change: { kind: "unset" } },
      "color",
      undefined,
    ],
  ])("validates $kind field/Variant candidates", (operation, field, expected) => {
    const result = applyPageOperation({ page: page(hero()), operation, ...rules });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.content[0]!.props[field]).toEqual(expected);
  });

  test.each<[Operation, string]>([
    [edit(12), "field_type"],
    [edit("x".repeat(MAX_PAGE_BYTES)), "size"],
    [{ id: "v", kind: "changeVariant", blockId: "h", variant: "free" }, "variant"],
    [
      {
        id: "t",
        kind: "editField",
        blockId: "h",
        field: "color",
        change: { kind: "set", value: "#fff" },
      },
      "token",
    ],
    [{ id: "r", kind: "removeBlock", blockId: "l" }, "slot_count"],
    [{ id: "m", kind: "moveBlock", blockId: "l", destination: end }, "slot_count"],
    [
      { id: "a", kind: "addBlock", block: { ...hero("new"), type: "Disabled" }, destination: end },
      "component",
    ],
    [
      {
        id: "a",
        kind: "addBlock",
        block: { type: "Columns", props: { id: "new", variant: "equal", left: [hero("deep")] } },
        destination: slot("left"),
      },
      "slot_component",
    ],
    [
      {
        id: "a",
        kind: "addBlock",
        block: { type: "Columns", props: { id: "new", variant: "equal", left: [hero("deep")] } },
        destination: slot(),
      },
      "depth",
    ],
    [{ id: "a", kind: "addBlock", block: hero("h"), destination: end }, "duplicate_id"],
  ])("refuses invalid $kind candidates (%s) without partial mutations", (operation, code) => {
    const input = { page: page(hero(), columns()), operation, ...rules };
    const before = structuredClone(input);
    const result = applyPageOperation(input);
    expect(result).toMatchObject({
      ok: false,
      errors: [
        {
          code: "invalid_candidate",
          validationErrors: expect.arrayContaining([expect.objectContaining({ code })]),
        },
      ],
    });
    expect(input).toEqual(before);
    expect(result).not.toHaveProperty("page");
  });

  test("enforces Slot maximum for preset insertion against the resulting Page", () => {
    const block = columns();
    block.props.right = [hero("r"), hero("r2")];
    const input = {
      page: page(block),
      presets: presets(),
      component: "Hero",
      destination: slot(),
      generateId: () => "new",
      ...rules,
    };
    const before = structuredClone({ page: input.page, presets: input.presets });
    expect(insertBlockPreset(input)).toMatchObject({
      ok: false,
      errors: [
        {
          code: "invalid_candidate",
          validationErrors: expect.arrayContaining([
            expect.objectContaining({ code: "slot_count" }),
          ]),
        },
      ],
    });
    expect({ page: input.page, presets: input.presets }).toEqual(before);
  });

  test("checks combined Page size even when the current Page and preset are individually valid", () => {
    const large = hero("existing");
    large.props.title = "x".repeat(550_000);
    const preset = hero("preset");
    preset.props.title = "x".repeat(550_000);
    const current = page(large);
    const before = structuredClone(current);
    expect(inspectBlockPresets({ Hero: preset }, rules).Hero?.ok).toBe(true);
    expect(
      insertBlockPreset({
        page: current,
        presets: { Hero: preset },
        component: "Hero",
        destination: end,
        generateId: () => "new",
        ...rules,
      }),
    ).toMatchObject({
      ok: false,
      errors: [
        {
          code: "invalid_candidate",
          validationErrors: [expect.objectContaining({ code: "size" })],
        },
      ],
    });
    expect(current).toEqual(before);
  });

  test.each<[Operation, string]>([
    [{ id: "m", kind: "moveBlock", blockId: "c", destination: slot() }, "invalid_destination"],
    [
      {
        id: "m",
        kind: "moveBlock",
        blockId: "h",
        destination: { ...end, position: { kind: "after", blockId: "r" } },
      },
      "invalid_destination",
    ],
    [
      { id: "m", kind: "moveBlock", blockId: "h", destination: slot("missing") },
      "invalid_destination",
    ],
    [{ id: "r", kind: "removeBlock", blockId: "missing" }, "missing_target"],
    [
      {
        id: "e",
        kind: "editField",
        blockId: "c",
        field: "left",
        change: { kind: "set", value: [] },
      },
      "invalid_operation",
    ],
    [
      {
        id: "e",
        kind: "editField",
        blockId: "h",
        field: "id",
        change: { kind: "set", value: "changed" },
      },
      "invalid_operation",
    ],
  ])("rejects invalid destinations or targets for $kind", (operation, code) => {
    const current = page(hero(), columns());
    const before = structuredClone(current);
    expect(applyPageOperation({ page: current, operation, ...rules })).toMatchObject({
      ok: false,
      errors: [{ code }],
    });
    expect(current).toEqual(before);
  });

  test("initializes an omitted optional Slot without mutating its parent", () => {
    const block = columns();
    delete block.props.right;
    const result = insertBlockPreset({
      page: page(block),
      presets: presets(),
      component: "Hero",
      destination: slot(),
      generateId: () => "new",
      ...rules,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.content[0]!.props.right).toEqual([hero("new")]);
    expect(block.props).not.toHaveProperty("right");
  });

  test.each([null, {}, { ...edit("valid"), extra: true }, edit(undefined)])(
    "decodes malformed Operations safely",
    (operation) => {
      expect(applyPageOperation({ page: page(hero()), operation, ...rules })).toMatchObject({
        ok: false,
        errors: [{ code: "invalid_input" }],
      });
    },
  );

  test("refuses an invalid current Page before any mutation or ID generation", () => {
    const current = page({ ...hero(), type: "Disabled" });
    const generateId = vi.fn(() => "new");
    expect(
      applyPageOperation({
        page: current,
        operation: { id: "r", kind: "removeBlock", blockId: "h" },
        ...rules,
      }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_current" }] });
    expect(
      getRootBlockDestination({ page: current, selectedBlockId: null, ...rules }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_current" }] });
    expect(
      insertBlockPreset({
        page: current,
        presets: presets(),
        component: "Hero",
        destination: end,
        generateId,
        ...rules,
      }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_current" }] });
    expect(generateId).not.toHaveBeenCalled();
  });

  test("rejects non-JSON Pages and malformed envelopes before accessing data", () => {
    const getter = vi.fn(() => []);
    const current = Object.defineProperty(page(), "content", { enumerable: true, get: getter });
    expect(applyPageOperation({ page: current, operation: edit("new"), ...rules })).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_current" }],
    });
    expect(applyPageOperation(null as never)).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_input" }],
    });
    expect(getRootBlockDestination({ page: page(), selectedBlockId: " ", ...rules })).toMatchObject(
      { ok: false, errors: [{ code: "invalid_input" }] },
    );
    expect(insertBlockPreset(null as never)).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_input" }],
    });
    expect(getter).not.toHaveBeenCalled();
  });
});
