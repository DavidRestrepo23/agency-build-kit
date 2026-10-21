---
name: wf-section-build
description: Executes one plan-section.mjs plan in Webflow through the Webflow MCP — create custom classes, build WHTML, apply breakpoint styles bound to variables, attach assets, insert components, record build state. Use only from /webflow-builder:wf-build.
---

# Build one section from its plan

Official gates from `webflow-mcp:figma-to-webflow` apply (read `references/css-rules.md` and `references/assets-and-svg.md` once per session).

## Input

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section>
```

Plan: `{ ok, page, section, specHash, classesToCreate[], utilitiesUsed[], whtml, styles[], assets[], components[], interactions[], placeholders[], natives[] }`.

## Steps

1. Validate names:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-class-names.mjs" <every classesToCreate and utilitiesUsed name>
   ```
2. `query_styles`: every `utilitiesUsed` must already exist (created by `/webflow-builder:wf-setup`). Missing → stop and tell the developer to run `/webflow-builder:wf-setup --update` (the spec gained a utility or surface after setup).
   **One class per element.** In Webflow a second class on an element is always stored as a combo class (`.a.b`) with its own, empty properties — a stacked global (`surface-*`, `text-color-*`, `text-align-*`, `text-size-*`) has no effect. The plan never stacks: surfaces, text colors and text alignment are already written as `styles[]` on the element's own class. The only two-class element is `button is-<variant>`, whose combo was created with its properties by `/webflow-builder:wf-setup` — apply that existing combo, never create a new one. If the plan's `whtml` ever has another two-class element, stop and report it.
3. `data_style_tool create_style` for each `classesToCreate` not yet existing.
4. `data_whtml_builder` with `whtml` (structure only, one call; the `<section>` carries `id="<section id>"` so navbar/footer anchors work — if the builder drops the attribute, set it with `data_element_settings_tool`) inside `main-wrapper` of the target page, **in spec order**: insert it before the element of the next spec section that already exists (find `section_<nextId>` with `query_elements`); append at the end only when no later section exists yet. Capture returned element ids.
5. `data_style_tool update_style` for each `styles[]` entry on its breakpoint; bind `variables` with `variable_as_value`.
6. Assets — for each `assets[]` entry, target the `order`-th element with `targetClass`:
   - `raster`: `data_assets_tool create_asset` from `site-spec/assets/<file>` (manifest `file` is relative to `site-spec/assets/`; 2x), then `set_image_asset` + alt.
   - `svg`: insert an HtmlEmbed inside the target with the cleaned inline SVG (`data_element_tool set_settings`).
7. Components — for each `components[]` entry, replace the `order`-th `targetClass` slot with an instance of the Webflow component `ref` (variant, props).
8. Interactions — for each `interactions[]` entry use the official `interactions` skill (IX3) on `targetClass`: plain `note` entries as described; `type: marquee` → infinite linear loop of `translateX` 0 → -50% (right: -50% → 0) over `speed` s on the track; `type: counter` → count-up on scroll into view if IX3 supports it, else list it as manual work.
8b. Natives — for each `natives[]` entry, find the `order`-th element with `targetClass` (an empty div from the WHTML) and create the native element inside it with `data_element_builder` (`type` from the entry). Read the element's settings with `data_element_settings_tool get_settings` before writing options. Then:
   - `Slider`: one slide per `items[]` (add/remove slides to match the count); give each slide the class `classes.slide` and fill it with `items[i].whtml` (`data_whtml_builder` inside the slide). Options: `arrows` / `dots` → show/hide the arrow and nav elements; `autoplay`, `interval`, `loop` → slider settings. Leave the slider mask overflow visible only if `perView` > 1.
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
    - `query_styles` on every class of the section: no style with `isComboClass: true` and no properties. Names alone are not enough — an empty combo looks correct by name but renders nothing. An empty combo found → remove it from the element, put the properties on the element's own class (from `styles[]`), recheck once.
    Missing or empty → fix, reapply, recheck once.
11. Record:
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status built --hash <specHash> --ids <comma-separated element ids> --page-id <pageId>
    ```

On a failure that persists after one retry:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status failed --error "<tool>: <message>" --ids <ids captured in step 4, if step 4 ran>
```
Passing the partial ids lets the next `/webflow-builder:wf-build` delete them instead of leaving a half-built duplicate.
then stop.
