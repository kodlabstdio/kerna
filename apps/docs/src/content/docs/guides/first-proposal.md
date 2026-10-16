---
title: Create your first Proposal
description: Preview conflicting Operations and accept an explicit subset using the local core package.
---

Run a Proposal against a Page that a Reviewer has changed. You will preserve the
Reviewer's title and accept only the Variant change. Everything runs in memory;
no CMS, storage or credentials are needed.

## Prepare the local package

Use a clone of the Kerna repository, Node 24 (see `.nvmrc`) and Vite+.
The core package is unreleased; this example uses its local workspace import.

From the repository root:

```bash
nvm use
vp install
cd packages/core
vp run test
```

`vp run test` rebuilds the library before running its tests, including this example,
even when build output is missing or stale. Stay in `packages/core` for the next step.

## Run the example

Save the following code as `example.mjs` in `packages/core`, then run:

```bash
node example.mjs
```

```js
import { createProposal, evaluateProposal, acceptProposal } from "@kodlab/kerna-core";

const components = {
  Hero: {
    label: "Hero",
    variants: ["centered", "split"],
    fields: { title: { type: "text", required: true } },
    slots: {},
  },
};
const tokens = {};
const page = {
  formatVersion: 1,
  root: { props: {} },
  content: [{ type: "Hero", props: { id: "hero", variant: "centered", title: "Hello" } }],
};
const created = createProposal({
  id: "proposal-1",
  base: { page, revision: "page-1" },
  components,
  tokens,
  operations: [
    {
      id: "title",
      kind: "editField",
      blockId: "hero",
      field: "title",
      change: { kind: "set", value: "Welcome" },
    },
    { id: "variant", kind: "changeVariant", blockId: "hero", variant: "split" },
  ],
});
if (!created.ok) throw new Error(JSON.stringify(created.errors));

// A Reviewer changed the title after the Agent's original base.
const currentPage = structuredClone(page);
currentPage.content[0].props.title = "Human title";
const input = {
  proposal: created.proposal,
  current: { page: currentPage, revision: "page-2" },
  operationIds: ["title", "variant"],
  components,
  tokens,
};
const preview = evaluateProposal(input);
if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
const all = acceptProposal(input);
if (all.ok) throw new Error("The conflicting selection must not be accepted.");

// Explicitly accept only the exact subset reported by the preview.
const accepted = acceptProposal({
  ...input,
  operationIds: preview.applicableOperationIds,
});
if (!accepted.ok) throw new Error(JSON.stringify(accepted.errors));
console.log(
  JSON.stringify({
    conflicts: preview.conflicts.map(({ operationId, code }) => ({ operationId, code })),
    applicable: preview.applicableOperationIds,
    title: accepted.page.content[0].props.title,
    variant: accepted.page.content[0].props.variant,
    statuses: accepted.proposal.operations.map(({ status }) => status),
    expectedRevision: accepted.expectedRevision,
    expectedProposalVersion: accepted.expectedProposalVersion,
    nextProposalVersion: accepted.proposal.version,
  }),
);
```

Expected output:

```json
{
  "conflicts": [{ "operationId": "title", "code": "guard_conflict" }],
  "applicable": ["variant"],
  "title": "Human title",
  "variant": "split",
  "statuses": ["pending", "accepted"],
  "expectedRevision": "page-2",
  "expectedProposalVersion": 0,
  "nextProposalVersion": 1
}
```

## Understand the result

The title Operation conflicts because the Reviewer changed its guarded value from
`Hello` to `Human title`. The Variant Operation is still applicable. Evaluation
tries selected pending Operations in Proposal order and keeps only successful
candidates in `previewPage`.

Accepting both Operations fails as a whole. The second acceptance explicitly
selects `preview.applicableOperationIds`, so only the Variant changes to `split`.
The title Operation stays pending; the Variant Operation becomes accepted.

Both the preview and accepted result are **unsaved values**. Inputs remain
unchanged. Core does not write storage or issue a new Page revision. Pass the
current enabled Component registry and Design Tokens on every call that takes them.

## Continue

- [Save Proposal decisions safely](/guides/persist-proposal-decisions/) before connecting storage.
- [Resolve Proposal errors](/reference/proposal-errors/) when input or an Operation fails.
- [Look up the Proposal API](/reference/proposals/) for amendment, review and rejection.
