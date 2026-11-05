import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';
import { planMotion } from '../lib/plan-motion.mjs';

runCli(([specDir = 'site-spec']) => {
  const spec = loadSpec(specDir);
  const result = validateSpec(spec);
  if (!result.ok) return result;
  if (!spec.motion) throw new Error('site-spec/motion.yaml not found — run /webflow-builder:wf-motion to create it');
  return planMotion(spec);
});
