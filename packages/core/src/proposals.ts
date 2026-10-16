import { validatePage } from "./page.ts";
import {
  applyOperation,
  budget,
  containerShape,
  copy,
  decodeOperations,
  failure,
  isJson,
  keys,
  nonempty,
  object,
  operationShape,
} from "./operations.ts";
import type {
  AcceptProposalInput,
  AcceptProposalResult,
  AmendProposalInput,
  AmendProposalResult,
  BeginProposalReviewInput,
  BeginProposalReviewResult,
  CreateProposalInput,
  CreateProposalResult,
  EvaluateProposalInput,
  EvaluateProposalResult,
  OperationGuard,
  Page,
  PageSnapshot,
  Proposal,
  ProposalDecisionResult,
  ProposalFailure,
  ProposalRules,
  RejectProposalInput,
  RejectProposalResult,
} from "./schema.ts";

function guardShape(value: unknown, kind: string): value is OperationGuard {
  const required = [
    ...(["editField", "changeVariant", "moveBlock", "removeBlock"].includes(kind)
      ? ["target"]
      : []),
    ...(kind === "moveBlock" ? ["source"] : []),
    ...(["moveBlock", "addBlock", "insertPattern"].includes(kind) ? ["destination"] : []),
  ];
  if (!object(value) || !keys(value, required)) return false;
  if (value.target !== undefined) {
    const t = value.target;
    if (!object(t) || !keys(t, ["type", "value"]) || !nonempty(t.type) || !object(t.value))
      return false;
    if (
      t.value.present === false
        ? !keys(t.value, ["present"])
        : t.value.present !== true || !keys(t.value, ["present", "value"])
    )
      return false;
  }
  if (value.source !== undefined) {
    const s = value.source;
    if (
      !object(s) ||
      !keys(s, ["container", "previous", "next"]) ||
      !containerShape(s.container) ||
      !(s.previous === null || nonempty(s.previous)) ||
      !(s.next === null || nonempty(s.next))
    )
      return false;
  }
  if (value.destination !== undefined) {
    const d = value.destination;
    if (
      !object(d) ||
      !keys(d, ["parentType", "anchorType"]) ||
      !(d.parentType === null || nonempty(d.parentType)) ||
      !(d.anchorType === null || nonempty(d.anchorType))
    )
      return false;
  }
  return true;
}

function decodeProposal(value: unknown): { ok: true; proposal: Proposal } | ProposalFailure {
  if (!isJson(value) || !object(value))
    return failure("invalid_input", "A Proposal must be a JSON object.");
  const limited = budget(
    value,
    Array.isArray(value.operations) ? value.operations.length : undefined,
  );
  if (limited) return limited;
  if (value.formatVersion !== 1)
    return failure("proposal_format", "Expected Proposal format version 1.");
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 0)
    return failure("proposal_version", "Proposal version must be a nonnegative safe integer.");
  if (
    !keys(value, [
      "formatVersion",
      "id",
      "baseRevision",
      "version",
      "reviewStarted",
      "operations",
    ]) ||
    !nonempty(value.id) ||
    !nonempty(value.baseRevision) ||
    typeof value.reviewStarted !== "boolean" ||
    !Array.isArray(value.operations) ||
    !value.operations.length
  )
    return failure("invalid_input", "Malformed Proposal envelope.");
  const ids = new Set<string>();
  for (const record of value.operations) {
    if (
      !object(record) ||
      !keys(record, ["operation", "guard", "summary", "status"]) ||
      !operationShape(record.operation) ||
      !guardShape(record.guard, record.operation.kind) ||
      typeof record.summary !== "string" ||
      Array.from(record.summary).length > 512 ||
      !["pending", "accepted", "rejected"].includes(record.status as string) ||
      (!value.reviewStarted && record.status !== "pending") ||
      ids.has(record.operation.id)
    )
      return failure("invalid_input", "Malformed Operation record, guard, status or duplicate ID.");
    ids.add(record.operation.id);
  }
  return { ok: true, proposal: copy(value) as unknown as Proposal };
}
function snapshot(
  input: unknown,
  rules: ProposalRules,
  kind: "base" | "current",
): { ok: true; page: Page; revision: string } | ProposalFailure {
  if (!object(input) || !keys(input, ["page", "revision"]) || !nonempty(input.revision))
    return failure("invalid_input", "A Page snapshot needs a Page and non-empty revision.");
  if (!isJson(input.page))
    return failure(
      kind === "base" ? "invalid_base" : "invalid_current",
      "A Page snapshot must contain JSON data.",
    );
  const validationErrors = validatePage(input.page, rules.components, rules.tokens);
  if (validationErrors.length)
    return failure(
      kind === "base" ? "invalid_base" : "invalid_current",
      `The ${kind} Page is invalid under the current Design System.`,
      { validationErrors },
    );
  return { ok: true, page: copy(input.page) as Page, revision: input.revision };
}
function envelope(input: unknown, names: string[]): input is Record<string, unknown> {
  return object(input) && keys(input, names);
}
function append(
  proposal: Proposal,
  input: { base: PageSnapshot; operations: unknown } & ProposalRules,
): CreateProposalResult {
  const base = snapshot(input.base, input, "base");
  if (!base.ok) return base;
  if (base.revision !== proposal.baseRevision)
    return failure("base_revision", "Amendment requires the original base revision.");
  const decoded = decodeOperations(input.operations);
  if (!decoded.ok) return decoded;
  const countLimit = budget(proposal, proposal.operations.length + decoded.operations.length);
  if (countLimit) return countLimit;
  const ids = new Set(proposal.operations.map((r) => r.operation.id));
  for (const operation of decoded.operations) {
    if (ids.has(operation.id))
      return failure("invalid_input", "Operation ID already exists.", {
        operationId: operation.id,
      });
    ids.add(operation.id);
    // Independently derive against the original base, never against previous output.
    const applied = applyOperation({ operation }, base.page, input);
    if (!applied.ok) return applied;
    proposal.operations.push({
      operation,
      guard: applied.guard,
      summary: applied.summary,
      status: "pending",
    });
    const limited = budget(proposal);
    if (limited) return limited; // Bound retained evidence before validating another candidate.
  }
  return { ok: true, proposal };
}

export function createProposal(input: CreateProposalInput): CreateProposalResult {
  if (!envelope(input, ["id", "base", "operations", "components", "tokens"]) || !nonempty(input.id))
    return failure("invalid_input", "Malformed createProposal input.");
  // Inspect the snapshot envelope before reading a caller-supplied revision.
  if (!object(input.base) || !keys(input.base, ["page", "revision"]))
    return failure("invalid_input", "A Page snapshot needs a Page and non-empty revision.");
  const proposal: Proposal = {
    formatVersion: 1,
    id: input.id,
    baseRevision: input.base.revision,
    version: 0,
    reviewStarted: false,
    operations: [],
  };
  const result = append(proposal, input);
  if (result.ok && !result.proposal.operations.length)
    return failure("invalid_input", "A Proposal needs at least one Operation.");
  return result;
}

function decision(proposal: Proposal, changed: boolean): ProposalDecisionResult {
  const expectedProposalVersion = proposal.version;
  if (changed) {
    if (proposal.version === Number.MAX_SAFE_INTEGER)
      return failure("proposal_version", "Proposal decision version is exhausted.");
    proposal.version++;
  }
  const limited = budget(proposal);
  return limited ?? { ok: true, proposal, expectedProposalVersion };
}
export function amendProposal(input: AmendProposalInput): AmendProposalResult {
  if (!envelope(input, ["proposal", "base", "operations", "components", "tokens"]))
    return failure("invalid_input", "Malformed amendProposal input.");
  const decoded = decodeProposal(input.proposal);
  if (!decoded.ok) return decoded;
  if (decoded.proposal.reviewStarted)
    return failure("review_started", "Review has begun; create a new Proposal.");
  const originalCount = decoded.proposal.operations.length;
  const appended = append(decoded.proposal, input);
  if (!appended.ok) return appended;
  return decision(appended.proposal, appended.proposal.operations.length !== originalCount);
}
export function beginProposalReview(input: BeginProposalReviewInput): BeginProposalReviewResult {
  if (!envelope(input, ["proposal"]))
    return failure("invalid_input", "Malformed beginProposalReview input.");
  const decoded = decodeProposal(input.proposal);
  if (!decoded.ok) return decoded;
  const changed = !decoded.proposal.reviewStarted;
  decoded.proposal.reviewStarted = true;
  return decision(decoded.proposal, changed);
}
function selection(
  proposal: Proposal,
  value: unknown,
): { ok: true; ids: Set<string> } | ProposalFailure {
  if (!isJson(value) || !Array.isArray(value) || !value.every(nonempty))
    return failure("invalid_selection", "Select explicit pending Operation IDs.");
  const ids = new Set(value);
  const pending = new Set(
    proposal.operations.filter((r) => r.status === "pending").map((r) => r.operation.id),
  );
  if (ids.size !== value.length || value.some((id) => !pending.has(id)))
    return failure(
      "invalid_selection",
      "Selection contains duplicate, unknown or settled Operation IDs.",
    );
  return { ok: true, ids };
}
export function rejectProposal(input: RejectProposalInput): RejectProposalResult {
  if (!envelope(input, ["proposal", "operationIds"]))
    return failure("invalid_input", "Malformed rejectProposal input.");
  const decoded = decodeProposal(input.proposal);
  if (!decoded.ok) return decoded;
  const selected = selection(decoded.proposal, input.operationIds);
  if (!selected.ok) return selected;
  for (const record of decoded.proposal.operations)
    if (selected.ids.has(record.operation.id)) record.status = "rejected";
  if (selected.ids.size) decoded.proposal.reviewStarted = true;
  return decision(decoded.proposal, selected.ids.size > 0);
}
export function evaluateProposal(input: EvaluateProposalInput): EvaluateProposalResult {
  if (!envelope(input, ["proposal", "current", "operationIds", "components", "tokens"]))
    return failure("invalid_input", "Malformed evaluateProposal input.");
  const decoded = decodeProposal(input.proposal);
  if (!decoded.ok) return decoded;
  const current = snapshot(input.current, input, "current");
  if (!current.ok) return current;
  const selected = selection(decoded.proposal, input.operationIds);
  if (!selected.ok) return selected;
  let previewPage = current.page;
  const conflicts = [];
  const applicableOperationIds = [];
  // Greedy simulation: a conflict retains the last successful Page; later
  // Operations still run, in Proposal order rather than selection order.
  for (const record of decoded.proposal.operations) {
    if (!selected.ids.has(record.operation.id)) continue;
    const applied = applyOperation(record, previewPage, input);
    if (applied.ok) {
      previewPage = applied.page;
      applicableOperationIds.push(record.operation.id);
    } else conflicts.push(...applied.errors);
  }
  return {
    ok: true,
    previewPage,
    applicableOperationIds,
    conflicts,
    expectedRevision: current.revision,
    expectedProposalVersion: decoded.proposal.version,
  };
}
export function acceptProposal(input: AcceptProposalInput): AcceptProposalResult {
  const evaluated = evaluateProposal(input);
  if (!evaluated.ok) return evaluated;
  if (evaluated.conflicts.length) return { ok: false, errors: evaluated.conflicts };
  const proposal = copy(input.proposal) as Proposal;
  const ids = new Set(evaluated.applicableOperationIds);
  for (const record of proposal.operations)
    if (ids.has(record.operation.id)) record.status = "accepted";
  if (ids.size) proposal.reviewStarted = true;
  const updated = decision(proposal, ids.size > 0);
  if (!updated.ok) return updated;
  return {
    ok: true,
    proposal: updated.proposal,
    page: evaluated.previewPage,
    expectedRevision: evaluated.expectedRevision,
    expectedProposalVersion: evaluated.expectedProposalVersion,
  };
}
