---
title: Resolve Proposal errors
description: Identify invalid inputs and Operation conflicts, then choose a safe recovery action.
---

First check `ok`. A top-level failure returns `{ ok: false, errors }`.
`evaluateProposal` can instead return `ok: true` with Operation failures in
`conflicts`, alongside a valid `previewPage` and its exact `applicableOperationIds`.
`acceptProposal` fails the whole acceptance if any selected Operation conflicts.

For a complete conflict-and-retry example, [Create your first Proposal](/guides/first-proposal/).

## Read the details

Each `ProposalError` has a stable `code`, readable `message` and deduplicated
`affectedBlockIds` (which can be empty). When available, `operationId` identifies
the failed Operation. Use these IDs to locate records and Blocks; never parse
summaries for identity.

Page rule failures include `validationErrors`. Each entry has `code`, `message`,
`path` and `field`, with `blockId`, `allowed`, `actualBytes` and `maxBytes` where
applicable. Use the full path and allowed alternatives to correct the value.
Budget failures include `limit` and `actual` when available.

Operation summaries are deterministic, bounded **plain text**, not trusted HTML.
Escape them when rendering; do not insert summaries or messages as raw HTML.

## Input and state failures

| Code                | What failed                                                                                                  | Next action                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_input`     | Malformed JSON data or envelopes, unknown keys/kinds, duplicate IDs, malformed records or an empty creation. | Correct the input shape using the [Proposal API](/reference/proposals/) and [Operation shapes](/reference/operations/#operation-shapes). Load authoritative records from storage.  |
| `proposal_format`   | The Proposal format version is unsupported.                                                                  | Load canonical state in supported `formatVersion: 1`. Do not relabel an unknown format to bypass validation.                                                                       |
| `proposal_version`  | The decision version is invalid or a change would exceed the safe-integer maximum.                           | Reload canonical state. For an exhausted version, create a new Proposal; never reset decision history. See [lifecycle and versions](/reference/proposals/#lifecycle-and-versions). |
| `proposal_limit`    | The record count or UTF-8 JSON byte budget is exceeded.                                                      | Compare `actual` with `limit` and submit smaller independent Proposals within the [limits](/reference/operations/#limits). Do not truncate accepted/rejected history.              |
| `invalid_base`      | The original Page is not JSON data or fails validation under the supplied Design System.                     | Retrieve the authentic original snapshot and reconcile its Design System. Read `validationErrors` before retrying.                                                                 |
| `base_revision`     | Amendment supplied a revision other than the Proposal's original base revision.                              | Retrieve the authentic original revision-bound Page, not the latest Page. See [load authoritative state](/guides/persist-proposal-decisions/#load-authoritative-state).            |
| `invalid_current`   | The current Page is not JSON data or fails current Design System validation, even for an empty selection.    | Have the host reconcile the current Page and enabled Design System, then reload and reevaluate. Operations cannot bypass current-Page validation to repair it.                     |
| `invalid_selection` | IDs are malformed, unknown, duplicated or already accepted/rejected.                                         | Reload the canonical Proposal and explicitly select pending IDs only.                                                                                                              |
| `review_started`    | An amendment was attempted after review began.                                                               | Create a new Proposal against an appropriate authentic base. Existing pending Operations may still be reviewed; their history cannot be reopened for amendment.                    |

## Operation conflicts

These errors may occur while creating or amending Operations, or appear in
evaluation's `conflicts` when a candidate cannot apply to the current preview.

| Code                  | What failed                                                                                                                        | Next action                                                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_target`      | The target Block is absent.                                                                                                        | Reload and reevaluate. Select unaffected Operations or create a new Proposal from a fresh base.                                                                                                                                                                                                 |
| `guard_conflict`      | A guarded Component, field value, subtree, move source or destination Component changed.                                           | Inspect the affected Blocks and [move guards](/reference/operations/#guards-and-moves). Select unaffected Operations or create a fresh Proposal that reflects the change. Do not overwrite guards.                                                                                              |
| `invalid_destination` | A Slot or anchor is missing, an anchor is outside the named container, or a move targets itself, a descendant or itself as anchor. | Check the [destination shapes and order](/reference/operations/#destinations-and-order). Reload changed state; correct a draft's destination before submission.                                                                                                                                 |
| `invalid_operation`   | `editField` targets an undeclared content field.                                                                                   | Choose a declared field. Use `changeVariant` for a Variant; do not edit IDs, Slots or root metadata through `editField`.                                                                                                                                                                        |
| `invalid_candidate`   | Applying the Operation would violate a Page rule, including duplicate copied IDs or Slot counts.                                   | Read `validationErrors` and the [independent-validity restrictions](/reference/operations/#independent-validity-and-slots). Correct draft Operations. Before review, you may append a corrected independent Operation and later reject the old one; after review starts, create a new Proposal. |

After reevaluation, submit an explicit conflict-free subset to `acceptProposal`.
A successful core result still requires the host to
[save decisions with atomic version comparisons](/guides/persist-proposal-decisions/#save-acceptance-atomically).
If a storage comparison fails, reload canonical state and reevaluate; that race
is a host storage result, not a core error code.
