# E2E run — 2026-10-15 — Adgrowers landing

Fixture: Figma `UdUQJPP87wJo8TglSwgfZ3`, frame `V2` (`2162:566`), 1440 desktop only.
Sections in Figma: header, hero, numbers, services, process, portfolio, CTA ("Typeform"), footer.
Note: the fixture has no testimonials or cards-grid section; it has numbers/services/process/portfolio instead.
Client folder: `~/Desktop/Agents IA/abk-e2e-adgrowers/site-spec/`.
Webflow sandbox: **not run** — Webflow MCP was not connected in the session.

## /build-audit
- [x] `site-spec/` created; `validate-spec` → `ok: true` (first pass)
- [x] Every Figma section appears once, in order, with kebab ids — `navbar, hero, numbers, services, process, portfolio, cta, footer`. Needed manual judgement: sections nested in wrapper frames and navbar nested in hero (skill updated).
- [x] No invented copy; 26 ambiguities in `open-questions.md` (links, typos, placeholder "Client Name", missing responsive frames, gradients, Satoshi font).
- [~] Logos/icons are `svg`; photos are raster `scale: 2` — icons are SVG. **Logo and client logos exist only as rasters** (open question). Portfolio images were source-size (~1.66x) from `get_design_context`; re-exported at true 2x via `download_assets`. Other rasters remain unverified.

Audit was executed by following `build-audit.md` manually in this session (no parallel `figma-auditor` agents: one page).

## /wf-setup
- [x] Refuses to run while open questions are unchecked — `validate-spec --require-resolved` → 26 `unresolved` errors.
- [ ] Variables in Colors / Typography / Spacing with rem values — not run (no Webflow MCP)
- [ ] Utilities exist and pass `validate-class-names` — not run
- [ ] Style guide page matches Figma tokens — not run
- [ ] Navbar and footer exist as components; navbar collapses CSS-only — not run

## /wf-build home
- [ ] all — not run

## /wf-qa home
- [ ] all — not run

## Findings and fixes (branch `fix/e2e-cycle1-findings`)
1. `validate-spec` accepted manifest entries whose file was never downloaded → now errors with `asset file "<f>" not found in assets/` (TDD, 119 tests pass).
2. `figma-extract` skill: descend through generic wrapper frames; navbar/footer nested in another section are still sections; sort by `y`.
3. `figma-extract` skill: when the file has no variables, infer tokens and raise one open question.
4. `figma-extract` skill: `get_design_context` raster URLs are source-size, not 2x → use `download_assets` with `defaultScale: 2`; name files by real format (a `.png` URL served a JPEG).
5. `build-audit` command: file-level `get_metadata` listed only the cover page → ask for a node-specific link.

## Open issues (not fixed)
- Schema errors short-circuit cross-reference checks, so fixing one batch can reveal a second batch (by design; costs an extra loop).
- site-spec has no way to express gradients (buttons, icon tiles, gradient text) or semi-transparent colors; this design uses both heavily.
- Hero collage, services bento and process ring are absolutely positioned compositions; the neutral spec captures them only as `group` + `notes`. Expect manual work in Webflow.
