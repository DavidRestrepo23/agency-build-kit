import { readFileSync } from 'node:fs';
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { figmaCoverage } from '../lib/figma-coverage.mjs';

runCli(([specDir, page, xmlFile]) => {
  if (!specDir || !page || !xmlFile) throw new Error('usage: figma-coverage <site-spec> <page> <page-metadata.xml>');
  return figmaCoverage(loadSpec(specDir), page, readFileSync(xmlFile, 'utf8'));
});
