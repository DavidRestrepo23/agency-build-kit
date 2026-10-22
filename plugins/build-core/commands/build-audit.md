---
description: Audit an approved Figma file into site-spec/ (tokens, components, pages, assets, open questions) for any platform builder
argument-hint: <figma-url>
---

# /build-core:build-audit

Figma URL: $ARGUMENTS

Goal: produce a valid `site-spec/` in the current project repo, then stop for developer review. Do not touch any platform.

0. **Ask the response language first** (one question, before anything else): "¿En qué idioma quieres las respuestas y las preguntas abiertas? / Which language for answers and open questions?" — options: Español (`es`) · English (`en`) · other (ask for the code). Skip only if `site-spec/project.yaml` already has `language`. From here on, every message to the developer, every question, the final report and all of `open-questions.md` are written in that language. Spec values (ids, token names, YAML keys) and Figma copy stay as they are — never translate copy.
1. Load the `site-spec` and `figma-extract` skills.
2. Parse `fileKey` (and optional node id) from the URL. If `$ARGUMENTS` is empty, ask for the URL and stop.
3. `get_metadata` on the file → list pages/top-level frames that are site pages. Without a node id this can list only some canvases (seen: only the cover page) — if the landing frames are not there, ask for a node-specific link (right-click frame → Copy link to selection) and stop. Ask the developer to confirm the page list and slugs (one question) unless there is only one obvious page.
4. Write `site-spec/project.yaml` (`language`: the code chosen in step 0; platforms: ask which platform if not obvious; units `rem`; Webflow default breakpoints 1440/991/767/478).
5. Extract global tokens: `get_variable_defs` + text styles → `site-spec/tokens.yaml`. Detect components used across pages → `site-spec/components.yaml`.
6. Dispatch one `figma-auditor` agent per page **in parallel**, passing fileKey, page node, slug, `language` and the paths of tokens/components files.
7. Merge each auditor's `discovered` block: add missing tokens/components/assets (dedupe by name/id; on conflicting values add an open question instead of choosing), append questions to `site-spec/open-questions.md` as `- [ ] ...`, written in `language` (translate auditor questions if needed; headings too). Frames without auto layout are inferred by `infer-layout.mjs` (see `figma-extract` step 6): only `inferredLayouts` with `confidence: low` become open questions, under a heading such as "Layout" (es: "Layout"), one line per frame with its reasons and the suggested auto layout. `medium` ones go to the report, not to the questions.
8. **Ask about behavior — always, for every section.** Figma is static and most sliders, tabs or accordions show no visible signal, so never skip this step because no candidate was detected.
   1. Show ONE review list with every section of every page, each with the auditors' guess (`static` when nothing was detected) and the signal seen, e.g. `hero — static · testimonials — slider? (3 cards clipped at the right) · faq — accordion? (stacked questions with +)`. Ask: "Which sections have something clickable or moving? Correct the list." Options per item: static · slider · tabs · accordion · lightbox (video over a thumbnail) · video · modal · marquee · counter · form · animation on scroll/hover · code (custom logic).
   2. For each non-static answer ask only the missing details, one question per section: slider → items visible per breakpoint, arrows, dots, autoplay (+ interval); tabs → tab labels (one per panel); accordion → which element is the question; lightbox/video → video URL; modal → trigger button text; marquee → direction and speed.
   3. Record it as a `behavior` on the group that holds the moving items (create/rename the group if needed; children = slides / panes / accordion items) — see the `site-spec` skill. Animations on scroll/hover go to `notes.interaction`; `form` stays a `form` child.
   4. No answer or "not sure" → an open question `- [ ] <section>: behavior of <element>?`. Never invent a behavior.
9. Validate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec
   ```
   Fix every error (re-read Figma when needed) until `ok: true`.
10. Report to the developer (in `language`): pages and section counts, every `behavior` (section › group: type + options), layouts inferred from frames without auto layout (medium: "inferred, review"; low: also in open questions), decorative layers placed absolutely and whether they hide on mobile, interactive elements and the behavior chosen for each, token counts, components, assets, sections flagged `needsCodeComponent`, components with no `children` (they are built as an empty shell plus a placeholder, so list them as manual work), surfaces defined and where they are used, every asset with `scaleApproved` plus its reason, and the open questions list. Tell them the next step is resolving open questions (mark `- [x]`) and then running the platform setup command (e.g. `/webflow-builder:wf-setup`).
