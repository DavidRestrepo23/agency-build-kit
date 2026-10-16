---
name: wf-bootstrap
description: Executes the plan-setup.mjs output in an empty Webflow site through the Webflow MCP — variables, fonts, Client-First utilities, style guide page, shared components. Use only from /webflow-builder:wf-setup.
---

# Webflow bootstrap from plan-setup

Before acting, load `webflow-mcp:figma-to-webflow` (official plugin) and read its `references/css-rules.md`. Its gates apply. Agency overrides for its required prompts: build mode **headless**, variables **create new system**, naming **Client-First**, units **rem**. Do not ask those four questions.

## Input

```bash
mkdir -p site-spec/.plans && node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-setup.mjs" site-spec > site-spec/.plans/setup.json
```

If the output has `ok: false`, report its `errors` and stop — never treat a failed plan as an empty one.

Shape: `{ ok, variables[], fonts[], styles[], classes[], components[] }` (`styles[]` items: `{ class, breakpoint, props, variables, comboOf? }`).

## Order (stop on the first failed step)

1. `webflow_guide_tool` once; `whoami` + `get_site` → record `siteId`.
2. **Variables:** create collections `Colors`, `Typography`, `Spacing` and every entry of `variables[]` (`type: color` → color variable, `type: size` → size variable in rem). Use the variable tool named by `webflow_guide_tool`. Skip variables that already exist with the same value; if one exists with a different value, stop and report.
3. **Fonts:** `data_fonts_tool` for each `fonts[]` entry (Google source or upload). Never add `<link>` tags to head.
4. **Classes:** for every name in `classes[]` call `data_style_tool create_style` (combos from entries with `comboOf` are created as combo classes on their base). Then verify with `query_styles` that all exist.
5. **Styles:** for each `styles[]` entry call `data_style_tool update_style` on its breakpoint (`main`, `medium`, `small`, `tiny`) with `props` as native longhand properties and each `variables` entry bound with `variable_as_value`. Never use WHTML `css` or embed `<style>`.
6. **Style guide page:** create page `style-guide` (`data_pages_tool`) and build sections with `data_whtml_builder` showing every color (background-color utility swatches), every `heading-style-*` / `text-size-*` sample, spacing samples and every button variant.
7. **Components:** for each name in `components[]`, build it from `components.yaml` + Figma (`get_design_context` on its `figmaNode`) as a Webflow component. Navbar: follow the official CSS-only navbar pattern (`references/navbar.md`); ask the developer which breakpoint collapses to hamburger.
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
