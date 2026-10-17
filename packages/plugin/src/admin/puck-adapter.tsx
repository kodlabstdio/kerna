import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Puck, createUsePuck, type Config, type Data } from "@puckeditor/core";
import "@puckeditor/core/no-external.css";
import { Button, Input } from "@cloudflare/kumo";
import {
  validatePage,
  inspectBlockPresets,
  getRootBlockDestination,
  insertBlockPreset,
  applyPageOperation,
  type BlockPresets,
  type BlockDestination,
  type BlockContainer,
  type Block,
  type ComponentRegistry,
  type DesignTokens,
  type Page,
} from "@kodlab/kerna-core";

// All Puck access lives here. Its built-in mutation controls are disabled;
// custom Fields submit pure candidates before dispatch/history ever sees them.
const usePuck = createUsePuck();
export interface EditorState {
  page: Page;
  selected: string | undefined;
  select: (id: string) => void;
  commit: (candidate: Page) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  invalidDrafts: boolean;
  error: string;
  announcement: string;
  showDraftErrors: () => void;
  outline: ReactNode;
  fields: ReactNode;
  choices: { component: string; label: string; error: string }[];
  destinationLabel: string;
  add: (component: string, destination?: BlockDestination) => boolean;
  remove: (id: string) => void;
  move: (id: string, direction: -1 | 1) => boolean;
  rootControls: ReactNode;
  insertion: number;
}
type Draft = { id: string; text: string; error: string; exposed: boolean };
const FieldContext = createContext<{
  drafts: Record<string, Draft>;
  edit: (id: string, field: string, text: string, value: unknown) => void;
  blur: (key: string) => void;
} | null>(null);

function asPage(data: Data): Page {
  return {
    formatVersion: 1,
    root: { props: data.root.props?.title === undefined ? {} : { title: data.root.props.title } },
    content: data.content as Block[],
  };
}

// JSON object order is not Page identity (native storage and Puck reorder it).
export function pageSnapshot(page: Page): string {
  return JSON.stringify(page, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}

function Field({
  field,
  label,
  type,
  options,
}: {
  field: string;
  label: string;
  type: string;
  options?: string[];
}) {
  const selected = usePuck((state) => state.selectedItem);
  const context = useContext(FieldContext)!;
  if (!selected) return null;
  // Puck's custom-field value intentionally freezes during focus unless its
  // onChange is called. That callback bypasses our validation boundary. Read
  // accepted data directly; only invalid input lives in the overlay instead.
  const value = selected.props[field];
  const id = selected.props.id;
  const key = `${id}:${field}`;
  const draft = context.drafts[key];
  const text =
    draft?.text ??
    (type === "token"
      ? ((value as { token?: string })?.token ?? "")
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "");
  const change = (text: string) =>
    context.edit(
      id,
      field,
      text,
      type === "number"
        ? text.trim()
          ? Number(text)
          : Number.NaN
        : type === "token"
          ? { token: text }
          : type === "boolean"
            ? text === "true"
            : text,
    );
  return (
    <div className="space-y-2 py-2">
      <label id={`${key}:label`} htmlFor={key} className="block font-medium text-kumo-default">
        {label}
      </label>
      {options ? (
        <select
          id={key}
          value={text}
          onChange={(event) => change(event.target.value)}
          onBlur={() => context.blur(key)}
          aria-invalid={!!draft?.error && draft.exposed}
          aria-describedby={draft?.error && draft.exposed ? `${key}:error` : undefined}
          className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 text-kumo-default focus-visible:outline-2 focus-visible:outline-kumo-focus"
        >
          {!text && <option value="">Choose {label}</option>}
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <Input
          id={key}
          aria-labelledby={`${key}:label`}
          value={text}
          onChange={(event: ChangeEvent<HTMLInputElement>) => change(event.target.value)}
          onBlur={() => context.blur(key)}
          aria-invalid={!!draft?.error && draft.exposed}
          aria-describedby={draft?.error && draft.exposed ? `${key}:error` : undefined}
        />
      )}
      {draft?.error && draft.exposed && (
        <p id={`${key}:error`} role="alert" className="text-kumo-danger">
          {draft.error}
        </p>
      )}
    </div>
  );
}

// Derived views of the accepted Page, never an independent outline or history.
function locations(
  blocks: Block[],
  components: ComponentRegistry,
  container: BlockContainer = { kind: "root" },
): { block: Block; container: BlockContainer; siblings: Block[] }[] {
  return blocks.flatMap((block) => [
    { block, container, siblings: blocks },
    ...Object.keys(components[block.type]!.slots).flatMap((slot) =>
      locations((block.props[slot] as Block[] | undefined) ?? [], components, {
        kind: "slot",
        parentId: block.props.id,
        slot,
      }),
    ),
  ]);
}

function blockLabel(block: Block, components: ComponentRegistry): string {
  for (const field of ["title", "heading"]) {
    const value = block.props[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return components[block.type]!.label;
}

// Narrow ADR-0015 presentation correction: Puck 0.23's sortable Outline row
// nests buttons even with drag disabled. This projection uses only the accepted
// Puck Page and selection; Puck still owns forms and history.
function Outline({
  page,
  components,
  selected,
  select,
}: {
  page: Page;
  components: ComponentRegistry;
  selected: string | undefined;
  select: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const selectedRow = useRef<HTMLButtonElement>(null);
  const all = locations(page.content, components);
  const ancestors: string[] = [];
  let current = all.find(({ block }) => block.props.id === selected);
  while (current?.container.kind === "slot") {
    const parentId = current.container.parentId;
    ancestors.push(parentId);
    current = all.find(({ block }) => block.props.id === parentId);
  }
  const ancestorKey = JSON.stringify(ancestors);
  useEffect(() => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      for (const id of JSON.parse(ancestorKey) as string[]) next.delete(id);
      return next;
    });
  }, [selected, ancestorKey]);
  useEffect(() => {
    selectedRow.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected, collapsed]);
  const render = (blocks: Block[]) => (
    <ul className="kerna-proof-outline-list">
      {blocks.map((block) => {
        const id = block.props.id;
        const name = blockLabel(block, components);
        const slots = Object.keys(components[block.type]!.slots);
        const expanded = !collapsed.has(id);
        return (
          <li key={id}>
            <div className="kerna-proof-outline-row">
              <Button
                ref={selected === id ? selectedRow : undefined}
                aria-label={`Select ${name}`}
                aria-pressed={selected === id}
                className="kerna-proof-outline-select"
                onClick={() => select(id)}
              >
                {name}
                {selected === id && <span className="text-xs">Selected</span>}
              </Button>
              {!!slots.length && (
                <Button
                  aria-label={`${expanded ? "Collapse" : "Expand"} Slots in ${name}`}
                  aria-expanded={expanded}
                  aria-controls={`kerna-outline-slots:${id}`}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (expanded) next.add(id);
                      else next.delete(id);
                      return next;
                    })
                  }
                >
                  {expanded ? "Collapse" : "Expand"}
                </Button>
              )}
            </div>
            {!!slots.length && (
              <div
                id={`kerna-outline-slots:${id}`}
                hidden={!expanded}
                className="kerna-proof-outline-slots"
              >
                {slots.map((slot) => (
                  <section key={slot} aria-label={`${slot} Slot in ${name}`}>
                    <h2 className="text-kumo-default text-xs">{slot} Slot</h2>
                    {render((block.props[slot] as Block[] | undefined) ?? [])}
                  </section>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <nav aria-label="Block outline" className="p-3 text-kumo-default">
      {render(page.content)}
    </nav>
  );
}

function diagnostics(errors: { message: string; validationErrors?: { message: string }[] }[]) {
  return errors
    .flatMap((error) => [
      error.message,
      ...(error.validationErrors ?? []).map((item) => item.message),
    ])
    .join(" ");
}

function Session({
  components,
  tokens,
  presets,
  generateId,
  children,
}: {
  components: ComponentRegistry;
  tokens: DesignTokens;
  presets: BlockPresets;
  generateId: () => string;
  children: (state: EditorState) => ReactNode;
}) {
  const puck = usePuck((state) => state);
  const page = asPage(puck.appState.data);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [insertion, setInsertion] = useState(0);
  const [removing, setRemoving] = useState<string>();
  const boundary = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const ownsInteraction = useRef(false);
  const pendingFocus = useRef<string>(undefined);
  const pendingSelection = useRef<{ id: string | undefined }>(undefined);
  const pendingSlot = useRef<string>(undefined);
  const all = locations(page.content, components);
  const selected = puck.selectedItem?.props.id;
  const location = all.find(({ block }) => block.props.id === selected);
  const label = (block: Block) => blockLabel(block, components);
  const select = (id: string | undefined) => {
    const itemSelector = id ? puck.getSelectorForId(id) : null;
    puck.dispatch({
      type: "setUi",
      ui: { itemSelector: itemSelector ?? null },
      recordHistory: false,
    });
  };
  useEffect(() => {
    if (pendingSelection.current) {
      const { id } = pendingSelection.current;
      pendingSelection.current = undefined;
      select(id);
      return;
    }
    if (pendingSlot.current) {
      const row = document.getElementById(pendingSlot.current);
      if (row) {
        row.focus();
        row.scrollIntoView?.({ block: "nearest" });
        pendingSlot.current = undefined;
      }
    }
  });
  useEffect(() => {
    if (!pendingFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const id = pendingFocus.current!;
      pendingFocus.current = undefined;
      const root = boundary.current;
      // Never move focus out of a modal or back into a hidden Fields panel.
      if (!root || root.querySelector("dialog[open]")) return;
      const visible = (element: HTMLElement) => {
        for (
          let node: HTMLElement | null = element;
          node && node !== root;
          node = node.parentElement
        ) {
          if (
            node.hidden ||
            node.inert ||
            (node instanceof HTMLDialogElement && !node.open) ||
            getComputedStyle(node).display === "none" ||
            getComputedStyle(node).visibility === "hidden"
          )
            return false;
        }
        return true;
      };
      const field = document.getElementById(id);
      const fallback = [...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")].find(
        visible,
      );
      const target = field && root.contains(field) && visible(field) ? field : fallback;
      // An intentional focus change since travel takes precedence.
      if (document.activeElement === document.body || document.activeElement?.id === id)
        target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => {
    if (removing) confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [removing]);
  const inspected = useMemo(
    () => inspectBlockPresets(presets, { components, tokens }),
    [presets, components, tokens],
  );
  const choices = Object.entries(components).map(([component, definition]) => {
    const result = inspected[component]!;
    return {
      component,
      label: definition.label,
      error: result.ok
        ? ""
        : `${diagnostics(result.errors)} Ask your site developer to supply a complete valid Block preset for ${component}.`,
    };
  });
  const rootDestination = getRootBlockDestination({
    page,
    selectedBlockId: selected ?? null,
    components,
    tokens,
  });
  const position = rootDestination.ok ? rootDestination.destination.position : undefined;
  const anchor =
    position?.kind === "after"
      ? page.content.find((block) => block.props.id === position.blockId)
      : undefined;
  const destinationLabel = anchor
    ? `After ${anchor.props.id === selected ? "" : "containing root Block "}${label(anchor)}`
    : "At Page end";
  const commit = (candidate: Page) => {
    const errors = validatePage(candidate, components, tokens);
    if (errors.length) {
      setError(errors.map((item) => item.message).join(" "));
      return false;
    }
    setError("");
    if (pageSnapshot(candidate) !== pageSnapshot(page))
      puck.dispatch({ type: "setData", data: () => candidate, recordHistory: true });
    return true;
  };
  const acceptStructure = (candidate: Page, nextSelected: string | undefined) => {
    pendingSelection.current = { id: nextSelected };
    if (commit(candidate)) return true;
    pendingSelection.current = undefined;
    return false;
  };
  const add = (component: string, destination?: BlockDestination) => {
    if (!destination) {
      if (!rootDestination.ok) {
        setError(diagnostics(rootDestination.errors));
        return false;
      }
      destination = rootDestination.destination;
    }
    const result = insertBlockPreset({
      page,
      presets,
      component,
      destination,
      generateId,
      components,
      tokens,
    });
    if (!result.ok) {
      setError(diagnostics(result.errors));
      return false;
    }
    if (!acceptStructure(result.page, result.block.props.id)) return false;
    setInsertion((value) => value + 1);
    return true;
  };
  const move = (id: string, direction: -1 | 1) => {
    const source = all.find(({ block }) => block.props.id === id);
    if (!source) return false;
    const index = source.siblings.findIndex((block) => block.props.id === id);
    const neighbor = source.siblings[index + direction];
    if (!neighbor) return false;
    const result = applyPageOperation({
      page,
      components,
      tokens,
      operation: {
        id: "move-block",
        kind: "moveBlock",
        blockId: id,
        destination: {
          container: source.container,
          position: { kind: direction === -1 ? "before" : "after", blockId: neighbor.props.id },
        },
      },
    });
    if (!result.ok) {
      setError(diagnostics(result.errors));
      return false;
    }
    return acceptStructure(result.page, selected);
  };
  const remove = (id: string, confirmed = false) => {
    const source = all.find(({ block }) => block.props.id === id);
    if (!source) return;
    const result = applyPageOperation({
      page,
      components,
      tokens,
      operation: { id: "remove-block", kind: "removeBlock", blockId: id },
    });
    if (!result.ok) {
      setError(diagnostics(result.errors));
      return;
    }
    const removedIds = new Set(
      locations([source.block], components).map(({ block }) => block.props.id),
    );
    const affectedKeys = Object.keys(drafts).filter((key) => removedIds.has(drafts[key]!.id));
    if (affectedKeys.length && !confirmed) {
      setRemoving(id);
      return;
    }
    const index = source.siblings.findIndex((block) => block.props.id === id);
    const fallback =
      source.container.kind === "slot"
        ? source.container.parentId
        : (source.siblings[index + 1] ?? source.siblings[index - 1])?.props.id;
    if (acceptStructure(result.page, selected && !removedIds.has(selected) ? selected : fallback)) {
      setDrafts((old) =>
        Object.fromEntries(Object.entries(old).filter(([key]) => !affectedKeys.includes(key))),
      );
    }
  };
  const actions = (block: Block, siblings: Block[]) => {
    const index = siblings.findIndex((item) => item.props.id === block.props.id);
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          aria-label={`Move ${label(block)} up`}
          disabled={index === 0}
          onClick={() => move(block.props.id, -1)}
        >
          Move up
        </Button>
        <Button
          aria-label={`Move ${label(block)} down`}
          disabled={index === siblings.length - 1}
          onClick={() => move(block.props.id, 1)}
        >
          Move down
        </Button>
        <Button aria-label={`Remove ${label(block)}`} onClick={() => remove(block.props.id)}>
          Remove
        </Button>
      </div>
    );
  };
  const slots =
    location &&
    Object.entries(components[location.block.type]!.slots).map(([slot, schema]) => {
      const children = (location.block.props[slot] as Block[] | undefined) ?? [];
      const parentId = location.block.props.id;
      return (
        <section
          key={slot}
          id={`kerna-slot:${parentId}:${slot}`}
          tabIndex={-1}
          className="kerna-proof-slot space-y-3 border-t border-kumo-line py-3"
          aria-label={`${slot} Slot`}
        >
          <h3 className="font-semibold">{slot} Slot</h3>
          {!children.length && <p>No Blocks in this Slot.</p>}
          <ol className="space-y-3">
            {children.map((child) => (
              <li key={child.props.id}>
                <Button onClick={() => select(child.props.id)} aria-label={`Edit ${label(child)}`}>
                  {label(child)}
                </Button>
                {actions(child, children)}
              </li>
            ))}
          </ol>
          {choices
            .filter((choice) => schema.accepts.includes(choice.component))
            .map((choice) => (
              <div key={choice.component}>
                <Button
                  disabled={!!choice.error}
                  aria-describedby={
                    choice.error
                      ? `kerna-preset:${parentId}:${slot}:${choice.component}`
                      : undefined
                  }
                  onClick={() =>
                    add(choice.component, {
                      container: { kind: "slot", parentId, slot },
                      position: { kind: "end" },
                    })
                  }
                >
                  Add {choice.label} to {slot}
                </Button>
                {choice.error && (
                  <p
                    id={`kerna-preset:${parentId}:${slot}:${choice.component}`}
                    className="text-kumo-danger"
                  >
                    {choice.error}
                  </p>
                )}
              </div>
            ))}
        </section>
      );
    });
  const edit = (id: string, field: string, text: string, value: unknown) => {
    const candidate = structuredClone(page);
    function visit(blocks: Block[]) {
      for (const block of blocks) {
        if (block.props.id === id) block.props[field] = value;
        for (const slot of Object.keys(components[block.type]!.slots))
          visit((block.props[slot] as Block[] | undefined) ?? []);
      }
    }
    visit(candidate.content);
    const errors = validatePage(candidate, components, tokens);
    const key = `${id}:${field}`;
    if (errors.length) {
      setDrafts((old) => ({
        ...old,
        [key]: { id, text, error: errors.map((item) => item.message).join(" "), exposed: false },
      }));
    } else {
      commit(candidate);
      setDrafts((old) => {
        const next = { ...old };
        delete next[key];
        return next;
      });
    }
  };
  const blur = (key: string) => {
    setDrafts((old) => (old[key] ? { ...old, [key]: { ...old[key]!, exposed: true } } : old));
  };
  const showDraftErrors = () => {
    setDrafts((old) =>
      Object.fromEntries(
        Object.entries(old).map(([key, draft]) => [key, { ...draft, exposed: true }]),
      ),
    );
  };
  const travel = (direction: -1 | 1) => {
    // A nested modal owns interaction until it closes (including Leave).
    if (boundary.current?.querySelector("dialog[open]")) return;
    // Undo in a focused invalid field discards that overlay alone.
    const focused = document.activeElement?.id;
    if (direction === -1 && focused && drafts[focused]) {
      setAnnouncement("Invalid field draft discarded; the Page is unchanged.");
      setDrafts((old) => {
        const next = { ...old };
        delete next[focused];
        return next;
      });
      return;
    }
    const target = puck.history.histories[puck.history.index + direction]?.state.data;
    if (!target) return;
    const errors = validatePage(asPage(target), components, tokens);
    if (errors.length) {
      setError("This history entry no longer matches the Design System.");
      return;
    }
    const targetBlocks = locations(asPage(target).content, components);
    const restored = targetBlocks.find(
      ({ block }) => !all.some((item) => item.block.props.id === block.props.id),
    );
    pendingSelection.current = {
      id:
        restored?.block.props.id ??
        targetBlocks.find(({ block }) => block.props.id === selected)?.block.props.id ??
        targetBlocks[0]?.block.props.id,
    };
    pendingFocus.current = boundary.current?.contains(document.activeElement) ? focused : undefined;
    setError("");
    if (direction === -1) puck.history.back();
    else puck.history.forward();
  };
  useEffect(() => {
    const root = boundary.current!;
    const doc = root.ownerDocument;
    const focus = (event: FocusEvent) => {
      if (event.target !== doc.body) ownsInteraction.current = root.contains(event.target as Node);
    };
    const keydown = (event: KeyboardEvent) => {
      const inside = root.contains(event.target as Node);
      const modal = !!root.querySelector("dialog[open]");
      if (!inside && !(event.target === doc.body && (ownsInteraction.current || modal))) return;
      const key =
        event.code === "KeyZ" ? "z" : event.code === "KeyY" ? "y" : event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || (key !== "z" && key !== "y")) return;
      // Capture also owns BODY after a Puck remount, before its raw listener.
      event.stopPropagation();
      if (event.altKey) return;
      event.preventDefault();
      travel(key === "y" || event.shiftKey ? 1 : -1);
    };
    doc.addEventListener("focusin", focus, true);
    doc.addEventListener("keydown", keydown, true);
    return () => {
      doc.removeEventListener("focusin", focus, true);
      doc.removeEventListener("keydown", keydown, true);
    };
  });
  return (
    <FieldContext.Provider value={{ drafts, edit, blur }}>
      <div ref={boundary} style={{ display: "contents" }}>
        {children({
          page,
          selected,
          select,
          choices,
          destinationLabel,
          add,
          remove,
          move,
          insertion,
          rootControls:
            location?.container.kind === "root" ? (
              <section className="space-y-3 p-3" aria-label="Selected root Block">
                <h2 className="font-semibold">{label(location.block)}</h2>
                {actions(location.block, page.content)}
              </section>
            ) : null,
          commit,
          undo: () => travel(-1),
          redo: () => travel(1),
          canUndo: puck.history.hasPast || Object.keys(drafts).length > 0,
          canRedo: puck.history.hasFuture,
          invalidDrafts: Object.keys(drafts).length > 0,
          error,
          announcement,
          showDraftErrors,
          outline: (
            <Outline page={page} components={components} selected={selected} select={select} />
          ),
          fields: (
            <>
              {location?.container.kind === "slot" && (
                <Button
                  onClick={() => {
                    if (location.container.kind !== "slot") return;
                    pendingSlot.current = `kerna-slot:${location.container.parentId}:${location.container.slot}`;
                    select(location.container.parentId);
                  }}
                >
                  Manage {location.container.slot} in parent
                </Button>
              )}
              <Puck.Fields />
              {slots}
            </>
          ),
        })}
        <dialog
          ref={confirmation}
          aria-labelledby="kerna-remove-title"
          className="rounded-lg bg-kumo-base p-6 text-kumo-default"
          onCancel={(event) => {
            event.preventDefault();
            setRemoving(undefined);
          }}
        >
          <h2 id="kerna-remove-title">Remove Block and its field drafts?</h2>
          <p>Unaccepted input in this Block and its Slots will be discarded.</p>
          <div className="mt-4 flex gap-3">
            <Button autoFocus onClick={() => setRemoving(undefined)}>
              Keep Block
            </Button>
            <Button
              onClick={() => {
                if (removing) remove(removing, true);
                setRemoving(undefined);
              }}
            >
              Remove Block and drafts
            </Button>
          </div>
        </dialog>
      </div>
    </FieldContext.Provider>
  );
}

const noPresets: BlockPresets = {};
const randomId = () => crypto.randomUUID();

export function EditorAdapter({
  initialPage,
  presets = noPresets,
  generateId = randomId,
  components,
  tokens,
  children,
}: {
  initialPage: Page;
  presets?: BlockPresets;
  generateId?: () => string;
  components: ComponentRegistry;
  tokens: DesignTokens;
  children: (state: EditorState) => ReactNode;
}) {
  const config = useMemo<Config>(
    () => ({
      root: { fields: {}, render: () => <></> },
      components: Object.fromEntries(
        Object.entries(components).map(([name, definition]) => [
          name,
          {
            label: definition.label,
            render: () => <></>,
            fields: {
              variant: {
                type: "custom",
                render: () => (
                  <Field
                    field="variant"
                    label="Variant"
                    type="text"
                    options={definition.variants}
                  />
                ),
              },
              ...Object.fromEntries(
                Object.entries(definition.fields).map(([field, schema]) => [
                  field,
                  {
                    type: "custom",
                    render: () => (
                      <Field
                        field={field}
                        label={field}
                        type={schema.type}
                        options={
                          schema.type === "token"
                            ? Object.keys(tokens).filter(
                                (key) => tokens[key]!.type === schema.tokenType,
                              )
                            : schema.type === "boolean"
                              ? ["true", "false"]
                              : undefined
                        }
                      />
                    ),
                  },
                ]),
              ),
              ...Object.fromEntries(
                Object.entries(definition.slots).map(([slot, schema]) => [
                  slot,
                  {
                    type: "slot",
                    allow: schema.accepts,
                  },
                ]),
              ),
            },
          },
        ]),
      ),
    }),
    [components, tokens],
  );
  return (
    <Puck
      height="100%"
      config={config}
      data={initialPage}
      permissions={{ drag: false, insert: false, delete: false, duplicate: false }}
    >
      <Session components={components} tokens={tokens} presets={presets} generateId={generateId}>
        {children}
      </Session>
    </Puck>
  );
}
