import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { validateSpec } from '../src/lib/validate-spec.mjs';
import { VALID_SPEC, copyFixture, editYaml } from './helpers.mjs';

function errorsFor(dir, options) {
  return validateSpec(loadSpec(dir), options).errors;
}

test('valid fixture passes', () => {
  const result = validateSpec(loadSpec(VALID_SPEC));
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('rejects non-kebab section id with exact path', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].id = 'Hero CTA'; });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.file === 'pages/home.yaml' && e.path === '/sections/0/id'), JSON.stringify(errors));
});

test('rejects non-kebab group name', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].children[1].name = 'Card Grid'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/1/children/1/name'));
});

test('heading without level fails', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { delete p.sections[0].children[0].level; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/children/0' && /level/.test(e.message)));
});

test('page declared in project.yaml without a file', () => {
  const dir = copyFixture();
  editYaml(dir, 'project.yaml', (p) => { p.pages.push({ slug: 'about', figmaNode: '1:9' }); });
  assert.ok(errorsFor(dir).some((e) => /page "about" has no pages\/about\.yaml/.test(e.message)));
});

test('orphan page file not listed in project.yaml', () => {
  const dir = copyFixture();
  cpSync(join(dir, 'pages/home.yaml'), join(dir, 'pages/extra.yaml'));
  editYaml(dir, 'pages/extra.yaml', (p) => { p.page = 'extra'; });
  assert.ok(errorsFor(dir).some((e) => e.file === 'pages/extra.yaml' && /not listed in project\.yaml/.test(e.message)));
});

test('unknown color token', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].background = 'brand.missing'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/background' && /unknown color token "brand\.missing"/.test(e.message)));
});

test('unknown component variant', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[2].variant = 'ghost'; });
  assert.ok(errorsFor(dir).some((e) => /unknown variant "ghost" for component "button"/.test(e.message)));
});

test('svg child must reference an svg asset', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children.push({ type: 'svg', asset: 'hero-mockup' }); });
  assert.ok(errorsFor(dir).some((e) => /must reference an asset of kind "svg"/.test(e.message)));
});

test('raster asset below 2x is rejected', () => {
  const dir = copyFixture();
  editYaml(dir, 'assets/manifest.yaml', (a) => { a.assets[0].scale = 1; });
  assert.ok(errorsFor(dir).some((e) => /scale 2 or higher/.test(e.message)));
});

test('duplicate section ids are rejected', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].id = 'hero'; });
  assert.ok(errorsFor(dir).some((e) => /duplicate section id "hero"/.test(e.message)));
});

test('reserved spacing token name is rejected', () => {
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.spacing['space.top'] = 8; });
  assert.ok(errorsFor(dir).some((e) => e.file === 'tokens.yaml' && /reserved/.test(e.message)));
});

test('open questions only block with requireResolvedQuestions', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'open-questions.md'), '# Open questions\n\n- [ ] Missing mobile frame\n- [x] Done\n');
  assert.equal(validateSpec(loadSpec(dir)).ok, true);
  const errors = errorsFor(dir, { requireResolvedQuestions: true });
  assert.deepEqual(errors, [{ file: 'open-questions.md', path: '/', message: 'unresolved: Missing mobile frame' }]);
});

test('CLI prints JSON and sets exit code', () => {
  const ok = spawnSync(process.execPath, ['src/cli/validate-spec.mjs', VALID_SPEC], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).ok, true);

  const missing = spawnSync(process.execPath, ['src/cli/validate-spec.mjs', '/nonexistent'], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).ok, false);
});

test('final review: spacing names that collide with core utilities are reserved', () => {
  for (const name of ['global', 'section-small', 'section-medium', 'section-large']) {
    const dir = copyFixture();
    editYaml(dir, 'tokens.yaml', (t) => { t.spacing[`space.${name}`] = 8; });
    assert.ok(errorsFor(dir).some((e) => e.file === 'tokens.yaml' && /reserved/.test(e.message)), name);
  }
});

test('final review: button child requires a button component even without variant', () => {
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => { c.components = c.components.filter((x) => x.name !== 'button'); });
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[2] = { type: 'button', text: 'Go', href: '#' }; });
  assert.ok(errorsFor(dir).some((e) => /unknown component "button"/.test(e.message)));
});

test('final review: group names that collide with generated classes are rejected', () => {
  for (const name of ['component', 'image', 'image-wrapper', 'icon', 'link', 'list-item', 'card-slot']) {
    const dir = copyFixture();
    editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].children[1].name = name; });
    assert.ok(errorsFor(dir).some((e) => e.path === '/sections/1/children/1/name' && /reserved/.test(e.message)), name);
  }
});

test('manifest entry whose file is missing on disk fails', () => {
  const dir = copyFixture();
  rmSync(join(dir, 'assets/logo.svg'));
  assert.ok(
    errorsFor(dir).some((e) => e.file === 'assets/manifest.yaml' && e.path === '/assets/1/file' && /logo\.svg.*not found/.test(e.message)),
    JSON.stringify(errorsFor(dir)),
  );
});

test('surfaces: fixture with surfaces is valid', () => {
  assert.deepEqual(validateSpec(loadSpec(VALID_SPEC)).errors, []);
});

test('surfaces: unknown tokens and radius are reported', () => {
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => {
    t.surfaces.card.background = 'brand.missing';
    t.surfaces.card.border.color = 'brand.nope';
    t.surfaces.card.padding.x = 'space.huge';
    t.surfaces.card.radius = 'huge';
  });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.path === '/surfaces/card/background' && /unknown color token "brand\.missing"/.test(e.message)));
  assert.ok(errors.some((e) => e.path === '/surfaces/card/border/color' && /unknown color token "brand\.nope"/.test(e.message)));
  assert.ok(errors.some((e) => e.path === '/surfaces/card/padding/x' && /unknown spacing token "space\.huge"/.test(e.message)));
  assert.ok(errors.some((e) => e.path === '/surfaces/card/radius' && /unknown radius "huge"/.test(e.message)));
});

test('surfaces: empty surface and border without width are schema errors', () => {
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.surfaces.empty = {}; delete t.surfaces.card.border.width; });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.file === 'tokens.yaml' && e.path === '/surfaces/empty'));
  assert.ok(errors.some((e) => e.file === 'tokens.yaml' && e.path === '/surfaces/card/border'));
});

test('surfaces: page references an unknown surface', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].children[1].surface = 'ghost'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/1/children/1/surface' && /unknown surface "ghost"/.test(e.message)));
});

test('surfaces: only groups accept surface', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[0].surface = 'card'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/children/0/type'));
});

test('surfaces: section cannot have background and surface', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].surface = 'card'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0' && /cannot have both background and surface/.test(e.message)));
});

test('scaleApproved: approved raster below 2x is valid, empty reason is not', () => {
  const dir = copyFixture();
  editYaml(dir, 'assets/manifest.yaml', (a) => { a.assets[0].scale = 1; a.assets[0].scaleApproved = 'client only has 1x sources'; });
  assert.deepEqual(errorsFor(dir), []);
  editYaml(dir, 'assets/manifest.yaml', (a) => { a.assets[0].scaleApproved = ''; });
  assert.ok(errorsFor(dir).some((e) => e.file === 'assets/manifest.yaml' && e.path === '/assets/0/scaleApproved'));
});

test('final review 1.1: radius named like an Object prototype key is unknown', () => {
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.surfaces.card.radius = 'toString'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/surfaces/card/radius' && /unknown radius "toString"/.test(e.message)));
});

test('page: unknown base tokens are reported', () => {
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.page = { background: 'brand.missing', color: 'neutral.black', text: 'text.huge' }; });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.path === '/page/background' && /unknown color token "brand\.missing"/.test(e.message)));
  assert.ok(errors.some((e) => e.path === '/page/text' && /unknown typography token "text\.huge"/.test(e.message)));
});

test('e2e B: child color must be a known color token on text-like children only', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[1].color = 'brand.nope'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/children/1/color' && /unknown color token "brand\.nope"/.test(e.message)));
  const dir2 = copyFixture();
  editYaml(dir2, 'pages/home.yaml', (p) => { p.sections[0].children[3].color = 'neutral.black'; });
  assert.ok(errorsFor(dir2).some((e) => e.path === '/sections/0/children/3/type'));
});

test('e2e B: layout textAlign accepts only left, center, right', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].layout.textAlign = 'justify'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/layout/textAlign'));
});

test('project.yaml accepts an optional language code', () => {
  const dir = copyFixture();
  editYaml(dir, 'project.yaml', (p) => { p.language = 'es'; });
  assert.deepEqual(errorsFor(dir), []);
  editYaml(dir, 'project.yaml', (p) => { p.language = 'pt-BR'; });
  assert.deepEqual(errorsFor(dir), []);
});

test('project.yaml rejects a language that is not a code', () => {
  const dir = copyFixture();
  editYaml(dir, 'project.yaml', (p) => { p.language = 'Spanish'; });
  assert.ok(errorsFor(dir).some((e) => e.file === 'project.yaml' && e.path === '/language'), JSON.stringify(errorsFor(dir)));
});

test('report: textTransform must be a CSS text-transform keyword', () => {
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.typography[0].textTransform = 'shout'; });
  assert.ok(errorsFor(dir).some((e) => e.file === 'tokens.yaml' && e.path === '/typography/0/textTransform'), JSON.stringify(errorsFor(dir)));
});

const slides = [
  { type: 'text', style: 'text.regular', text: 'Slide one' },
  { type: 'text', style: 'text.regular', text: 'Slide two' },
];
function withBehavior(behavior, children = slides) {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => {
    p.sections[1].children.push({ type: 'group', name: 'carousel', behavior, children });
  });
  return dir;
}

test('behavior: slider group is valid', () => {
  assert.deepEqual(errorsFor(withBehavior({ type: 'slider', perView: { desktop: 3, mobile: 1 }, arrows: true, dots: true, autoplay: false })), []);
});

test('behavior: unknown type is rejected by the schema', () => {
  assert.ok(errorsFor(withBehavior({ type: 'parallax' })).some((e) => /behavior\/type/.test(e.path)));
});

test('behavior: tabs need one label per child', () => {
  const errors = errorsFor(withBehavior({ type: 'tabs', labels: ['Only one'] }));
  assert.ok(errors.some((e) => e.path.endsWith('/behavior/labels') && /2 children/.test(e.message)), JSON.stringify(errors));
});

test('behavior: video and lightbox need a url, modal needs a trigger', () => {
  assert.ok(errorsFor(withBehavior({ type: 'video' })).some((e) => e.path.endsWith('/behavior/url')));
  assert.ok(errorsFor(withBehavior({ type: 'modal' })).some((e) => e.path.endsWith('/behavior/trigger')));
  assert.deepEqual(errorsFor(withBehavior({ type: 'lightbox', url: 'https://youtu.be/x' })), []);
});

test('behavior: accordion items must be groups', () => {
  const errors = errorsFor(withBehavior({ type: 'accordion' }));
  assert.ok(errors.some((e) => /accordion item must be a group/.test(e.message)), JSON.stringify(errors));
  const items = [{ type: 'group', name: 'faq-1', children: [
    { type: 'heading', level: 3, style: 'heading.h2', text: 'Q?' },
    { type: 'text', style: 'text.regular', text: 'A.' },
  ] }];
  assert.deepEqual(errorsFor(withBehavior({ type: 'accordion' }, items)), []);
});

test('behavior: only groups can have a behavior', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].children[0].behavior = { type: 'slider' }; });
  assert.ok(errorsFor(dir).some((e) => /behavior/.test(e.path)));
});

test('decorative: position and keepOnMobile need decorative: true', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[3].position = { top: 0 }; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/children/3/position' && /decorative: true/.test(e.message)), JSON.stringify(errorsFor(dir)));
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[3].decorative = true; });
  assert.deepEqual(errorsFor(dir), []);
});
