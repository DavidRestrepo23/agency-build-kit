---
name: wf-section-build
description: Builds one site-spec section in Webflow in two phases — A) structure, headless (classes, WHTML, styles bound to variables, assets, components, natives, interactions); B) visual loop in the Designer (snapshot vs Figma, fixes stored as spec overrides). Use only from /webflow-builder:wf-build.
---

# Build one section from its plan

Official gates from `webflow-mcp:figma-to-webflow` apply (read `references/css-rules.md` and `references/assets-and-svg.md` once per session).

## Input

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section>
```

Plan: `{ ok, page, section, specHash, classesToCreate[], utilitiesUsed[], whtml, styles[], assets[], components[], interactions[], placeholders[], natives[] }`.

## Two phases

Built against **Webflow MCP v2.0.1** (see the official skill-migration guide when the MCP changes).

| Phase | Steps | Needs the Designer | Status recorded |
|---|---|---|---|
| **A — Structure** (headless) | 1–10 | **No.** Elements, styles, variables, components, settings, natives and IX3 interactions are all `data_*` tools and work without the Designer (official guidance: never open or wait for a Designer session only to edit content). | `building` after step 4, `structure-built` after step 10 |
| **B — Visual** (Designer) | 11–12 | **Yes**: `element_snapshot_tool`, `designer_tool` and `asset_tool upload_image_by_url` need the Webflow Designer open for the site in Chrome, tab in front, MCP Bridge app connected. | `built` |

Phase A never waits for the Designer, so it can run unattended and be split across agents. Phase B runs one section at a time, with the developer present. A section is never `built` without phase B.

## Phase A — Structure (headless)

**Pattern first:** for anything repeated (cards, slides, tabs, accordion items, buttons with icons, components), build ONE, read it back (`query_elements` / `query_styles`), confirm it is right, and only then repeat it.

1. Validate names:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-class-names.mjs" <every classesToCreate and utilitiesUsed name>
   ```
2. `query_styles`: every `utilitiesUsed` must already exist (created by `/webflow-builder:wf-setup`). Missing → stop and tell the developer to run `/webflow-builder:wf-setup --update` (the spec gained a utility or surface after setup).
   **One class per element.** In Webflow a second class on an element is always stored as a combo class (`.a.b`) with its own, empty properties — a stacked global (`surface-*`, `text-color-*`, `text-align-*`, `text-size-*`) has no effect. The plan never stacks: surfaces, text colors and text alignment are already written as `styles[]` on the element's own class. The only two-class element is `button is-<variant>`, whose combo was created with its properties by `/webflow-builder:wf-setup` — apply that existing combo, never create a new one. If the plan's `whtml` ever has another two-class element, stop and report it.
3. `data_style_tool create_style` for each `classesToCreate` not yet existing, in small batches (~10); after a timeout, `query_styles` to see which exist before retrying.
4. `data_whtml_builder` with `whtml` (structure only, one call; the `<section>` carries `id="<section id>"` so navbar/footer anchors work — if the builder drops the attribute, set it with `data_element_settings_tool`) inside `main-wrapper` of the target page, **in spec order**: insert it before the element of the next spec section that already exists (find `section_<nextId>` with `query_elements`); append at the end only when no later section exists yet. Capture returned element ids and record them right away, so an interruption never leaves an untracked duplicate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status building --hash <specHash> --ids <ids> --page-id <pageId>
   ```
5. `data_style_tool update_style` for each `styles[]` entry on its breakpoint; bind `variables` with `variable_as_value`. Never put the same property in `properties` and `remove_properties` of one call — the removal wins and the value is lost.
5b. **Read the copy back.** `query_elements` on the section and compare every text with the YAML. `set_text` on a builder TextBlock can silently keep "This is some text inside of a div block": set the text on its child String node (or use Paragraph/Heading). WHTML drops trailing spaces inside inline spans — fix with `set_text`. Never leave placeholder or rewritten copy.
6. Assets — for each `assets[]` entry, target the `order`-th element with `targetClass`:
   - `raster` (headless, files are in `site-spec/assets/`, 2x):
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/asset-upload.mjs" md5 site-spec/assets/<file>
     ```
     → `data_assets_tool create_asset` with that name + md5 → save the upload part of the response (`uploadUrl`, `uploadDetails`) to `site-spec/.plans/upload.json` and run at once (the signed URL expires in minutes):
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/asset-upload.mjs" upload site-spec/assets/<file> site-spec/.plans/upload.json
     ```
     Then `set_image_asset` on the image + alt (WHTML never links `<img src>` to an asset). Upload each asset once; reuse its id. Limit ~30MB per file. Only URL-only images wait for phase B (`asset_tool upload_image_by_url` needs the Designer).
   - `svg`: insert an HtmlEmbed inside the target and write the cleaned inline SVG with `data_element_settings_tool set_settings`, key **`code`** (`set_text` does not store embed code).
7. Components — for each `components[]` entry, replace the `order`-th `targetClass` slot with an instance of the Webflow component `ref`; set its props with `data_component_props_tool set_component_instance_prop_values` and its variant with `data_component_variants_tool`.
8. Interactions (native IX3 only, `data_interactions_tool`; Classic interactions are not supported by the MCP). Call `data_interactions_tool guide` once per session for the accepted shapes, create, then read back with `get_interaction`:
   - Target by attribute when the entry has `selector` (the WHTML already carries `data-anim="…"`): trigger target `{ extensionKey: "wf:attribute", value: <selector> }`; otherwise by the entry's `targetClass`.
   - Scroll entrances (`note` entries such as fade-up): trigger `wf:scroll` with `scrollTriggerConfig { start: "top 85%", enter: "play", leave: "none", enterBack: "none", leaveBack: "none" }` (the hero plays on load); animate opacity inside `wf:transform` (not `wf:style`); add `conditionalPlayback { type: "prefers-reduced-motion", behavior: "skip-to-end" }`.
   - `type: marquee`: on page load, linear `translateX` 0 → -50% (right: -50% → 0) over `speed` s, repeating forever, with the same reduced-motion rule. If the interactions guide offers no infinite repeat, leave it static and list it as manual work.
   - `type: counter`: IX3 cannot count numbers — keep the numbers static, add an entrance (fade-up) and list the count-up as manual work / code component for the developer.
   - The "initial appearance" (hidden state before the trigger) cannot be set through the API: never hide content with a class to fake it; list it for the developer to set in the Designer if the entrance flashes.
8b. Natives — for each `natives[]` entry, find the `order`-th element with `targetClass` (an empty div from the WHTML) and create the native element inside it with `data_element_builder` (`type` from the entry). Read the element's settings with `data_element_settings_tool get_settings` before writing options. Then:
   - `Slider`: the MCP **cannot create new slides**. A new Slider comes with its default slides; when `items[]` needs more, create a second "donor" Slider and `move_element` its slides into the first slider's mask until the count matches, then hide the empty donor with a class (`display: none`) and list it for the developer to delete by hand. Build ONE slide first, read it back, then repeat. Give each slide the class `classes.slide` and fill it with `items[i].whtml` (`data_whtml_builder` inside the slide). Options: `arrows` / `dots` → show/hide the arrow and nav elements; `autoplay`, `interval` → slider settings. Infinite `loop` is not in the API: list it as a manual Designer setting. Leave the slider mask overflow visible only if `perView` > 1.
   - `Tabs`: one tab link + pane per item; tab link text = `items[i].label`; classes `classes.menu` (menu), `classes.tab` (links), `classes.pane` (panes); fill each pane with `items[i].whtml`.
   - `Dropdown` (`options.mode: accordion`): one Dropdown per item with class `classes.item`; its toggle gets `classes.toggle` and `items[i].toggle`, its list gets `classes.content` and `items[i].content` (the content class is already `position: static` so it pushes content down).
   - `Lightbox`: settings media = `options.url`; fill the lightbox link with `items[0].whtml` (the thumbnail).
   - `YouTubeVideo` / `Video`: set the video URL to `options.url`.
   - `Modal`: create the Modal, fill it with `items[0].whtml`, then add a `button` (one class) with text `options.trigger` before the modal, linked with `static_link` mode `modal` → that Modal.
   A native type the MCP rejects → leave the div, add a placeholder to the report with the behavior and continue; never fake it with custom code.
9. Placeholders stay as empty slots; list them in the final report.
10. Verify:
    - `query_elements`: every class in `classesToCreate` **and** `utilitiesUsed` is present on its element, and the section element has `id="<section id>"`.
    - every `natives[]` entry exists inside its `targetClass` with `items.length` slides / tabs / dropdowns.
    - applied values: dump the section's styles from `query_styles` (`[{ name, breakpoint, props, variables }]`) to `site-spec/.plans/<section>.styles.json` and check that what the plan set is what Webflow has:
      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-values.mjs" site-spec --plan <page> <section> site-spec/.plans/<section>.styles.json
      ```
      Every `medium`/`high` diff is a dropped or wrong value → reapply.
    - `query_styles` on every class of the section: no style with `isComboClass: true` and no properties. Names alone are not enough — an empty combo looks correct by name but renders nothing. An empty combo found → remove it from the element, put the properties on the element's own class (from `styles[]`), recheck once.
    Missing or empty → fix, reapply, recheck once.
    Then record the end of phase A:
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status structure-built --hash <specHash> --ids <ids> --page-id <pageId>
    ```

## Phase B — Visual (Designer)

Start of phase B (once per run): `designer_tool get_current_page`. Not connected → ask the developer to open the Webflow Designer for this site in Chrome (tab in front, MCP Bridge app running) and wait for the answer; never record a section as `built` without this phase. Then `designer_tool switch_page` to the target `pageId` and confirm `get_current_mode` is `design`. If the Designer disconnects mid-loop: stop, ask to reconnect, resume the loop of the current section — its structure is already safe (`structure-built`).

11. **Visual loop (max 3 iterations).** The structure from the YAML is only a first pass; fidelity comes from comparing with Figma, as in QA, but while building.
    1. Reference: Figma `get_screenshot` of the section `figmaNode` (once) and `get_design_context` for its CSS reference — for frames without auto layout that reference gives the real widths, offsets and overlaps.
    2. Snapshot: `designer_tool select_element` on `section_<id>` (so the developer sees it), then `element_snapshot_tool` of it at 1440px. Upload any URL-only images left from step 6 first.
    3. Compare, **by numbers first, then by image**:
       - Numbers: from `get_design_context`, write the key values of the section to `site-spec/.plans/<section>.expected.json` — `[{ class, breakpoint?, prop, value, label }]` for section padding, gaps, column widths, max-widths, font sizes, line heights, radii and colours of each main box (use the plan's class names) — then dump `query_styles` and run `compare-values.mjs site-spec site-spec/.plans/<section>.expected.json site-spec/.plans/<section>.styles.json`.
       - Image: the `wf-qa-reviewer` agent (one at a time, never in parallel) on the snapshot, for what numbers cannot see (missing elements, overlaps, crops, wrong order).
       A snapshot that fails twice (it can fail even with the Designer open) does not block: continue with the numeric comparison and add "snapshot unavailable" to `--pending`.
    4. No high or medium diffs → stop the loop.
    5. Fix in the **spec**, never only in Webflow, so a rebuild reproduces it:
       - Spacing, sizes, columns, alignment, positions → `overrides` on the section in `site-spec/pages/<page>.yaml`, own classes only (`section_<id>`, `<id>_*`), per breakpoint. A value equal to a token is written as `$<token>` (validate-spec rejects the raw value).
       - Missing / extra / wrong element, wrong copy order → the section's `children`.
       - Overlapping decorative layers → `decorative: true` + `position`.
       Then `validate-spec`, re-run `plan-section` and apply only what changed with the headless `data_*` tools: `update_style` for changed entries plus `remove_properties` for properties the plan no longer sets (never the same property in both); rebuild the WHTML only when `children` changed (delete the section's elements first).
    6. After every iteration: `validate-class-names` on the plan's classes, no empty combos (`query_styles`), no hard-coded token values (validate-spec covers overrides).
    7. After the 3rd iteration, stop even if diffs remain: they go to `--pending`.
    Do not use absolute positioning to match the screenshot except for `decorative` layers; prefer flex/grid overrides so tablet and mobile keep working. Never fix a `height` on content (validate-spec rejects it; use `min-height`). A grid of 4+ columns that renders too narrow: override it to `display: flex` and give the item class `flex: 1 1 0; min-width: 0`.
12. Record (re-run `plan-section` first: overrides change `specHash`):
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status built --hash <specHash> --ids <comma-separated element ids> --page-id <pageId> --iterations <n> --pending "<diff>;<diff>"
    ```

On a failure that persists after one retry:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status failed --error "<tool>: <message>" --ids <ids captured in step 4, if step 4 ran>   # phase B failures keep status structure-built instead
```
Passing the partial ids lets the next `/webflow-builder:wf-build` delete them instead of leaving a half-built duplicate.
then stop.
