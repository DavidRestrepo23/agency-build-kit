---
name: wf-bootstrap
description: Executes the plan-setup.mjs output in an empty Webflow site through the Webflow MCP — variables, fonts, Client-First utilities, style guide page, shared components. Use only from /wf-setup.
---

# Webflow bootstrap from plan-setup

Before acting, load `webflow-mcp:figma-to-webflow` (official plugin) and read its `references/css-rules.md`. Its gates apply. Agency overrides for its required prompts: build mode **headless**, variables **create new system**, naming **Client-First**, units **rem**. Do not ask those four questions.

## Input

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-setup.mjs" site-spec > /tmp/wf-setup-plan.json
```

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
