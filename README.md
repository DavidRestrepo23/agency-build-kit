# Agency Build Kit

Claude Code plugins that turn an approved Figma into a built site, phase by phase.

| Plugin | Commands |
|---|---|
| `build-core` | `/build-core:build-audit <figma-url>` → `site-spec/` |
| `webflow-builder` | `/webflow-builder:wf-setup` · `/webflow-builder:wf-build <page> [--section <id>]` · `/webflow-builder:wf-qa <page>` · `/webflow-builder:wf-component <page> <section>` |

New to the kit? Start with the step-by-step guide: [docs/onboarding.md](docs/onboarding.md).

## Install (each developer)

```text
/plugin marketplace add webflow/webflow-skills
/plugin install webflow-skills@webflow-skills
/plugin marketplace add <git-url-of-this-repo>
/plugin install build-core@agency-build-kit
/plugin install webflow-builder@agency-build-kit
```

Also required: Figma MCP and Webflow MCP authorized (`/mcp`), Node ≥ 22, Webflow CLI ≥ 2.0 only for `/webflow-builder:wf-component`.

## Workflow

1. In the client project repo: `/build-core:build-audit <figma-url>` → review `site-spec/`, resolve `open-questions.md`.
2. `/webflow-builder:wf-setup` → review the `style-guide` page in Designer.
3. `/webflow-builder:wf-build home` (repeat per page).
4. `/webflow-builder:wf-qa home` → read `site-spec/qa/home.md`; fix and rebuild sections as needed.
5. Publish manually (or with the official `safe-publish` skill) after review.

## Development

```bash
npm install
npm test
npm run build   # regenerates plugins/*/scripts from src/ — commit the output
```

Scripts in `plugins/*/scripts/` are generated; edit `src/` instead.
