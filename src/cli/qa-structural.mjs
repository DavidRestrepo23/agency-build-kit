import { readFileSync } from 'node:fs';
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { checkStructure } from '../lib/qa-structural.mjs';

runCli(([dir = 'site-spec', page, dumpFile]) => {
  if (!page || !dumpFile) throw new Error('usage: qa-structural <specDir> <page> <dump.json>');
  const dump = JSON.parse(readFileSync(dumpFile, 'utf8'));
  return checkStructure(loadSpec(dir), page, dump);
});
