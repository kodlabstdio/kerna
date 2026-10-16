import { validatePage } from "./page.ts";
import type {
  Block,
  BlockContainer,
  BlockDestination,
  ComponentRegistry,
  Operation,
  OperationGuard,
  OperationRecord,
  Page,
  ProposalError,
  ProposalErrorCode,
  ProposalFailure,
  ProposalRules,
} from "./schema.ts";

export const MAX_PROPOSAL_OPERATIONS = 100;
export const MAX_PROPOSAL_BYTES = 2_000_000;

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  return (
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      return (
        typeof key === "string" &&
        descriptor.enumerable &&
        Object.hasOwn(descriptor, "value") &&
        (required.includes(key) || optional.includes(key))
      );
    })
  );
}

// Inspect descriptors, not getters. JSON input cannot contain exotic objects,
// hidden properties, sparse arrays or values that serialization silently drops.
export function isJson(value: unknown): boolean {
  const ancestors = new Set<object>();
  function visit(item: unknown): boolean {
    if (item === null || typeof item === "string" || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item !== "object" || ancestors.has(item)) return false;
    const array = Array.isArray(item);
    if (array && Object.getPrototypeOf(item) !== Array.prototype) return false;
    if (
      !array &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return false;
    ancestors.add(item);
    const names = Reflect.ownKeys(item);
    if (array && names.length !== item.length + 1) return false;
    for (const key of names) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (
        typeof key !== "string" ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value") ||
        (array && !/^(0|[1-9]\d*)$/.test(key)) ||
        !visit(descriptor.value)
      )
        return false;
    }
    ancestors.delete(item);
    return true;
  }
  try {
    return visit(value);
  } catch {
    return false;
  }
}
export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const names = Object.keys(a);
  return (
    names.length === Object.keys(b).length &&
    names.every((name) => Object.hasOwn(b, name) && equal(a[name], b[name]))
  );
}
export function failure(
  code: ProposalErrorCode,
  message: string,
  extra: Partial<ProposalError> = {},
): ProposalFailure {
  return { ok: false, errors: [{ code, message, affectedBlockIds: [], ...extra }] };
}
export function budget(value: unknown, count?: number): ProposalFailure | undefined {
  if (count !== undefined && count > MAX_PROPOSAL_OPERATIONS)
    return failure("proposal_limit", "A Proposal may contain at most 100 Operations.", {
      limit: MAX_PROPOSAL_OPERATIONS,
      actual: count,
    });
  const actual = bytes(value);
  if (actual > MAX_PROPOSAL_BYTES)
    return failure("proposal_limit", "Proposal JSON exceeds the UTF-8 byte budget.", {
      limit: MAX_PROPOSAL_BYTES,
      actual,
    });
}
export function containerShape(value: unknown): value is BlockContainer {
  return (
    object(value) &&
    (value.kind === "root"
      ? keys(value, ["kind"])
      : value.kind === "slot" &&
        keys(value, ["kind", "parentId", "slot"]) &&
        nonempty(value.parentId) &&
        nonempty(value.slot))
  );
}
function destinationShape(value: unknown): value is BlockDestination {
  if (
    !object(value) ||
    !keys(value, ["container", "position"]) ||
    !containerShape(value.container) ||
    !object(value.position)
  )
    return false;
  const p = value.position;
  return p.kind === "end"
    ? keys(p, ["kind"])
    : (p.kind === "before" || p.kind === "after") &&
        keys(p, ["kind", "blockId"]) &&
        nonempty(p.blockId);
}
export function operationShape(value: unknown): value is Operation {
  if (!object(value) || !nonempty(value.id)) return false;
  const target = nonempty(value.blockId);
  switch (value.kind) {
    case "removeBlock":
      return keys(value, ["id", "kind", "blockId"]) && target;
    case "changeVariant":
      return keys(value, ["id", "kind", "blockId", "variant"]) && target && nonempty(value.variant);
    case "editField":
      return (
        keys(value, ["id", "kind", "blockId", "field", "change"]) &&
        target &&
        nonempty(value.field) &&
        object(value.change) &&
        (value.change.kind === "unset"
          ? keys(value.change, ["kind"])
          : value.change.kind === "set" && keys(value.change, ["kind", "value"]))
      );
    case "moveBlock":
      return (
        keys(value, ["id", "kind", "blockId", "destination"]) &&
        target &&
        destinationShape(value.destination)
      );
    case "addBlock":
      return (
        keys(value, ["id", "kind", "block", "destination"]) &&
        object(value.block) &&
        destinationShape(value.destination)
      );
    case "insertPattern":
      return (
        keys(value, ["id", "kind", "blocks", "destination"]) &&
        Array.isArray(value.blocks) &&
        value.blocks.length > 0 &&
        value.blocks.every(object) &&
        destinationShape(value.destination)
      );
    default:
      return false;
  }
}
export function decodeOperations(
  value: unknown,
): { ok: true; operations: Operation[] } | ProposalFailure {
  if (!isJson(value) || !Array.isArray(value))
    return failure("invalid_input", "Operations must be a JSON array.");
  const limited = budget(value, value.length);
  if (limited) return limited;
  const ids = new Set<string>();
  for (const item of value) {
    if (!operationShape(item))
      return failure(
        "invalid_input",
        "Malformed Operation or unknown fields.",
        object(item) && nonempty(item.id) ? { operationId: item.id } : {},
      );
    if (ids.has(item.id))
      return failure("invalid_input", "Operation IDs must be unique.", { operationId: item.id });
    ids.add(item.id);
  }
  return { ok: true, operations: copy(value) };
}

interface Location {
  block: Block;
  list: Block[];
  index: number;
  container: BlockContainer;
}
function indexPage(page: Page, components: ComponentRegistry): Map<string, Location> {
  const result = new Map<string, Location>();
  function visit(list: Block[], container: BlockContainer) {
    list.forEach((block, index) => {
      result.set(block.props.id, { block, list, index, container });
      for (const slot of Object.keys(components[block.type]!.slots)) {
        if (Object.hasOwn(block.props, slot))
          visit(block.props[slot] as Block[], { kind: "slot", parentId: block.props.id, slot });
      }
    });
  }
  visit(page.content, { kind: "root" });
  return result;
}
function valueAt(block: Block, field: string): NonNullable<OperationGuard["target"]>["value"] {
  return Object.hasOwn(block.props, field)
    ? { present: true, value: block.props[field] }
    : { present: false };
}
function targetValue(op: Operation, block: Block) {
  if (op.kind === "editField") return valueAt(block, op.field);
  if (op.kind === "changeVariant") return valueAt(block, "variant");
  return { present: true as const, value: block };
}
function sourceAt(location: Location): NonNullable<OperationGuard["source"]> {
  return {
    container: location.container,
    previous: location.list[location.index - 1]?.props.id ?? null,
    next: location.list[location.index + 1]?.props.id ?? null,
  };
}
function affected(op: Operation): string[] {
  const ids: string[] = [];
  if ("blockId" in op) ids.push(op.blockId);
  if ("destination" in op) {
    if (op.destination.container.kind === "slot") ids.push(op.destination.container.parentId);
    if (op.destination.position.kind !== "end") ids.push(op.destination.position.blockId);
  }
  return [...new Set(ids)];
}
function destinationAt(
  page: Page,
  destination: BlockDestination,
  index: Map<string, Location>,
  components: ComponentRegistry,
) {
  const { container, position } = destination;
  let list = page.content;
  let parentType: string | null = null;
  if (container.kind === "slot") {
    const parent = index.get(container.parentId)?.block;
    if (!parent || !Object.hasOwn(components[parent.type]!.slots, container.slot)) return;
    parentType = parent.type;
    if (!Object.hasOwn(parent.props, container.slot))
      Object.defineProperty(parent.props, container.slot, {
        value: [],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    list = parent.props[container.slot] as Block[];
  }
  if (position.kind === "end")
    return { list, offset: list.length, evidence: { parentType, anchorType: null } };
  const anchor = index.get(position.blockId);
  if (!anchor || !equal(anchor.container, container)) return;
  return {
    list,
    offset: anchor.index + (position.kind === "after" ? 1 : 0),
    evidence: { parentType, anchorType: anchor.block.type },
  };
}
function truncate(text: string, limit: number): string {
  const chars = Array.from(text);
  return chars.length > limit ? chars.slice(0, limit - 1).join("") + "…" : text;
}
function excerpt(value: unknown): string {
  return typeof value === "string"
    ? JSON.stringify(truncate(value.replace(/[\r\n\t]+/g, " ").trim(), 40))
    : truncate(JSON.stringify(value), 40);
}
function summary(op: Operation, guard: OperationGuard, components: ComponentRegistry): string {
  const label = guard.target
    ? components[guard.target.type]!.label
    : op.kind === "addBlock"
      ? components[op.block.type]!.label
      : "Pattern";
  const old = guard.target?.value;
  const previous = old?.present ? excerpt(old.value) : "<unset>";
  let place =
    "destination" in op
      ? op.destination.container.kind === "root"
        ? "Page"
        : `${op.destination.container.parentId}.${op.destination.container.slot}`
      : "";
  if ("destination" in op) {
    const position = op.destination.position;
    place += position.kind === "end" ? " at current end" : ` ${position.kind} ${position.blockId}`;
  }
  let action: string;
  switch (op.kind) {
    case "editField":
      action = `${op.blockId}: ${op.field} ${previous} → ${op.change.kind === "unset" ? "<unset>" : excerpt(op.change.value)}`;
      break;
    case "changeVariant":
      action = `${op.blockId}: variant ${previous} → ${excerpt(op.variant)}`;
      break;
    case "removeBlock":
      action = `remove ${op.blockId}`;
      break;
    case "moveBlock":
      action = `move ${op.blockId} to ${place}`;
      break;
    case "addBlock":
      action = `add ${op.block.props.id} to ${place}`;
      break;
    case "insertPattern":
      action = `insert ${op.blocks.length} Blocks into ${place}`;
      break;
  }
  return truncate(`${label}: ${action}`, 512);
}

// Each call owns its candidate. A failed mutation never leaks into the caller
// or the evaluator's successful accumulator.
export function applyOperation(
  { operation: op, guard }: Pick<OperationRecord, "operation"> & { guard?: OperationGuard },
  page: Page,
  rules: ProposalRules,
): { ok: true; page: Page; guard: OperationGuard; summary: string } | ProposalFailure {
  const candidate = copy(page);
  let index = indexPage(candidate, rules.components);
  const evidence: OperationGuard = {};
  const fail = (code: ProposalErrorCode, message: string) =>
    failure(code, message, { operationId: op.id, affectedBlockIds: affected(op) });
  const target = "blockId" in op ? index.get(op.blockId) : undefined;
  if ("blockId" in op) {
    if (!target) return fail("missing_target", "The target Block no longer exists.");
    if (
      op.kind === "editField" &&
      !Object.hasOwn(rules.components[target.block.type]!.fields, op.field)
    )
      return fail("invalid_operation", "editField requires a declared content field.");
    evidence.target = { type: target.block.type, value: targetValue(op, target.block) };
    if (op.kind === "moveBlock") evidence.source = sourceAt(target);
    if (guard && (!equal(evidence.target, guard.target) || !equal(evidence.source, guard.source)))
      return fail("guard_conflict", "The guarded target value, subtree or move source changed.");
  }
  if ("destination" in op) {
    const destination = destinationAt(candidate, op.destination, index, rules.components);
    if (!destination)
      return fail(
        "invalid_destination",
        "The destination Slot or sibling anchor is missing or in another container.",
      );
    evidence.destination = destination.evidence;
    if (guard && !equal(guard.destination, evidence.destination))
      return fail("guard_conflict", "The destination parent or anchor Component changed.");
    if (op.kind === "moveBlock") {
      const source = target!;
      const container = op.destination.container;
      const position = op.destination.position;
      if (
        (position.kind !== "end" && position.blockId === op.blockId) ||
        (container.kind === "slot" &&
          (container.parentId === op.blockId ||
            (index.get(container.parentId)?.container.kind === "slot" &&
              (index.get(container.parentId)!.container as { parentId: string }).parentId ===
                op.blockId)))
      )
        return fail(
          "invalid_destination",
          "A Block cannot move into itself or its descendants, or anchor to itself.",
        );
      source.list.splice(source.index, 1);
      index = indexPage(candidate, rules.components);
      const afterRemoval = destinationAt(candidate, op.destination, index, rules.components)!;
      afterRemoval.list.splice(afterRemoval.offset, 0, source.block);
    } else {
      const blocks = op.kind === "addBlock" ? [op.block] : op.blocks;
      const suffix = destination.list.splice(destination.offset);
      for (const block of copy(blocks)) destination.list.push(block);
      for (const block of suffix) destination.list.push(block);
    }
  } else if (op.kind === "removeBlock") {
    target!.list.splice(target!.index, 1);
  } else if (op.kind === "changeVariant") {
    target!.block.props.variant = op.variant;
  } else {
    if (op.change.kind === "unset") delete target!.block.props[op.field];
    else
      Object.defineProperty(target!.block.props, op.field, {
        value: copy(op.change.value),
        writable: true,
        enumerable: true,
        configurable: true,
      });
  }
  const validationErrors = validatePage(candidate, rules.components, rules.tokens);
  if (validationErrors.length)
    return failure("invalid_candidate", "The Operation would produce an invalid Page.", {
      operationId: op.id,
      affectedBlockIds: [
        ...new Set([
          ...affected(op),
          ...validationErrors.flatMap((e) => (e.blockId ? [e.blockId] : [])),
        ]),
      ],
      validationErrors,
    });
  const captured = copy(evidence);
  return {
    ok: true,
    page: candidate,
    guard: captured,
    summary: summary(op, captured, rules.components),
  };
}
