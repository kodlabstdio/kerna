import { CURRENT_FORMAT_VERSION, validatePage } from "./page.ts";
import {
  applyOperation,
  copy,
  decodeOperations,
  failure,
  isJson,
  keys,
  nonempty,
  object,
} from "./operations.ts";
import type {
  Block,
  BlockPresetFailure,
  BlockPresetResult,
  BlockPresets,
  ComponentRegistry,
  InsertBlockPresetInput,
  InsertBlockPresetResult,
  Page,
  PageMutationInput,
  PageMutationResult,
  ProposalRules,
  RootBlockDestinationInput,
  RootBlockDestinationResult,
} from "./schema.ts";

function currentPage(page: unknown, rules: ProposalRules): PageMutationResult {
  if (!isJson(page)) return failure("invalid_current", "The current Page must contain JSON data.");
  const validationErrors = validatePage(page, rules.components, rules.tokens);
  if (validationErrors.length)
    return failure(
      "invalid_current",
      "The current Page is invalid under the current Design System.",
      { validationErrors },
    );
  return { ok: true, page: copy(page) as Page };
}

/** A candidate only: the caller owns authorization, accepted state and history. */
export function applyPageOperation(input: PageMutationInput): PageMutationResult {
  if (!object(input) || !keys(input, ["page", "operation", "components", "tokens"]))
    return failure("invalid_input", "Malformed Page mutation input.");
  const current = currentPage(input.page, input);
  if (!current.ok) return current;
  const decoded = decodeOperations([input.operation]);
  if (!decoded.ok) return decoded;
  const result = applyOperation({ operation: decoded.operations[0]! }, current.page, input);
  return result.ok ? { ok: true, page: result.page } : result;
}

function presetFailure(
  code: BlockPresetFailure["errors"][number]["code"],
  message: string,
): BlockPresetFailure {
  return { ok: false, errors: [{ code, message, affectedBlockIds: [] }] };
}

function inspectPreset(
  component: string,
  presets: BlockPresets,
  rules: ProposalRules,
): BlockPresetResult {
  if (!Object.hasOwn(rules.components, component))
    return presetFailure("disabled_component", `Component '${component}' is not enabled.`);
  const descriptor = Object.getOwnPropertyDescriptor(presets, component);
  if (!descriptor)
    return presetFailure(
      "missing_preset",
      `Component '${component}' needs a site-owned Block preset.`,
    );
  if (!Object.hasOwn(descriptor, "value") || !isJson(descriptor.value))
    return presetFailure("invalid_preset", `The preset for '${component}' must contain JSON data.`);
  const block: unknown = descriptor.value;
  if (!object(block) || block.type !== component)
    return presetFailure(
      "invalid_preset",
      `The preset for '${component}' must instantiate that Component.`,
    );
  const validationErrors = validatePage(
    { formatVersion: CURRENT_FORMAT_VERSION, root: { props: {} }, content: [block] },
    rules.components,
    rules.tokens,
  );
  if (validationErrors.length)
    return {
      ok: false,
      errors: [
        {
          code: "invalid_preset",
          message: `The preset for '${component}' is invalid under the current Design System.`,
          affectedBlockIds: [],
          validationErrors,
        },
      ],
    };
  return { ok: true, block: copy(block) as unknown as Block };
}

/** Diagnose each enabled Component independently; never invent required content. */
export function inspectBlockPresets(
  presets: BlockPresets,
  rules: ProposalRules,
): Record<string, BlockPresetResult> {
  const names = new Set([...Object.keys(rules.components), ...Object.keys(presets)]);
  return Object.fromEntries([...names].map((name) => [name, inspectPreset(name, presets, rules)]));
}

// Only traverse declared Slots, after the complete Page or preset has been validated.
function blocksIn(block: Block, components: ComponentRegistry): Block[] {
  return [
    block,
    ...Object.keys(components[block.type]!.slots).flatMap((slot) =>
      ((block.props[slot] as Block[] | undefined) ?? []).flatMap((child) =>
        blocksIn(child, components),
      ),
    ),
  ];
}

/** Destination data also identifies the root Block to label before insertion. */
export function getRootBlockDestination(
  input: RootBlockDestinationInput,
): RootBlockDestinationResult {
  if (
    !object(input) ||
    !keys(input, ["page", "selectedBlockId", "components", "tokens"]) ||
    !(input.selectedBlockId === null || nonempty(input.selectedBlockId))
  )
    return failure("invalid_input", "Select a Block ID, or null to append.");
  const current = currentPage(input.page, input);
  if (!current.ok) return current;
  if (input.selectedBlockId === null)
    return { ok: true, destination: { container: { kind: "root" }, position: { kind: "end" } } };
  const root = current.page.content.find((block) =>
    blocksIn(block, input.components).some((child) => child.props.id === input.selectedBlockId),
  );
  if (!root) return failure("invalid_selection", "The selected Block no longer exists.");
  return {
    ok: true,
    destination: {
      container: { kind: "root" },
      position: { kind: "after", blockId: root.props.id },
    },
  };
}

/** Clone a current site preset, replace every ID once, and validate its insertion. */
export function insertBlockPreset(input: InsertBlockPresetInput): InsertBlockPresetResult {
  if (
    !object(input) ||
    !keys(input, [
      "page",
      "presets",
      "component",
      "destination",
      "generateId",
      "components",
      "tokens",
    ]) ||
    !object(input.presets) ||
    !nonempty(input.component) ||
    typeof input.generateId !== "function"
  )
    return failure("invalid_input", "Malformed Block preset insertion input.");
  const current = currentPage(input.page, input);
  if (!current.ok) return current;
  const preset = inspectPreset(input.component, input.presets, input);
  if (!preset.ok) return preset;
  const blocks = blocksIn(preset.block, input.components);
  const used = new Set(
    [...current.page.content.flatMap((block) => blocksIn(block, input.components)), ...blocks].map(
      (block) => block.props.id,
    ),
  );
  for (const block of blocks) {
    let id: string;
    try {
      id = input.generateId();
    } catch {
      return presetFailure("invalid_id", "Block ID generation failed.");
    }
    if (!nonempty(id) || used.has(id))
      return presetFailure(
        "invalid_id",
        "Generated Block IDs must be non-empty, unique and unused by the Page or preset.",
      );
    used.add(id);
    block.props.id = id;
  }
  const result = applyPageOperation({
    page: current.page,
    operation: {
      id: "insert-preset",
      kind: "addBlock",
      block: preset.block,
      destination: input.destination,
    },
    components: input.components,
    tokens: input.tokens,
  });
  return result.ok ? { ok: true, page: result.page, block: preset.block } : result;
}
