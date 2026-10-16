import { expect, test } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  createProposal,
  evaluateProposal,
  acceptProposal,
  rejectProposal,
  amendProposal,
  beginProposalReview,
  type ComponentRegistry,
  type Page,
} from "../src/index.ts";
import {
  MAX_PROPOSAL_BYTES,
  MAX_PROPOSAL_OPERATIONS,
  type Proposal,
  type CreateProposalInput,
  type EvaluateProposalInput,
} from "../src/index.ts";

const components: ComponentRegistry = {
  Hero: {
    label: "Hero",
    variants: ["centered", "split"],
    fields: { title: { type: "text" } },
    slots: {},
  },
};
const tokens = {};

test("G12 executes the exact first Proposal guide example through the built package root", () => {
  const guide = readFileSync(
    new URL("../../../apps/docs/src/content/docs/guides/first-proposal.md", import.meta.url),
    "utf8",
  );
  const code = guide.split("```js\n")[1]!.split("\n```")[0]!;
  const expected = guide.split("```json\n")[1]!.split("\n```")[0]!;
  const result = spawnSync(process.execPath, ["--input-type=module"], {
    input: code,
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(expected));
});

test("strict outer envelopes reject hidden properties, accessors and exotic prototypes", () => {
  const input = { id: "p", base, operations, components, tokens };
  const hidden = Object.defineProperty({ ...input }, "hidden", { value: 1 });
  const accessor = Object.defineProperty({ ...input }, "base", {
    enumerable: true,
    get() {
      throw new Error("must not run");
    },
  });
  for (const value of [
    hidden,
    accessor,
    Object.assign(Object.create({}), input),
    { ...input, [Symbol()]: 1 },
  ]) {
    expect(createProposal(value).ok).toBe(false);
  }
  const badBase = Object.defineProperty({ page }, "revision", {
    enumerable: true,
    get() {
      throw new Error("must not run");
    },
  });
  expect(createProposal({ ...input, base: badBase } as CreateProposalInput).ok).toBe(false);
  expect(createProposal({ ...input, base: null } as unknown as CreateProposalInput).ok).toBe(false);
});

test("G11 creation and acceptance enforce the exact enriched output byte boundary", () => {
  const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const seed = createProposal({ id: "p", base, operations: [operations[2]], components, tokens });
  if (!seed.ok) throw new Error("seed");
  const id = "p".repeat(MAX_PROPOSAL_BYTES - encoded(seed.proposal) + 1);
  const exact = createProposal({ id, base, operations: [operations[2]], components, tokens });
  expect(exact.ok).toBe(true);
  if (!exact.ok) return;
  expect(encoded(exact.proposal)).toBe(MAX_PROPOSAL_BYTES);
  expect(
    createProposal({ id: id + "é", base, operations: [operations[2]], components, tokens }),
  ).toMatchObject({
    ok: false,
    errors: [{ code: "proposal_limit", actual: MAX_PROPOSAL_BYTES + 2 }],
  });
  // With review already started, pending -> accepted grows by one byte.
  const reviewed = { ...exact.proposal, reviewStarted: true, id: exact.proposal.id + "p" };
  expect(encoded(reviewed)).toBe(MAX_PROPOSAL_BYTES);
  expect(
    acceptProposal({ proposal: reviewed, current: base, operationIds: ["c"], components, tokens }),
  ).toMatchObject({
    ok: false,
    errors: [{ code: "proposal_limit", actual: MAX_PROPOSAL_BYTES + 1 }],
  });
});
const page: Page = {
  formatVersion: 1,
  root: { props: {} },
  content: [{ type: "Hero", props: { id: "h", variant: "centered", title: "Hello" } }],
};
const base = { page, revision: "r1" };
const operations = [
  { id: "a", kind: "editField", blockId: "h", field: "title", change: { kind: "set", value: "A" } },
  { id: "b", kind: "editField", blockId: "h", field: "title", change: { kind: "set", value: "B" } },
  { id: "c", kind: "changeVariant", blockId: "h", variant: "split" },
];
function make() {
  const result = createProposal({ id: "p", base, operations, components, tokens });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.proposal;
}

test("greedy preview returns replayable IDs; explicit acceptance is atomic", () => {
  const proposal = make();
  const input = {
    proposal,
    current: { page, revision: "r2" },
    operationIds: ["c", "b", "a"],
    components,
    tokens,
  };
  const preview = evaluateProposal(input);
  expect(preview.ok).toBe(true);
  if (!preview.ok) return;
  expect(preview.applicableOperationIds).toEqual(["a", "c"]);
  expect(preview.conflicts.map((x) => x.operationId)).toEqual(["b"]);
  expect(acceptProposal(input).ok).toBe(false);
  const accepted = acceptProposal({ ...input, operationIds: preview.applicableOperationIds });
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) return;
  expect(accepted.page).toEqual(preview.previewPage);
  expect(accepted.proposal.operations.map((x) => x.status)).toEqual([
    "accepted",
    "pending",
    "accepted",
  ]);
  expect(accepted.expectedRevision).toBe("r2");
  expect(accepted.expectedProposalVersion).toBe(0);
  expect(accepted.proposal.version).toBe(1);
  expect(proposal.version).toBe(0);
});

test("retains rejection, freezes amendment and prevents replay", () => {
  const proposal = make();
  const rejected = rejectProposal({ proposal, operationIds: ["a"] });
  expect(rejected.ok).toBe(true);
  if (!rejected.ok) return;
  expect(rejected.proposal.operations[0]!.status).toBe("rejected");
  expect(rejectProposal({ proposal: rejected.proposal, operationIds: ["a"] }).ok).toBe(false);
  expect(
    amendProposal({ proposal: rejected.proposal, base, operations: [], components, tokens }).ok,
  ).toBe(false);
  const review = beginProposalReview({ proposal });
  expect(review.ok && review.proposal.reviewStarted).toBe(true);
});

test("G7 amendment appends independently against the authentic original base", () => {
  const proposal = make();
  const before = JSON.stringify(proposal);
  const extra = { id: "d", kind: "changeVariant", blockId: "h", variant: "split" };
  const amended = amendProposal({ proposal, base, operations: [extra], components, tokens });
  expect(amended.ok).toBe(true);
  if (!amended.ok) return;
  expect(amended.proposal.operations.slice(0, 3)).toEqual(proposal.operations);
  expect(amended.proposal.baseRevision).toBe("r1");
  expect(amended.expectedProposalVersion).toBe(0);
  expect(amended.proposal.version).toBe(1);
  expect(JSON.stringify(proposal)).toBe(before);
  expect(
    amendProposal({
      proposal,
      base: { ...base, revision: "wrong" },
      operations: [extra],
      components,
      tokens,
    }),
  ).toMatchObject({ ok: false, errors: [{ code: "base_revision" }] });
  expect(
    amendProposal({ proposal, base, operations: [extra, operations[0]], components, tokens }).ok,
  ).toBe(false);
  expect(
    amendProposal({
      proposal,
      base,
      operations: [extra, { ...extra, id: "e", blockId: "missing" }],
      components,
      tokens,
    }).ok,
  ).toBe(false);
  expect(amendProposal({ proposal, base, operations: [], components, tokens })).toMatchObject({
    ok: true,
    proposal: { version: 0 },
  });
  const current = structuredClone(page);
  current.content[0]!.props.title = "Human";
  expect(
    evaluateProposal({
      proposal: amended.proposal,
      current: { page: current, revision: "r9" },
      operationIds: ["d"],
      components,
      tokens,
    }),
  ).toMatchObject({ ok: true, conflicts: [] });
});

test("G8 empty selections/repeated begin are no-ops; safe-integer exhaustion only blocks mutations", () => {
  const proposal = make();
  expect(rejectProposal({ proposal, operationIds: [] })).toMatchObject({
    ok: true,
    proposal: { version: 0, reviewStarted: false },
  });
  expect(
    acceptProposal({ proposal, current: base, operationIds: [], components, tokens }),
  ).toMatchObject({ ok: true, proposal: { version: 0, reviewStarted: false }, page });
  const begun = beginProposalReview({ proposal });
  if (!begun.ok) throw new Error("begin");
  expect(beginProposalReview({ proposal: begun.proposal })).toMatchObject({
    ok: true,
    proposal: { version: 1 },
    expectedProposalVersion: 1,
  });
  const max = { ...proposal, version: Number.MAX_SAFE_INTEGER };
  expect(rejectProposal({ proposal: max, operationIds: [] }).ok).toBe(true);
  expect(beginProposalReview({ proposal: { ...max, reviewStarted: true } }).ok).toBe(true);
  expect(amendProposal({ proposal: max, base, operations: [], components, tokens }).ok).toBe(true);
  for (const result of [
    beginProposalReview({ proposal: max }),
    rejectProposal({ proposal: max, operationIds: ["a"] }),
    acceptProposal({ proposal: max, current: base, operationIds: ["a"], components, tokens }),
    amendProposal({
      proposal: max,
      base,
      operations: [{ ...operations[2], id: "d" }],
      components,
      tokens,
    }),
  ])
    expect(result).toMatchObject({ ok: false, errors: [{ code: "proposal_version" }] });
  for (const version of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "0"])
    expect(beginProposalReview({ proposal: { ...proposal, version } })).toMatchObject({
      ok: false,
      errors: [{ code: "proposal_version" }],
    });
});

test("G8 returned dual guards reject stale accept after reject in a host CAS simulation", () => {
  const proposal = make();
  const accept = acceptProposal({
    proposal,
    current: base,
    operationIds: ["a"],
    components,
    tokens,
  });
  const reject = rejectProposal({ proposal, operationIds: ["a"] });
  if (!accept.ok || !reject.ok) throw new Error("decisions");
  const host = { revision: "r1", proposal: reject.proposal };
  const canSave =
    host.revision === accept.expectedRevision &&
    host.proposal.version === accept.expectedProposalVersion;
  expect(canSave).toBe(false);
  expect(reject.expectedProposalVersion).toBe(0);
  expect(reject.proposal.version).toBe(1);
});

test("G8 selection rejects unknown, duplicate and settled IDs without mutation", () => {
  const proposal = make();
  for (const operationIds of [["missing"], ["a", "a"], [""], null]) {
    expect(rejectProposal({ proposal, operationIds: operationIds as string[] }).ok).toBe(false);
    expect(
      evaluateProposal({
        proposal,
        current: base,
        operationIds: operationIds as string[],
        components,
        tokens,
      }).ok,
    ).toBe(false);
  }
  const accepted = acceptProposal({
    proposal,
    current: base,
    operationIds: ["a"],
    components,
    tokens,
  });
  if (!accepted.ok) throw new Error("accept");
  expect(
    acceptProposal({
      proposal: accepted.proposal,
      current: base,
      operationIds: ["a"],
      components,
      tokens,
    }).ok,
  ).toBe(false);
  expect(proposal.operations.every((r) => r.status === "pending")).toBe(true);
});

test("G9 invalid snapshots fail at top level including empty selection and attempted repair", () => {
  const proposal = make();
  for (const badPage of [
    null,
    { ...page, formatVersion: 2 },
    { ...page, content: [{ ...page.content[0], type: "disabled" }] },
  ]) {
    expect(
      createProposal({
        id: "p",
        base: { page: badPage, revision: "r1" },
        operations,
        components,
        tokens,
      }),
    ).toMatchObject({ ok: false, errors: [{ code: "invalid_base" }] });
    for (const operationIds of [[], ["a"]])
      expect(
        evaluateProposal({
          proposal,
          current: { page: badPage, revision: "r1" },
          operationIds,
          components,
          tokens,
        }),
      ).toMatchObject({ ok: false, errors: [{ code: "invalid_current" }] });
  }
  const disabled = { Hero: { ...components.Hero!, variants: ["split"] } };
  expect(
    evaluateProposal({
      proposal,
      current: base,
      operationIds: ["c"],
      components: disabled,
      tokens,
    }),
  ).toMatchObject({ ok: false, errors: [{ code: "invalid_current" }] });
  expect(
    evaluateProposal({ proposal, current: base, operationIds: [], components: {}, tokens }),
  ).toMatchObject({ ok: false, errors: [{ code: "invalid_current" }] });
});

test("G1 envelopes and canonical record invariants are decoded strictly", () => {
  const proposal = make();
  const malformed: unknown[] = [
    null,
    [],
    { ...proposal, extra: true },
    { ...proposal, formatVersion: 2 },
    { ...proposal, operations: [] },
    { ...proposal, baseRevision: "" },
    { ...proposal, operations: [proposal.operations[0], proposal.operations[0]] },
    { ...proposal, operations: [{ ...proposal.operations[0], status: "accepted" }] },
    { ...proposal, operations: [{ ...proposal.operations[0], summary: "a".repeat(513) }] },
    ...[
      {},
      { target: { type: "Hero", value: { present: true } } },
      { target: { type: "", value: { present: false } } },
    ].map((guard) => ({ ...proposal, operations: [{ ...proposal.operations[0], guard }] })),
  ];
  for (const value of malformed) expect(beginProposalReview({ proposal: value }).ok).toBe(false);
  expect(createProposal(null as unknown as CreateProposalInput).ok).toBe(false);
  expect(evaluateProposal(null as unknown as EvaluateProposalInput).ok).toBe(false);
  expect(beginProposalReview({ proposal, extra: true } as { proposal: Proposal }).ok).toBe(false);
  expect(rejectProposal(null as unknown as { proposal: Proposal; operationIds: string[] }).ok).toBe(
    false,
  );
  expect(amendProposal(null as never).ok).toBe(false);
  expect(
    createProposal({ id: "p", base: { ...base, revision: "" }, operations, components, tokens }).ok,
  ).toBe(false);
});

test("G10 evidence and summaries are alias-safe, bounded, deterministic plain text", () => {
  const input = structuredClone({ id: "p", base, operations, components, tokens });
  const made = createProposal(input);
  if (!made.ok) throw new Error("create");
  const saved = JSON.stringify(made);
  input.base.page.content[0]!.props.title = "mutated";
  input.operations[0]!.change!.value = "mutated";
  expect(JSON.stringify(made)).toBe(saved);
  const result = createProposal({
    id: "p",
    base,
    operations: [
      { ...operations[0], change: { kind: "set", value: "<script>\n" + "é".repeat(1000) } },
    ],
    components,
    tokens,
  });
  if (!result.ok) throw new Error("create");
  const summary = result.proposal.operations[0]!.summary;
  expect(summary).toContain("Hello");
  expect(summary).toContain("…");
  expect(summary.length).toBeLessThan(320);
  expect(summary).toContain("<script>");
  expect(summary).not.toContain("\n");
});

test.each(["a", "😀"])("G10 decodes the 512-code-point summary boundary with %s", (character) => {
  const proposal = make();
  proposal.operations[0]!.summary = character.repeat(512);
  const before = structuredClone(proposal);
  const reviewed = beginProposalReview({ proposal });
  expect(reviewed.ok).toBe(true);
  if (reviewed.ok) expect(reviewed.proposal.operations).toEqual(proposal.operations);
  expect(proposal).toEqual(before);
  proposal.operations[0]!.summary += character;
  const oversized = structuredClone(proposal);
  expect(beginProposalReview({ proposal })).toMatchObject({
    ok: false,
    errors: [{ code: "invalid_input", affectedBlockIds: [] }],
  });
  expect(proposal).toEqual(oversized);
});

test("G11 count and UTF-8 budgets include terminal records, drafts and evidence", () => {
  expect(MAX_PROPOSAL_OPERATIONS).toBe(100);
  expect(MAX_PROPOSAL_BYTES).toBe(2_000_000);
  expect(createProposal({ id: "p", base, operations: [], components, tokens }).ok).toBe(false);
  const hundred = Array.from({ length: 100 }, (_, i) => ({ ...operations[2], id: String(i) }));
  const made = createProposal({ id: "p", base, operations: hundred, components, tokens });
  expect(made.ok).toBe(true);
  expect(
    createProposal({
      id: "p",
      base,
      operations: [...hundred, { ...operations[2], id: "100" }],
      components,
      tokens,
    }),
  ).toMatchObject({ ok: false, errors: [{ code: "proposal_limit", actual: 101, limit: 100 }] });
  if (!made.ok) return;
  expect(
    amendProposal({
      proposal: made.proposal,
      base,
      operations: [{ ...operations[2], id: "100" }],
      components,
      tokens,
    }),
  ).toMatchObject({ ok: false, errors: [{ code: "proposal_limit" }] });
  const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const exactDraft = [{ ...operations[0], change: { kind: "set", value: "" } }];
  const remaining = MAX_PROPOSAL_BYTES - encoded(exactDraft);
  exactDraft[0]!.change.value = "é".repeat(Math.floor(remaining / 2)) + "a".repeat(remaining % 2);
  expect(encoded(exactDraft)).toBe(MAX_PROPOSAL_BYTES);
  expect(
    createProposal({ id: "p", base, operations: exactDraft, components, tokens }),
  ).toMatchObject({ ok: false, errors: [{ code: "invalid_candidate" }] });
  exactDraft[0]!.change.value += "a";
  expect(
    createProposal({ id: "p", base, operations: exactDraft, components, tokens }),
  ).toMatchObject({
    ok: false,
    errors: [{ code: "proposal_limit", actual: MAX_PROPOSAL_BYTES + 1 }],
  });
  const canonical = make();
  canonical.id = "é".repeat(
    Math.floor((MAX_PROPOSAL_BYTES - encoded({ ...canonical, id: "" })) / 2),
  );
  canonical.id += "a".repeat(MAX_PROPOSAL_BYTES - encoded(canonical));
  expect(beginProposalReview({ proposal: canonical }).ok).toBe(true); // false -> true saves one byte.
  canonical.id += "a";
  expect(beginProposalReview({ proposal: canonical })).toMatchObject({
    ok: false,
    errors: [{ code: "proposal_limit", actual: MAX_PROPOSAL_BYTES + 1 }],
  });
  const largePage = structuredClone(page);
  largePage.content[0]!.props.title = "x".repeat(700_000);
  const repeated = [0, 1, 2].map((i) => ({ id: String(i), kind: "removeBlock", blockId: "h" }));
  expect(
    createProposal({
      id: "p",
      base: { page: largePage, revision: "r1" },
      operations: repeated,
      components,
      tokens,
    }),
  ).toMatchObject({ ok: false, errors: [{ code: "proposal_limit" }] });
  const huge = { ...operations[0], change: { kind: "set", value: "x".repeat(700_000) } };
  const one = createProposal({ id: "p", base, operations: [huge], components, tokens });
  if (!one.ok) throw new Error("one");
  const before = JSON.stringify(one.proposal);
  expect(
    amendProposal({
      proposal: one.proposal,
      base,
      operations: [
        { ...huge, id: "x" },
        { ...huge, id: "y" },
      ],
      components,
      tokens,
    }).ok,
  ).toBe(false);
  expect(JSON.stringify(one.proposal)).toBe(before);
});
