import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';
import { planSection } from '../lib/plan-section.mjs';

runCli(([dir = 'site-spec', page, section]) => {
  if (!page || !section) throw new Error('usage: plan-section <specDir> <page> <sectionId>');
  const spec = loadSpec(dir);
  const validation = validateSpec(spec);
  if (!validation.ok) return validation;
  return { ok: true, ...planSection(spec, page, section) };
});
