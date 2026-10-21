---
name: figma-extract
description: How to read an approved Figma file through the Figma MCP and translate frames, variables, text styles, component instances and assets into site-spec YAML. Use when auditing Figma for /build-core:build-audit or when a figma-auditor agent extracts a page.
---

# Figma → site-spec extraction

Read the `site-spec` skill first; it defines the output format.

## Prerequisites

- Figma MCP connected (`get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`). If tools fail with auth errors, stop and tell the user to authorize the Figma MCP via `/mcp`.
- Load the `figma:figma-design-to-code` skill before the first `get_design_context` call (it is mandatory for that tool).

## Procedure per page

1. `get_metadata` on the page frame → list top-level children; each full-width child frame is a **section**, top to bottom.
   - Designers often wrap sections in unnamed full-width frames (`Frame 82`, `Content`). Descend through any wrapper whose name is generic (`Frame N`, `Content`, `Group N`) and whose children are themselves full-width frames; the named children are the sections. Never emit a wrapper as a section.
   - A navbar/header nested inside the hero frame is still its own section (`navbar`), placed first. Same for a footer nested in a wrapper.
   - Sort sections by `y`, not by layer order.
2. For each section: `get_design_context` on the section frame (not the whole page — keeps responses small).
3. Map Figma → spec:

| Figma | site-spec |
|---|---|
| Section frame name ("Hero", "Features") | `id` in kebab-case (`hero`, `features`) |
| Vertical padding of section | `spacing: section.small|medium|large` (closest token) |
| Inner max-width (~768 / ~1024 / ~1280px) | `container: small|medium|large` |
| Auto-layout horizontal with equal children | `layout: { type: grid, columns }` |
| Auto-layout vertical | `layout: { type: stack }` |
| Auto-layout horizontal, unequal children | `layout: { type: flex, align, justify }` |
| Auto-layout gap | `gap:` closest `space.*` token |
| Text with heading style | `heading` (level from semantic order, style `heading.hN`) |
| Body text | `text` with `text.<size>` |
| Instance of a library component | `component` with `ref` + `variant` |
| Vector / icon / logo | `svg` asset |
| Image fill / photo | `image` raster asset, `ratio` from frame size |
| Page frame fill and dominant body text color/style | `tokens.yaml` `page: { background, color, text }` |
| Nested frame grouping children | `group` with kebab `name` |
| Frame with fill / stroke / corner radius / padding (card, badge, panel) | `group` (or `section`) with `surface: <name>`; define the surface once in `tokens.yaml` and reuse it for identical boxes |
| Mobile/tablet frames of the same section | responsive values (`columns`, sizes) and `notes.responsive` |

4. Tokens: `get_variable_defs` → colors, spacing, radii (store the primary button corner radius as `radii.button`); text styles → typography (size per breakpoint when mobile frames exist; a ~767px frame fills `mobileLandscape`, a ~375px frame fills `mobile`). `letterSpacing` stays in **px** exactly as Figma shows it (setup converts it to em). Figma "Text case: UPPER/lower/Title" → `textTransform: uppercase|lowercase|capitalize`; keep the copy as stored in the layer, never retype it in caps. Keep `figmaVar` ids.
   If `get_variable_defs` returns nothing usable (no variables, only effect/gradient styles), infer tokens from the raw values in `get_design_context` (most frequent fills, font sizes, gaps) and add ONE open question saying tokens were inferred, listing the main values.
5. Assets: SVGs can be downloaded from the URLs returned by `get_design_context`. Those raster URLs are the **source image at its uploaded size**, not a 2x export — for rasters call `download_assets` on the image node with `defaultScale: 2` (or confirm the source is ≥ 2× the rendered slot) before writing `scale: 2`. Name files by their real format (`file` on the download: a `.png` URL can be JPEG). If only a raster exists for a logo/icon, record an open question instead of using it.
6. **Auto layout check.** For every section and every content frame inside it (rows, columns, cards, button groups, text stacks), check whether it uses auto layout. In `get_design_context` output an auto-layout frame renders as `flex` / `flex-col` with `gap-[…]` / `p-[…]`; a frame **without** auto layout has children placed with `absolute` + `left-[…]` / `top-[…]` (or `-translate-x-1/2 … left-1/2`). Report each content frame without auto layout with the auto layout it should have so the build matches exactly:
   - `direction`: vertical when children are stacked by `top`, horizontal when they share a `top` and differ in `left`.
   - `gap`: the most common distance between consecutive children; `padding`: distance from the frame edges to the first/last child.
   - Skip purely decorative layers (glows, ellipses, rotated stickers, background shapes, floating icons) — they stay absolute; mention them in `notes.interaction` instead.
   Still write the best `layout` you can infer; the finding goes to the dispatcher (`autoLayout`), which turns it into an open question.
7. Interactive candidates: flag every section or group that may have behavior (see "Interactive candidates" below). Never decide the behavior yourself; report each candidate so `/build-core:build-audit` can ask the developer.
8. Anything ambiguous → an open question line (written in the project `language`): `- [ ] <section>: <question>`. Typical: placeholder copy repeated, missing mobile frame, unclear interaction, font not available on Google Fonts.

## Interactive candidates

Figma frames are static; behavior must come from the developer. Flag a section or group as a candidate when you see any of these signals, and record the signal you saw:

| Signal in Figma | Likely behavior |
|---|---|
| Row with more items than fit, clipped frame, arrows or pagination dots | slider / carousel |
| Strip of repeated logos or text, clipped at the edges | marquee (auto-scroll) |
| Play icon over an image or thumbnail grid | video / lightbox / modal |
| Chevrons, `+` / `−`, stacked question rows | accordion / FAQ |
| Row of labels where one looks active | tabs |
| Inputs, selects, submit button | form |
| Large standalone numbers (`+300`, `30%`) | counter animation (or static) |
| Floating, rotated or overlapping decorative elements | hover / scroll animation (or static) |
| Layer or component named *slider, carousel, tabs, accordion, modal, marquee, ticker* | the named behavior |
| Prototype interactions on the frame (if the MCP exposes them) | the prototyped behavior |
| Diagram or calculator with logic (rings, steps, sliders with values) | code component |

Report **every section**, with guess `static` when you saw no signal — the dispatcher asks the developer about all of them, because many sliders and tabs show no signal in a static frame. For each candidate keep: section id (and group name), Figma node id, the signal, and your best guess. Do not write `behavior`, `needsCodeComponent` or `notes.interaction` from a guess — wait for the developer's answer in `/build-core:build-audit`.

## Never

- Invent copy, links or alt text that is not in Figma (use an open question).
- Write platform class names.
- Round tokens silently: if a value does not match any token, record an open question.
