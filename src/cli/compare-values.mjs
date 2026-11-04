import { readFileSync } from 'node:fs';
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { compareValues, planExpectations } from '../lib/compare-values.mjs';
import { planSection } from '../lib/plan-section.mjs';

const USAGE = 'usage: compare-values <site-spec> <expected.json> <webflow-styles.json> | <site-spec> --plan <page> <section> <webflow-styles.json>';

runCli((argv) => {
  const [specDir, ...rest] = argv;
  if (!specDir || rest.length < 2) throw new Error(USAGE);
  const spec = loadSpec(specDir);
  const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
  if (rest[0] === '--plan') {
    const [, page, section, stylesFile] = rest;
    if (!stylesFile) throw new Error(USAGE);
    return compareValues(planExpectations(planSection(spec, page, section), spec), read(stylesFile), spec);
  }
  return compareValues(read(rest[0]), read(rest[1]), spec);
});
