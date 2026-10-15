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
| Combo | `is-[kebab]`, stacked on a base class | `button is-secondary` |

Utilities: `page-wrapper`, `main-wrapper`, `padding-global`, `container-*`, `padding-section-*`, `heading-style-h1..h6`, `text-size-*`, `text-weight-light|normal|medium|semibold|bold`, `text-color-*`, `background-color-*`, `text-align-*`, `text-rich-text`, `margin-|padding-` + `top|bottom|left|right|horizontal|vertical` or a size, `max-width-small|medium|large`, `hide-tablet|mobile-landscape|mobile-portrait`, `button`.

Spacing utilities combine: `margin-bottom margin-md` = bottom margin only.

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
| token `brand.primary` | Webflow variable `brand-primary` |

All of this is computed by `plan-section.mjs`; do not hand-roll class names.

## Validate names

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-class-names.mjs" section_hero hero_component is-secondary
```

Any `ok: false` → stop and fix the spec or plan, never create the class.
