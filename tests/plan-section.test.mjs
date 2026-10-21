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
    '<section id="hero" class="section_hero"><div class="padding-global"><div class="container-large"><div class="padding-section-large"><div class="hero_component">',
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
  assert.ok(plan.whtml.includes('<div class="features_grid"><div class="features_card-slot"></div><div class="features_card-slot"></div></div>'));
  assert.deepEqual(plan.components.map((c) => [c.ref, c.variant, c.order, c.props.title]), [['card', 'default', 1, 'Fast'], ['card', 'default', 2, 'Safe']]);
  const grid = plan.styles.filter((s) => s.class === 'features_grid');
  assert.deepEqual(grid.map((s) => s.breakpoint), ['main', 'medium', 'small']);
  assert.deepEqual(grid[2].variables, {
    'grid-row-gap': 'space-md-mobile', 'grid-column-gap': 'space-md-mobile', 'padding-top': 'space-md-mobile', 'padding-bottom': 'space-md-mobile',
  });
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

test('surfaces: section surface props land on the section class, no stacked global', () => {
  const plan = planSection(spec, 'home', 'calculator');
  assert.ok(plan.whtml.startsWith('<section id="calculator" class="section_calculator">'), plan.whtml);
  assert.ok(!plan.utilitiesUsed.some((u) => u.startsWith('surface-')));
  const main = plan.styles.find((s) => s.class === 'section_calculator' && s.breakpoint === 'main');
  assert.equal(main.variables['background-color'], 'neutral-glass');
  assert.equal(main.props['border-top-left-radius'], '0.5rem');
  assert.equal(main.props.overflow, 'hidden');
});

test('surfaces: group surface is merged into the group class styles', () => {
  const plan = planSection(spec, 'home', 'features');
  assert.ok(plan.whtml.includes('<div class="features_grid">'), plan.whtml);
  assert.ok(!plan.utilitiesUsed.includes('surface-card'));
  const grid = plan.styles.filter((s) => s.class === 'features_grid');
  const main = grid.find((s) => s.breakpoint === 'main');
  assert.equal(main.props.display, 'grid');
  assert.equal(main.props['border-top-width'], '2px');
  assert.equal(main.variables['border-top-color'], 'neutral-border-strong');
  assert.equal(main.variables['padding-left'], 'space-lg');
  assert.equal(main.variables['padding-top'], 'space-md');
  assert.equal(grid.find((s) => s.breakpoint === 'small').variables['padding-top'], 'space-md-mobile');
  assert.equal(new Set(grid.map((s) => s.breakpoint)).size, grid.length, 'one entry per breakpoint');
});

test('surfaces: hash changes with the assigned surface and with its definition', () => {
  const before = planSection(spec, 'home', 'features').specHash;
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.surfaces.card.border.width = 4; });
  assert.notEqual(planSection(loadSpec(dir), 'home', 'features').specHash, before);
  const dir2 = copyFixture();
  editYaml(dir2, 'pages/home.yaml', (p) => { p.sections[1].children[1].surface = 'pill'; });
  assert.notEqual(planSection(loadSpec(dir2), 'home', 'features').specHash, before);
});

test('e2e A: image wrappers take full width so they do not collapse in centered layouts', () => {
  const plan = planSection(spec, 'home', 'hero');
  assert.equal(plan.styles.find((s) => s.class === 'hero_image-wrapper').props.width, '100%');
});

test('report: text color and textAlign are written on the element own class, never stacked', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => {
    p.sections[0].layout.textAlign = 'center';
    p.sections[0].children[1].color = 'neutral.black';
    p.sections[1].children[1].layout.textAlign = 'left';
  });
  const hero = planSection(loadSpec(dir), 'home', 'hero');
  assert.ok(hero.whtml.includes('<div class="hero_component">'), hero.whtml);
  assert.equal(hero.styles.find((s) => s.class === 'hero_component' && s.breakpoint === 'main').props['text-align'], 'center');
  assert.ok(hero.whtml.includes('<p class="hero_text-large-neutral-black">'), hero.whtml);
  assert.ok(hero.classesToCreate.includes('hero_text-large-neutral-black'));
  const own = hero.styles.filter((s) => s.class === 'hero_text-large-neutral-black');
  const main = own.find((s) => s.breakpoint === 'main');
  assert.equal(main.props['font-family'], 'Inter');
  assert.equal(main.variables.color, 'neutral-black');
  assert.equal(main.variables['font-size'], 'text-large-size');
  assert.equal(own.find((s) => s.breakpoint === 'small').variables['font-size'], 'text-large-size-mobile');
  assert.ok(!hero.utilitiesUsed.some((u) => u.startsWith('text-color-') || u.startsWith('text-align-')));
  const features = planSection(loadSpec(dir), 'home', 'features');
  assert.ok(features.whtml.includes('<div class="features_grid">'));
});

test('report: no element carries two classes except button + is-* combo', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => {
    p.sections[0].children[0].color = 'brand.primary';
    p.sections[0].layout.textAlign = 'center';
    p.sections[0].children.push({ type: 'rich-text', text: 'One', color: 'neutral.black' });
    p.sections[0].children.push({ type: 'button', text: 'More', href: '#', variant: 'secondary' });
  });
  const s = loadSpec(dir);
  for (const id of ['hero', 'features', 'calculator']) {
    for (const [, classes] of planSection(s, 'home', id).whtml.matchAll(/class="([^"]+)"/g)) {
      const parts = classes.split(' ');
      assert.ok(parts.length === 1 || (parts.length === 2 && parts[0] === 'button' && parts[1].startsWith('is-')), `${id}: "${classes}"`);
    }
  }
});

test('report: component child text and href reach the plan', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => {
    p.sections[1].children[1].children[0] = { type: 'component', ref: 'card', text: 'Check item', href: '#x', props: { title: 'T' } };
  });
  const plan = planSection(loadSpec(dir), 'home', 'features');
  assert.deepEqual(plan.components[0].props, { title: 'T', text: 'Check item', href: '#x' });
});

test('report: rich-text bold and italic become strong and em, everything else escaped', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => {
    p.sections[0].children.push({ type: 'rich-text', text: 'Hola **mundo** y *todo* <b>x</b>\n\nSegundo' });
  });
  const plan = planSection(loadSpec(dir), 'home', 'hero');
  assert.ok(plan.whtml.includes('<div class="text-rich-text"><p>Hola <strong>mundo</strong> y <em>todo</em> &lt;b&gt;x&lt;/b&gt;</p><p>Segundo</p></div>'), plan.whtml);
});

test('report: grid columns with mobileLandscape emit small and tiny styles', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].children[1].layout.columns = { desktop: 3, tablet: 2, mobileLandscape: 2, mobile: 1 }; });
  const grid = planSection(loadSpec(dir), 'home', 'features').styles.filter((s) => s.class === 'features_grid');
  assert.equal(grid.find((s) => s.breakpoint === 'tiny').props['grid-template-columns'], 'repeat(1, minmax(0, 1fr))');
  assert.equal(grid.find((s) => s.breakpoint === 'small')?.props['grid-template-columns'], undefined);
});
