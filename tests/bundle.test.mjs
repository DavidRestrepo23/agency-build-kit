import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALID_SPEC } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function runIsolated(plugin, script, args) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  const target = join(dir, script);
  copyFileSync(join(ROOT, 'plugins', plugin, 'scripts', script), target);
  return spawnSync(process.execPath, [target, ...args], { encoding: 'utf8', cwd: dir });
}

before(() => {
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
});

test('build-core validate-spec runs without node_modules', () => {
  const run = runIsolated('build-core', 'validate-spec.mjs', [VALID_SPEC]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).ok, true);
});

for (const [script, args] of [
  ['validate-spec.mjs', [VALID_SPEC]],
  ['validate-class-names.mjs', ['section_hero']],
  ['plan-setup.mjs', [VALID_SPEC]],
  ['plan-section.mjs', [VALID_SPEC, 'home', 'hero']],
]) {
  test(`webflow-builder ${script} runs without node_modules`, () => {
    const run = runIsolated('webflow-builder', script, args);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(JSON.parse(run.stdout).ok, true);
  });
}

test('webflow-builder build-state and qa-structural are bundled', () => {
  const run = runIsolated('webflow-builder', 'build-state.mjs', ['get', VALID_SPEC, '--page', 'home', '--section', 'hero', '--hash', 'x']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).needsBuild, true);
  const qa = runIsolated('webflow-builder', 'qa-structural.mjs', []);
  assert.equal(qa.status, 1);
  assert.match(JSON.parse(qa.stdout).errors[0].message, /usage: qa-structural/);
});
