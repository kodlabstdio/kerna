import { useCallback, useRef, useState } from "react";
import { fetchContentList, useCurrentUser } from "@emdash-cms/admin";
import { Role } from "@emdash-cms/auth";
import { Button } from "@cloudflare/kumo";
import { useBlocker } from "@tanstack/react-router";
import type { BlockPresets, ComponentRegistry, DesignSystem } from "@kodlab/kerna-core";
import { EditorShell } from "./editor-proof.tsx";
import { setupKerna } from "./setup.ts";

const PAGE_SIZE = 20;

function Editor() {
  const { data: user, isPending, error: userError } = useCurrentUser();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchContentList>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string>();
  const opening = useRef(false);
  const [selected, setSelected] = useState<{ id: string; title: string }>();
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [configuration, setConfiguration] = useState<{
    components: ComponentRegistry;
    designSystem: DesignSystem;
    presets: BlockPresets;
  }>();
  const guard = useRef<(() => Promise<boolean>) | undefined>(undefined);
  const registerNavigationGuard = useCallback((handler: () => Promise<boolean>) => {
    guard.current = handler;
    return () => {
      if (guard.current === handler) guard.current = undefined;
    };
  }, []);
  useBlocker({ shouldBlockFn: () => guard.current?.() ?? false, enableBeforeUnload: false });

  async function open(
    item: NonNullable<Awaited<ReturnType<typeof fetchContentList>>>["items"][number],
    trigger: HTMLButtonElement,
  ) {
    if (opening.current || selected) return;
    opening.current = true;
    setOpeningId(item.id);
    returnFocus.current = trigger;
    setError("");
    try {
      const response = await fetch("/_emdash/api/plugins/kerna/config", {
        headers: { "X-EmDash-Request": "1" },
      });
      if (!response.ok) throw new Error("Kerna editor configuration could not be loaded.");
      const result = await response.json();
      if (!result?.success || !result.data?.designSystem || !result.data?.components)
        throw new Error("Kerna editor configuration could not be loaded.");
      setConfiguration(result.data);
      setSelected({
        id: item.id,
        title: typeof item.data.title === "string" ? item.data.title : item.slug || item.id,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Kerna editor configuration could not be loaded.",
      );
    } finally {
      opening.current = false;
      setOpeningId(undefined);
    }
  }

  async function load(nextPage: number) {
    setBusy(true);
    setError("");
    try {
      const result = await fetchContentList("kerna_pages", {
        page: nextPage,
        limit: PAGE_SIZE,
        orderBy: "updatedAt",
        order: "desc",
      });
      setItems(result);
      setPage(nextPage);
    } catch {
      setError("Kerna Pages could not be loaded. Check your access and retry.");
    } finally {
      setBusy(false);
    }
  }

  if (isPending)
    return (
      <p role="status" className="p-6">
        Checking your access…
      </p>
    );
  if (userError)
    return (
      <p role="alert" className="p-6">
        Your access could not be checked. Reload this page to retry.
      </p>
    );
  if (!user || user.role < Role.EDITOR)
    return <p className="p-6">Ask an editor to open the Kerna Page editor.</p>;

  return (
    <>
      <main className="space-y-5 p-6 text-kumo-default">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold text-kumo-strong">Edit a Kerna Page</h1>
          <p>Select an existing Page from Kerna Pages.</p>
        </header>
        {!items && (
          <Button variant="primary" loading={busy} onClick={() => void load(1)}>
            Load Pages
          </Button>
        )}
        {busy && <p role="status">Loading Pages…</p>}
        {error && (
          <p role="alert" className="text-kumo-danger">
            {error}
          </p>
        )}
        {items && (
          <>
            {!items.items.length && <p>No Kerna Pages yet. Set up Kerna and add a Page first.</p>}
            <ul className="divide-y divide-kumo-line">
              {items.items.map((item) => (
                <li key={item.id} className="py-3">
                  <button
                    className="text-kumo-link underline underline-offset-4"
                    disabled={Boolean(openingId)}
                    aria-busy={openingId === item.id}
                    onClick={(event) => void open(item, event.currentTarget)}
                  >
                    {openingId === item.id
                      ? "Loading editor…"
                      : typeof item.data.title === "string"
                        ? item.data.title
                        : item.slug || item.id}
                  </button>
                  <span className="ml-3 text-sm text-kumo-subtle">{item.status}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3">
              <Button disabled={busy || page <= 1} onClick={() => void load(page - 1)}>
                Previous
              </Button>
              <span>
                Page {page}
                {items.total ? ` of ${Math.ceil(items.total / PAGE_SIZE)}` : ""}
              </span>
              <Button
                disabled={
                  busy ||
                  (items.total !== undefined && page >= Math.ceil(items.total / PAGE_SIZE)) ||
                  (!items.total && items.items.length < PAGE_SIZE)
                }
                onClick={() => void load(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </main>
      {selected && configuration && (
        <EditorShell
          id={selected.id}
          tokens={configuration.designSystem.tokens}
          {...configuration}
          registerNavigationGuard={registerNavigationGuard}
          returnFocus={returnFocus.current}
          onClose={() => {
            setSelected(undefined);
            setConfiguration(undefined);
          }}
        />
      )}
    </>
  );
}

function Setup() {
  const { data: user, isPending, error: userError } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function setup() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await setupKerna();
      setMessage(
        result === "existing"
          ? "Kerna is already set up."
          : "Kerna is ready. The Kerna Pages collection is available in Content.",
      );
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : "Setup could not finish."} You can retry safely; completed steps are kept.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6 text-kumo-default">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-kumo-strong">Kerna</h1>
        <p className="max-w-prose">
          Prepare this site for Pages composed from its Design System. Setup adds a Kerna Pages
          collection with drafts and revision history.
        </p>
      </div>
      {isPending ? (
        <p role="status">Checking your access…</p>
      ) : userError ? (
        <p role="alert">Your access could not be checked. Reload this page to retry.</p>
      ) : user && user.role >= Role.ADMIN ? (
        <Button variant="primary" loading={busy} disabled={busy} onClick={setup}>
          Set up Kerna
        </Button>
      ) : (
        <p>Ask an administrator to set up Kerna.</p>
      )}
      <p role="status" aria-live="polite">
        {message || (busy ? "Setting up Kerna…" : "")}
      </p>
      {message && (
        <a
          className="text-kumo-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
          href="/_emdash/admin/content/kerna_pages"
        >
          Open Kerna Pages
        </a>
      )}
      {error && (
        <p role="alert" className="max-w-prose text-kumo-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const pages = { "/setup": Setup, "/editor": Editor };
