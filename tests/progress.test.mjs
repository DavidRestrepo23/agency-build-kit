import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { appendProgress, resumeStatus } from '../src/lib/progress.mjs';
import { copyFixture } from './helpers.mjs';

const state = (webflow) => ({ webflow });

test('appendProgress writes a dated markdown entry and keeps older ones', () => {
  const dir = copyFixture();
  appendProgress(dir, { command: '/build-core:build-audit', step: 'spec created', summary: '3 sections, 2 questions', next: 'resolve open-questions.md' }, new Date('2026-11-04T15:20:00Z'));
  appendProgress(dir, { command: '/webflow-builder:wf-setup', step: 'variables', summary: '24 variables' }, new Date('2026-11-04T16:00:00Z'));
  const md = readFileSync(join(dir, 'progress.md'), 'utf8');
  assert.match(md, /^# Progress/);
  assert.match(md, /## 2026-11-04 15:20 UTC · \/build-core:build-audit · spec created\n\n3 sections, 2 questions\n\nNext: resolve open-questions\.md/);
  assert.ok(md.indexOf('16:00') > md.indexOf('15:20'), 'appended in order');
});

test('resumeStatus: next step follows the pipeline', () => {
  const spec = loadSpec(copyFixture());
  const next = (s, openQuestions = '') => resumeStatus({ ...spec, buildState: s, openQuestions }).next;
  assert.match(next(null, '- [ ] Missing mobile frame'), /open-questions\.md \(1 open\)/);
  assert.match(next(null), /\/webflow-builder:wf-setup/);
  const setupDone = { setup: { status: 'done' } };
  assert.match(next(state(setupDone)), /wf-build home/);
  const sections = (statuses) => state({ ...setupDone, pages: { home: { sections: Object.fromEntries(['hero', 'features', 'calculator'].map((id, i) => [id, { status: statuses[i] }])) } } });
  assert.match(next(sections(['built', 'building', 'built'])), /wf-build home --phase structure.*features/);
  assert.match(next(sections(['built', 'structure-built', 'built'])), /wf-build home --phase visual/);
  assert.match(next(sections(['built', 'built', 'built'])), /wf-qa home$/);
  assert.match(next(sections(['qa-pass', 'qa-fail', 'qa-pass'])), /wf-qa home --fix/);
  assert.match(next(sections(['qa-pass', 'qa-pass', 'qa-pass'])), /wf-motion home/);
  const polished = sections(['qa-pass', 'qa-pass', 'qa-pass']);
  polished.webflow.motion = { home: { status: 'done' } };
  assert.match(next(polished), /done/i);
  polished.webflow.motion = { home: { status: 'skipped' } };
  assert.match(next(polished), /done/i);
});

test('resumeStatus reports sections, components and the last log entries', () => {
  const dir = copyFixture();
  appendProgress(dir, { command: '/webflow-builder:wf-build', step: 'hero built', summary: '2 visual iterations' });
  writeFileSync(join(dir, 'build-state.json'), JSON.stringify(state({ setup: { status: 'done' }, components: { navbar: { status: 'structure-built' } }, pages: { home: { sections: { hero: { status: 'built' } } } } })));
  const status = resumeStatus(loadSpec(dir));
  assert.deepEqual(status.pages.home, { built: ['hero'], structureBuilt: [], toBuild: ['features', 'calculator'], qaPass: [], qaFail: [] });
  assert.deepEqual(status.componentsPendingVisual, ['navbar']);
  assert.equal(status.lastEntries.length, 1);
  assert.match(status.lastEntries[0], /hero built/);
});

test('CLI log + status --text', () => {
  const dir = copyFixture();
  const log = spawnSync(process.execPath, ['src/cli/progress.mjs', 'log', dir, '--command', '/build-core:build-audit', '--step', 'spec created', '--summary', 'ok', '--next', 'resolve questions'], { encoding: 'utf8' });
  assert.equal(log.status, 0, log.stdout);
  const status = spawnSync(process.execPath, ['src/cli/progress.mjs', 'status', dir, '--text'], { encoding: 'utf8' });
  assert.equal(status.status, 0);
  assert.match(status.stdout, /Agency Build Kit — resume point/);
  assert.match(status.stdout, /Next: /);
  assert.match(status.stdout, /spec created/);
});

test('status without a spec suggests the audit', () => {
  const empty = mkdtempSync(join(tmpdir(), 'nospec-'));
  const run = spawnSync(process.execPath, ['src/cli/progress.mjs', 'status', join(empty, 'site-spec')], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(JSON.parse(run.stdout).next, /build-audit/);
});
