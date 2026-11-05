import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VALID_SPEC } from './helpers.mjs';

const run = (cwd) => spawnSync(process.execPath, ['src/cli/session-resume.mjs'], { input: JSON.stringify({ cwd, hook_event_name: 'SessionStart' }), encoding: 'utf8' });

test('a project with a site-spec gets its resume point as session context', () => {
  const project = mkdtempSync(join(tmpdir(), 'proj-'));
  cpSync(VALID_SPEC, join(project, 'site-spec'), { recursive: true });
  const out = run(project);
  assert.equal(out.status, 0, out.stderr);
  const ctx = JSON.parse(out.stdout).hookSpecificOutput;
  assert.equal(ctx.hookEventName, 'SessionStart');
  assert.match(ctx.additionalContext, /resume point/);
  assert.match(ctx.additionalContext, /Next: \/webflow-builder:wf-setup/);
});

test('folders without a site-spec stay silent', () => {
  const out = run(mkdtempSync(join(tmpdir(), 'other-')));
  assert.equal(out.status, 0);
  assert.equal(out.stdout.trim(), '');
});
