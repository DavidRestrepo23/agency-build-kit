import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function guard(input, cwd) {
  const run = spawnSync(process.execPath, ['src/cli/guard.mjs'], { input: JSON.stringify({ cwd, ...input }), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim() ? JSON.parse(run.stdout).hookSpecificOutput : null;
}

const project = mkdtempSync(join(tmpdir(), 'guard-'));
mkdirSync(join(project, 'site-spec'));
writeFileSync(join(project, 'site-spec/build-state.json'), JSON.stringify({ webflow: { siteId: 'site-ok' } }));

test('publishing asks the developer', () => {
  const out = guard({ tool_name: 'mcp__webflow__data_sites_tool', tool_input: { actions: [{ publish_site: { site_id: 'site-ok' } }] } }, project);
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /publish/i);
});

test('irreversible deletes of styles, variables or pages ask; deleting own elements and remove_properties pass', () => {
  assert.equal(guard({ tool_name: 'mcp__a80744b7__data_style_tool', tool_input: { actions: [{ delete_style: { name: 'x' } }] } }, project).permissionDecision, 'ask');
  assert.equal(guard({ tool_name: 'mcp__webflow__data_pages_tool', tool_input: { action: 'delete_page' } }, project).permissionDecision, 'ask');
  assert.equal(guard({ tool_name: 'mcp__webflow__data_element_tool', tool_input: { actions: [{ remove_element: { id: 'e1' } }] } }, project), null);
  assert.equal(guard({ tool_name: 'mcp__webflow__data_style_tool', tool_input: { actions: [{ update_style: { remove_properties: ['width'] } }] } }, project), null);
});

test('a site id other than the project site is denied', () => {
  const out = guard({ tool_name: 'mcp__webflow__data_pages_tool', tool_input: { siteId: 'other-site', action: 'list_pages' } }, project);
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /other-site.*site-ok/);
  assert.equal(guard({ tool_name: 'mcp__webflow__data_pages_tool', tool_input: { siteId: 'site-ok' } }, project), null);
});

test('non-Webflow tools and projects without a site id pass', () => {
  assert.equal(guard({ tool_name: 'mcp__figma__get_metadata', tool_input: { fileKey: 'x' } }, project), null);
  const empty = mkdtempSync(join(tmpdir(), 'guard-'));
  assert.equal(guard({ tool_name: 'mcp__webflow__data_pages_tool', tool_input: { siteId: 'any' } }, empty), null);
});
