import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@cloudflare/kumo";
import {
  readPage,
  type Block,
  type BlockPresets,
  type ComponentRegistry,
  type DesignTokens,
  type Page,
} from "@kodlab/kerna-core";
import { EditorAdapter, pageSnapshot, type EditorState } from "./puck-adapter.tsx";
import { createPreviewQueue } from "./preview-queue.ts";
import { connectPreview, type PreviewBinding } from "./preview-channel.ts";
import { previewDocument } from "./preview-document.ts";
import "./editor-proof.css";

type Loaded = { page: Page; revision: string; title: string };
type RegisterNavigationGuard = (shouldBlock: () => Promise<boolean>) => () => void;
const uncertainSave =
  "The save outcome is uncertain. Your edits are kept; check or reopen this Page before trying again.";
async function content(id: string, signal: AbortSignal): Promise<Loaded> {
  const response = await fetch(`/_emdash/api/content/kerna_pages/${encodeURIComponent(id)}`, {
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "This Page is unavailable."
        : "Your access could not be checked. Return and sign in again.",
    );
  const { data } = await response.json();
  if (typeof data._rev !== "string" || !data._rev)
    throw new Error("This Page has no safe save revision. Return and reload it.");
  return { page: data.item.data.page, revision: data._rev, title: data.item.data.title };
}

function Preview({
  state,
  id,
  session,
  components,
}: {
  state: EditorState;
  id: string;
  session: string;
  components: ComponentRegistry;
}) {
  const [document, setDocument] = useState<{
    html: string;
    binding: PreviewBinding;
    ids: Set<string>;
  }>();
  const [status, setStatus] = useState("Loading preview…");
  const channel = useRef<ReturnType<typeof connectPreview>>(undefined);
  const current = useRef(state);
  current.current = state;
  const generation = useRef(0);
  const scroll = useRef({ x: 0, y: 0 });
  const serialized = pageSnapshot(state.page);
  const queue =
    useRef<
      ReturnType<
        typeof createPreviewQueue<Page, { html: string; binding: PreviewBinding; ids: Set<string> }>
      >
    >(undefined);
  useEffect(() => {
    queue.current = createPreviewQueue(
      async (page, signal) => {
        const token = [...crypto.getRandomValues(new Uint8Array(32))]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        const binding = { token, session, generation: ++generation.current };
        const response = await fetch("/_emdash/api/kerna-preview", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
          body: JSON.stringify({ id, page, binding }),
        });
        if (!response.ok)
          throw new Error("Preview could not load. Your changes are kept. Retry preview.");
        const ids = new Set<string>();
        function visit(blocks: Block[]) {
          for (const block of blocks) {
            ids.add(block.props.id);
            for (const slot of Object.keys(components[block.type]!.slots))
              visit((block.props[slot] as Block[] | undefined) ?? []);
          }
        }
        visit(page.content);
        return { html: previewDocument(await response.text(), binding), binding, ids };
      },
      (result) => {
        setDocument(result);
        setStatus("");
      },
      () => setStatus("Preview could not load. Your changes are kept."),
    );
    return () => {
      queue.current?.dispose();
      channel.current?.dispose();
    };
  }, [id, session, components]);
  useEffect(() => {
    channel.current?.dispose();
    channel.current = undefined;
    setStatus("Updating preview…");
    queue.current?.submit(JSON.parse(serialized));
  }, [serialized]);
  useEffect(() => {
    channel.current?.highlight(state.selected);
  }, [state.selected]);
  return (
    <section className="kerna-proof-preview" aria-label="Preview">
      {status && (
        <div role="status" className="p-3">
          {status}{" "}
          <Button onClick={() => queue.current?.submit(current.current.page)}>Retry preview</Button>
        </div>
      )}
      {document && (
        <iframe
          title="Page preview"
          sandbox="allow-scripts"
          inert={!!status}
          srcDoc={document.html}
          onLoad={(event) => {
            if (status) return;
            channel.current?.dispose();
            channel.current = connectPreview(
              event.currentTarget,
              document.binding,
              document.ids,
              (id) => current.current.select(id),
              (position) => {
                scroll.current = position;
              },
            );
            channel.current.restore(scroll.current);
            channel.current.highlight(current.current.selected);
          }}
        />
      )}
    </section>
  );
}

function Workspace({
  state,
  loaded,
  id,
  close,
  components,
  registerNavigationGuard,
}: {
  state: EditorState;
  loaded: Loaded;
  id: string;
  close: () => void;
  components: ComponentRegistry;
  registerNavigationGuard: RegisterNavigationGuard;
}) {
  const [baseline, setBaseline] = useState(pageSnapshot(loaded.page));
  const revision = useRef(loaded.revision);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [session] = useState(() => crypto.randomUUID());
  const [tab, setTab] = useState("Outline");
  const [focus, setFocus] = useState(false);
  const [compact, setCompact] = useState(() => matchMedia("(max-width: 1023px)").matches);
  const drawer = useRef<HTMLDialogElement>(null);
  const fieldsPanel = useRef<HTMLElement>(null);
  const focusButton = useRef<HTMLButtonElement>(null);
  const focusFields = useRef(false);
  useEffect(() => {
    if (!state.insertion) return;
    focusFields.current = true;
    setFocus(false);
    drawer.current?.close();
  }, [state.insertion]);
  useEffect(() => {
    if (focusFields.current && fieldsPanel.current) {
      fieldsPanel.current.focus();
      focusFields.current = false;
    }
  });
  const confirmation = useRef<HTMLDialogElement>(null);
  const pendingLeave = useRef<((blocked: boolean) => void) | undefined>(undefined);
  const current = pageSnapshot(state.page);
  const dirty = current !== baseline || state.invalidDrafts;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  function shouldBlock() {
    if (!dirtyRef.current) return Promise.resolve(false);
    if (pendingLeave.current) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      pendingLeave.current = resolve;
      confirmation.current?.showModal();
    });
  }
  function answerLeave(blocked: boolean) {
    const resolve = pendingLeave.current;
    pendingLeave.current = undefined;
    confirmation.current?.close();
    resolve?.(blocked);
  }
  useEffect(() => {
    const unregister = registerNavigationGuard(shouldBlock);
    return () => {
      unregister();
      pendingLeave.current?.(true);
      pendingLeave.current = undefined;
    };
  }, [registerNavigationGuard]);
  const saveController = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const media = matchMedia("(max-width: 1023px)");
    const resize = () => {
      setCompact(media.matches);
      drawer.current?.close();
    };
    media.addEventListener("change", resize);
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      media.removeEventListener("change", resize);
      window.removeEventListener("beforeunload", unload);
      saveController.current?.abort();
    };
  }, []);
  async function save() {
    if (saving || saveBlocked) return;
    if (state.invalidDrafts) {
      state.showDraftErrors();
      setSaveMessage("Resolve the highlighted field errors before saving. Your edits are kept.");
      return;
    }
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(`/_emdash/api/content/kerna_pages/${encodeURIComponent(id)}`, {
        method: "PUT",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
        body: JSON.stringify({ _rev: revision.current, data: { page: JSON.parse(current) } }),
      });
      if (response.status === 409) {
        setSaveBlocked(true);
        throw new Error(
          "Another writer changed this Page. Your edits are kept; return and reopen to review the saved version.",
        );
      }
      if (response.status === 401 || response.status === 403) {
        setSaveBlocked(true);
        throw new Error(
          "Your access changed. Your edits are kept; ask an Editor to restore access before reopening this Page.",
        );
      }
      if (!response.ok) throw new Error(uncertainSave);
      const result = await response.json();
      if (typeof result?.data?._rev !== "string" || !result.data._rev.trim())
        throw new Error(uncertainSave);
      if (controller.signal.aborted) return;
      revision.current = result.data._rev;
      setBaseline(current);
      setSaveMessage("Draft saved.");
    } catch (error) {
      if (!controller.signal.aborted)
        setSaveMessage(
          error instanceof Error &&
            (error.message.startsWith("Another writer changed") ||
              error.message.startsWith("Your access changed") ||
              error.message === uncertainSave)
            ? error.message
            : uncertainSave,
        );
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }
  function leave() {
    void shouldBlock().then((blocked) => {
      if (!blocked) close();
    });
  }
  const left = (
    <>
      <div role="tablist" aria-label="Page structure" className="flex gap-2 p-3">
        {["Components", "Outline"].map((name) => (
          <Button
            key={name}
            id={`kerna-tab-${name}`}
            role="tab"
            aria-controls={`kerna-panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "Components"
                  : event.key === "End"
                    ? "Outline"
                    : name === "Components"
                      ? "Outline"
                      : "Components";
              setTab(next);
              document.getElementById(`kerna-tab-${next}`)?.focus();
            }}
          >
            {name}
          </Button>
        ))}
      </div>
      {["Components", "Outline"].map((name) => (
        <div
          key={name}
          role="tabpanel"
          id={`kerna-panel-${name}`}
          aria-labelledby={`kerna-tab-${name}`}
          hidden={tab !== name}
          tabIndex={0}
        >
          {name === "Outline" ? (
            <>
              {!state.page.content.length && (
                <div className="space-y-3 p-3">
                  <p>No Blocks yet.</p>
                  <Button
                    onClick={() => {
                      setTab("Components");
                      document.getElementById("kerna-tab-Components")?.focus();
                    }}
                  >
                    Add a Component
                  </Button>
                </div>
              )}
              {state.outline}
              {state.rootControls}
            </>
          ) : (
            <div className="space-y-3 p-3">
              <p id="kerna-insertion-destination">{state.destinationLabel}</p>
              {state.choices.map((choice) => (
                <div key={choice.component} className="space-y-2">
                  <Button
                    disabled={!!choice.error}
                    aria-describedby={`kerna-insertion-destination${choice.error ? ` kerna-preset-${choice.component}` : ""}`}
                    onClick={() => state.add(choice.component)}
                  >
                    Add {choice.label}
                  </Button>
                  {choice.error && (
                    <p id={`kerna-preset-${choice.component}`} className="text-kumo-danger">
                      {choice.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
  return (
    <div
      className="kerna-proof-workspace"
      data-focus={focus}
      onKeyDown={(event) => {
        if (
          event.altKey &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.key.toLowerCase() === "f"
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget.querySelector("dialog[open]")) return;
          // The focused field may be hidden by this action; keep the exit reachable.
          focusButton.current?.focus();
          setFocus((value) => !value);
        }
      }}
    >
      <header className="kerna-proof-toolbar border-b border-kumo-line p-3">
        <Button data-kerna-action="return" onClick={leave}>
          Return
        </Button>
        <h1 className="font-semibold">{loaded.title}</h1>
        <span role="status">{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
        <Button onClick={state.undo} disabled={!state.canUndo}>
          Undo
        </Button>
        <Button onClick={state.redo} disabled={!state.canRedo}>
          Redo
        </Button>
        <Button
          ref={focusButton}
          onClick={() => setFocus(!focus)}
          aria-pressed={focus}
          aria-keyshortcuts="Alt+Shift+F"
        >
          Focus
        </Button>
        {compact && (
          <>
            <Button
              onClick={() => {
                setTab("Components");
                drawer.current?.showModal();
                document.getElementById("kerna-tab-Components")?.focus();
              }}
            >
              Components
            </Button>
            <Button
              onClick={() => {
                setTab("Outline");
                drawer.current?.showModal();
                document.getElementById("kerna-tab-Outline")?.focus();
              }}
            >
              Outline
            </Button>
          </>
        )}
        <Button
          data-kerna-action="save"
          variant="primary"
          disabled={saving || saveBlocked || !dirty}
          onClick={save}
        >
          Save
        </Button>
      </header>
      {state.announcement && (
        <p role="status" aria-live="polite" className="sr-only">
          {state.announcement}
        </p>
      )}
      {saveMessage && (
        <p role="status" className="p-3">
          {saveMessage}
        </p>
      )}
      {state.error && (
        <p role="alert" className="p-3 text-kumo-danger">
          {state.error}
        </p>
      )}
      <div className="kerna-proof-panels">
        {!compact && !focus && (
          <aside aria-label="Components and Outline" className="kerna-proof-left">
            {left}
          </aside>
        )}
        <Preview state={state} id={id} session={session} components={components} />
        {!focus && (
          <aside
            ref={fieldsPanel}
            tabIndex={-1}
            aria-label="Fields"
            className="kerna-proof-fields p-3"
          >
            <h2 className="font-semibold">Fields</h2>
            {state.selected ? state.fields : <p>Select a Block in the Outline or preview.</p>}
          </aside>
        )}
      </div>
      <dialog
        ref={drawer}
        className="kerna-proof-drawer bg-kumo-base text-kumo-default"
        aria-label="Components and Outline"
      >
        <Button onClick={() => drawer.current?.close()}>Close panel</Button>
        {compact && left}
      </dialog>
      <dialog
        ref={confirmation}
        className="rounded-lg bg-kumo-base p-6 text-kumo-default"
        aria-labelledby="kerna-leave-title"
        onCancel={(event) => {
          event.preventDefault();
          answerLeave(true);
        }}
      >
        <h2 id="kerna-leave-title">Leave without saving?</h2>
        <p>Your unsaved changes will be discarded.</p>
        <div className="mt-4 flex gap-3">
          <Button autoFocus onClick={() => answerLeave(true)}>
            Keep editing
          </Button>
          <Button onClick={() => answerLeave(false)}>Leave without saving</Button>
        </div>
      </dialog>
    </div>
  );
}

// Only the disposable host registers this entry while integration gates remain open.
export function EditorShell({
  components,
  tokens,
  presets,
  id,
  registerNavigationGuard,
  onClose,
  returnFocus,
}: {
  components: ComponentRegistry;
  tokens: DesignTokens;
  presets?: BlockPresets;
  id: string;
  registerNavigationGuard: RegisterNavigationGuard;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded & { id: string }>();
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoaded(undefined);
    setError("");
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void content(id, controller.signal)
      .then((result) => {
        const checked = readPage(result.page, components, tokens);
        if (!checked.ok)
          throw new Error(
            "This stored Page does not match the Design System. Return without changing it. " +
              checked.errors.map((error) => error.message).join(" "),
          );
        if (!controller.signal.aborted) setLoaded({ ...result, page: checked.page, id });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => {
      controller.abort();
      dialog.current?.close();
      document.body.style.overflow = overflow;
      returnFocus?.focus();
    };
  }, [open, id, components, tokens, returnFocus]);
  useEffect(() => {
    if (!id) return;
    setOpen(true);
  }, [id]);
  return (
    <div className="text-kumo-default">
      <dialog
        ref={dialog}
        data-kerna-editor
        className="kerna-proof-editor bg-kumo-base text-kumo-default"
        aria-label="Page editor"
        onCancel={(event) => event.preventDefault()}
      >
        {open &&
          (loaded?.id === id ? (
            <EditorAdapter
              key={id}
              initialPage={loaded.page}
              components={components}
              tokens={tokens}
              presets={presets}
            >
              {(state) => (
                <Workspace
                  state={state}
                  loaded={loaded}
                  id={id}
                  close={() => {
                    setOpen(false);
                    onClose();
                  }}
                  components={components}
                  registerNavigationGuard={registerNavigationGuard}
                />
              )}
            </EditorAdapter>
          ) : (
            <div className="p-6">
              <Button data-kerna-action="return" onClick={() => setOpen(false)}>
                Return
              </Button>
              <p role={error ? "alert" : "status"}>{error || "Loading Page…"}</p>
            </div>
          ))}
      </dialog>
    </div>
  );
}

/** Test harness entry retained for focused adapter tests; production uses EditorShell. */
export function EditorProof(props: Omit<Parameters<typeof EditorShell>[0], "onClose">) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} onClick={() => setOpen(true)}>
        Open editor
      </Button>
      {open && (
        <EditorShell {...props} returnFocus={trigger.current} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
