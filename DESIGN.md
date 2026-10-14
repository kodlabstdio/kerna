---
version: alpha
name: Kerna admin
description: Kerna's editor inside the EmDash admin. Native to EmDash's Kumo design system, with the heat ramp kept as Kerna's signature for Agent work.
colors:
  primary: "oklch(0.5772 0.2324 260)"
  primary-hover: "oklch(48.8% 0.243 264.376)"
  on-primary: "#ffffff"
  surface: "#ffffff"
  surface-canvas: "oklch(98.75% 0 0)"
  surface-recessed: "oklch(96% 0 0)"
  surface-tint: "oklch(97% 0 0)"
  on-surface: "oklch(21% 0.006 285.885)"
  on-surface-strong: "oklch(14.5% 0 0)"
  on-surface-subtle: "oklch(55.6% 0 0)"
  hairline: "oklch(93.5% 0 0)"
  added: "oklch(43.2% 0.095 166.913)"
  added-tint: "oklch(95% 0.052 163.051)"
  removed: "oklch(50.5% 0.213 27.518)"
  removed-tint: "oklch(93.6% 0.032 17.717)"
  modified: "oklch(42.4% 0.199 265.638)"
  modified-tint: "oklch(93.2% 0.032 255.585)"
  warning: "oklch(47.6% 0.114 61.907)"
  warning-tint: "oklch(97.3% 0.071 103.193)"
  agent: "#6B11DF"
  agent-tint: "oklch(95.5% 0.03 292)"
typography:
  headline-lg:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
  headline-md:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  body-md:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: system-ui
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  label-md:
    fontFamily: system-ui
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
  label-sm:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  code-sm:
    fontFamily: ui-monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    height: 32px
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    height: 32px
    padding: 12px
  editor-panel:
    backgroundColor: "{colors.surface-canvas}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  preview-frame:
    backgroundColor: "{colors.surface-recessed}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  outline-row:
    backgroundColor: "{colors.surface-canvas}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: 28px
    padding: 8px
  outline-row-selected:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.on-surface-strong}"
  field-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 8px
  field-hint:
    backgroundColor: "{colors.surface-canvas}"
    textColor: "{colors.on-surface-subtle}"
    typography: "{typography.body-sm}"
  token-swatch:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.code-sm}"
    rounded: "{rounded.sm}"
    size: 20px
  operation-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: 12px
  diff-added:
    backgroundColor: "{colors.added-tint}"
    textColor: "{colors.added}"
    typography: "{typography.code-sm}"
  diff-removed:
    backgroundColor: "{colors.removed-tint}"
    textColor: "{colors.removed}"
    typography: "{typography.code-sm}"
  diff-modified:
    backgroundColor: "{colors.modified-tint}"
    textColor: "{colors.modified}"
    typography: "{typography.code-sm}"
  conflict-banner:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 12px
  agent-badge:
    backgroundColor: "{colors.agent-tint}"
    textColor: "{colors.agent}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    height: 20px
    padding: 8px
  section-label:
    backgroundColor: "{colors.surface-canvas}"
    textColor: "{colors.on-surface-subtle}"
    typography: "{typography.label-sm}"
  divider:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.on-surface}"
    height: 1px
---

# Kerna admin

Kerna's editor lives inside other people's EmDash admins, so it should feel like part of EmDash rather than a guest. This file describes the editor, outline, Proposal review and forms. Kerna's brand (marketing site, docs, the vivid heat ramp) is a separate layer, specified in `apps/site/DESIGN.md` (ADR-0016).

## Overview

Calm, dense and precise: the Reviewer is checking an Agent's work, so nothing competes with the content and the diff. The editor is three columns inside the admin frame: outline, preview and fields. A focus mode collapses the outline and fields so the preview fills the frame.

Every value here mirrors a Kumo token from EmDash's admin. Build with Kumo components and its `kumo-*` classes or CSS variables, never with the literal values below: Kumo resolves light and dark mode with `light-dark()`, and EmDash's "classic" theme re-maps the neutrals. Literal values would break both. The values here are the light-mode values, for reference and contrast checks.

Kerna's own colour appears in one place only: work done by an Agent. That is Kerna's signature, and it uses the heat ramp's violet stop and the Kerna mark.

## Colors

Each token maps to Kumo:

| Token                                                           | Kumo                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `primary`, `primary-hover`                                      | `kumo-brand`, `kumo-brand-hover`                            |
| `surface`, `surface-canvas`, `surface-recessed`, `surface-tint` | `kumo-base`, `kumo-canvas`, `kumo-recessed`, `kumo-tint`    |
| `on-surface`, `on-surface-strong`, `on-surface-subtle`          | `text-kumo-default`, `text-kumo-strong`, `text-kumo-subtle` |
| `hairline`                                                      | `kumo-hairline`                                             |
| `added`, `added-tint`                                           | `text-kumo-success`, `kumo-success-tint`                    |
| `removed`, `removed-tint`                                       | `text-kumo-danger`, `kumo-danger-tint`                      |
| `modified`, `modified-tint`                                     | `text-kumo-info`, `kumo-info-tint`                          |
| `warning`, `warning-tint`                                       | `text-kumo-warning`, `kumo-warning-tint`                    |

The two tokens Kumo doesn't have are Kerna's:

- **`agent` (heat violet, `#6B11DF`) and `agent-tint`** mark anything an Agent made: the Agent badge, Proposal headers and the "Agent is working" indicator. Expose them as `--kerna-agent` and `--kerna-agent-tint`, with dark values `oklch(0.78 0.13 292)` on `oklch(0.27 0.08 292)`.
- **The heat ramp** (`heat-0` to `heat-6`, defined in the brand DESIGN.md) never appears as admin colours. It reaches the admin only through the Kerna mark asset.

Kumo has no diff colours. Kerna maps added, removed and modified onto Kumo's success, danger and info so the review screen inherits EmDash's meanings and theme.

## Typography

The admin's own stack: `--font-sans` (EmDash sets it to `--font-emdash`, then `system-ui`) and Kumo's `--font-mono`. Kerna adds no web fonts to the admin. Body text is 14px (`text-base` in Kumo), dense labels 13px and 12px. Code, token names, field keys and JSON paths use the mono stack (`code-sm`).

## Layout

- **Three columns:** outline 260px, preview flexible, fields 320px. Below 1024px the outline becomes a drawer and the fields a bottom sheet.
- **Focus mode** hides both side panels; a single shortcut toggles it, and the preview stays where it was.
- **Spacing** follows Kumo's 4px Tailwind base; Kerna uses only the `xs`–`2xl` steps above.
- **Proposal review** replaces the fields column with the list of Operations; the preview shows the Proposal applied.

## Elevation & Depth

Flat, as Kumo is. Panels are separated by `hairline` dividers, not shadows. Only floating menus and popovers use Kumo's shadow (`shadow-lg` with `kumo-shadow-drop`). The preview sits in a `surface-recessed` well so the Page reads as content, not admin chrome.

## Shapes

Kumo's radii: `rounded-lg` (8px) for buttons, inputs and cards; `rounded-md` (6px) for outline rows; `rounded-xl` (12px) only for Operation cards; `full` for badges. Selection in the preview is a 2px `primary` outline offset by 2px, never a fill over the Page.

## Components

- **Outline row:** the Component's icon, the Block's name (its heading text if it has one, else the Component name), and a Slot marker for children. Selected rows use `surface-tint` and `on-surface-strong`. Blocks an Agent added in the current Proposal carry a small `agent` dot.
- **Field control:** Kumo inputs. Variant choices are a segmented control or select listing only the Component's Variants. Token pickers show a 20px `token-swatch` next to the token's name in mono; they never offer a free colour input.
- **Operation card:** one per Operation, with the Operation's summary in plain words ("Add Testimonials after Features"), the diff below, then Accept and Reject. Accept is `button-primary`; Reject is `button-secondary`. Diff lines use `diff-added`, `diff-removed` and `diff-modified`, each with a `+`, `−` or `~` sign.
- **Agent badge:** `agent-badge` with the Kerna mark and the Agent User's name. It appears on Proposals, in the Page's history, and on the "Agent is working" indicator.
- **Conflict banner:** `conflict-banner` when a Proposal's base revision is out of date, stating which Operations no longer apply.
- **Empty states:** the Kerna mark (the only place the full heat ramp shows), one sentence and one action, such as "Set up Kerna" or "Ask your Agent to draft a Page".

## Do's and Don'ts

- **Do** build with Kumo components and `kumo-*` tokens so EmDash's light, dark and classic themes keep working.
- **Do** pair every diff colour with its sign and words; colour is never the only signal (WCAG 1.4.1).
- **Do** mark Agent work with `agent` violet and the Kerna mark, so a Reviewer always knows who made a change.
- **Do** keep focus visible with Kumo's `kumo-focus` ring on every control, including outline rows and Operation cards.
- **Do** keep `on-surface-subtle` text on `surface` or `surface-canvas` only; on `surface-recessed` it drops below 4.5:1, so use `on-surface` there.
- **Do** keep the preview's selection outline outside the Block so it never changes the Page's layout.
- **Don't** use the heat ramp, gradients or the brand's ultramarine in the admin; red, orange and yellow already mean removed and warning here.
- **Don't** use green or red for Accept and Reject buttons; those colours belong to the diff.
- **Don't** invent colours, fonts, radii or shadows outside this file; if something is missing, add it here first.
- **Don't** open the editor outside the admin frame (PRD: stay in the admin frame).
