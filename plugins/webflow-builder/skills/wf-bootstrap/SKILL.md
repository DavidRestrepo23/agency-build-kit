---
name: wf-bootstrap
description: Executes the plan-setup.mjs output in an empty Webflow site through the Webflow MCP — variables, fonts, Client-First utilities, style guide page, shared components. Use only from /webflow-builder:wf-setup.
---

# Webflow bootstrap from plan-setup

Before acting, load `webflow-mcp:figma-to-webflow` (official plugin) and read its `references/css-rules.md`. Its gates apply. Agency overrides for its required prompts: build mode **headless**, variables **create new system**, naming **Client-First**, units **rem**. Do not ask those four questions. Setup never needs the Designer (built against Webflow MCP v2.0.1: variables, styles, pages and components are headless `data_*` tools).

## Input

```bash
mkdir -p site-spec/.plans && node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-setup.mjs" site-spec > site-spec/.plans/setup.json
```

If the output has `ok: false`, report its `errors` and stop — never treat a failed plan as an empty one.

Shape: `{ ok, variables[], fonts[], styles[], classes[], components[] }` (`styles[]` items: `{ class, breakpoint, props, variables, comboOf? }`).

## Order (stop on the first failed step)

1. `webflow_guide_tool` once; `whoami` + `get_site` → record `siteId`.
2. **Variables:** create collections `Colors`, `Typography`, `Spacing` and every entry of `variables[]` (`type: color` → color variable, `type: size` → size variable in rem). Use the variable tool named by `webflow_guide_tool`. Skip variables that already exist with the same value; if one exists with a different value, stop and report.
3. **Fonts:** the MCP only manages **uploaded** font files, so every font is uploaded as a file:
   - `source: google`: download the family (woff2, latin; Google Fonts are SIL Open Font License):
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch-google-font.mjs" "<family>" <weights,comma-separated> site-spec/fonts
     ```
     A `variable: true` file covers all its weights — upload it once.
   - `source: upload`: the files listed in `files` (confirm the licence with the developer).
   - Upload each file: `node "${CLAUDE_PLUGIN_ROOT}/scripts/asset-upload.mjs" md5 <file>` → `data_fonts_tool create_font` (name + md5) → `asset-upload.mjs upload <file> <response.json>` right away (signed URL expires).
   - Adobe Fonts cannot be uploaded: ask the developer to add them in Site settings → Fonts.
   If the Designer is open while fonts upload, it keeps showing a serif fallback until it is reloaded — that is not a data error; ask the developer to reload the Designer before judging typography. Never add `<link>` tags to head.
4. **Classes:** for every name in `classes[]` call `data_style_tool create_style` (combos from entries with `comboOf` are created as combo classes on their base). Then verify with `query_styles` that all exist.
5. **Styles:** for each `styles[]` entry call `data_style_tool update_style` on its breakpoint (`main`, `medium`, `small`, `tiny`) with `props` as native longhand properties and each `variables` entry bound with `variable_as_value`. Never use WHTML `css` or embed `<style>`.
6. **Style guide page:** create page `style-guide` (`data_pages_tool`) and build sections with `data_whtml_builder` showing every color (background-color utility swatches), every `heading-style-*` / `text-size-*` sample, spacing samples and every button variant.
7. **Components (structure, headless):** for each name in `components[]`, get its plan and build it as a Webflow component with the same rules as a section (`wf-section-build` phase A: one class per element, styles bound to variables, read copy back, assets, natives):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-component.mjs" site-spec <name>
   ```
   Navbar: follow the official CSS-only navbar pattern (`references/navbar.md`); ask the developer which breakpoint collapses to hamburger if `collapse` is not set. **Props:** for each entry of the plan's `props[]`, create the component prop (`data_component_props_tool create_prop`: `text` → text prop, `link` → link prop, `image` → image prop, with its `default`), then bind the element carrying `data-prop="<name>"` (text or image) or `data-prop-href="<name>"` (link) to it with `data_element_settings_tool` (`binding: { source_type: "prop", prop_id }`). Read the binding back. Shared sections become components the same way, so they are built and compared with Figma once.
   Record `build-state.mjs set-component site-spec --component <name> --status structure-built --hash <specHash>`.
7b. **Components (visual loop, Designer)** — navbar and footer are on every page, so they are never left unverified. With the Designer connected (`designer_tool get_current_page`; if not, ask the developer to open it and wait), place one instance of each component on the `style-guide` page and run the `wf-section-build` visual loop on it (max 3 iterations): Figma `get_screenshot` + numbers from `get_design_context` on the component `figmaNode` → `compare-values.mjs` and the `wf-qa-reviewer` on the `element_snapshot_tool` image. Fixes go to **`components.yaml`** — `overrides` on the component's own classes (`<name>_*`, per breakpoint, `$token` for token values) or its `children` — then re-run `plan-component` and apply only what changed.
   Collapsing navbar: also switch the canvas to the collapse breakpoint (`designer_tool`) and check: burger visible, menu hidden until clicked, links stacked; compare with a Figma mobile frame when one exists, otherwise report the collapsed state as inferred.
   Record `build-state.mjs set-component site-spec --component <name> --status built --hash <specHash> --iterations <n> --pending "<diff>;…"`. No Designer → leave `structure-built` and say so in the report: `/webflow-builder:wf-build` (phase B) and `/webflow-builder:wf-qa` pick it up.
8. Record setup:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-setup site-spec --platform webflow --site-id <siteId> --status done
   ```

MCP call fails → retry once → if it still fails, stop and report the exact call and error. Never continue on top of a failure.

## Update mode (`/webflow-builder:wf-setup --update`)

Requires `webflow.setup.status = done`. Re-run the same plan idempotently:

1. Create missing variables and classes; update variables whose value changed (report every old → new value).
2. For every class in the plan, read its current properties per breakpoint (`query_styles` with `include_breakpoints`). Make each class/breakpoint match the plan exactly: `update_style` with the plan's `props`/`variables` and `remove_properties` for every property present in Webflow but absent from that plan entry. A breakpoint that has properties in Webflow but no plan entry gets all of them removed. `update_style` merges, so skipping this step leaves stale borders, radii or paddings.
3. Components and fonts: create the ones in the plan that do not exist yet (same steps as the first run); do not rebuild existing components or the style-guide page.
4. Never delete variables or classes; list variables and classes that exist in Webflow but are no longer in the plan so the developer can remove them by hand.
