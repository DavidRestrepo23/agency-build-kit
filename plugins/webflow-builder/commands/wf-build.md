---
description: Build one page (or one section) of the site-spec in Webflow, section by section, resuming from build-state
argument-hint: <page> [--section <id> | --sections <id,id,...>]
---

# /webflow-builder:wf-build

Arguments: $ARGUMENTS → `<page>` and optional `--section <id>` (one section) or `--sections <id,id,...>` (a group of sections, in spec order).

## 1. Preconditions

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec --require-resolved
```
Then read `site-spec/build-state.json`: `webflow.setup.status` must be `done`, otherwise tell the developer to run `/webflow-builder:wf-setup` and stop. Confirm the official `webflow-skills` plugin is installed (skill `webflow-mcp:figma-to-webflow` available), the Webflow MCP responds (`webflow_guide_tool`, `whoami`) and the Figma MCP is authenticated. The visual loop needs the **Webflow Designer open for this site in Chrome, tab in front** (`element_snapshot_tool`); ask the developer to open it before starting.

Ensure the page exists in Webflow (`data_pages_tool`; create it with slug `<page>` and the `page-wrapper` > `main-wrapper` structure if missing). Remember its `pageId`.

## 1b. Warning: offer to split the work (whole page only)

Skip this step when `--section` or `--sections` was given.

Count the sections that need a build (`build-state.mjs get` for each; `needsBuild: true`). If there are **3 or more**, stop before building anything and show this warning in the project `language`:

> ⚠️ **<n> sections to build in `<page>`.** Each section goes through build + visual loop (up to 3 snapshot/compare/fix iterations), so the whole page can take a long time in one session. You can split it across several agents:
> 1. **Continue here**, one section after another.
> 2. **Split into groups** and run each group in another agent — another Claude Code session, Codex or Antigravity — each with its own prompt.
>
> Limits: all agents write to the same Webflow site and the same `site-spec/`. Structure and styles (steps 1–10 of `wf-section-build`) can run in parallel; the **visual loop needs the Webflow Designer in front** and the Designer bridge drops with several agents snapshotting at once — run the visual loops one agent at a time, or give each agent its own Designer tab and accept the risk. Agents other than Claude Code need the Figma and Webflow MCPs configured and access to this kit's folder.

Ask which option. On **2**, ask how many agents (default: groups of ~3 sections), split the sections into **contiguous groups in spec order**, and print one ready-to-paste prompt per group:

```text
You are building part of a Webflow page from a site-spec, in the project folder <absolute path of the project>.
Kit (instructions and scripts): <absolute path of the agency-build-kit clone>.
Page: <page>. Your sections, in this order: <id>, <id>, <id>. Build ONLY these sections.
- In Claude Code: run /webflow-builder:wf-build <page> --sections <id,id,id>
- In any other agent (Codex, Antigravity…): read and follow
  <kit>/plugins/webflow-builder/commands/wf-build.md and
  <kit>/plugins/webflow-builder/skills/wf-section-build/SKILL.md (plus skills/client-first/SKILL.md),
  replacing ${CLAUDE_PLUGIN_ROOT} with <kit>/plugins/webflow-builder.
Rules: setup is already done — do not run wf-setup or change variables, utilities or other sections;
edit only your sections in site-spec/pages/<page>.yaml (children, overrides);
record each section with build-state.mjs set-section as soon as it is done;
run the visual loop only when no other agent is snapshotting (ask the developer if unsure);
never publish the site.
At the end, report per section: built / failed / placeholders, visual iterations and pending diffs.
```

Then stop: the developer launches the agents. When they finish, `/webflow-builder:wf-build <page>` (no flags) skips the built sections and only builds what is missing; then `/webflow-builder:wf-qa <page>`.

## 2. Sections

Load `client-first` and `wf-section-build`. For each section of `site-spec/pages/<page>.yaml` in order (or only `--section` / the `--sections` list):

1. Get the plan: `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section>`.
2. Check state: `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" get site-spec --platform webflow --page <page> --section <section> --hash <specHash>`.
   - `needsBuild: false` and the section was not named with `--section` / `--sections` → skip.
   - Otherwise you rebuild. Whenever you rebuild (needsBuild true OR the section named explicitly) and `current.elementIds` is non-empty, delete those elements first so the section is never duplicated.
3. Follow `wf-section-build`.
4. A section ending in `failed` stops the command.

## 3. Report

Table: section → built / skipped / failed / placeholder, visual iterations, pending diffs (from build-state `visual`). List every `overrides` the loop wrote to the YAML (the developer reviews them in the diff). List placeholders (code components → `/webflow-builder:wf-component <section>`, forms → build natively in Designer). Suggest `/webflow-builder:wf-qa <page>`. Do not publish.
