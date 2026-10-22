---
name: client-first
description: Finsweet Client-First naming and structure rules used by this agency for every Webflow build, with the site-spec to Client-First mapping and the class-name validator. Use whenever creating, naming or reviewing Webflow classes.
---

# Client-First (agency rules)

## Page structure

`page-wrapper` > `main-wrapper` > `section_[id]` > `padding-global` > `container-[small|medium|large]` > `padding-section-[small|medium|large]` > `[id]_component` > content.

## Class kinds

| Kind | Pattern | Examples |
|---|---|---|
| Custom | `[folder]_[element]`, kebab parts, exactly one `_` | `section_hero`, `hero_component`, `hero_image-wrapper` |
| Utility | closed list below | `padding-global`, `heading-style-h1`, `margin-bottom` |
| Combo | `is-[kebab]`, stacked on a base class; only for `button` variants, created with properties by setup | `button is-secondary` |

Utilities: `page-wrapper`, `main-wrapper`, `padding-global`, `container-*`, `padding-section-*`, `heading-style-h1..h6`, `text-size-*`, `text-weight-light|normal|medium|semibold|bold`, `text-color-*`, `background-color-*`, `text-align-*`, `text-rich-text`, `margin-|padding-` + `top|bottom|left|right|horizontal|vertical` or a size, `max-width-small|medium|large`, `hide-tablet|mobile-landscape|mobile-portrait`, `button`, `surface-*` (box styles from `tokens.yaml` surfaces).

**Never stack utilities in a build.** Webflow stores any second class as a combo with empty properties, so `features_grid surface-card` or `text-size-large text-color-white` render without the utility's styles. Each element gets one class; when it needs more than its base utility, it gets its own `<folder>_<element>` class carrying the props (bound to variables). Utilities such as `surface-*`, `text-color-*`, `text-align-*` and spacing combos still exist for the style guide and manual work.

## site-spec → Client-First

| Spec | Client-First |
|---|---|
| section `id` | `section_<id>` + wrappers above |
| `spacing: section.large` | `padding-section-large` |
| `container: large` | `container-large` |
| `heading.hN` | `heading-style-hN` on the semantic `<hN>` |
| `text.<size>` | `text-size-<size>` |
| `group` `name` | `<id>_<name>` |
| `button` variant ≠ primary | `button is-<variant>` |
| image | `<id>_image-wrapper` > `<id>_image` |
| `surface: card` on a group/section | surface props written on the element's own class (`<id>_<name>` / `section_<id>`) |
| `color` on heading/text | own class `<id>_<style>-<color>` with typography + color (e.g. `hero_text-large-neutral-black`); without color, the utility alone |
| `layout.textAlign` | `text-align` written on the element's own class |
| section | `<section id="<id>">` for anchor links |
| child `decorative: true` | wrapped in `<id>_decor` / `<id>_decor-2`… (`position: absolute`, offsets in rem, `aria-hidden`), parent gets `position: relative` |
| token `brand.primary` | Webflow variable `brand-primary` |

All of this is computed by `plan-section.mjs`; do not hand-roll class names.

## Validate names

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-class-names.mjs" section_hero hero_component is-secondary
```

Any `ok: false` → stop and fix the spec or plan, never create the class.
