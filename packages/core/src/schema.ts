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
