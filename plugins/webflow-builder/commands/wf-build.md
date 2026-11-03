---
description: Build one page (or some sections) of the site-spec in Webflow — structure headless, then a visual loop in the Designer — resuming from build-state
argument-hint: <page> [--section <id> | --sections <id,id,...>] [--phase all|structure|visual]
---

# /webflow-builder:wf-build

Arguments: $ARGUMENTS → `<page>`, optional `--section <id>` (one section) or `--sections <id,id,...>` (a group, in spec order), and optional `--phase`:

| `--phase` | What runs | Needs the Designer |
|---|---|---|
| `all` (default) | phase A for every section that needs it, then phase B for every `structure-built` section | only for phase B |
| `structure` | phase A only (headless): structure, classes, styles, assets, components, natives, interactions → `structure-built` | no |
| `visual` | phase B only: snapshot vs Figma, fixes as spec `overrides` → `built` | yes |

Phases are defined in `wf-section-build`. Built against Webflow MCP v2.0.1: editing is headless; only snapshots, canvas navigation/selection and `upload_image_by_url` need the Designer with the MCP Bridge app.

## 1. Preconditions

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec --require-resolved
```
Then read `site-spec/build-state.json`: `webflow.setup.status` must be `done`, otherwise tell the developer to run `/webflow-builder:wf-setup` and stop. Confirm the official `webflow-skills` plugin is installed (skill `webflow-mcp:figma-to-webflow` available), the Webflow MCP responds (`webflow_guide_tool`, `whoami`) and the Figma MCP is authenticated.

Phase A does **not** need the Designer — never wait for it before building structure. Phase B does: before the first visual loop, check `designer_tool get_current_page`; if it is not connected, ask the developer to open the Webflow Designer for this site in Chrome (tab in front, MCP Bridge app running) and wait. With `--phase all`, phase A finishes first, so the developer can open the Designer while it runs.

Ensure the page exists in Webflow (`data_pages_tool`; create it with slug `<page>` and the `page-wrapper` > `main-wrapper` structure if missing). Remember its `pageId`.

## 1b. Warning: offer to split the work (whole page only)

Skip this step when `--section`, `--sections` or `--phase visual` was given.

Count the sections that need phase A (`build-state.mjs get` for each; `needsBuild: true`). If there are **3 or more**, stop before building anything and show this warning in the project `language`:

> ⚠️ **<n> sections to build in `<page>`.** Each section has a structure phase (headless) and a visual phase (Designer: up to 3 snapshot/compare/fix iterations), so the whole page can take long in one session. You can split it:
> 1. **Continue here**: structure for all sections, then the visual loop section by section.
> 2. **Split the structure phase** across several agents — other Claude Code sessions, Codex or Antigravity — each with a group of sections and `--phase structure` (headless, can run in parallel). Then **one** agent runs `--phase visual` for the whole page.
>
> Why the visual phase is not split: it needs the Webflow Designer in front with the MCP Bridge app, one connection per site, and the bridge drops with several agents snapshotting at once. Agents other than Claude Code need the Figma and Webflow MCPs configured and access to this kit's folder.

Ask which option. On **2**, ask how many agents (default: groups of ~3 sections), split the sections into **contiguous groups in spec order**, and print one ready-to-paste prompt per group:

```text
You are building part of a Webflow page from a site-spec, in the project folder <absolute path of the project>.
Kit (instructions and scripts): <absolute path of the agency-build-kit clone>.
Page: <page>. Your sections, in this order: <id>, <id>, <id>. Build ONLY these sections, structure phase only (headless, no Designer needed).
- In Claude Code: run /webflow-builder:wf-build <page> --sections <id,id,id> --phase structure
- In any other agent (Codex, Antigravity…): read and follow
  <kit>/plugins/webflow-builder/commands/wf-build.md and
  <kit>/plugins/webflow-builder/skills/wf-section-build/SKILL.md ("Phase A" only, plus skills/client-first/SKILL.md),
  replacing ${CLAUDE_PLUGIN_ROOT} with <kit>/plugins/webflow-builder.
Rules: setup is already done — do not run wf-setup or change variables, utilities or other sections;
edit only your sections in site-spec/pages/<page>.yaml;
record each section with build-state.mjs set-section (building after the WHTML, structure-built at the end);
do not run the visual loop; never publish the site.
At the end, report per section: structure-built / failed / placeholders.
```

Then stop: the developer launches the agents. When they finish, run `/webflow-builder:wf-build <page> --phase visual` in **one** session with the Designer open (it also builds the structure of anything still missing if run as `--phase all`); then `/webflow-builder:wf-qa <page>`.

## 2. Sections

Load `client-first` and `wf-section-build`. Sections = every section of `site-spec/pages/<page>.yaml` in spec order, or only `--section` / the `--sections` list.

For each section, get the plan (`node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section>`) and the state (`node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" get site-spec --platform webflow --page <page> --section <section> --hash <specHash>` → `needsBuild`, `needsVisual`, `current`).

**Phase A pass** (`--phase all` or `structure`), all sections first:
- `needsBuild: false` and the section was not named explicitly → skip phase A.
- Otherwise rebuild: if `current.elementIds` is non-empty (also after a `building` interruption), delete those elements first so the section is never duplicated; then follow **Phase A** of `wf-section-build`.
- A section ending in `failed` stops the command.

**Phase B pass** (`--phase all` or `visual`), then one section at a time, never in parallel:
- `needsVisual: true` (status `structure-built`, same hash) → follow **Phase B** of `wf-section-build`.
- `needsBuild: true` → its structure is missing or outdated: with `--phase visual`, report it ("run --phase structure first") and continue with the next section.

## 3. Report

Table: section → structure-built / built / skipped / failed / placeholder, visual iterations, pending diffs (from build-state `visual`). Sections left `structure-built` are **not done**: tell the developer to run `--phase visual` with the Designer open. List every `overrides` the loop wrote to the YAML (the developer reviews them in the diff). List placeholders (code components → `/webflow-builder:wf-component <section>`, forms → build natively in Designer). Suggest `/webflow-builder:wf-qa <page>` once every section is `built`. Do not publish.
