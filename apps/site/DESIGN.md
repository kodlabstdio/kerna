---
version: alpha
name: Kerna
description: Kerna's brand for its marketing site and docs. Cold silver and graphite, chrome objects, one ultramarine accent, and a vivid heat ramp used only as art.
colors:
  primary: "#1F25F9"
  primary-hover: "#171ACB"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  surface-silver: "#F5F7F9"
  surface-silver-strong: "#EEF0F4"
  rail: "#CED1D6"
  on-surface: "#0E0F12"
  on-surface-muted: "#5E636D"
  on-surface-quiet: "#484D56"
  stage: "#0E0F12"
  stage-raised: "#1D1F23"
  on-stage: "#FFFFFF"
  on-stage-muted: "#95989F"
  primary-on-stage: "#7598FF"
  heat-0: "#1113D0"
  heat-1: "#6B11DF"
  heat-2: "#C2029C"
  heat-3: "#EE343B"
  heat-4: "#FC740E"
  heat-5: "#FFB334"
  heat-6: "#FDEC9E"
typography:
  display:
    fontFamily: Geist
    fontSize: 64px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.02em
  title:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  label-mono:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.04em
  code:
    fontFamily: Geist Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  numeral:
    fontFamily: Geist
    fontSize: 96px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.05em
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  2xl: 96px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 20px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 20px
  button-on-stage:
    backgroundColor: "{colors.on-stage}"
    textColor: "{colors.stage}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 20px
  nav-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-quiet}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    height: 48px
    padding: 8px
  headline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.display}"
  headline-second-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.display}"
  highlight:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
  bento-card:
    backgroundColor: "{colors.surface-silver}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  bento-card-caption:
    backgroundColor: "{colors.surface-silver}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-md}"
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.on-surface}"
    width: 1px
  label-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-mono}"
    rounded: "{rounded.md}"
    padding: 16px
  stats-numeral:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.numeral}"
  code-block:
    backgroundColor: "{colors.surface-silver-strong}"
    textColor: "{colors.on-surface-quiet}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: 16px
  stage:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.on-stage}"
    typography: "{typography.display}"
  stage-second-line:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.on-stage-muted}"
    typography: "{typography.display}"
  stage-card:
    backgroundColor: "{colors.stage-raised}"
    textColor: "{colors.on-stage}"
    rounded: "{rounded.lg}"
    padding: 24px
  stage-link:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.primary-on-stage}"
    typography: "{typography.body-md}"
  heat-legend-0:
    backgroundColor: "{colors.heat-0}"
    textColor: "{colors.on-stage}"
    typography: "{typography.label-mono}"
  heat-legend-1:
    backgroundColor: "{colors.heat-1}"
    textColor: "{colors.on-stage}"
    typography: "{typography.label-mono}"
  heat-legend-2:
    backgroundColor: "{colors.heat-2}"
    textColor: "{colors.on-stage}"
    typography: "{typography.label-mono}"
  heat-legend-3:
    backgroundColor: "{colors.heat-3}"
    textColor: "{colors.stage}"
    typography: "{typography.label-mono}"
  heat-legend-4:
    backgroundColor: "{colors.heat-4}"
    textColor: "{colors.stage}"
    typography: "{typography.label-mono}"
  heat-legend-5:
    backgroundColor: "{colors.heat-5}"
    textColor: "{colors.stage}"
    typography: "{typography.label-mono}"
  heat-legend-6:
    backgroundColor: "{colors.heat-6}"
    textColor: "{colors.stage}"
    typography: "{typography.label-mono}"
---

# Kerna

The brand for Kerna's marketing site and docs. Kerna's admin follows the root `DESIGN.md` instead, which is EmDash-native (ADR-0016). This file is also imported as `apps/site`'s Kerna Design System, so every token here must stay expressible as a Kerna Design Token.

## Overview

Cold metal, hot signal. The page is clean and quiet: white and cold silver, regular-weight type, thin guide rails. Against that calm, one thing is loud: the heat ramp, a thermal-camera gradient from ultramarine through magenta and red to pale yellow, reflected on chrome objects.

Three references, one job each:

- **Structure, from Aceternity:** a framed canvas with dotted guide rails on both sides, dashed dividers between sections, a floating pill nav, centred heroes and bento grids of product moments.
- **Material, from pen.dev:** monochrome silver and graphite, chrome objects lit by soft horizon glows, two-tone headlines at regular weight, a giant wordmark in the footer.
- **Colour, from the HEATMAP coffee packaging:** the heat ramp as the only chroma, a white label card carrying information on top of it, and an oversized ultramarine numeral as the hierarchy anchor.

The voice is calm and exact: short sentences, numbers over adjectives.

## Colors

**Neutrals** are cold: `surface` white, `surface-silver` for cards, `rail` for guide lines, `on-surface` graphite ink, `on-surface-muted` for the second line of headlines and captions. **Stages** (`stage`, `stage-raised`) are graphite bands for the hero and the final call to action, where chrome and heat glow best.

**Ultramarine** (`primary`, from the packaging's score) is the only accent: links, the primary button, the selection highlight and the highlighted phrase. On stages it lightens to `primary-on-stage`.

**The heat ramp** (`heat-0` to `heat-6`) is tuned in OKLCH so it blends evenly: lightness climbs from 0.40 to 0.94 while hue turns from ultramarine (266°) through violet, magenta, red and orange to pale yellow (98°). Use it as one continuous gradient, in this order, cold to hot. It feeds Kerna's mesh-gradient shader Variant on the site.

Text never sits on heat art. Only the solid legend swatches carry text, and their pairs are checked: white on `heat-0` to `heat-2`, graphite on `heat-3` to `heat-6`.

**Dark mode** turns the whole page into a stage: `stage` becomes the canvas, `stage-raised` the cards, `on-stage` and `on-stage-muted` the text, `primary-on-stage` the accent, and `rail` becomes `#2A2D33`. The heat ramp is unchanged; it glows more on graphite.

## Typography

**Geist** for everything, at regular weight. Headlines are weight 400 with tight tracking, never bold. Most headlines are two-tone: the first line in `on-surface`, the second in `on-surface-muted` (on stages, `on-stage` then `on-stage-muted`). **Geist Mono** only for code, data, token names and measurements, never as decoration for ordinary labels. **Oversized numerals** (`numeral`, 96px, ultramarine) appear only in Stats, as the packaging's "86" does. Both fonts are free (SIL OFL) and self-hosted.

Sizes step down by roughly 1.4: display 64px, headline 40px and 28px, title and body 18px, body 16px, labels 12px. Below 640px, display drops to 40px and headline-lg to 32px.

## Layout

- **The frame:** content sits in a 1152px column bounded by 1px dotted `rail` lines on both sides, running the full page height. Sections are separated by dashed `rail` dividers that stop at the rails.
- **Rhythm:** sections are 96px apart (`2xl`), cards 16px (`md`) apart, card padding 24px.
- **Hero:** a full-width graphite stage with the nav floating above it. A dark circle sits above the stage with only its rim showing, and the heat ramp glows down from that rim, hottest at the edge and coldest furthest away. Below it: the chrome "kerna" wordmark lit from above, a centred two-tone headline, one sentence and two buttons. The final call to action uses the same stage.
- **Hero product frame:** shows a Proposal under review (outline with Agent dots, the preview with the Agent's additions marked, and the Operations with Accept and Reject), because that is what only Kerna does. Below 640px it shows the Operations alone. Customer Pages depicted inside product frames may carry their own type over their own heat art; that is their brand, not ours.
- **Bento grids:** 3 columns on desktop, 2 on tablet, 1 on phones; one card per grid may span two columns and carry the section's heat art.
- **Footer:** link columns in Geist, then a giant Kerna wordmark in `rail` grey.

## Elevation & Depth

Almost flat. Depth comes from light, not shadows: chrome objects carry their own highlights, and heat art glows like a horizon behind them. Cards have no shadow; they are silver on white. The floating nav pill is the only element with a shadow (`0 8px 24px rgb(14 15 18 / 0.08)`).

## Shapes

Soft but not bubbly: `md` (10px) for label cards and code, `lg` (16px) for bento and stage cards, `xl` (24px) for the hero's product frame, `full` for buttons, nav, the install command and badges.

## Components

- **Nav pill:** floating, centred, white with the rail as its border; the wordmark on the left, three links, and one primary button.
- **Install block:** the page's one conversion action, used in the hero and the final stage: a graphite panel with a package-manager switch and two copyable commands (Site, Agent). Every "Install" link leads to it.
- **Two-tone headline:** see Typography. At most one phrase per page gets the `highlight` marker: ultramarine fill, white text, 6px radius.
- **Label card:** the packaging's white label. It carries a Page's name, a mono key-value list, and an ultramarine figure with its own label (for example "13/14 changes accepted"); an unlabelled number reads as a mystery score. It is the only way text appears over heat art.
- **Bento card:** silver, 16px radius, a short title and a muted caption, and a product moment (outline, Proposal diff, token picker) rendered in the admin's own look.
- **Stats:** an ultramarine numeral and one plain sentence under it. Stats prove a benefit (0 KB of JavaScript, $0 of AI usage, 1 prompt); never list limits.
- **Heat ribbon:** the main background art. One soft, curving band of light over graphite, built like a thermal cross-section: cold and wide at the edges (`heat-0`), hot and thin at the core (`heat-6`, then a white line), heavily blurred, with fine monochrome grain on top so it never bands. It holds still. Place it so it passes beside or below text, never behind it.
- **Heat legend:** seven solid swatches with mono labels, like a thermal camera's scale; used for the Design Token story.
- **Chrome art:** the full "kerna" wordmark (never a single letter) and Component icons rendered as liquid metal, catching the heat glow on their top edges and a cold ultramarine reflection underneath. They ship as static AVIF and WebP images in light and dark versions; only the hero runs one live shader island, which shows the static image when the visitor prefers reduced motion.

## Do's and Don'ts

- **Do** keep heat to one surface per viewport: the hero, one featured card per section, the Kerna mark, or the final call to action.
- **Do** put text over heat art only inside a white label card.
- **Do** keep every headline at weight 400; use the second line's muted tone, not boldness, for hierarchy.
- **Do** give every chrome or heat image a static version and honour `prefers-reduced-motion`.
- **Do** spend motion on one authored moment per page (on the home page, the hero horizon heating up from cold to hot once on load, with an exponential ease-out from an already-visible state), not on ambient loops everywhere.
- **Do** make the hero's main action the real install command with a copy button, not a link to it.
- **Do** theme the browser's own surfaces: ultramarine text selection and caret, rail-coloured scrollbars, tabular numerals.
- **Don't** put small labels or kickers above headings; the two-tone headline carries the section.
- **Do** write marketing copy in plain words. Of Kerna's product terms, only Agent, Proposal and Design System appear before they are explained.
- **Do** use `primary-on-stage` for focus rings on graphite stages (ultramarine is under 3:1 there), and give every control at least 44px of tap target below 640px.
- **Do** keep a menu for the nav links on phones; never hide navigation without one.
- **Do** keep the rails and dividers 1px and quiet; they frame, they never decorate.
- **Don't** use any accent colour other than ultramarine, or put the heat ramp in text, links or buttons.
- **Don't** use the heat ramp out of order or as separate decorative colours; it is one cold-to-hot gradient.
- **Don't** fill backgrounds with round radial blobs; heat moves as ribbons and horizon glows.
- **Don't** add drop shadows to cards or glow effects to text.
- **Don't** use more than one highlighted phrase per page.
