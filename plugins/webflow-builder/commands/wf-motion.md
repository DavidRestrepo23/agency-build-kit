---
description: Optional polish after QA — research modern hover and scroll effects for this site, propose a motion plan per section, and apply the chosen effects with native Webflow states and IX3
argument-hint: <page>
---

# /webflow-builder:wf-motion

Page: $ARGUMENTS

The page already matches Figma (QA passed). This phase makes it feel alive without changing the approved design: hovers on buttons, links and cards, and entrances on scroll. Everything lands in `site-spec/motion.yaml`, so it is reviewable and reproducible.

## 1. Preconditions

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec` is ok.
- Every section of `<page>` is `qa-pass` in `site-spec/build-state.json` (if not, say which and ask whether to continue anyway).
- Webflow MCP responds (`webflow_guide_tool`).

## 2. Research references (observe, never copy code)

1. Understand the brand: industry from `project.yaml` and the copy, tone from the Figma screenshots (playful, corporate, luxury, technical…), and any prototype interactions in Figma.
2. Search the web for 5–8 current references of sites in that industry/tone with good motion (Webflow Showcase / Made in Webflow, Awwwards, Godly, Land-book…). For each, note the URL and the concrete effect worth borrowing (e.g. "CTA lifts 2px with a soft shadow", "cards stagger in from 20px below", "images zoom slowly inside their frame").
3. Pick an **intensity**: `subtle` (most B2B/corporate), `medium`, `bold` (creative/entertainment). When unsure, recommend `subtle`.

## 3. Propose a motion plan (one question)

Show a table per section — element (the plan's class name), effect (kit preset), why (reference) — plus the site-wide hovers. Kit presets:

| Preset | Kind | Use on |
|---|---|---|
| `hover-lift` | hover: up 2px + soft shadow | buttons, cards |
| `hover-scale` | hover: scale 1.03 | cards, logos |
| `hover-image-zoom` | hover: image scale 1.06 (wrapper already clips) | images in cards/portfolio (target the `_image` class) |
| `hover-darken` / `hover-fade` | hover: brightness 0.92 / opacity 0.8 | image links, secondary buttons |
| `hover-underline` | hover: underline | text links, nav links |
| `scroll-fade-up` / `scroll-fade-in` / `scroll-scale-in` | entrance on scroll | headings, text blocks, single cards |
| `scroll-stagger-children` | children enter one after another | grids, lists, logo rows |
| `heading-line-reveal` | heading lines rise from a mask | big section headings (1–2 per page) |
| `scroll-parallax-y` | scrubbed vertical drift | decorative layers and background images only |
| `load-fade-up` | hero content on page load | hero component |

Rules for the proposal: less is more (one entrance style per page, hovers consistent site-wide); never parallax or reveal body text; never animate the navbar; durations under 1s; effects only change transform/opacity/filter/shadow, so nothing shifts layout and the final state is exactly the approved design.

Ask ONE question: apply all / choose which / change intensity / skip. On skip:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-motion site-spec --page <page> --status skipped
```

## 4. Write `site-spec/motion.yaml`

```yaml
intensity: subtle
references:
  - { url: "https://…", note: "soft lift on CTAs" }
effects:
  - { id: cta-hover, preset: hover-lift, targets: [button] }
  - { id: card-zoom, preset: hover-image-zoom, targets: [services_image] }
  - { id: hero-intro, preset: load-fade-up, targets: [hero_component] }
  - { id: cards-reveal, preset: scroll-stagger-children, targets: [services_grid], stagger: 0.08 }
```
`targets` are class names from the section plans (`plan-section.mjs`) or utilities like `button`. Then `validate-spec` and:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-motion.mjs" site-spec
```
→ `{ styles[], attributes[], interactions[] }`.

## 5. Apply (headless, Webflow MCP)

1. **Hovers** — for each `styles[]` entry: `data_style_tool update_style` on `class`; entries without `state` are the base (the `transition`), entries with `state: hover` go on the hover state of that class (check the state parameter in `webflow_guide_tool` / the style tool schema). Hover effects also apply on the `button is-*` combos through the base class.
2. **Attributes** — for each `attributes[]` entry: every element with `targetClass` (`query_elements`) gets `data-anim="<value>"` with `data_element_tool set_attributes`.
3. **Interactions** — `data_interactions_tool guide` once, then one interaction per `interactions[]` entry (recipes as in `wf-section-build` step 8): trigger `wf:scroll` with `scrollTriggerConfig { start: "top 85%", enter: "play" }` (`scroll`), page load (`load`) or scrubbed scroll (`scroll-scrub`); trigger target `{ extensionKey: "wf:attribute", value: <selector> }`; action on the element itself (`target: self`) or its children with `stagger`; `from` → the design state (opacity in `wf:transform`); `split: lines` → `splitText { type: "lines", mask: "lines" }`; `conditionalPlayback { type: "prefers-reduced-motion", behavior: "skip-to-end" }`. Read each back with `get_interaction`.
4. Hover-only effects do nothing on touch: that is fine (no extra mobile work).

## 6. Verify

- At rest the page must still match Figma: re-run pass 2 of `/webflow-builder:wf-qa <page>` for the touched sections (numbers + snapshot). Any change at rest = an effect is wrong → fix it.
- Designer preview: hover each target once; scroll the page once.
- With the developer's yes, on staging: `check-published.mjs <url> data-anim=` (every effect id present, `w-mod-ix3` on `<html>`), scroll in a visible browser (a hidden tab does not run animations), toggle reduced motion, check horizontal scroll stays 0.

## 7. Record and report

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-motion site-spec --page <page> --status done --effects <n>
```
Report: references used, effects applied per section, anything left manual (e.g. initial appearance tweaks in the Designer). Do not publish.

## Progress log (project memory)

Before starting, read the resume point:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs" status site-spec
```
Log milestones (references found, plan approved / skipped, effects applied, verification):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs" log site-spec --command "/webflow-builder:wf-motion" --step "<milestone>" --summary "<what was done>" --next "<next>"
```
