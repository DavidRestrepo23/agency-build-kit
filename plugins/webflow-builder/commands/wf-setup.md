---
description: Bootstrap an empty Webflow site with Client-First variables, utilities, style guide and shared components from site-spec
argument-hint: "[site name or id] [--update]"
---

# /webflow-builder:wf-setup

Target site: $ARGUMENTS (ask if empty and more than one site is available).

## 1. Prerequisites — stop with an exact message if any fails

- Official plugin `webflow-skills` is installed (skill `webflow-mcp:figma-to-webflow` is available). If not: tell the developer to run `/plugin marketplace add webflow/webflow-skills` and `/plugin install webflow-skills@webflow-skills`.
- Webflow MCP authenticated: `webflow_guide_tool`, then `whoami` + `get_site`.
- Figma MCP authenticated.
- Spec valid and questions resolved:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec --require-resolved
  ```
- Without `--update`: the site is empty or only contains Webflow defaults (if not, stop and ask). With `--update`: `site-spec/build-state.json` has `webflow.setup.status = done`; follow the "Update mode" section of `wf-bootstrap`.

## 2. Bootstrap

Load the `client-first` and `wf-bootstrap` skills and follow `wf-bootstrap` exactly.

## 3. Report

List created variables (count per collection), utilities, components with their visual status (`built` with iterations and pending diffs, or `structure-built` = not yet compared with Figma) and the style-guide page link. Ask the developer to review the style guide in Designer before running `/webflow-builder:wf-build <page>`. Do not publish.

## Progress log (project memory)

Before starting, read the resume point and continue from it instead of redoing finished work:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs" status site-spec
```
After each milestone below, append an entry to `site-spec/progress.md` (one short line of summary; ids and counts, not prose), so a new session can resume if this one closes:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs" log site-spec --command "/webflow-builder:wf-setup" --step "<milestone>" --summary "<what was done, counts, ids>" --next "<next command>"
```
Milestones:
- variables and fonts created
- utilities and style guide created
- each component built and its visual status (built / structure-built)
- setup done → next: /webflow-builder:wf-build <page>
