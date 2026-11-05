import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
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

function withOverrides(overrides) {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].overrides = overrides; });
  return dir;
}

test('overrides: own classes with raw values and $token references are valid', () => {
  assert.deepEqual(errorsFor(withOverrides({
    features_grid: { main: { 'grid-template-columns': '715fr 501fr', 'margin-top': '$space.lg' }, small: { position: 'static' } },
    section_features: { main: { 'background-color': '$brand.surface' } },
  })), []);
});

test('overrides: only the section own classes, known breakpoints and known tokens', () => {
  const errors = errorsFor(withOverrides({
    hero_component: { main: { width: '50%' } },
    features_grid: { main: { 'margin-top': '$space.missing' } },
  }));
  assert.ok(errors.some((e) => e.path === '/sections/1/overrides/hero_component' && /own classes/.test(e.message)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /unknown token "space\.missing"/.test(e.message)));
  assert.ok(errorsFor(withOverrides({ features_grid: { desktop: { width: '1px' } } })).some((e) => /overrides/.test(e.path)));
});

test('overrides: a raw value equal to a token must use the token', () => {
  const errors = errorsFor(withOverrides({ features_grid: { main: { 'padding-top': '2rem', color: '#1F4BFF' } } }));
  assert.ok(errors.some((e) => /padding-top.*2rem.*\$space\.lg/.test(e.message)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /color.*#1F4BFF.*\$brand\.primary/.test(e.message)));
});

test('replicator: overrides cannot fix a height in px/rem on content classes (use min-height)', () => {
  const errors = errorsFor(withOverrides({ features_grid: { main: { height: '420px' } } }));
  assert.ok(errors.some((e) => /height.*min-height/.test(e.message)), JSON.stringify(errors));
  assert.deepEqual(errorsFor(withOverrides({ features_grid: { main: { 'min-height': '26.25rem', height: 'auto' } } })), []);
  const dir = withOverrides({ features_decor: { main: { height: '120px' } } });
  assert.ok(!errorsFor(dir).some((e) => /min-height/.test(e.message)), 'decorative wrappers may have a fixed height');
});

function pngBytes({ alpha, corner = 0, size = 2 }) {
  // Minimal non-interlaced 8-bit PNG: RGBA (colour type 6) or RGB (2), filter 0 per row.
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ch = alpha ? 4 : 3;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  const rows = [];
  for (let y = 0; y < size; y++) { const row = Buffer.alloc(1 + size * ch, 200); row[0] = 0; if (alpha) for (let x = 0; x < size; x++) row[1 + x * ch + 3] = corner; rows.push(row); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('assets: svg needs a viewBox and no embedded raster', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="data:image/png;base64,AAAA"/></svg>');
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => /logo\.svg.*viewBox/.test(e.message)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /logo\.svg.*embedded raster/.test(e.message)));
});

test('assets: transparent cutouts need an alpha channel and transparent corners', () => {
  const dir = copyFixture();
  editYaml(dir, 'assets/manifest.yaml', (m) => { m.assets[0].transparent = true; });
  writeFileSync(join(dir, 'assets/hero-mockup@2x.png'), pngBytes({ alpha: false }));
  assert.ok(errorsFor(dir).some((e) => /no alpha channel/.test(e.message)));
  writeFileSync(join(dir, 'assets/hero-mockup@2x.png'), pngBytes({ alpha: true, corner: 255 }));
  assert.ok(errorsFor(dir).some((e) => /corners are opaque/.test(e.message)));
  writeFileSync(join(dir, 'assets/hero-mockup@2x.png'), pngBytes({ alpha: true, corner: 0 }));
  assert.deepEqual(errorsFor(dir), []);
});

test('assets: files over 500KB are a warning, not an error', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'assets/hero-mockup@2x.png'), Buffer.concat([pngBytes({ alpha: false }), Buffer.alloc(600 * 1024)]));
  const result = validateSpec(loadSpec(dir));
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => /hero-mockup@2x\.png.*KB/.test(w.message)), JSON.stringify(result.warnings));
});

test('qa: component overrides only target the component own classes', () => {
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => {
    c.components.find((x) => x.name === 'navbar').overrides = { hero_component: { main: { width: '50%' } }, navbar_menu: { main: { 'padding-top': '2rem' } } };
  });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.file === 'components.yaml' && /hero_component/.test(e.path) && /navbar_\*/.test(e.message)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /\$space\.lg/.test(e.message)));
});

function withSecondPage(mutate) {
  const dir = copyFixture();
  editYaml(dir, 'project.yaml', (p) => { p.pages.push({ slug: 'about', figmaNode: '3:1' }); });
  cpSync(join(dir, 'pages/home.yaml'), join(dir, 'pages/about.yaml'));
  editYaml(dir, 'pages/about.yaml', (p) => { p.page = 'about'; p.figmaNode = '3:1'; mutate?.(p); });
  return dir;
}

test('multi-page: the same section id with different content on two pages is an error (class collision)', () => {
  const dir = withSecondPage((p) => { p.sections[1].children[0].text = 'Other title'; p.sections[1].layout.gap = 'space.lg'; });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.file === 'pages/about.yaml' && /section id "features" is also on page "home" with different content/.test(e.message)), JSON.stringify(errors));
});

test('multi-page: an identical section on two pages is valid but warns to make it a shared component', () => {
  const dir = withSecondPage();
  const result = validateSpec(loadSpec(dir));
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => /"hero" is identical on pages home, about/.test(w.message)), JSON.stringify(result.warnings));
});

test('shared: prop names must be declared; pages cannot use prop; instance props must exist', () => {
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => {
    const nav = c.components.find((x) => x.name === 'navbar');
    nav.children[0].children[0].prop = 'undeclared';
  });
  editYaml(dir, 'pages/home.yaml', (p) => {
    p.sections[0].children[0].prop = 'title';
    p.sections[1].children[1].children[0].props.subtitle = 'nope';
  });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.file === 'components.yaml' && /prop "undeclared" is not in navbar\.props/.test(e.message)), JSON.stringify(errors));
  assert.ok(errors.some((e) => e.file === 'pages/home.yaml' && /prop.*only inside components\.yaml/.test(e.message)));
  assert.ok(errors.some((e) => /"subtitle" is not a prop of component "card"/.test(e.message)));
});
