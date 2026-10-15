import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';

runCli((argv) => {
  const dir = argv.find((a) => !a.startsWith('--')) ?? 'site-spec';
  return validateSpec(loadSpec(dir), { requireResolvedQuestions: argv.includes('--require-resolved') });
});
