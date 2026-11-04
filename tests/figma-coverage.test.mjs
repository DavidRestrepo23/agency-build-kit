import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { figmaCoverage } from '../src/lib/figma-coverage.mjs';
import { VALID_SPEC } from './helpers.mjs';

// Fixture spec: page 1:1, sections hero 1:2, features 1:3, calculator 1:4; navbar component 2:20.
const XML = `<frame id="1:1" name="Home" x="0" y="0" width="1440" height="3000">
  <frame id="9:1" name="Frame 82" x="0" y="0" width="1440" height="1600">
    <frame id="1:2" name="Hero" x="0" y="0" width="1440" height="800">
      <frame id="2:20" name="header" x="0" y="0" width="1440" height="100" />
      <text id="9:9" name="Title" x="100" y="300" width="800" height="80" />
    </frame>
    <frame id="1:3" name="Features" x="0" y="800" width="1440" height="800" />
  </frame>
  <frame id="5:5" name="Testimonials" x="0" y="1600" width="1440" height="600" />
  <frame id="1:4" name="Calculator" x="0" y="2200" width="1440" height="500" />
  <frame id="6:6" name="Footer" x="0" y="2700" width="1440" height="300" />
</frame>`;

test('frames are matched to spec sections/components; missing ones are reported in Figma order', () => {
  const r = figmaCoverage(loadSpec(VALID_SPEC), 'home', XML);
  assert.deepEqual(r.frames.map((f) => [f.name, f.covered]), [
    ['Hero', 'section:hero'],
    ['header', 'component:navbar'],
    ['Features', 'section:features'],
    ['Testimonials', null],
    ['Calculator', 'section:calculator'],
    ['Footer', null],
  ]);
  assert.deepEqual(r.uncovered.map((f) => f.figmaNode), ['5:5', '6:6']);
  assert.deepEqual(r.missingInFigma, []);
  assert.equal(r.ok, false);
});

test('spec nodes that no longer exist in Figma are reported', () => {
  const r = figmaCoverage(loadSpec(VALID_SPEC), 'home', XML.replace('id="1:4"', 'id="7:7"'));
  assert.deepEqual(r.missingInFigma, ['section:calculator (1:4)']);
});

test('CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cov-'));
  const file = join(dir, 'home.xml');
  writeFileSync(file, XML);
  const run = spawnSync(process.execPath, ['src/cli/figma-coverage.mjs', VALID_SPEC, 'home', file], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).uncovered.length, 2);
});
