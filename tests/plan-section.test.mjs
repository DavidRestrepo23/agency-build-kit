import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { planSection, escapeHtml } from '../src/lib/plan-section.mjs';
import { validateClassName } from '../src/lib/class-names.mjs';
import { VALID_SPEC, copyFixture, editYaml } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);
const hero = planSection(spec, 'home', 'hero');

test('escapeHtml escapes &, <, > and quotes', () => {
  assert.equal(escapeHtml('a & <b> "c"'), 'a &amp; &lt;b&gt; &quot;c&quot;');
});

test('hero: Client-First wrapper structure', () => {
  assert.ok(hero.whtml.startsWith(
    '<section class="section_hero"><div class="padding-global"><div class="container-large"><div class="padding-section-large"><div class="hero_component">',
  ), hero.whtml);
  assert.ok(hero.whtml.endsWith('</div></div></div></div></section>'));
});

test('hero: copy is escaped, never injected as tags', () => {
  assert.ok(hero.whtml.includes('<h1 class="heading-style-h1">Grow faster &amp; smarter</h1>'));
  assert.ok(hero.whtml.includes('<p class="text-size-large">Built for &lt;teams&gt; that ship.</p>'));
  assert.ok(!hero.whtml.includes('<teams>'));
});

test('hero: classes and utilities', () => {
  assert.deepEqual(hero.classesToCreate, ['section_hero', 'hero_component', 'hero_image-wrapper', 'hero_image']);
  assert.deepEqual(hero.utilitiesUsed, ['button', 'container-large', 'heading-style-h1', 'padding-global', 'padding-section-large', 'text-size-large']);
  for (const name of [...hero.classesToCreate, ...hero.utilitiesUsed]) assert.ok(validateClassName(name).ok, name);
});

test('hero: background bound to a variable', () => {
  assert.deepEqual(hero.styles.find((s) => s.class === 'section_hero'), {
    class: 'section_hero', breakpoint: 'main', props: {}, variables: { 'background-color': 'brand-surface' },
  });
});

test('hero: grid styles only on breakpoints that change', () => {
  assert.deepEqual(hero.styles.filter((s) => s.class === 'hero_component'), [
    { class: 'hero_component', breakpoint: 'main', props: { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' }, variables: { 'grid-row-gap': 'space-lg', 'grid-column-gap': 'space-lg' } },
    { class: 'hero_component', breakpoint: 'medium', props: { 'grid-template-columns': 'repeat(1, minmax(0, 1fr))' }, variables: {} },
  ]);
});

test('hero: primary button has no combo class', () => {
  assert.ok(hero.whtml.includes('<a class="button" href="#contact">Book a demo</a>'));
});

test('hero: image asset and ratio', () => {
  assert.deepEqual(hero.assets, [{ id: 'hero-mockup', kind: 'raster', alt: 'Dashboard', targetClass: 'hero_image', order: 1 }]);
  assert.ok(hero.whtml.includes('<div class="hero_image-wrapper"><img class="hero_image" alt="Dashboard"></div>'));
  assert.equal(hero.styles.find((s) => s.class === 'hero_image-wrapper').props['aspect-ratio'], '4 / 3');
});

test('hero: interaction note targets the section', () => {
  assert.deepEqual(hero.interactions, [{ note: 'fade-up on load', targetClass: 'section_hero' }]);
});

test('features: group and ordered component slots', () => {
  const plan = planSection(spec, 'home', 'features');
  assert.ok(plan.whtml.includes('<div class="features_grid surface-card"><div class="features_card-slot"></div><div class="features_card-slot"></div></div>'));
  assert.deepEqual(plan.components.map((c) => [c.ref, c.variant, c.order, c.props.title]), [['card', 'default', 1, 'Fast'], ['card', 'default', 2, 'Safe']]);
  const grid = plan.styles.filter((s) => s.class === 'features_grid');
  assert.deepEqual(grid.map((s) => s.breakpoint), ['main', 'medium', 'small']);
  assert.deepEqual(grid[2].variables, { 'grid-row-gap': 'space-md-mobile', 'grid-column-gap': 'space-md-mobile' });
  const stack = plan.styles.filter((s) => s.class === 'features_component');
  assert.equal(stack[0].props['flex-direction'], 'column');
});

test('secondary button variant becomes an is- combo', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[2].variant = 'secondary'; });
  const plan = planSection(loadSpec(dir), 'home', 'hero');
  assert.ok(plan.whtml.includes('<a class="button is-secondary" href="#contact">'));
  assert.ok(plan.utilitiesUsed.includes('is-secondary'));
});

test('calculator: code component slot after native children', () => {
  const plan = planSection(spec, 'home', 'calculator');
  assert.ok(plan.whtml.includes('<h2 class="heading-style-h2">ROI calculator</h2><div class="calculator_code-component-slot"></div>'));
  assert.deepEqual(plan.placeholders, [
    { type: 'code-component', targetClass: 'calculator_code-component-slot', order: 1, description: 'live ROI calculation' },
  ]);
  assert.deepEqual(plan.interactions, []);
});

test('unknown page or section throws', () => {
  assert.throws(() => planSection(spec, 'about', 'hero'), /unknown page "about"/);
  assert.throws(() => planSection(spec, 'home', 'nope'), /unknown section "nope"/);
});

test('specHash: stable, sensitive to section and referenced tokens only', () => {
  assert.match(hero.specHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(planSection(loadSpec(VALID_SPEC), 'home', 'hero').specHash, hero.specHash);

  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.colors.find((c) => c.name === 'neutral.black').value = '#111111'; });
  assert.equal(planSection(loadSpec(dir), 'home', 'hero').specHash, hero.specHash, 'unrelated token must not change hash');

  editYaml(dir, 'tokens.yaml', (t) => { t.colors.find((c) => c.name === 'brand.surface').value = '#EEEEEE'; });
  assert.notEqual(planSection(loadSpec(dir), 'home', 'hero').specHash, hero.specHash, 'referenced token must change hash');

  const dir2 = copyFixture();
  editYaml(dir2, 'pages/home.yaml', (p) => { p.sections[0].children[0].text = 'New headline'; });
  assert.notEqual(planSection(loadSpec(dir2), 'home', 'hero').specHash, hero.specHash, 'section edit must change hash');
});

test('CLI validates the spec before planning', () => {
  const ok = spawnSync(process.execPath, ['src/cli/plan-section.mjs', VALID_SPEC, 'home', 'hero'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  const out = JSON.parse(ok.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.section, 'hero');

  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].background = 'brand.missing'; });
  const bad = spawnSync(process.execPath, ['src/cli/plan-section.mjs', dir, 'home', 'hero'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
});

test('surfaces: section surface is stacked on the section class', () => {
  const plan = planSection(spec, 'home', 'calculator');
  assert.ok(plan.whtml.startsWith('<section class="section_calculator surface-pill">'));
  assert.ok(plan.utilitiesUsed.includes('surface-pill'));
  assert.ok(!plan.classesToCreate.includes('surface-pill'));
});

test('surfaces: group surface is a utility, not a class to create', () => {
  const plan = planSection(spec, 'home', 'features');
  assert.ok(plan.utilitiesUsed.includes('surface-card'));
  assert.ok(!plan.classesToCreate.includes('surface-card'));
});

test('surfaces: hash changes with the assigned surface, not with its definition', () => {
  const before = planSection(spec, 'home', 'features').specHash;
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.surfaces.card.border.width = 4; });
  assert.equal(planSection(loadSpec(dir), 'home', 'features').specHash, before);
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].children[1].surface = 'pill'; });
  assert.notEqual(planSection(loadSpec(dir), 'home', 'features').specHash, before);
});
