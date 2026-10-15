---
description: QA a built Webflow page against site-spec and Figma — structural checks, visual diffs per section, accessibility audit
argument-hint: <page>
---

# /wf-qa

Page: $ARGUMENTS

## 1. Structural (deterministic)

1. With `query_elements` / `get_all_elements` on the page and `query_styles`, build a dump and save it to `site-spec/qa/<page>.dump.json`:
   ```json
   {
     "sections": [{ "id": "<section id from section_<id> class>", "classes": [], "headings": [1, 2], "images": [{ "alt": "" }], "links": [{ "href": "" }] }],
     "styles": [{ "name": "<class>", "breakpoint": "main", "props": { "<css-prop>": "<raw value, not variable>" } }]
   }
   ```
   `sections` in DOM order; `headings` in DOM order within each section; `styles` only raw (non-variable) values.
2. Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/qa-structural.mjs" site-spec <page> site-spec/qa/<page>.dump.json
   ```

## 2. Visual

Dispatch one `wf-qa-reviewer` agent per built section in parallel (Designer Bridge connected, tab foregrounded). Tablet/mobile: ask the developer whether to publish to the `.webflow.io` staging subdomain; only on an explicit yes use the official `safe-publish` flow for staging, then capture 1440/768/375 px screenshots with the browser. Otherwise mark tablet/mobile as **unverified**.

## 3. Accessibility

Run the official `accessibility-audit` skill on the page.

## 4. Report and state

Write `site-spec/qa/<page>.md`: structural findings, per-section visual diffs (high/medium/low), accessibility findings, unverified items. A section is `qa-pass` when it has no structural findings and no high visual diff; otherwise `qa-fail`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <id> --status qa-pass
```

Do not fix anything. Tell the developer to fix the spec or run `/wf-build <page> --section <id>` for failing sections.
