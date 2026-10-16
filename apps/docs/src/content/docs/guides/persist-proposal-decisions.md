---
title: Save Proposal decisions safely
description: Authorize review and save Page and Proposal changes with atomic version comparisons.
---

Core returns unsaved values. To connect it to storage, your host must authenticate
requests, load authoritative state and save decisions atomically. No storage or
authorization adapter is provided by these APIs.

## Load authoritative state

Before creating or reviewing a Proposal:

1. Authenticate the caller and verify the Page identity. Authorize the requested
   action: an Agent User may submit Operations, but must never accept or publish.
2. Load the canonical Proposal from server-side storage for an existing Proposal.
   Do not trust client-supplied guards, summaries, versions or decision records.
3. Retain or retrieve the authentic original Page and its revision for creation
   and amendment. Amendment requires that original revision-bound base, even if
   the current Page has changed.
4. Load the current Page and revision for evaluation or acceptance, together with
   the current enabled Component registry and Design Tokens.

Core validates shapes and domain invariants. It cannot establish whether a
snapshot is authentic or whether the caller may act on it. Matching revision
strings alone do not prove that a supplied Page is the original snapshot.

## Preview and choose Operations

Call `evaluateProposal` with explicit pending `operationIds`. It checks guards and
tries Operations in Proposal order. Each successful candidate becomes the input
to the next Operation; failed candidates are discarded and later Operations
still run. The returned `applicableOperationIds` exactly describes `previewPage`.

Evaluation can return `ok: true` with Operation conflicts. A top-level failure,
such as `invalid_current`, returns `ok: false` instead. Follow
[Resolve Proposal errors](/reference/proposal-errors/) before retrying.

Ask the Reviewer to choose the Operations to accept. Call `acceptProposal` with
that explicit selection. It reruns evaluation and fails the whole acceptance if
any selected Operation conflicts. To accept a useful subset, submit only those
IDs; core never silently drops a selected Operation during acceptance.

## Save acceptance atomically

Use a transaction or equivalent storage operation that compares the stored
versions and writes only when both still match. This is often called
compare-and-swap.

For a successful `acceptProposal` result, perform these steps as one atomic action:

1. Compare the stored Page revision with `expectedRevision`.
2. Compare the stored canonical Proposal version with `expectedProposalVersion`.
3. If both match, store the returned `page` and `proposal` together. The host issues
   the new Page revision according to its storage contract.
4. If either differs, write neither value. Reload canonical state, reevaluate and
   obtain a new decision for the current result.

A concurrent rejection changes the Proposal version without changing the Page
revision. Checking only the Page would allow a stale acceptance to overwrite that
rejection. Checking and writing in separate actions leaves the same race.

Core does not mutate the inputs, persist either value or issue Page revisions.
Do not treat an unsaved preview as the current stored Page.

## Save Proposal-only changes

`amendProposal`, `beginProposalReview` and `rejectProposal` return a Proposal and
`expectedProposalVersion`. Compare that version with canonical storage and save
the returned Proposal atomically. On a mismatch, reload and retry the action
against current state; do not reset versions or remove terminal records.

For creation, store the returned Proposal with its Page identity and authentic
original base under the host's authorized creation rules. Retain accepted and
rejected Operations as decision history.

See the [Proposal lifecycle](/reference/proposals/#lifecycle-and-versions) for
amendment freezes and no-ops, or [run the first Proposal example](/guides/first-proposal/)
to inspect the expected version fields without storage.
