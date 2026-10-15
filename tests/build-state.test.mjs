import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sectionNeedsBuild, setSectionState, setSetupState } from '../src/lib/build-state.mjs';
import { copyFixture } from './helpers.mjs';

const base = { platform: 'webflow', page: 'home', section: 'hero' };

test('sectionNeedsBuild follows status and hash', () => {
  let state = {};
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), true);
  state = setSectionState(state, { ...base, status: 'built', specHash: 'sha256:a', elementIds: ['e1'] });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), false);
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:b'), true);
  state = setSectionState(state, { ...base, status: 'qa-pass' });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), false);
  state = setSectionState(state, { ...base, status: 'qa-fail' });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), true);
  state = setSectionState(state, { ...base, status: 'failed', error: 'boom' });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), true);
});

test('setSectionState keeps previous fields and does not mutate', () => {
  const first = setSectionState({}, { ...base, status: 'built', specHash: 'sha256:a', elementIds: ['e1'], pageId: 'p1' });
  const second = setSectionState(first, { ...base, status: 'qa-pass' });
  assert.equal(first.webflow.pages.home.sections.hero.status, 'built');
  const entry = second.webflow.pages.home.sections.hero;
  assert.equal(entry.status, 'qa-pass');
  assert.equal(entry.specHash, 'sha256:a');
  assert.deepEqual(entry.elementIds, ['e1']);
  assert.equal(entry.error, null);
  assert.equal(second.webflow.pages.home.pageId, 'p1');
});

test('invalid status throws', () => {
  assert.throws(() => setSectionState({}, { ...base, status: 'done' }), /invalid status "done"/);
});

test('setSetupState records site and status', () => {
  const state = setSetupState({}, { platform: 'webflow', siteId: 's1', status: 'done' });
  assert.equal(state.webflow.siteId, 's1');
  assert.equal(state.webflow.setup.status, 'done');
});

test('CLI set-section then get', () => {
  const dir = copyFixture();
  const set = spawnSync(process.execPath, [
    'src/cli/build-state.mjs', 'set-section', dir, '--platform', 'webflow', '--page', 'home', '--section', 'hero',
    '--status', 'built', '--hash', 'sha256:a', '--ids', 'e1,e2', '--page-id', 'p1',
  ], { encoding: 'utf8' });
  assert.equal(set.status, 0, set.stdout);
  const file = JSON.parse(readFileSync(join(dir, 'build-state.json'), 'utf8'));
  assert.deepEqual(file.webflow.pages.home.sections.hero.elementIds, ['e1', 'e2']);

  const get = spawnSync(process.execPath, [
    'src/cli/build-state.mjs', 'get', dir, '--platform', 'webflow', '--page', 'home', '--section', 'hero', '--hash', 'sha256:a',
  ], { encoding: 'utf8' });
  assert.equal(JSON.parse(get.stdout).needsBuild, false);
});

test('CLI rejects unknown command', () => {
  const run = spawnSync(process.execPath, ['src/cli/build-state.mjs', 'nope', copyFixture()], { encoding: 'utf8' });
  assert.equal(run.status, 1);
});

test('final review: CLI rejects set-section without page or section', () => {
  const dir = copyFixture();
  const run = spawnSync(process.execPath, ['src/cli/build-state.mjs', 'set-section', dir, '--status', 'built'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(JSON.parse(run.stdout).errors[0].message, /--page and --section are required/);
});

test('final review: setup status is restricted', () => {
  assert.throws(() => setSetupState({}, { platform: 'webflow', siteId: 's', status: 'bogus' }), /invalid setup status "bogus"/);
});
