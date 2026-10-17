export type TokenType = "color" | "typography" | "spacing" | "radius" | "shadow";

export interface DesignToken {
  type: TokenType;
  value: string;
}

export type DesignTokens = Record<string, DesignToken>;

export interface TokenReference {
  token: string;
}

export type FieldDefinition = { required?: boolean } & (
  | { type: "text" | "number" | "boolean" }
  | { type: "token"; tokenType: TokenType }
);

export interface SlotDefinition {
  accepts: string[];
  min: number;
  max: number;
}

export interface ComponentDefinition {
  label: string;
  variants: string[];
  fields: Record<string, FieldDefinition>;
  slots: Record<string, SlotDefinition>;
}

export type ComponentRegistry = Record<string, ComponentDefinition>;

export interface ComponentRegistration extends ComponentDefinition {
  name: string;
}

export interface DesignSystem {
  tokens: DesignTokens;
  components: Record<string, string[]>;
}

export interface Block {
  type: string;
  props: {
    id: string;
    variant: string;
    [field: string]: unknown;
  };
}

export interface Page {
  formatVersion: 1;
  root: { props: { title?: string; [field: string]: unknown } };
  content: Block[];
}

export interface ValidationError {
  code: string;
  message: string;
  path: string;
  field: string;
  blockId?: string;
  allowed?: string[];
  actualBytes?: number;
  maxBytes?: number;
}

export type PageReadResult = { ok: true; page: Page } | { ok: false; errors: ValidationError[] };

export type BlockContainer = { kind: "root" } | { kind: "slot"; parentId: string; slot: string };
export interface BlockDestination {
  container: BlockContainer;
  position: { kind: "end" } | { kind: "before" | "after"; blockId: string };
}
export type FieldChange = { kind: "unset" } | { kind: "set"; value: unknown };
export type Operation = { id: string } & (
  | { kind: "addBlock"; block: Block; destination: BlockDestination }
  | { kind: "insertPattern"; blocks: Block[]; destination: BlockDestination }
  | { kind: "moveBlock"; blockId: string; destination: BlockDestination }
  | { kind: "removeBlock"; blockId: string }
  | { kind: "changeVariant"; blockId: string; variant: string }
  | { kind: "editField"; blockId: string; field: string; change: FieldChange }
);

export interface OperationGuard {
  target?: { type: string; value: { present: false } | { present: true; value: unknown } };
  source?: { container: BlockContainer; previous: string | null; next: string | null };
  destination?: { parentType: string | null; anchorType: string | null };
}
export interface OperationRecord {
  operation: Operation;
  guard: OperationGuard;
  summary: string;
  status: "pending" | "accepted" | "rejected";
}
export interface Proposal {
  formatVersion: 1;
  id: string;
  baseRevision: string;
  version: number;
  reviewStarted: boolean;
  operations: OperationRecord[];
}
export type ProposalErrorCode =
  | "invalid_input"
  | "proposal_format"
  | "proposal_version"
  | "proposal_limit"
  | "invalid_base"
  | "invalid_current"
  | "base_revision"
  | "review_started"
  | "invalid_selection"
  | "missing_target"
  | "invalid_destination"
  | "guard_conflict"
  | "invalid_operation"
  | "invalid_candidate";
export interface ProposalError {
  code: ProposalErrorCode;
  message: string;
  affectedBlockIds: string[];
  operationId?: string;
  validationErrors?: ValidationError[];
  limit?: number;
  actual?: number;
}
export type ProposalFailure = { ok: false; errors: ProposalError[] };
export interface PageSnapshot {
  page: unknown;
  revision: string;
}
export interface ProposalRules {
  components: ComponentRegistry;
  tokens: DesignTokens;
}
export interface CreateProposalInput extends ProposalRules {
  id: string;
  base: PageSnapshot;
  operations: unknown;
}
export interface AmendProposalInput extends ProposalRules {
  proposal: unknown;
  base: PageSnapshot;
  operations: unknown;
}
export interface BeginProposalReviewInput {
  proposal: unknown;
}
export interface RejectProposalInput extends BeginProposalReviewInput {
  operationIds: string[];
}
export interface EvaluateProposalInput extends RejectProposalInput, ProposalRules {
  current: PageSnapshot;
}
export type AcceptProposalInput = EvaluateProposalInput;
export type CreateProposalResult = { ok: true; proposal: Proposal } | ProposalFailure;
export type ProposalDecisionResult =
  | { ok: true; proposal: Proposal; expectedProposalVersion: number }
  | ProposalFailure;
export type AmendProposalResult = ProposalDecisionResult;
export type BeginProposalReviewResult = ProposalDecisionResult;
export type RejectProposalResult = ProposalDecisionResult;
export type EvaluateProposalResult =
  | {
      ok: true;
      previewPage: Page;
      applicableOperationIds: string[];
      conflicts: ProposalError[];
      expectedRevision: string;
      expectedProposalVersion: number;
    }
  | ProposalFailure;
export type AcceptProposalResult =
  | {
      ok: true;
      page: Page;
      proposal: Proposal;
      expectedRevision: string;
      expectedProposalVersion: number;
    }
  | ProposalFailure;

/** Supply the current enabled Component registry and Design Tokens. */
export interface PageMutationInput extends ProposalRules {
  page: unknown;
  operation: unknown;
}
export type PageMutationResult = { ok: true; page: Page } | ProposalFailure;
export type BlockPresetError = Omit<ProposalError, "code"> & {
  code:
    | ProposalErrorCode
    | "missing_preset"
    | "invalid_preset"
    | "disabled_component"
    | "invalid_id";
};
export type BlockPresetFailure = { ok: false; errors: BlockPresetError[] };
export type BlockPresetResult = { ok: true; block: Block } | BlockPresetFailure;
export type BlockPresets = Record<string, unknown>;
export interface InsertBlockPresetInput extends ProposalRules {
  page: unknown;
  presets: BlockPresets;
  component: string;
  destination: BlockDestination;
  generateId: () => string;
}
export type InsertBlockPresetResult = { ok: true; page: Page; block: Block } | BlockPresetFailure;
export interface RootBlockDestinationInput extends ProposalRules {
  page: unknown;
  selectedBlockId: string | null;
}
export type RootBlockDestinationResult =
  | { ok: true; destination: BlockDestination }
  | ProposalFailure;
