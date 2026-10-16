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

List created variables (count per collection), utilities, components and the style-guide page link. Ask the developer to review the style guide in Designer before running `/webflow-builder:wf-build <page>`. Do not publish.
