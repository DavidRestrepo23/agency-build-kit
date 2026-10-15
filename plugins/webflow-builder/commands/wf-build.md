---
description: Build one page (or one section) of the site-spec in Webflow, section by section, resuming from build-state
argument-hint: <page> [--section <id>]
---

# /wf-build

Arguments: $ARGUMENTS → `<page>` and optional `--section <id>`.

## 1. Preconditions

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec --require-resolved
```
Then read `site-spec/build-state.json`: `webflow.setup.status` must be `done`, otherwise tell the developer to run `/wf-setup` and stop. Confirm Webflow MCP (`webflow_guide_tool`, `whoami`).

Ensure the page exists in Webflow (`data_pages_tool`; create it with slug `<page>` and the `page-wrapper` > `main-wrapper` structure if missing). Remember its `pageId`.

## 2. Sections

Load `client-first` and `wf-section-build`. For each section of `site-spec/pages/<page>.yaml` in order (or only `--section`):

1. Get the plan: `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section>`.
2. Check state: `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" get site-spec --platform webflow --page <page> --section <section> --hash <specHash>`.
   - `needsBuild: false` and no `--section` flag → skip.
   - `needsBuild: true` and the section already has `elementIds` (spec changed or previous failure) → delete those elements first, then rebuild.
3. Follow `wf-section-build`.
4. A section ending in `failed` stops the command.

## 3. Report

Table: section → built / skipped / failed / placeholder. List placeholders (code components → `/wf-component <section>`, forms → build natively in Designer). Suggest `/wf-qa <page>`. Do not publish.
