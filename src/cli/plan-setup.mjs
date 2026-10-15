import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';
import { planSetup } from '../lib/plan-setup.mjs';

runCli(([dir = 'site-spec']) => {
  const spec = loadSpec(dir);
  const validation = validateSpec(spec);
  if (!validation.ok) return validation;
  return { ok: true, ...planSetup(spec) };
});
