import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { checkStructure } from '../src/lib/qa-structural.mjs';
import { planSection } from '../src/lib/plan-section.mjs';
import { VALID_SPEC } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);

function plannedClasses(id) {
  const plan = planSection(spec, 'home', id);
  return [...plan.classesToCreate, ...plan.utilitiesUsed];
}

function goodDump() {
  return {
    sections: [
      { id: 'hero', classes: ['section_hero', 'padding-global', 'container-large', 'padding-section-large', 'hero_component', 'heading-style-h1', 'text-size-large', 'button', 'hero_image-wrapper', 'hero_image'], headings: [1], images: [{ alt: 'Dashboard' }], links: [{ href: '#contact' }] },
      { id: 'features', classes: plannedClasses('features'), headings: [2], images: [], links: [] },
      { id: 'calculator', classes: plannedClasses('calculator'), headings: [2], images: [], links: [] },
    ],
    styles: [{ name: 'hero_component', breakpoint: 'main', props: { display: 'grid' } }],
  };
}

test('clean page passes', () => {
  assert.deepEqual(checkStructure(spec, 'home', goodDump()), { ok: true, findings: [] });
});

test('missing section is high severity', () => {
  const dump = goodDump();
  dump.sections.pop();
  const result = checkStructure(spec, 'home', dump);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, [{ severity: 'high', section: 'calculator', message: 'section "calculator" from spec not found in Webflow' }]);
});

test('invalid class name is high severity', () => {
  const dump = goodDump();
  dump.sections[0].classes.push('Hero Title');
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => f.severity === 'high' && /invalid class "Hero Title"/.test(f.message)));
});

test('more than one h1 is high severity', () => {
  const dump = goodDump();
  dump.sections[1].headings = [1];
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => /exactly one h1, found 2/.test(f.message)));
});

test('heading level jump is medium severity', () => {
  const dump = goodDump();
  dump.sections[1].headings = [4];
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => f.severity === 'medium' && /h1 to h4/.test(f.message)));
});

test('image without alt and link without href', () => {
  const dump = goodDump();
  dump.sections[0].images = [{ alt: ' ' }];
  dump.sections[0].links = [{ href: '' }];
  const messages = checkStructure(spec, 'home', dump).findings.map((f) => f.message);
  assert.ok(messages.includes('image without alt text'));
  assert.ok(messages.includes('link without href'));
});

test('hard-coded token values in custom classes are flagged, utilities are not', () => {
  const dump = goodDump();
  dump.styles.push({ name: 'hero_component', breakpoint: 'main', props: { 'background-color': '#f5f7ff', 'row-gap': '32px' } });
  dump.styles.push({ name: 'padding-global', breakpoint: 'main', props: { 'padding-left': '2rem' } });
  const messages = checkStructure(spec, 'home', dump).findings.map((f) => f.message);
  assert.ok(messages.some((m) => /background-color: #f5f7ff is hard-coded; bind variable for token "brand\.surface"/.test(m)));
  assert.ok(messages.some((m) => /row-gap: 32px is hard-coded; bind variable for token "space\.lg"/.test(m)));
  assert.ok(!messages.some((m) => m.startsWith('padding-global')));
});

test('CLI reads dump file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dump-'));
  const file = join(dir, 'dump.json');
  writeFileSync(file, JSON.stringify(goodDump()));
  const run = spawnSync(process.execPath, ['src/cli/qa-structural.mjs', VALID_SPEC, 'home', file], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).ok, true);
});

test('final review: hard-coded findings are attributed to the section from the class prefix', () => {
  const dump = goodDump();
  dump.styles.push({ name: 'hero_component', breakpoint: 'main', props: { 'background-color': '#f5f7ff' } });
  const finding = checkStructure(spec, 'home', dump).findings.find((f) => /hard-coded/.test(f.message));
  assert.equal(finding.section, 'hero');
});

test('final review: section order different from spec is flagged', () => {
  const dump = goodDump();
  dump.sections = [dump.sections[1], dump.sections[0], dump.sections[2]];
  dump.sections[0].headings = [2];
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => f.severity === 'medium' && /order/.test(f.message)));
});

test('final review 1.1: planned class missing from the built section is high severity', () => {
  const dump = goodDump();
  dump.sections[1].classes = dump.sections[1].classes.filter((c) => c !== 'surface-card');
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => f.severity === 'high' && f.section === 'features' && /class "surface-card" from plan not found/.test(f.message)));
});
