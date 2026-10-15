import { useState } from "react";
import { useCurrentUser } from "@emdash-cms/admin";
import { Role } from "@emdash-cms/auth";
import { Button } from "@cloudflare/kumo";
import { setupKerna } from "./setup.ts";

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

export const pages = { "/setup": Setup };
