import { readFileSync } from 'node:fs';
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { inferTree } from '../lib/infer-layout.mjs';

runCli((argv) => {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('usage: infer-layout <metadata.xml> [--spec site-spec]');
  const specIndex = argv.indexOf('--spec');
  const spacing = specIndex >= 0 ? loadSpec(argv[specIndex + 1]).tokens.spacing : {};
  const frames = inferTree(readFileSync(file, 'utf8'), spacing);
  return {
    ok: true,
    frames,
    summary: {
      high: frames.filter((f) => f.confidence === 'high').length,
      medium: frames.filter((f) => f.confidence === 'medium').length,
      low: frames.filter((f) => f.confidence === 'low').length,
    },
  };
});
