---
description: Audit an approved Figma file into site-spec/ (tokens, components, pages, assets, open questions) for any platform builder
argument-hint: <figma-url>
---

# /build-core:build-audit

Figma URL: $ARGUMENTS

Goal: produce a valid `site-spec/` in the current project repo, then stop for developer review. Do not touch any platform.

1. Load the `site-spec` and `figma-extract` skills.
2. Parse `fileKey` (and optional node id) from the URL. If `$ARGUMENTS` is empty, ask for the URL and stop.
3. `get_metadata` on the file → list pages/top-level frames that are site pages. Without a node id this can list only some canvases (seen: only the cover page) — if the landing frames are not there, ask for a node-specific link (right-click frame → Copy link to selection) and stop. Ask the developer to confirm the page list and slugs (one question) unless there is only one obvious page.
4. Write `site-spec/project.yaml` (platforms: ask which platform if not obvious; units `rem`; Webflow default breakpoints 1440/991/767/478).
5. Extract global tokens: `get_variable_defs` + text styles → `site-spec/tokens.yaml`. Detect components used across pages → `site-spec/components.yaml`.
6. Dispatch one `figma-auditor` agent per page **in parallel**, passing fileKey, page node, slug and the paths of tokens/components files.
7. Merge each auditor's `discovered` block: add missing tokens/components/assets (dedupe by name/id; on conflicting values add an open question instead of choosing), append questions to `site-spec/open-questions.md` as `- [ ] ...`.
8. **Ask about interactive elements.** Collect every `interactive` candidate from the auditors and ask the developer about each one, one question per candidate (group several candidates of the same section in one question at most), showing the section, the signal and your guess. Options: static · slider/carousel · marquee · tabs · accordion · modal/lightbox · video · form · animation on scroll/hover · code component (custom logic). Then record the answer in the section/group:
   - static → nothing.
   - slider, tabs, accordion, modal, video, form, code component → `needsCodeComponent: true` on the section when it needs custom logic, plus `notes.interaction` describing the behavior (e.g. "slider: 4 cards visible, arrows + dots, autoplay off").
   - marquee, animation on scroll/hover, counter → `notes.interaction` only (built later with Webflow interactions).
   - No answer or "not sure" → an open question `- [ ] <section>: behavior of <element>?`. Never guess a behavior.
9. Validate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec
   ```
   Fix every error (re-read Figma when needed) until `ok: true`.
10. Report to the developer: pages and section counts, interactive elements and the behavior chosen for each, token counts, components, assets, sections flagged `needsCodeComponent`, surfaces defined and where they are used, every asset with `scaleApproved` plus its reason, and the open questions list. Tell them the next step is resolving open questions (mark `- [x]`) and then running the platform setup command (e.g. `/webflow-builder:wf-setup`).
