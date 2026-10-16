---
title: Proposal API
description: Inputs, return values and lifecycle for the six core Proposal functions.
---

Import these functions and their types from `@kodlab/kerna-core`. Each function
takes one named input object and returns an `ok` discriminant. Results are unsaved
values; inputs remain unchanged. For a runnable introduction, see
[Create your first Proposal](/guides/first-proposal/).

## Shared inputs and results

- `base` and `current` are `{ page, revision }` snapshots. `revision` is a nonempty
  string supplied by the host; `page` must validate under the supplied Design System.
- `components` is the current enabled Component registry; `tokens` contains the
  current Design Tokens. Supply both to creation, amendment, evaluation and acceptance.
- `proposal` is the canonical stored Proposal. `operations` contains draft
  [Operations](/reference/operations/), without guards, summaries or status.
- `operationIds` explicitly selects pending Operations. Unknown, duplicate or
  settled IDs fail. Selection order does not change Proposal order.
- Every failure is `{ ok: false, errors: ProposalError[] }`. See
  [Resolve Proposal errors](/reference/proposal-errors/) for codes and details.

## Functions

### `createProposal`

Input: `{ id, base, operations, components, tokens }`.

Requires a nonempty Proposal ID and at least one Operation. Every Operation must
be independently valid against the original base. Core derives its guard and
summary there. Failure rejects the whole creation.

Success: `{ ok: true, proposal }`. The Proposal starts with `formatVersion: 1`,
`version: 0`, `reviewStarted: false`, the supplied `baseRevision` and pending records.

### `amendProposal`

Input: `{ proposal, base, operations, components, tokens }`.

Appends Operations before review starts. Supply the authentic original base with
the Proposal's `baseRevision`. Each appended Operation must work alone against
that base, and its ID must be unique across all records. Any failure rejects the
entire append.

Success: `{ ok: true, proposal, expectedProposalVersion }`.

### `beginProposalReview`

Input: `{ proposal }`.

Sets `reviewStarted` to `true`, freezing amendment. Repeating it is a no-op.

Success: `{ ok: true, proposal, expectedProposalVersion }`.

### `evaluateProposal`

Input: `{ proposal, current, operationIds, components, tokens }`.

Validates the current Page, even for an empty selection. Tries selected pending
Operations in Proposal order against the accumulated preview. A failed candidate
is discarded; later Operations still run. Evaluation does not begin review or
change decision history.

Success: `{ ok: true, previewPage, applicableOperationIds, conflicts,
expectedRevision, expectedProposalVersion }`.

`conflicts` contains `ProposalError` entries for failed Operations and may be
nonempty on success. `applicableOperationIds` identifies exactly the successful
Operations in `previewPage`. Invalid input or an invalid current Page is a
top-level failure, with no successful preview result.

### `acceptProposal`

Input: `{ proposal, current, operationIds, components, tokens }`.

Reruns evaluation. Any selected conflict fails the whole acceptance. Otherwise,
marks the selection accepted and starts review for a nonempty selection. To
accept only applicable Operations, explicitly submit that subset.

Success: `{ ok: true, page, proposal, expectedRevision, expectedProposalVersion }`.

The host must [compare both versions and save both values atomically](/guides/persist-proposal-decisions/#save-acceptance-atomically).

### `rejectProposal`

Input: `{ proposal, operationIds }`.

Marks selected pending Operations rejected, retains their records and starts
review for a nonempty selection. Does not require or change a Page.

Success: `{ ok: true, proposal, expectedProposalVersion }`.

## Lifecycle and versions

Each record contains `operation`, `guard`, `summary` and a `status` of `pending`,
`accepted` or `rejected`. Accepted and rejected records are terminal. They remain
in order with their original evidence and summaries. Unselected records stay pending.

Review begins with the first `beginProposalReview` or successful nonempty
acceptance or rejection. Afterward, amendment fails with `review_started`.

Each successful nonempty amendment, acceptance or rejection, and the first
begin-review call, advances `version` exactly once. This decision version is
separate from `formatVersion: 1`. It must be a nonnegative safe integer, at most
`Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). A change that would exceed it
fails; create a new Proposal rather than resetting decision history.

Empty selections and empty pre-review amendments are no-ops. Repeated begin-review
is also a no-op. These leave the version unchanged but still validate their
required inputs. A selected move whose placement is already achieved can still
be accepted normally and advance the version.

`expectedProposalVersion` is the input version, before any increment.
`expectedRevision` is the supplied current Page revision. A changed revision does
not globally block acceptance: guards are always checked, even if revision
strings match. See [Operation guards](/reference/operations/#guards-and-moves).
