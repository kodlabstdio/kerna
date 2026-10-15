import type {
  ComponentRegistry,
  DesignTokens,
  Page,
  PageReadResult,
  ValidationError,
} from "./schema.ts";

export const CURRENT_FORMAT_VERSION = 1;
export const MAX_PAGE_BYTES = 1_000_000;
export const MAX_BLOCK_DEPTH = 2;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePage(
  input: unknown,
  components: ComponentRegistry,
  tokens: DesignTokens,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();
  const add = (
    code: string,
    message: string,
    field: string,
    path: string,
    blockId?: string,
    allowed?: string[],
  ) => errors.push({ code, message, field, path, blockId, allowed });

  let actualBytes: number;
  try {
    actualBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  } catch {
    return [
      { code: "json", message: "A Page must be serializable JSON.", field: "content", path: "" },
    ];
  }
  if (actualBytes > MAX_PAGE_BYTES) {
    return [
      {
        code: "size",
        message: `Page is ${actualBytes} bytes; the budget is ${MAX_PAGE_BYTES} bytes.`,
        field: "content",
        path: "",
        actualBytes,
        maxBytes: MAX_PAGE_BYTES,
      },
    ];
  }
  if (!record(input)) {
    return [{ code: "page", message: "A Page must be an object.", field: "content", path: "" }];
  }
  if (input.formatVersion !== CURRENT_FORMAT_VERSION) {
    return [
      {
        code: "format_version",
        message: `Expected Page format version ${CURRENT_FORMAT_VERSION}.`,
        field: "formatVersion",
        path: "formatVersion",
      },
    ];
  }

  function unknownFields(
    value: Record<string, unknown>,
    allowed: string[],
    path: string,
    blockId?: string,
  ) {
    for (const field of Object.keys(value)) {
      if (!allowed.includes(field)) {
        add(
          "unknown_field",
          `Field '${field}' is not declared. Allowed: ${allowed.join(", ")}.`,
          field,
          path ? `${path}.${field}` : field,
          blockId,
          allowed,
        );
      }
    }
  }

  unknownFields(input, ["formatVersion", "root", "content"], "");
  if (!record(input.root) || !record(input.root.props)) {
    add("root", "Page root must contain a props object.", "root", "root");
  } else {
    unknownFields(input.root, ["props"], "root");
    unknownFields(input.root.props, ["title"], "root.props");
    if (input.root.props.title !== undefined && typeof input.root.props.title !== "string") {
      add("field_type", "Page title must be text.", "title", "root.props.title");
    }
  }

  function visit(value: unknown, path: string, depth: number, slotField: string) {
    if (!record(value) || typeof value.type !== "string" || !record(value.props)) {
      add("block", "A Block needs a Component type and a props object.", slotField, path);
      return;
    }
    const { props, type } = value;
    const id = typeof props.id === "string" ? props.id : undefined;
    if (depth > MAX_BLOCK_DEPTH) {
      add("depth", `Blocks may be at most ${MAX_BLOCK_DEPTH} levels deep.`, slotField, path, id);
      return;
    }
    unknownFields(value, ["type", "props"], path, id);
    if (!id?.trim()) {
      add("id", "A Block needs a non-empty id.", "id", `${path}.props.id`, id);
    } else if (ids.has(id)) {
      add(
        "duplicate_id",
        `Block id '${id}' is already used on this Page.`,
        "id",
        `${path}.props.id`,
        id,
      );
    } else {
      ids.add(id);
    }
    if (!Object.hasOwn(components, type)) {
      const allowed = Object.keys(components);
      add(
        "component",
        `Unknown Component '${type}'. Available: ${allowed.join(", ")}.`,
        "type",
        `${path}.type`,
        id,
        allowed,
      );
      return;
    }
    const component = components[type]!;
    unknownFields(
      props,
      ["id", "variant", ...Object.keys(component.fields), ...Object.keys(component.slots)],
      `${path}.props`,
      id,
    );
    if (typeof props.variant !== "string" || !component.variants.includes(props.variant)) {
      add(
        "variant",
        `Choose a Variant: ${component.variants.join(", ")}.`,
        "variant",
        `${path}.props.variant`,
        id,
        component.variants,
      );
    }
    for (const [field, definition] of Object.entries(component.fields)) {
      const value = props[field];
      const fieldPath = `${path}.props.${field}`;
      if (value === undefined) {
        if (definition.required)
          add("required", `Field '${field}' is required.`, field, fieldPath, id);
        continue;
      }
      if (definition.type === "token") {
        const allowed = Object.keys(tokens).filter(
          (name) => tokens[name]!.type === definition.tokenType,
        );
        if (
          !record(value) ||
          Object.keys(value).length !== 1 ||
          typeof value.token !== "string" ||
          !allowed.includes(value.token)
        ) {
          add(
            "token",
            `Use a ${definition.tokenType} Design Token reference. Available: ${allowed.join(", ")}.`,
            field,
            fieldPath,
            id,
            allowed,
          );
        }
      } else {
        const expected = definition.type === "text" ? "string" : definition.type;
        if (typeof value !== expected || (expected === "number" && !Number.isFinite(value))) {
          add("field_type", `Field '${field}' must be ${definition.type}.`, field, fieldPath, id);
        }
      }
    }
    for (const [field, slot] of Object.entries(component.slots)) {
      const children = props[field] === undefined ? [] : props[field];
      const fieldPath = `${path}.props.${field}`;
      if (!Array.isArray(children)) {
        add("slot", `Slot '${field}' must be an array of Blocks.`, field, fieldPath, id);
        continue;
      }
      if (children.length < slot.min || children.length > slot.max) {
        add(
          "slot_count",
          `Slot '${field}' needs ${slot.min}–${slot.max} Blocks; received ${children.length}.`,
          field,
          fieldPath,
          id,
        );
      }
      children.forEach((child, index) => {
        if (record(child) && typeof child.type === "string" && !slot.accepts.includes(child.type)) {
          add(
            "slot_component",
            `Slot '${field}' accepts: ${slot.accepts.join(", ")}.`,
            field,
            `${fieldPath}[${index}]`,
            id,
            slot.accepts,
          );
        }
        visit(child, `${fieldPath}[${index}]`, depth + 1, field);
      });
    }
  }

  if (!Array.isArray(input.content)) {
    add("content", "Page content must be an array of Blocks.", "content", "content");
  } else {
    input.content.forEach((block, index) => visit(block, `content[${index}]`, 1, "content"));
  }
  return errors;
}

export function readPage(
  input: unknown,
  components: ComponentRegistry,
  tokens: DesignTokens,
): PageReadResult {
  // The pre-versioning Puck-shaped document is version 0. Its Block shape is unchanged.
  const migrated =
    record(input) && (input.formatVersion === undefined || input.formatVersion === 0)
      ? { ...input, formatVersion: CURRENT_FORMAT_VERSION }
      : input;
  const errors = validatePage(migrated, components, tokens);
  return errors.length ? { ok: false, errors } : { ok: true, page: migrated as Page };
}
