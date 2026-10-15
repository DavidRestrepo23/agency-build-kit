import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';
import { planComponent } from '../lib/plan-component.mjs';

runCli(([dir = 'site-spec', name]) => {
  if (!name) throw new Error('usage: plan-component <specDir> <componentName>');
  const spec = loadSpec(dir);
  const validation = validateSpec(spec);
  if (!validation.ok) return validation;
  return { ok: true, ...planComponent(spec, name) };
});
