# Kerna

An AI-agent-first page builder for the EmDash CMS, by Kod Lab Studio (npm `@kodlab/kerna`). Agents compose Pages from a site's Design System; humans fine-tune the result visually.

## Language

### Host and actors

**EmDash**:
The host CMS (Cloudflare's Astro-based CMS) that this product extends as a plugin.
_Avoid_: Mdash, Emdash CMS

**Agent**:
The primary author of Pages: an AI model running in the person's own agent tool (e.g. Claude Code, Codex), connected to the site, drafting and editing Pages on that person's behalf.
_Avoid_: bot, assistant, AI

**Agent User**:
The dedicated, low-privilege EmDash user whose token an Agent connects with. It can create Proposals but never accept them or publish.
_Avoid_: bot account, service account, API user

### Design System

**Design System**:
A site's foundation that every Page is built from — its Design Tokens and the Components it enables. Pages can only be assembled from what the Design System offers, so output stays on-brand. Always the _site's_; never the look of our own admin UI.
_Avoid_: theme, style guide, brand kit

**Design System Preset**:
A ready-made Design System (tokens and Variant defaults, as a DESIGN.md) that sets a site's whole look in one step.
_Avoid_: theme, skin, template, kit

**Design Token**:
A named design value in the Design System (a color, font, spacing step, radius, shadow). Pages refer to tokens, never to raw values, so changing a token restyles every Page.
_Avoid_: variable, setting, style

**Component**:
A definition of one kind of page piece (Hero, Feature Grid, Testimonials, CTA…): its content fields, its Variants, and how it renders. Owns its own internal layout. EmDash calls a registered Component a "block type".
_Avoid_: widget, element, module, block type (outside EmDash-facing code)

**Variant**:
A named, predefined presentation of a Component (e.g. a Hero that is "split", "centered" or "image-background"). Chosen, never freely designed.
_Avoid_: style, layout, skin

### Pages

**Page**:
An ordered stack of top-level Blocks, rendered between the theme's header and footer. Blocks nest only through Slots, at most 2 levels deep.
_Avoid_: layout, canvas, document

**Block**:
One placed instance of a Component, with a chosen Variant, filled-in content, and the Blocks in its Slots (if any).
_Avoid_: section, widget, element, row, container

**Slot**:
A named place a Component declares for holding child Blocks (e.g. "left" and "right" in Columns, "actions" in a Hero), with rules about which Components it accepts and how many.
_Avoid_: drop zone, children, container, region

**Pattern**:
A saved, reusable set of Blocks that humans and Agents can insert into Pages. Always either Copied or Synced.
_Avoid_: template, global component, global widget, reusable block

**Copied Pattern**:
A Pattern whose Blocks become independent copies on insert; later edits to the Pattern don't affect Pages already using it.
_Avoid_: starter, template

**Synced Pattern**:
A Pattern inserted as a link; editing it once updates every Page that uses it. Holds a single Block (which may have Blocks in its Slots).
_Avoid_: global block, symbol, linked block

**Markdown Twin**:
A Markdown rendering of a Page, generated from its Blocks, served alongside the HTML for AI crawlers and used by Agents as a compact view of the Page.
_Avoid_: llms page, text version, export

**Lock**:
A restriction on a Block or one of its fields that lets lower roles edit its content but not its Variant, structure or the locked fields.
_Avoid_: freeze, protect, pin

### Review

**Reviewer**:
Whoever is acting on a Proposal: accepting or rejecting its Operations and fine-tuning the Page. A role in the review flow, not an EmDash permission role.
_Avoid_: editor, owner, admin, user

**Proposal**:
A set of Operations an Agent submits against a specific revision of a Page, with a preview, waiting for a Reviewer to accept or reject. Agents never change a Page any other way.
_Avoid_: draft, suggestion, changeset, PR

**Operation**:
One small, typed change inside a Proposal (add, move or remove a Block; change a Variant; edit a content field) that a Reviewer can accept or reject on its own.
_Avoid_: patch, edit, diff, step

## Relationships

- A **Design System** has many **Design Tokens** and enables many **Components**
- A **Component** has one or more **Variants**
- A **Page** is an ordered list of **Blocks**; each **Block** instantiates one **Component** with one **Variant**
- A **Component** may declare **Slots**; each **Slot** holds child **Blocks** (max depth 2)
- A **Pattern** holds one or more **Blocks**; a **Synced Pattern** holds exactly one
- A page-sized **Copied Pattern** renders on-brand under any **Design System Preset**
- Each **Page** has one **Markdown Twin**; each translation of a Page is its own Page
- An **Agent** changes a **Page** only through a **Proposal** made of **Operations**
- An **Agent** composes **Pages** using only what the **Design System** offers, acting as the **Agent User**
- A **Reviewer** accepts or rejects each **Operation** of a **Proposal**

## Example dialogue

> **Dev:** "The client wants a pricing table but there's no pricing **Component**."
> **Domain expert:** "Then the **Agent** says so. A new **Component** is added to the **Design System** in code; it is never improvised on the **Page**."

> **Dev:** "The phone number in the contact CTA changed. It's on 12 **Pages**."
> **Domain expert:** "If it was inserted from a **Synced Pattern**, edit the **Pattern** once. If it came from a **Copied Pattern**, each **Page** owns its copy."

> **Dev:** "The agent's Proposal swaps the Hero to 'split' and adds two testimonials, but the client only likes the testimonials."
> **Domain expert:** "Reject the Variant **Operation**, accept the two add-Block **Operations**. The **Proposal** is then partially applied."

## Flagged ambiguities

- "Section" means a reusable rich-text snippet in **EmDash**; we never use it for a **Block**.
