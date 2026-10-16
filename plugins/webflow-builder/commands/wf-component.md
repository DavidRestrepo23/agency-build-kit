---
description: Build a React code component with the Webflow CLI for a site-spec section marked needsCodeComponent and place it in its slot
argument-hint: <page> <section-id>
---

# /webflow-builder:wf-component

Arguments: $ARGUMENTS → `<page> <section-id>`.

1. Read the section in `site-spec/pages/<page>.yaml`; it must have `needsCodeComponent: true` and status `built` (the slot exists). Otherwise stop.
2. Check the CLI: `webflow --version` must be ≥ 2.0 and Node ≥ 22.13. If missing: `npm install -g @webflow/webflow-cli`, then `webflow auth login` (the developer completes login).
3. Use the official skills in order: `component-scaffold` (component in the project's `webflow-components/` folder, name `<section-id>`), implement it from the Figma frame (load `figma:figma-design-to-code` first, then `get_design_context` on the section `figmaNode`) and `notes.interaction`, using Webflow variables names from site-spec tokens as CSS custom properties; then `pre-deploy-check`; then `devlink-command` to import (`webflow devlink import`).
4. Insert an instance of the shared component into `<section-id>_code-component-slot` of the page.
5. Record `built` again with the same plan `specHash`:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section-id>
   node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section-id> --status built --hash <specHash>
   ```
6. Report the component name, library and anything to verify in preview.
