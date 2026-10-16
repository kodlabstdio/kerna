---
title: Operations
description: Operation shapes, stable-ID destinations, guards, Slot constraints and size limits.
---

An Operation is one typed change in a Proposal. Submit draft Operations to
[`createProposal` or `amendProposal`](/reference/proposals/#functions); core derives
guards and summaries from the original base.

## Operation shapes

Every Operation has a nonempty `id`, unique across the Proposal, and a `kind`.
The following shapes list all required keys. Unknown keys or kinds are rejected.

| Kind            | Shape                                                | Effect                                                  |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `addBlock`      | `{ id, kind: "addBlock", block, destination }`       | Insert one Block, including its declared Slot contents. |
| `moveBlock`     | `{ id, kind: "moveBlock", blockId, destination }`    | Move an existing Block and its subtree.                 |
| `removeBlock`   | `{ id, kind: "removeBlock", blockId }`               | Remove an existing Block and its subtree.               |
| `changeVariant` | `{ id, kind: "changeVariant", blockId, variant }`    | Choose an enabled Variant of the Block's Component.     |
| `editField`     | `{ id, kind: "editField", blockId, field, change }`  | Set or unset a declared content field.                  |
| `insertPattern` | `{ id, kind: "insertPattern", blocks, destination }` | Insert a nonempty array of Copied Pattern Blocks.       |

A Block has `{ type, props: { id, variant, ... } }`; content fields and declared
Slots live in `props`. Block IDs must be nonempty and unique across the Page,
including nested Blocks. `blockId` targets a stable ID, not an array index.

### Set or unset a field

Use `change: { kind: "set", value }` to set a value or
`change: { kind: "unset" }` to delete an optional field. `null` is not unset.
Empty strings, zero and false are values and must satisfy the field's declared
type. Token fields use `{ token: "token.name" }`, referencing an existing Design
Token of the declared type.

Only declared content fields can be edited this way. IDs, Variants, Slots and
root metadata are not content fields. Required fields cannot be unset.

## Destinations and order

`destination` contains both `container` and `position`:

| Property    | Accepted shapes                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| `container` | `{ kind: "root" }` or `{ kind: "slot", parentId, slot }`                           |
| `position`  | `{ kind: "end" }` or `{ kind: "before", blockId }` or `{ kind: "after", blockId }` |

The Slot must be declared by its parent Component. Before/after anchors are
stable Block IDs in the named container. Reordering an anchor within its container
is allowed; moving it out causes a conflict. `end` appends after the **current**
last child, not the last child of the original base.

Positions are literal. Applying A-after-X and then B-after-X produces X,B,A.
Repeated before/end insertions preserve Proposal order. A single Copied Pattern
with `blocks: [A, B]` always preserves that payload order.

## Guards and moves

Field and Variant changes protect the original target Component and guarded
value, including the distinction between an absent field and a present value.
Removal protects the entire target subtree. Moves also protect the source
container and immediate predecessor/successor IDs, including start/end boundaries.
Destinations protect the parent and anchor Component types.

Nearby insertion, removal or reordering can conservatively conflict with a move.
Sibling field edits and distant changes can succeed. A Block cannot move into
itself or its descendants, or use itself as an anchor. Same-container moves
reorder atomically. Traversal visits declared Slots only.

Guards are checked even when Page revision strings match. A changed revision
alone does not block an otherwise valid Operation.

## Copied Patterns

The host resolves a Copied Pattern and supplies final unique IDs for every Block,
including nested Blocks. Core does not look up Patterns, generate IDs, remap
collisions or insert Synced Patterns. The inserted Blocks are independent copies.

A collision with the Page or within the payload, or any invalid child, rejects
the entire insertion. No partial Pattern is retained and inputs remain unchanged.

## Independent validity and Slots

Every Operation must be valid **alone against the original base**, including
Operations appended later. An add followed by an edit of its new Block is
unsupported: put the final content inside the add.

At Slot minimum/maximum boundaries, remove/move-out or add/move-in can be invalid
alone. Replacing a sole child in a Slot with `min=max=1` using separate remove/add
Operations is unsupported. The same limitation applies to wider fixed-cardinality
Slots. Use field/Variant changes or an independently valid move when appropriate.
There is no composite replacement Operation or automatic conflict repair.

During evaluation, candidates must also remain valid as earlier successful
Operations accumulate. See [Proposal evaluation](/reference/proposals/#evaluateproposal)
and [error recovery](/reference/proposal-errors/#operation-conflicts).

## Summaries

Summaries are deterministic plain text; consumers must escape them for their
output context. For old/new strings, runs of CR, LF and tab characters become one
space and outer whitespace is trimmed. The normalized content is limited to 40
Unicode code points, including `…` when shortened, then JSON-quoted. Quoting and
escape characters are added after that excerpt limit. Empty strings display as
`""`; absent or unset fields display as `<unset>`. Numbers, booleans and token
references use their JSON representation, limited to 40 code points in the same
way. For example: `Hero: h: title "Hello" → "New"`.

The complete summary is limited to 512 Unicode code points, including a final
`…` when shortened. These display rules never change stored values, IDs or guards.

## Limits

| Limit             | Exact value and scope                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation records | 100 total, including accepted and rejected records. Exported as `MAX_PROPOSAL_OPERATIONS`.                                                                             |
| Proposal size     | 2,000,000 UTF-8 bytes of serialized JSON for a draft Operation array or enriched Proposal, including payloads, guards and summaries. Exported as `MAX_PROPOSAL_BYTES`. |
| Page size         | 1,000,000 UTF-8 bytes of serialized JSON, including metadata.                                                                                                          |
| Block depth       | 2: top-level Blocks are depth 1; their Slot children are depth 2.                                                                                                      |
| Summary length    | At most 512 Unicode code points per Operation record, including `…` when shortened. Consumers must escape this plain text.                                             |

Every candidate must satisfy enabled Component and Variant rules, content-field
types, token references, Slot allow-lists and counts, depth and Page size.
Evidence is budgeted incrementally as Operations are added.

Full-Page copying and validation costs O(N × P), where N is at most 100 Operations
and P is at most 1,000,000 Page bytes. These limits are product constraints, not
measured performance claims or hard time/memory guarantees for arbitrary
preallocated JavaScript objects. The host must bound request parsing before
passing objects to core. Split oversized submissions into smaller independent
Proposals; preserve existing decision history.
