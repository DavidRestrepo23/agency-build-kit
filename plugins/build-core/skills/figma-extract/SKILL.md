---
name: figma-extract
description: How to read an approved Figma file through the Figma MCP and translate frames, variables, text styles, component instances and assets into site-spec YAML. Use when auditing Figma for /build-audit or when a figma-auditor agent extracts a page.
---

# Figma → site-spec extraction

Read the `site-spec` skill first; it defines the output format.

## Prerequisites

- Figma MCP connected (`get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`). If tools fail with auth errors, stop and tell the user to authorize the Figma MCP via `/mcp`.
- Load the `figma:figma-design-to-code` skill before the first `get_design_context` call (it is mandatory for that tool).

## Procedure per page

1. `get_metadata` on the page frame → list top-level children; each full-width child frame is a **section**, top to bottom.
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
| Nested frame grouping children | `group` with kebab `name` |
| Mobile/tablet frames of the same section | responsive values (`columns`, sizes) and `notes.responsive` |

4. Tokens: `get_variable_defs` → colors, spacing, radii (store the primary button corner radius as `radii.button`); text styles → typography (size per breakpoint when mobile frames exist). Keep `figmaVar` ids.
5. Assets: download asset URLs returned by `get_design_context` into `site-spec/assets/`; rasters at 2x. If only a raster exists for a logo/icon, record an open question instead of using it.
6. Anything ambiguous → an open question line: `- [ ] <section>: <question>`. Typical: placeholder copy repeated, missing mobile frame, unclear interaction, font not available on Google Fonts.

## Never

- Invent copy, links or alt text that is not in Figma (use an open question).
- Write platform class names.
- Round tokens silently: if a value does not match any token, record an open question.
