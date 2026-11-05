---
description: QA a built Webflow page in two passes — 1) conformance with the site-spec, 2) fidelity with Figma ignoring the spec — plus accessibility; --fix applies corrections through the spec
argument-hint: <page> [--fix]
---

# /webflow-builder:wf-qa

Arguments: $ARGUMENTS → `<page>` and optional `--fix`.

Two passes, because they catch different errors:

| Pass | Question | Source of truth | Catches |
|---|---|---|---|
| **1. Spec conformance** | Did we build what the spec says? | `site-spec/` | build errors (dropped values, placeholder copy, empty combos, missing natives) |
| **2. Figma fidelity** | Does Webflow look like Figma? | **Figma only** — the spec is ignored | spec/audit errors and omissions (wrong or missing sections, a wrong navbar/footer, values the audit got wrong) |

Without `--fix` QA only reports. With `--fix` it corrects through the spec and rebuilds (section 5).

Before starting, list sections whose build-state is `structure-built` or `building` and components whose `get-component` says `needsVisual`: they never went through the visual phase. Report them as **not built / not verified** and suggest `/webflow-builder:wf-build <page> --phase visual`.

## 1. Pass 1 — Spec conformance (deterministic)

1. With `query_elements` / `get_all_elements` on the page and `query_styles`, build a dump and save it to `site-spec/qa/<page>.dump.json`:
   ```json
   {
     "sections": [{ "id": "<section id from section_<id> class>", "classes": [], "headings": [1, 2], "images": [{ "alt": "" }], "links": [{ "href": "" }], "texts": ["<every visible text in DOM order>"], "natives": [{ "type": "Slider", "targetClass": "<class of the div that contains it>", "items": 3 }] }],
     "styles": [{ "name": "<class or 'base combo' for combos>", "breakpoint": "main", "isComboClass": false, "props": { "<css-prop>": "<raw value, not variable>" }, "variables": { "<css-prop>": "<variable>" } }]
   }
   ```
   `sections` in DOM order; `classes` lists every class name on every element of the section, one name per entry; `headings` in DOM order within each section; `natives` has one entry per div that contains native elements (Slider / Tabs / Dropdown / Lightbox / Video / YouTubeVideo / Modal), in DOM order: the native type, the div's class, and the item count (slides, tabs, or the number of Dropdowns for an accordion; 1 otherwise); `styles` lists every class used in the page, including combos (`isComboClass` from `query_styles`), with raw values in `props` and bound variables in `variables`.
2. Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/qa-structural.mjs" site-spec <page> site-spec/qa/<page>.dump.json
   ```
3. Applied values per section and per component: `compare-values.mjs site-spec --plan <page> <section> <styles.json>` (sections) — every `medium`/`high` diff is a value that did not land.

## 2. Pass 2 — Figma fidelity (Figma is the only truth)

Do not read the YAML to decide what is right here; read it only afterwards, to classify each diff.

1. **Coverage.** Save `get_metadata` of the page frame to `site-spec/.figma/<page>.xml`, then:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/figma-coverage.mjs" site-spec <page> site-spec/.figma/<page>.xml
   ```
   `frames` = every section frame of the Figma page (through generic wrappers) plus nested header/nav/footer frames, in Figma order, with the spec section or component that covers it. `uncovered` = frames the spec never built (audit omission). `missingInFigma` = spec sections whose node no longer exists.
2. **Compare every frame in `frames`, in order, one at a time** (Designer connected, tab in front; never parallel reviewers — the Designer bridge drops):
   - Figma: `get_screenshot` of the frame + `get_design_context` → write the key numbers (paddings, gaps, widths, max-widths, font family/size/weight/line-height, colours, radii of each main box) to `site-spec/qa/<frame>.expected.json` with the Webflow class names of the covering section/component.
   - Webflow: `element_snapshot_tool` of the covering element (`section_<id>` or the component instance) + its `query_styles` → `compare-values.mjs site-spec <expected.json> <styles.json>`.
   - The `wf-qa-reviewer` agent on both images for what numbers cannot see: missing or extra elements, order, overlaps, crops, copy.
   - Navbar (and any collapsing component): also at its collapse breakpoint — switch the canvas breakpoint with `designer_tool`; compare with the Figma mobile frame if one exists, otherwise check burger visible / menu hidden / links stacked and mark it "inferred".
3. **Classify each diff** — now read the spec:

   | Case | Meaning | Fix |
   |---|---|---|
   | spec = Figma, Webflow ≠ spec | build error | rebuild that section / component |
   | spec ≠ Figma | spec or audit error | correct the spec (`children`, `overrides`, `components.yaml`, tokens), then rebuild |
   | Figma frame in `uncovered` | audit omission | add the section (or component) to the spec, then build it |
   | `missingInFigma` | stale spec | ask the developer: remove the section from the spec or update its `figmaNode` |

Tablet/mobile: ask the developer whether to publish to the `.webflow.io` staging subdomain; only on an explicit yes use the official `safe-publish` flow for staging (the guard asks again), then:
   - Read the **published** page, not the draft: `node "${CLAUDE_PLUGIN_ROOT}/scripts/check-published.mjs" https://<site>.webflow.io/<page> section_<id> … data-anim=` — `lastPublished` must be after the last build; every marker present.
   - In the browser, check widths 375 · 390 · 430 · 479 · 600 · 768 · 820 · 991 · 1024 · 1200 · 1440 · 1600 · 1920 · 2560: horizontal scroll `document.documentElement.scrollWidth - clientWidth === 0`, nothing cut or overflowing the side margins, body text ≥ 16px on mobile, tap targets ≥ 44×44px, no hover-only behaviour on touch, section backgrounds edge to edge at 1920/2560. Compare with Figma tablet/mobile frames when they exist.
   - Capture 1440/768/375 screenshots for the report.
   Otherwise mark tablet/mobile as **unverified**. On the published page native IX3 interactions do not use `data-w-id`: the `<html>` gets `w-mod-ix3` and the targets keep their `data-anim` attributes.

## 3. Accessibility

Run the official `accessibility-audit` skill on the page.

## 4. Report and state

Write `site-spec/qa/<page>.md`: pass 1 findings, pass 2 diffs per Figma frame with their class (build error / spec error / omission / stale), components' visual status, accessibility findings, unverified items. A section is `qa-pass` when it has no pass 1 finding with its `section` and no high pass 2 diff without a written justification; otherwise `qa-fail`. Page-level findings (`section: null`, uncovered frames, navbar/footer diffs) are listed at the top as blocking for the page:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <id> --status qa-pass
```

## 5. `--fix` (only when the developer passed it)

Show the classified diff list and ask ONE confirmation before changing anything. Then, for each high/medium diff, in page order, components first:
1. Correct the **spec**, never only Webflow, so a rebuild reproduces it: `overrides` (own classes, per breakpoint, `$token` for token values), `children`, `components.yaml` (component `children`/`overrides`), or a missing section added with the same rules as `/build-core:build-audit` (one question to the developer for its behavior if it may be interactive). Run `validate-spec`.
2. Rebuild only what changed: a section with `/webflow-builder:wf-build <page> --section <id>` (both phases); a component with `wf-bootstrap` steps 7 and 7b for that component.
3. Re-run pass 2 for that frame. Max 3 iterations per frame; what remains goes to the report as pending.
Never publish, never delete styles/variables/pages (the guard asks); list leftovers for the developer.

Without `--fix`, end with: the classified diffs, and the command to apply them (`/webflow-builder:wf-qa <page> --fix`).

## Progress log (project memory)

Before starting, read the resume point and continue from it instead of redoing finished work:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs" status site-spec
```
After each milestone below, append an entry to `site-spec/progress.md` (one short line of summary; ids and counts, not prose), so a new session can resume if this one closes:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs" log site-spec --command "/webflow-builder:wf-qa" --step "<milestone>" --summary "<what was done, counts, ids>" --next "<next command>"
```
Milestones:
- pass 1 and pass 2 results (counts per class: build error / spec error / omission)
- each fix applied with --fix
- end → next: /webflow-builder:wf-qa <page> --fix, or "ready for the developer to publish"
