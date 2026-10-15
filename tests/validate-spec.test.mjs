import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, writeFileSync } from 'node:fs';
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
