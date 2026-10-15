import { runCli } from '../lib/cli.mjs';
import { validateClassName } from '../lib/class-names.mjs';

runCli((argv) => {
  const results = argv.map((name) => ({ name, ...validateClassName(name) }));
  return { ok: results.every((r) => r.ok), results };
});
