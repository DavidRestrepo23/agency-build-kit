import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { compareValues, planExpectations, toPx } from '../src/lib/compare-values.mjs';
import { planSection } from '../src/lib/plan-section.mjs';
import { VALID_SPEC } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);

test('toPx reads px, rem and bare numbers', () => {
  assert.equal(toPx('24px'), 24);
  assert.equal(toPx('1.5rem'), 24);
  assert.equal(toPx(16), 16);
  assert.equal(toPx('auto'), null);
});

test('figma numbers vs webflow styles: tolerance, severity, variables resolved, missing props', () => {
  const expected = [
    { class: 'features_grid', prop: 'grid-row-gap', value: '24px', label: 'card gap' },
    { class: 'features_grid', prop: 'padding-top', value: '30px' },
    { class: 'features_grid', prop: 'padding-left', value: '32px' },
    { class: 'section_hero', prop: 'background-color', value: '#F5F7FF' },
    { class: 'hero_component', prop: 'max-width', value: '1200px' },
    { class: 'features_grid', breakpoint: 'small', prop: 'padding-top', value: '16px' },
  ];
  const styles = [
    { name: 'features_grid', breakpoint: 'main', props: { 'padding-left': '3rem' }, variables: { 'grid-row-gap': 'space-md', 'padding-top': 'space-md' } },
    { name: 'features_grid', breakpoint: 'small', props: {}, variables: { 'padding-top': 'space-md-mobile' } },
    { name: 'section_hero', breakpoint: 'main', props: {}, variables: { 'background-color': 'brand-surface' } },
  ];
  const r = compareValues(expected, styles, spec);
  const by = (prop, bp = 'main') => r.diffs.find((d) => d.prop === prop && d.breakpoint === bp);
  assert.equal(r.checked, 6);
  assert.equal(by('grid-row-gap'), undefined, '24px == space-md');
  assert.deepEqual([by('padding-top').severity, by('padding-top').delta], ['low', -6]);
  assert.deepEqual([by('padding-left').severity, by('padding-left').delta], ['medium', 16]);
  assert.equal(by('background-color'), undefined, 'variable resolved to the same hex');
  assert.equal(by('max-width').severity, 'medium');
  assert.match(by('max-width').actual, /missing/);
  assert.equal(by('padding-top', 'small'), undefined);
  assert.equal(r.ok, false);
});

test('color mismatch is high', () => {
  const r = compareValues([{ class: 'section_hero', prop: 'background-color', value: '#000000' }],
    [{ name: 'section_hero', breakpoint: 'main', props: {}, variables: { 'background-color': 'brand-surface' } }], spec);
  assert.equal(r.diffs[0].severity, 'high');
});

test('planExpectations turns a plan into checks that pass against its own styles', () => {
  const plan = planSection(spec, 'home', 'features');
  const expected = planExpectations(plan, spec);
  assert.ok(expected.length > 5);
  const styles = plan.styles.map((s) => ({ name: s.class, breakpoint: s.breakpoint, props: s.props, variables: s.variables }));
  assert.deepEqual(compareValues(expected, styles, spec).diffs, []);
  styles.find((s) => s.name === 'features_grid' && s.breakpoint === 'main').props.display = 'flex';
  assert.equal(compareValues(expected, styles, spec).diffs[0].prop, 'display');
});

test('CLI: expected file or --plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
  const stylesFile = join(dir, 'styles.json');
  writeFileSync(stylesFile, JSON.stringify([{ name: 'section_hero', breakpoint: 'main', props: {}, variables: { 'background-color': 'brand-surface' } }]));
  const expFile = join(dir, 'expected.json');
  writeFileSync(expFile, JSON.stringify([{ class: 'section_hero', prop: 'background-color', value: '#f5f7ff' }]));
  const ok = spawnSync(process.execPath, ['src/cli/compare-values.mjs', VALID_SPEC, expFile, stylesFile], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout);
  const plan = spawnSync(process.execPath, ['src/cli/compare-values.mjs', VALID_SPEC, '--plan', 'home', 'hero', stylesFile], { encoding: 'utf8' });
  assert.equal(plan.status, 1);
  assert.ok(JSON.parse(plan.stdout).diffs.length > 0);
});
