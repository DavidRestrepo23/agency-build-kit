// PreToolUse hook for Webflow MCP calls (installed by the webflow-builder plugin):
// - publishing asks the developer (the kit never publishes on its own);
// - irreversible deletes of styles, variables, pages, components, assets… ask; the kit's own element cleanup passes;
// - once site-spec/build-state.json records the project's siteId, calls for another site are denied.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEBFLOW_TOOL = /__(data_[a-z_]+_(tool|builder)|designer_tool|element_snapshot_tool|asset_tool|get_asset_preview)$/;
const PUBLISH = /^(publish|unpublish)/;
const DELETE = /^(delete|remove|batch_delete|unregister)/;

const reply = (decision, reason) => {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }));
  process.exit(0);
};

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
const tool = input.tool_name ?? '';
if (!WEBFLOW_TOOL.test(tool)) process.exit(0);
const args = input.tool_input ?? {};

const actions = [];
if (typeof args.action === 'string') actions.push(args.action);
for (const a of Array.isArray(args.actions) ? args.actions : []) {
  for (const key of Object.keys(a ?? {})) if (!['label', 'build_label'].includes(key)) actions.push(key);
}

const stateFile = join(input.cwd ?? process.cwd(), 'site-spec', 'build-state.json');
let projectSite = null;
try { projectSite = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8'))?.webflow?.siteId ?? null : null; } catch {}
if (projectSite) {
  const ids = [];
  const walk = (v, k) => {
    if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
    else if (typeof v === 'string' && /^site_?id$/i.test(k ?? '')) ids.push(v);
  };
  walk(args, '');
  const other = ids.find((id) => id !== projectSite);
  if (other) reply('deny', `siteId ${other} is not this project's site (site-spec/build-state.json: ${projectSite})`);
}

const publish = actions.find((a) => PUBLISH.test(a));
if (publish) reply('ask', `Webflow "${publish}": the kit never publishes on its own — only with the developer's explicit yes`);
const del = actions.find((a) => DELETE.test(a) && !/element/.test(a));
if (del) reply('ask', `Webflow "${del}" is irreversible — confirm with the developer (the kit hides and lists instead of deleting)`);
process.exit(0);
