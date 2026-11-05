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

test('visual loop: iterations and pending diffs are recorded on the section', () => {
  let state = setSectionState({}, { platform: 'webflow', page: 'home', section: 'hero', status: 'built', specHash: 'h', visual: { iterations: 2, pending: ['logo 6px lower'] } });
  assert.deepEqual(state.webflow.pages.home.sections.hero.visual, { iterations: 2, pending: ['logo 6px lower'] });
  state = setSectionState(state, { platform: 'webflow', page: 'home', section: 'hero', status: 'qa-pass' });
  assert.deepEqual(state.webflow.pages.home.sections.hero.visual, { iterations: 2, pending: ['logo 6px lower'] }, 'kept when not given');
});

test('CLI set-section accepts --iterations and --pending', () => {
  const dir = copyFixture();
  const run = spawnSync(process.execPath, ['src/cli/build-state.mjs', 'set-section', dir, '--page', 'home', '--section', 'hero', '--status', 'built', '--hash', 'h', '--iterations', '3', '--pending', 'a;b'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
  assert.deepEqual(JSON.parse(run.stdout).current.visual, { iterations: 3, pending: ['a', 'b'] });
});

test('hybrid: structure-built needs only the visual phase; building needs a rebuild', async () => {
  const { sectionNeedsVisual } = await import('../src/lib/build-state.mjs');
  let state = setSectionState({}, { ...base, status: 'building', specHash: 'sha256:a', elementIds: ['e1', 'e2'] });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), true, 'partial structure is rebuilt');
  assert.deepEqual(state.webflow.pages.home.sections.hero.elementIds, ['e1', 'e2'], 'ids kept for cleanup');
  assert.equal(sectionNeedsVisual(state, 'webflow', 'home', 'hero', 'sha256:a'), false);

  state = setSectionState(state, { ...base, status: 'structure-built', specHash: 'sha256:a' });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), false);
  assert.equal(sectionNeedsVisual(state, 'webflow', 'home', 'hero', 'sha256:a'), true);
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:b'), true, 'spec changed → structure again');
  assert.equal(sectionNeedsVisual(state, 'webflow', 'home', 'hero', 'sha256:b'), false);

  state = setSectionState(state, { ...base, status: 'built', specHash: 'sha256:c' });
  assert.equal(sectionNeedsVisual(state, 'webflow', 'home', 'hero', 'sha256:c'), false);
});

test('CLI get reports needsVisual', () => {
  const dir = copyFixture();
  const set = (status) => spawnSync(process.execPath, ['src/cli/build-state.mjs', 'set-section', dir, '--page', 'home', '--section', 'hero', '--status', status, '--hash', 'h'], { encoding: 'utf8' });
  assert.equal(set('structure-built').status, 0);
  const run = spawnSync(process.execPath, ['src/cli/build-state.mjs', 'get', dir, '--page', 'home', '--section', 'hero', '--hash', 'h'], { encoding: 'utf8' });
  const out = JSON.parse(run.stdout);
  assert.equal(out.needsBuild, false);
  assert.equal(out.needsVisual, true);
});

test('qa: components have their own state; visual pending until built with the same hash', async () => {
  const { setComponentState, componentNeedsVisual } = await import('../src/lib/build-state.mjs');
  let state = setComponentState({}, { platform: 'webflow', component: 'navbar', status: 'structure-built', specHash: 'h1' });
  assert.equal(componentNeedsVisual(state, 'webflow', 'navbar', 'h1'), true);
  state = setComponentState(state, { platform: 'webflow', component: 'navbar', status: 'built', specHash: 'h1', visual: { iterations: 2, pending: [] } });
  assert.equal(componentNeedsVisual(state, 'webflow', 'navbar', 'h1'), false);
  assert.equal(componentNeedsVisual(state, 'webflow', 'navbar', 'h2'), true, 'component changed');
  assert.equal(componentNeedsVisual(state, 'webflow', 'footer', 'x'), true, 'never verified');
  assert.deepEqual(state.webflow.components.navbar.visual, { iterations: 2, pending: [] });
  assert.throws(() => setComponentState(state, { platform: 'webflow', component: 'navbar', status: 'qa-pass' }), /invalid component status/);
});

test('CLI set-component / get-component', () => {
  const dir = copyFixture();
  const run = (args) => JSON.parse(spawnSync(process.execPath, ['src/cli/build-state.mjs', ...args], { encoding: 'utf8' }).stdout);
  run(['set-component', dir, '--component', 'navbar', '--status', 'built', '--hash', 'h', '--iterations', '1', '--pending', 'logo 4px low']);
  const out = run(['get-component', dir, '--component', 'navbar', '--hash', 'h']);
  assert.equal(out.needsVisual, false);
  assert.deepEqual(out.current.visual, { iterations: 1, pending: ['logo 4px low'] });
});

test('motion: per-page status done / skipped with the number of effects', () => {
  const dir = copyFixture();
  const run = (args) => JSON.parse(spawnSync(process.execPath, ['src/cli/build-state.mjs', ...args], { encoding: 'utf8' }).stdout);
  const out = run(['set-motion', dir, '--page', 'home', '--status', 'done', '--effects', '5']);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual([out.current.status, out.current.effects], ['done', 5]);
  assert.equal(run(['set-motion', dir, '--page', 'home', '--status', 'later']).ok, false);
});
