---
description: Audit an approved Figma file into site-spec/ (tokens, components, pages, assets, open questions) for any platform builder
argument-hint: <figma-url>
---

# /build-audit

Figma URL: $ARGUMENTS

Goal: produce a valid `site-spec/` in the current project repo, then stop for developer review. Do not touch any platform.

1. Load the `site-spec` and `figma-extract` skills.
2. Parse `fileKey` (and optional node id) from the URL. If `$ARGUMENTS` is empty, ask for the URL and stop.
3. `get_metadata` on the file → list pages/top-level frames that are site pages. Without a node id this can list only some canvases (seen: only the cover page) — if the landing frames are not there, ask for a node-specific link (right-click frame → Copy link to selection) and stop. Ask the developer to confirm the page list and slugs (one question) unless there is only one obvious page.
4. Write `site-spec/project.yaml` (platforms: ask which platform if not obvious; units `rem`; Webflow default breakpoints 1440/991/767/478).
5. Extract global tokens: `get_variable_defs` + text styles → `site-spec/tokens.yaml`. Detect components used across pages → `site-spec/components.yaml`.
6. Dispatch one `figma-auditor` agent per page **in parallel**, passing fileKey, page node, slug and the paths of tokens/components files.
7. Merge each auditor's `discovered` block: add missing tokens/components/assets (dedupe by name/id; on conflicting values add an open question instead of choosing), append questions to `site-spec/open-questions.md` as `- [ ] ...`.
8. Validate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec
   ```
   Fix every error (re-read Figma when needed) until `ok: true`.
9. Report to the developer: pages and section counts, token counts, components, assets, sections flagged `needsCodeComponent`, surfaces defined and where they are used, every asset with `scaleApproved` plus its reason, and the open questions list. Tell them the next step is resolving open questions (mark `- [x]`) and then running the platform setup command (e.g. `/wf-setup`).
