---
name: site-spec
description: Reference for the neutral site-spec contract (project, tokens, components, pages, assets, open questions, build state) that sits between Figma and every platform builder. Use whenever reading, writing, editing or validating files under a site-spec/ directory.
---

# site-spec

`site-spec/` lives in the client project repo. It is the contract between the Figma audit (`build-core`) and platform builders (`webflow-builder`, future Shopify/HubSpot/Framer). JSON Schemas: `schemas/` next to this file.

## Files

| File | Who writes it | Content |
|---|---|---|
| `project.yaml` | `/build-audit` | name (kebab), figma fileKey + url, platforms, `units: rem`, breakpoints, pages (slug + figmaNode) |
| `tokens.yaml` | `/build-audit` | colors, typography, spacing, radii, shadows, fonts — values in **px** |
| `components.yaml` | `/build-audit` | repeated pieces (button, card, navbar, footer) with variants and color-token styles |
| `pages/<slug>.yaml` | `figma-auditor` | ordered sections → neutral element tree |
| `assets/manifest.yaml` + files | `/build-audit` | svg / raster@2x exports |
| `open-questions.md` | `/build-audit` | ambiguities as `- [ ]` checkboxes; dev marks `- [x]` when resolved |
| `build-state.json` | platform builders only (via `build-state.mjs`) | never edit by hand |

## Rules

1. **Neutral.** Never write platform class names (`heading-style-h1`, `section_hero`). Use semantic roles: `heading.h1`, `text.large`, `section.large`, `space.md`, `container: large`.
2. **Token names:** `group.name` lowercase kebab parts (`brand.primary`). Typography: `heading.h1`–`heading.h6` or `text.<size>`. Spacing: `section.small|medium|large` or `space.<size>`; `space.top|bottom|left|right|horizontal|vertical|global|section-small|section-medium|section-large` are reserved. Radii: use `radii.button` for the button corner radius (other radii keys are informational).
3. **Responsive values:** a number, or `{ desktop, tablet?, mobile? }`. Missing `tablet` inherits `desktop`; missing `mobile` inherits `tablet`.
4. **Ids:** section `id`, group `name`, asset `id`, component `name`: lowercase kebab-case, unique in their scope. Group names `component`, `image`, `image-wrapper`, `icon`, `link`, `list`, `list-item`, `form`, `embed-placeholder` and anything ending in `-slot` are reserved.
5. **Never invent copy.** Placeholder text repeated across instances → add an open question instead.
6. **Assets:** logos/icons `kind: svg`; photos/mockups `kind: raster` with `scale: 2`. Manifest `file` is a file name relative to `site-spec/assets/` (e.g. `hero-mockup@2x.png`, not `assets/hero-mockup@2x.png`).
7. **Code components:** set `needsCodeComponent: true` on sections whose behavior native Webflow cannot express (calculators, complex filters, carousels with logic).

## Child types

`heading` (level, style, text) · `text` (style, text) · `rich-text` (text; blank line = new paragraph) · `image` (asset, alt, ratio "w/h") · `svg` (asset) · `link` (text, href) · `button` (text, href, variant?) · `list` (items) · `group` (name, layout?, children) · `component` (ref, variant?, text?, href?, props?) · `form` (description) · `embed-placeholder` (description)

Layout: `{ type: grid|flex|stack, columns?, gap?, direction?, align?, justify? }` — `gap` is a spacing token.

## Example section

```yaml
- id: hero
  figmaNode: "12:341"
  spacing: section.large
  container: large
  background: brand.surface
  layout: { type: grid, columns: { desktop: 2, tablet: 1 }, gap: space.lg }
  children:
    - { type: heading, level: 1, style: heading.h1, text: "Crece más rápido" }
    - { type: text, style: text.large, text: "…" }
    - { type: component, ref: button, variant: primary, text: "Agenda demo", href: "#contact" }
    - { type: image, asset: hero-mockup, alt: "Dashboard", ratio: "4/3" }
  notes: { interaction: "fade-up on load", responsive: "imagen debajo del texto en tablet" }
```

## Validate

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec
```

Output is JSON `{ ok, errors: [{ file, path, message }] }`. Fix every error before handing off. Builders run it with `--require-resolved`, which also fails on unchecked open questions.
