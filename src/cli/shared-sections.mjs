import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { findSharedSections } from '../lib/shared-sections.mjs';

runCli(([specDir = 'site-spec']) => findSharedSections(loadSpec(specDir)));
