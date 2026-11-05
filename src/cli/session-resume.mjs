// SessionStart hook (build-core): in a project with site-spec/, tell the new session where the
// work stopped — from build-state.json and progress.md — so it can resume instead of starting over.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSpec } from '../lib/load-spec.mjs';
import { resumeStatus, resumeText } from '../lib/progress.mjs';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch {}
const specDir = join(input.cwd ?? process.cwd(), 'site-spec');
if (!existsSync(join(specDir, 'project.yaml'))) process.exit(0);
try {
  const text = resumeText(resumeStatus(loadSpec(specDir)));
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `${text}\nWhen the developer starts working on this project, tell them where it stands and confirm the next step before continuing.`,
    },
  }));
} catch {
  // A broken spec must never block the session; validate-spec reports it when a command runs.
}
process.exit(0);
