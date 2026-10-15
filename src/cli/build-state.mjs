import { parseArgs } from 'node:util';
import { runCli } from '../lib/cli.mjs';
import { readState, sectionNeedsBuild, setSectionState, setSetupState, writeState } from '../lib/build-state.mjs';

const OPTIONS = {
  platform: { type: 'string', default: 'webflow' },
  page: { type: 'string' },
  section: { type: 'string' },
  status: { type: 'string' },
  hash: { type: 'string' },
  ids: { type: 'string' },
  error: { type: 'string' },
  'page-id': { type: 'string' },
  'site-id': { type: 'string' },
};

runCli((argv) => {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, specDir = 'site-spec'] = positionals;
  const state = readState(specDir);

  if (command === 'get') {
    const current = state?.[values.platform]?.pages?.[values.page]?.sections?.[values.section] ?? null;
    return { ok: true, needsBuild: sectionNeedsBuild(state, values.platform, values.page, values.section, values.hash), current };
  }
  if (command === 'set-section') {
    const next = setSectionState(state, {
      platform: values.platform,
      page: values.page,
      section: values.section,
      status: values.status,
      specHash: values.hash,
      elementIds: values.ids ? values.ids.split(',').filter(Boolean) : undefined,
      error: values.error,
      pageId: values['page-id'],
    });
    writeState(specDir, next);
    return { ok: true, current: next[values.platform].pages[values.page].sections[values.section] };
  }
  if (command === 'set-setup') {
    const next = setSetupState(state, { platform: values.platform, siteId: values['site-id'], status: values.status });
    writeState(specDir, next);
    return { ok: true, setup: next[values.platform].setup };
  }
  throw new Error(`unknown command "${command}"; use get | set-section | set-setup`);
});
