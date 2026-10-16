import { describe, expect, test } from "vite-plus/test";
import {
  createProposal,
  evaluateProposal,
  acceptProposal,
  type Block,
  type Page,
  type ComponentRegistry,
  type Operation,
  type BlockDestination,
} from "../src/index.ts";

const components: ComponentRegistry = {
  Hero: {
    label: "Hero",
    variants: ["centered", "split"],
    fields: {
      title: { type: "text", required: true },
      note: { type: "text" },
      count: { type: "number" },
      visible: { type: "boolean" },
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
const hero = (id = "h"): Block => ({
  type: "Hero",
  props: { id, variant: "centered", title: "Hello" },
});
const page = (...content: Block[]): Page => ({ formatVersion: 1, root: { props: {} }, content });
const columns = (): Block => ({
  type: "Columns",
  props: { id: "c", variant: "equal", left: [hero("l")], right: [] },
});
const end = { container: { kind: "root" as const }, position: { kind: "end" as const } };
const slot = (name = "right") => ({
  container: { kind: "slot" as const, parentId: "c", slot: name },
  position: { kind: "end" as const },
});
const anchored = (kind: "before" | "after", blockId = "h") => ({
  ...end,
  position: { kind, blockId },
});
const defaultPage = () => page(hero(), hero("b"), columns());
function create(operations: unknown, base = defaultPage(), registry = components) {
  return createProposal({
    id: "p",
    base: { page: base, revision: "r1" },
    operations,
    components: registry,
    tokens,
  });
}
function run(operation: Operation, current = defaultPage(), base = defaultPage()) {
  const made = create([operation], base);
  if (!made.ok) throw new Error(JSON.stringify(made.errors));
  return evaluateProposal({
    proposal: made.proposal,
    current: { page: current, revision: "r1" },
    operationIds: [operation.id],
    components,
    tokens,
  });
}
const edit = (field = "title", value: unknown = "New"): Operation => ({
  id: "e",
  kind: "editField",
  blockId: "h",
  field,
  change: { kind: "set", value },
});
const move = (destination: BlockDestination = end): Operation => ({
  id: "m",
  kind: "moveBlock",
  blockId: "h",
  destination,
});

describe("G10 exact Operation summaries", () => {
  test.each<[Operation, string]>([
    [edit(), 'Hero: h: title "Hello" → "New"'],
    [
      { id: "v", kind: "changeVariant", blockId: "h", variant: "split" },
      'Hero: h: variant "centered" → "split"',
    ],
    [
      { id: "a", kind: "addBlock", block: hero("new"), destination: end },
      "Hero: add new to Page at current end",
    ],
    [{ id: "r", kind: "removeBlock", blockId: "b" }, "Hero: remove b"],
    [move(slot()), "Hero: move h to c.right at current end"],
    [
      {
        id: "p",
        kind: "insertPattern",
        blocks: [hero("x"), hero("y")],
        destination: anchored("before"),
      },
      "Pattern: insert 2 Blocks into Page before h",
    ],
    [move(anchored("after", "b")), "Hero: move h to Page after b"],
  ])("formats $kind with its target and destination", (operation, summary) => {
    const base = defaultPage();
    const before = structuredClone({ base, operation });
    const made = create([operation], base);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.proposal.operations[0]).toMatchObject({ operation, summary });
    expect({ base, operation }).toEqual(before);
  });

  test.each<[string, unknown, unknown, string]>([
    ["note", undefined, "", 'Hero: h: note <unset> → ""'],
    ["note", "", undefined, 'Hero: h: note "" → <unset>'],
    ["note", "  ", "\t\r\n", 'Hero: h: note "" → ""'],
    ["note", "  old\r\n\ttext  ", "\tnew\n\r\ttext\n", 'Hero: h: note "old text" → "new text"'],
    ["note", 'a "quote"', "a \\ path", 'Hero: h: note "a \\"quote\\"" → "a \\\\ path"'],
    ["count", 0, 42.5, "Hero: h: count 0 → 42.5"],
    ["visible", false, true, "Hero: h: visible false → true"],
    ["color", undefined, { token: "ink" }, 'Hero: h: color <unset> → {"token":"ink"}'],
    [
      "note",
      "😀".repeat(40),
      "😀".repeat(41),
      `Hero: h: note "${"😀".repeat(40)}" → "${"😀".repeat(39)}…"`,
    ],
    [
      "note",
      "x".repeat(39),
      "x".repeat(40),
      `Hero: h: note "${"x".repeat(39)}" → "${"x".repeat(40)}"`,
    ],
  ])("formats %s without changing values or guards", (field, old, value, summary) => {
    const block = hero();
    if (old !== undefined) block.props[field] = old;
    const base = page(block);
    const operation: Operation =
      value === undefined
        ? { id: "e", kind: "editField", blockId: "h", field, change: { kind: "unset" } }
        : edit(field, value);
    const before = structuredClone({ base, operation });
    const made = create([operation], base);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const record = made.proposal.operations[0]!;
    expect(record.summary).toBe(summary);
    expect(record.operation).toEqual(operation);
    expect(record.guard).toEqual({
      target: {
        type: "Hero",
        value: old === undefined ? { present: false } : { present: true, value: old },
      },
    });
    const accepted = acceptProposal({
      proposal: made.proposal,
      current: { page: base, revision: "r1" },
      operationIds: [operation.id],
      components,
      tokens,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.page.content[0]!.props[field]).toEqual(value);
    expect(accepted.proposal.operations[0]!.guard).toEqual(record.guard);
    expect({ base, operation }).toEqual(before);
  });

  test.each([511, 512, 513])("bounds a %i-code-point summary and preserves IDs", (length) => {
    // "Hero: remove " contributes 13 code points.
    const id = "😀".repeat(length - 13);
    const base = page(hero(id));
    const operation: Operation = { id: "remove", kind: "removeBlock", blockId: id };
    const before = structuredClone({ base, operation });
    const made = create([operation], base);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const record = made.proposal.operations[0]!;
    expect(record.summary).toBe(
      length <= 512 ? `Hero: remove ${id}` : `Hero: remove ${"😀".repeat(498)}…`,
    );
    expect(Array.from(record.summary)).toHaveLength(Math.min(length, 512));
    expect(record.operation).toEqual(operation);
    expect(record.guard).toEqual({
      target: { type: "Hero", value: { present: true, value: base.content[0] } },
    });
    expect({ base, operation }).toEqual(before);
  });
});

describe("G1 decoding and G2 scalar Operations", () => {
  test.each<Operation>([
    edit(),
    { id: "v", kind: "changeVariant", blockId: "h", variant: "split" },
    { id: "a", kind: "addBlock", block: hero("new"), destination: end },
    { id: "r", kind: "removeBlock", blockId: "b" },
    move(),
    { id: "p", kind: "insertPattern", blocks: [hero("x"), hero("y")], destination: end },
  ])("applies $kind independently with a deterministic summary and no mutation", (operation) => {
    const base = defaultPage();
    const before = JSON.stringify({ base, operation });
    const made = create([operation], base);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const again = create([operation], base);
    expect(again).toEqual(made);
    expect(made.proposal.operations[0]!.summary.length).toBeGreaterThan(0);
    const result = run(operation, base, base);
    expect(result.ok && result.applicableOperationIds).toEqual([operation.id]);
    expect(JSON.stringify({ base, operation })).toBe(before);
  });
  test.each([
    null,
    [],
    {},
    { id: "a", kind: "unknown" },
    { id: "a", kind: "removeBlock", blockId: "h", extra: true },
    { id: "", kind: "removeBlock", blockId: "h" },
  ])("rejects malformed Operation %j", (operation) => {
    expect(create([operation]).ok).toBe(false);
  });
  test("rejects non-JSON values, exotic objects, accessors, symbols, sparse arrays and cycles", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const getter = Object.defineProperty({}, "x", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });
    for (const value of [
      undefined,
      NaN,
      Infinity,
      1n,
      () => 1,
      Symbol(),
      new Date(),
      new Map(),
      cycle,
      getter,
      { [Symbol()]: 1 },
      Array(2),
    ]) {
      expect(create([{ ...edit(), change: { kind: "set", value } }]).ok).toBe(false);
    }
    expect(create({}).ok).toBe(false);
    expect(create(Object.setPrototypeOf([edit()], null)).ok).toBe(false);
    expect(create(Object.setPrototypeOf([edit()], {})).ok).toBe(false);
    expect(create([edit(), edit()]).ok).toBe(false);
  });
  test.each([
    ["title", ""],
    ["count", 0],
    ["visible", false],
    ["color", { token: "ink" }],
  ])("sets declared %s values", (field, value) => {
    const operation = edit(field as string, value);
    const result = run(operation);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.conflicts).toEqual([]);
    expect(result.applicableOperationIds).toEqual([operation.id]);
    expect(result.previewPage.content[0]!.props[field as string]).toEqual(value);
  });
  test("unset distinguishes absent and empty, and cannot remove required fields", () => {
    const op: Operation = {
      id: "u",
      kind: "editField",
      blockId: "h",
      field: "note",
      change: { kind: "unset" },
    };
    const base = defaultPage();
    base.content[0]!.props.note = "";
    const result = run(op, base, base);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.conflicts).toEqual([]);
    expect(result.applicableOperationIds).toEqual([op.id]);
    expect(Object.hasOwn(result.previewPage.content[0]!.props, "note")).toBe(false);
    expect(create([{ ...op, field: "title" }]).ok).toBe(false);
    expect(create([edit("note", null)]).ok).toBe(false);
    expect(create([edit("id", "x")]).ok).toBe(false);
    expect(create([edit("toString", "x")]).ok).toBe(false);
  });
  test("guards own field/type even when revision matches; other fields stay editable", () => {
    const current = defaultPage();
    current.content[0]!.props.note = "Human";
    expect(run(edit(), current)).toMatchObject({ ok: true, conflicts: [] });
    current.content[0]!.props.title = "Human";
    expect(run(edit(), current)).toMatchObject({
      ok: true,
      conflicts: [{ code: "guard_conflict", operationId: "e", affectedBlockIds: ["h"] }],
    });
    expect(
      run({ id: "v", kind: "changeVariant", blockId: "h", variant: "split" }, current),
    ).toMatchObject({ ok: true, conflicts: [] });
    current.content[0]!.props.variant = "split";
    expect(
      run({ id: "v", kind: "changeVariant", blockId: "h", variant: "split" }, current),
    ).toMatchObject({ ok: true, conflicts: [{ code: "guard_conflict" }] });
    expect(run(edit(), page(hero("b"), columns()))).toMatchObject({
      ok: true,
      conflicts: [{ code: "missing_target" }],
    });
  });
  test("prototype identifiers are ordinary own data and inherited declarations do not count", () => {
    const registry = JSON.parse(JSON.stringify(components)) as ComponentRegistry;
    Object.defineProperty(registry.Hero!.fields, "__proto__", {
      value: { type: "text" },
      enumerable: true,
    });
    const base = page(hero("__proto__"));
    Object.defineProperty(base.content[0]!.props, "__proto__", { value: "old", enumerable: true });
    const made = create(
      [{ ...edit("__proto__", "new"), blockId: "__proto__", id: "constructor" }],
      base,
      registry,
    );
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const result = acceptProposal({
      proposal: made.proposal,
      current: { page: base, revision: "r1" },
      operationIds: ["constructor"],
      components: registry,
      tokens,
    });
    expect(result.ok && result.page.content[0]!.props.__proto__).toBe("new");
    expect(Object.getPrototypeOf(base.content[0]!.props)).toBe(Object.prototype);
  });
});

describe("G3 additions and literal destinations", () => {
  test("adds complete subtrees and materializes an omitted optional Slot", () => {
    const base = page();
    const op: Operation = { id: "a", kind: "addBlock", block: columns(), destination: end };
    expect(run(op, base, base)).toMatchObject({ ok: true, conflicts: [] });
    const missing = defaultPage();
    delete missing.content[2]!.props.right;
    expect(
      run({ id: "a", kind: "addBlock", block: hero("new"), destination: slot() }, missing, missing),
    ).toMatchObject({ ok: true, conflicts: [] });
  });
  test("follows anchors within their container and preserves concurrent end appends", () => {
    const current = page(hero("b"), hero(), columns(), hero("human"));
    const after = run(
      { id: "a", kind: "addBlock", block: hero("new"), destination: anchored("after") },
      current,
    );
    expect(after.ok && after.previewPage.content.map((b) => b.props.id)).toEqual([
      "b",
      "h",
      "new",
      "c",
      "human",
    ]);
    const atEnd = run({ id: "a", kind: "addBlock", block: hero("new"), destination: end }, current);
    expect(atEnd.ok && atEnd.previewPage.content.at(-2)!.props.id).toBe("human");
  });
  test("missing/moved anchors and changed destination types conflict", () => {
    const op: Operation = {
      id: "a",
      kind: "addBlock",
      block: hero("new"),
      destination: anchored("before"),
    };
    expect(run(op, page(hero("b"), columns()))).toMatchObject({
      ok: true,
      conflicts: [{ code: "invalid_destination" }],
    });
    const c = columns();
    c.props.right = [hero()];
    expect(run(op, page(hero("b"), c))).toMatchObject({
      ok: true,
      conflicts: [{ code: "invalid_destination" }],
    });
    const changed = defaultPage();
    changed.content[0] = {
      ...columns(),
      props: { ...columns().props, id: "h", left: [hero("other")] },
    };
    expect(run(op, changed)).toMatchObject({ ok: true, conflicts: [{ code: "guard_conflict" }] });
  });
  test("candidate rules retain depth, IDs, counts, fields, tokens and size", () => {
    for (const block of [
      hero("h"),
      { ...hero("new"), type: "Disabled" },
      { type: "Hero", props: { id: "new", variant: "bad", title: "" } },
      {
        type: "Hero",
        props: { id: "new", variant: "centered", title: "x", color: { token: "missing" } },
      },
      { type: "Hero", props: { id: "new", variant: "centered", title: "é".repeat(500_000) } },
    ]) {
      expect(create([{ id: "a", kind: "addBlock", block, destination: end }]).ok).toBe(false);
    }
    expect(
      create([
        {
          id: "a",
          kind: "addBlock",
          block: { ...columns(), props: { ...columns().props, id: "nested" } },
          destination: slot(),
        },
      ]).ok,
    ).toBe(false);
    expect(
      create([{ id: "a", kind: "addBlock", block: hero("n"), destination: slot("missing") }]).ok,
    ).toBe(false);
    const current = defaultPage();
    current.content.push(hero("new"));
    expect(
      run({ id: "a", kind: "addBlock", block: hero("new"), destination: end }, current),
    ).toMatchObject({
      ok: true,
      conflicts: [{ code: "invalid_candidate", affectedBlockIds: ["new"] }],
    });
  });
});

describe("G4 removal and G5 conservative moves", () => {
  test("removal guards the complete subtree but ignores unrelated edits", () => {
    const op: Operation = { id: "r", kind: "removeBlock", blockId: "c" };
    const current = defaultPage();
    current.content[0]!.props.title = "Human";
    expect(run(op, current)).toMatchObject({ ok: true, conflicts: [] });
    (current.content[2]!.props.left as Block[])[0]!.props.title = "Edited child";
    expect(run(op, current)).toMatchObject({ ok: true, conflicts: [{ code: "guard_conflict" }] });
    expect(create([{ id: "r", kind: "removeBlock", blockId: "l" }]).ok).toBe(false);
  });
  test("moves between Slots preserving both contents and caller inputs", () => {
    const container = columns();
    const moved = hero("h");
    moved.props.note = "Keep this content";
    container.props.left = [hero("l"), moved];
    container.props.right = [hero("r")];
    const base = page(container);
    const operation = move(slot());
    const before = structuredClone({ base, operation });
    const result = run(operation, base, base);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.conflicts).toEqual([]);
    expect(result.applicableOperationIds).toEqual([operation.id]);
    expect(result.previewPage).toEqual(
      page({
        ...container,
        props: { ...container.props, left: [hero("l")], right: [hero("r"), moved] },
      }),
    );
    expect({ base, operation }).toEqual(before);
  });
  test("moves from root to Slot and allows an already-achieved placement", () => {
    expect(run(move(slot()))).toMatchObject({ ok: true, conflicts: [] });
    const base = page(hero(), hero("b"));
    expect(run(move(anchored("before", "b")), base, base)).toMatchObject({
      ok: true,
      conflicts: [],
    });
    const fixed = columns();
    fixed.props.left = [hero(), hero("l")];
    const sameSlot = {
      container: { kind: "slot" as const, parentId: "c", slot: "left" },
      position: { kind: "end" as const },
    };
    const result = run(move(sameSlot), page(fixed), page(fixed));
    expect(
      result.ok && (result.previewPage.content[0]!.props.left as Block[]).map((b) => b.props.id),
    ).toEqual(["l", "h"]);
  });
  test("rejects self/descendant destinations and self anchors", () => {
    expect(create([move(anchored("before"))]).ok).toBe(false);
    expect(create([{ id: "m", kind: "moveBlock", blockId: "c", destination: slot() }]).ok).toBe(
      false,
    );
    expect(
      create([
        {
          id: "m",
          kind: "moveBlock",
          blockId: "c",
          destination: {
            container: { kind: "slot", parentId: "l", slot: "x" },
            position: { kind: "end" },
          },
        },
      ]).ok,
    ).toBe(false);
  });
  test("nearby source changes conflict; distant insertion and sibling fields do not", () => {
    for (const current of [
      page(hero("b"), hero(), columns()),
      page(hero(), hero("near"), hero("b"), columns()),
      page(hero(), columns()),
    ]) {
      expect(run(move(), current)).toMatchObject({
        ok: true,
        conflicts: [{ code: "guard_conflict" }],
      });
    }
    const current = defaultPage();
    current.content.push(hero("distant"));
    current.content[1]!.props.title = "Human";
    expect(run(move(), current)).toMatchObject({ ok: true, conflicts: [] });
    current.content[0]!.props.title = "Changed subtree";
    expect(run(move(), current)).toMatchObject({
      ok: true,
      conflicts: [{ code: "guard_conflict" }],
    });
  });
  test("fixed cardinality replacement cannot be expressed by independent remove/add", () => {
    const registry = structuredClone(components);
    registry.Columns!.slots.left!.max = 1;
    expect(
      create([{ id: "r", kind: "removeBlock", blockId: "l" }], defaultPage(), registry).ok,
    ).toBe(false);
    expect(
      create(
        [{ id: "a", kind: "addBlock", block: hero("new"), destination: slot("left") }],
        defaultPage(),
        registry,
      ).ok,
    ).toBe(false);
    const full = defaultPage();
    (full.content[2]!.props.left as Block[]).push(hero("l2"));
    expect(create([move(slot("left"))], full).ok).toBe(false);
  });
});

describe("G6 copied Pattern and insertion order", () => {
  test("a within-budget large malformed Pattern returns a structured failure without mutation", () => {
    const base = defaultPage();
    const operations = [
      {
        id: "large-pattern",
        kind: "insertPattern",
        blocks: Array.from({ length: 200_000 }, () => ({})),
        destination: end,
      },
    ];
    const before = JSON.stringify({ base, operations });
    expect(new TextEncoder().encode(JSON.stringify(operations)).byteLength).toBeLessThan(2_000_000);
    expect(() => {
      expect(create(operations, base)).toMatchObject({
        ok: false,
        errors: [{ code: "invalid_candidate", operationId: "large-pattern" }],
      });
    }).not.toThrow();
    expect(JSON.stringify({ base, operations })).toBe(before);
  });
  test.each(["before", "after", "end"] as const)(
    "copies complete nested Pattern payloads in order at %s without mutation",
    (kind) => {
      const nested = columns();
      nested.props.id = "copied-columns";
      nested.props.left = [hero("copied-left-1"), hero("copied-left-2")];
      const child = hero("copied-right");
      Object.assign(child.props, {
        note: "Copied content",
        count: 0,
        visible: false,
        color: { token: "ink" },
      });
      nested.props.right = [child];
      const blocks = [hero("copied-first"), nested, hero("copied-last")];
      const base = defaultPage();
      const operation: Operation = {
        id: "p",
        kind: "insertPattern",
        blocks,
        destination: kind === "end" ? end : anchored(kind),
      };
      const before = structuredClone({ base, operation });
      const result = run(operation, base, base);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      expect(result.conflicts).toEqual([]);
      expect(result.applicableOperationIds).toEqual(["p"]);
      const content =
        kind === "before"
          ? [...blocks, ...base.content]
          : kind === "after"
            ? [base.content[0], ...blocks, ...base.content.slice(1)]
            : [...base.content, ...blocks];
      expect(result.previewPage).toEqual({ ...base, content });
      expect({ base, operation }).toEqual(before);
      nested.props.left = [];
      expect(
        result.previewPage.content.find((block) => block.props.id === "copied-columns"),
      ).toEqual(before.operation.blocks[1]);
    },
  );
  test("nested copied IDs colliding within a payload or the base reject creation wholly", () => {
    for (const collisionId of ["l", "copied-first"]) {
      const nested = columns();
      nested.props.id = "copied-columns";
      nested.props.left = [hero(collisionId)];
      const base = defaultPage();
      const operation = {
        id: "p",
        kind: "insertPattern",
        blocks: [hero("copied-first"), nested],
        destination: end,
      };
      const before = structuredClone({ base, operation });
      expect(create([operation], base)).toMatchObject({
        ok: false,
        errors: [{ code: "invalid_candidate", validationErrors: [{ code: "duplicate_id" }] }],
      });
      expect({ base, operation }).toEqual(before);
    }
  });
  test("a concurrent nested ID collision discards the entire Pattern and fails acceptance atomically", () => {
    const nested = columns();
    nested.props.id = "copied-columns";
    nested.props.left = [hero("copied-child")];
    const operation = {
      id: "p",
      kind: "insertPattern",
      blocks: [hero("copied-first"), nested],
      destination: end,
    };
    const base = defaultPage();
    const made = create([operation], base);
    expect(made.ok).toBe(true);
    if (!made.ok) throw new Error(JSON.stringify(made.errors));
    const current = defaultPage();
    (current.content[2]!.props.right as Block[]).push(hero("copied-child"));
    const input = {
      proposal: made.proposal,
      current: { page: current, revision: "r2" },
      operationIds: ["p"],
      components,
      tokens,
    };
    const before = structuredClone({ base, operation, input });
    const result = evaluateProposal(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.applicableOperationIds).toEqual([]);
    expect(result.conflicts).toMatchObject([
      { operationId: "p", code: "invalid_candidate", validationErrors: [{ code: "duplicate_id" }] },
    ]);
    expect(result.previewPage).toEqual(current);
    expect(acceptProposal(input)).toMatchObject({
      ok: false,
      errors: [{ operationId: "p", code: "invalid_candidate" }],
    });
    expect({ base, operation, input }).toEqual(before);
  });
  test("guarded subtrees compare structurally rather than by object key order", () => {
    const base = defaultPage();
    const current = defaultPage();
    current.content[0] = { props: { title: "Hello", variant: "centered", id: "h" }, type: "Hero" };
    expect(run(move(), current, base)).toMatchObject({ ok: true, conflicts: [] });
  });
  test("used tokens disabled on current Page are top-level failures even for no selection", () => {
    const base = defaultPage();
    base.content[0]!.props.color = { token: "ink" };
    const made = create([edit()], base);
    if (!made.ok) throw new Error("create");
    expect(
      evaluateProposal({
        proposal: made.proposal,
        current: { page: base, revision: "r1" },
        operationIds: [],
        components,
        tokens: {},
      }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_current" }] });
  });
  test("affected IDs deduplicate target, destination parent, anchor and nested collision IDs", () => {
    const op: Operation = {
      id: "p",
      kind: "insertPattern",
      blocks: [hero("x"), hero("y")],
      destination: {
        container: { kind: "slot", parentId: "c", slot: "right" },
        position: { kind: "after", blockId: "b" },
      },
    };
    const base = page(hero(), columns());
    (base.content[1]!.props.right as Block[]).push(hero("b"));
    // The two new children exceed max=2; the entire Pattern fails.
    const made = create([op], base);
    expect(made).toMatchObject({
      ok: false,
      errors: [{ affectedBlockIds: ["c", "b"], validationErrors: [{ code: "slot_count" }] }],
    });
  });
  test.each(["before", "after", "end"] as const)("Pattern preserves order at %s", (kind) => {
    const destination = kind === "end" ? end : anchored(kind);
    const result = run({
      id: "p",
      kind: "insertPattern",
      blocks: [hero("x"), hero("y")],
      destination,
    });
    expect(result.ok && result.previewPage.content.map((b) => b.props.id).join(",")).toContain(
      "x,y",
    );
  });
  test.each(["before", "after", "end"] as const)(
    "repeated literal %s has no hidden insertion cursor",
    (kind) => {
      const destination = kind === "end" ? end : anchored(kind);
      const made = create(
        ["x", "y"].map((id) => ({ id, kind: "addBlock", block: hero(id), destination })),
      );
      if (!made.ok) throw new Error("create");
      const result = evaluateProposal({
        proposal: made.proposal,
        current: { page: defaultPage(), revision: "r2" },
        operationIds: ["y", "x"],
        components,
        tokens,
      });
      const ids = result.ok && result.previewPage.content.map((b) => b.props.id).join(",");
      expect(ids).toContain(kind === "after" ? "h,y,x" : "x,y");
    },
  );
  test("empty/late-invalid/colliding payloads fail wholly and new IDs cannot be referenced", () => {
    for (const blocks of [
      [],
      [hero("x"), hero("h")],
      [hero("x"), { type: "No", props: { id: "y", variant: "centered" } }],
    ]) {
      expect(create([{ id: "p", kind: "insertPattern", blocks, destination: end }]).ok).toBe(false);
    }
    expect(
      create([
        { id: "a", kind: "addBlock", block: hero("new"), destination: end },
        { ...edit(), blockId: "new" },
      ]).ok,
    ).toBe(false);
  });
});
