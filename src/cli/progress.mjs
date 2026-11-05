// usage: progress log <site-spec> --command <cmd> --step <what> [--summary <text>] [--next <cmd>]
//        progress status <site-spec> [--text]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadSpec } from '../lib/load-spec.mjs';
import { appendProgress, resumeStatus, resumeText } from '../lib/progress.mjs';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { command: { type: 'string' }, step: { type: 'string' }, summary: { type: 'string' }, next: { type: 'string' }, text: { type: 'boolean' } },
});
const [cmd, specDir = 'site-spec'] = positionals;
let result;
try {
  if (cmd === 'log') {
    if (!values.command || !values.step) throw new Error('--command and --step are required');
    result = { ok: true, ...appendProgress(specDir, values) };
  } else if (cmd === 'status') {
    result = existsSync(join(specDir, 'project.yaml'))
      ? resumeStatus(loadSpec(specDir))
      : { ok: true, next: '/build-core:build-audit <figma-url> (no site-spec yet)', pages: {}, lastEntries: [] };
  } else {
    throw new Error('usage: progress log|status <site-spec> …');
  }
} catch (err) {
  result = { ok: false, errors: [{ path: '/', message: err.message }] };
}
console.log(values.text && result.ok && cmd === 'status' ? resumeText({ openQuestions: 0, setup: 'pending', ...result }) : JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
