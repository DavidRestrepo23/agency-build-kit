# End-to-end checklist (cycle 1)

Fixture: agency Figma landing (navbar, hero, cards grid, testimonials, CTA, footer) + empty Webflow sandbox site.

## /build-core:build-audit
- [ ] `site-spec/` created; `validate-spec` → `ok: true`
- [ ] Every Figma section appears once, in order, with kebab ids
- [ ] No invented copy; ambiguities listed in `open-questions.md`
- [ ] Logos/icons are `svg`; photos are raster `scale: 2`

## /webflow-builder:wf-setup
- [ ] Refuses to run while open questions are unchecked
- [ ] Variables in Colors / Typography / Spacing with rem values
- [ ] Utilities exist and pass `validate-class-names`
- [ ] Style guide page matches Figma tokens
- [ ] Navbar and footer exist as components; navbar collapses CSS-only

## /webflow-builder:wf-build home
- [ ] Every section reaches `built` without manual intervention
- [ ] Re-running skips built sections; editing one section's YAML rebuilds only that section
- [ ] No embed `<style>`, no hard-coded token values in custom classes
- [ ] Code-component sections leave an empty slot and are reported

## /webflow-builder:wf-qa home
- [ ] Structural QA `ok: true`
- [ ] No unexplained high-severity visual diffs
- [ ] Accessibility audit attached to the report
- [ ] Unverified breakpoints listed explicitly

## Pilot metrics (real project)
- Dev hours vs. baseline: ____ vs ____
- Manual corrections per section (avg): ____
