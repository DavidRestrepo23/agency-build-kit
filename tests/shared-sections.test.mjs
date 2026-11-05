import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { findSharedSections } from '../src/lib/shared-sections.mjs';
import { copyFixture, editYaml } from './helpers.mjs';

function twoPages(mutate) {
  const dir = copyFixture();
  editYaml(dir, 'project.yaml', (p) => { p.pages.push({ slug: 'about', figmaNode: '3:1' }); });
  cpSync(join(dir, 'pages/home.yaml'), join(dir, 'pages/about.yaml'));
  editYaml(dir, 'pages/about.yaml', (p) => {
    p.page = 'about'; p.figmaNode = '3:1';
    p.sections = p.sections.map((s, i) => ({ ...s, id: `${s.id}-about`, figmaNode: `3:${i + 2}` }));
    mutate?.(p);
  });
  return dir;
}

test('identical sections on two pages are one group with no props', () => {
  const { groups } = findSharedSections(loadSpec(twoPages()));
  const hero = groups.find((g) => g.sections.some((s) => s.id === 'hero'));
  assert.equal(hero.match, 'identical');
  assert.deepEqual(hero.sections, [{ page: 'home', id: 'hero' }, { page: 'about', id: 'hero-about' }]);
  assert.equal(hero.suggestedName, 'hero');
  assert.deepEqual(hero.props, []);
});

test('same structure with different copy becomes props with the value per page', () => {
  const { groups } = findSharedSections(loadSpec(twoPages((p) => {
    p.sections[0].children[0].text = 'About us';
    p.sections[0].children[2].href = '#team';
  })));
  const hero = groups.find((g) => g.sections.some((s) => s.id === 'hero'));
  assert.equal(hero.match, 'same-structure');
  assert.deepEqual(hero.props.map((p) => [p.path, p.kind, p.values['about/hero-about']]), [
    ['children.0.text', 'text', 'About us'],
    ['children.2.href', 'link', '#team'],
  ]);
  assert.deepEqual(hero.props.map((p) => p.name), ['heading', 'button-link']);
});

test('sections with a different layout are not grouped', () => {
  const { groups } = findSharedSections(loadSpec(twoPages((p) => { p.sections[0].layout.columns = 3; })));
  assert.equal(groups.find((g) => g.sections.some((s) => s.id === 'hero')), undefined);
});

test('CLI', () => {
  const run = spawnSync(process.execPath, ['src/cli/shared-sections.mjs', twoPages()], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
  assert.equal(JSON.parse(run.stdout).groups.length, 3);
});
