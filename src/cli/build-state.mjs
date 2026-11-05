import { parseArgs } from 'node:util';
import { runCli } from '../lib/cli.mjs';
import { componentNeedsVisual, readState, setMotionState, sectionNeedsBuild, sectionNeedsVisual, setComponentState, setSectionState, setSetupState, writeState } from '../lib/build-state.mjs';

const OPTIONS = {
  platform: { type: 'string', default: 'webflow' },
  page: { type: 'string' },
  section: { type: 'string' },
  component: { type: 'string' },
  status: { type: 'string' },
  hash: { type: 'string' },
  ids: { type: 'string' },
  error: { type: 'string' },
  'page-id': { type: 'string' },
  'site-id': { type: 'string' },
  iterations: { type: 'string' },
  pending: { type: 'string' },
  effects: { type: 'string' },
};

runCli((argv) => {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, specDir = 'site-spec'] = positionals;
  const state = readState(specDir);
  if ((command === 'get' || command === 'set-section') && (!values.page || !values.section)) {
    throw new Error('--page and --section are required');
  }

  if (command === 'get') {
    const current = state?.[values.platform]?.pages?.[values.page]?.sections?.[values.section] ?? null;
    const args = [state, values.platform, values.page, values.section, values.hash];
    return { ok: true, needsBuild: sectionNeedsBuild(...args), needsVisual: sectionNeedsVisual(...args), current };
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
      visual: values.iterations !== undefined
        ? { iterations: Number(values.iterations), pending: (values.pending ?? '').split(';').map((s) => s.trim()).filter(Boolean) }
        : undefined,
    });
    writeState(specDir, next);
    return { ok: true, current: next[values.platform].pages[values.page].sections[values.section] };
  }
  const visual = values.iterations !== undefined
    ? { iterations: Number(values.iterations), pending: (values.pending ?? '').split(';').map((s) => s.trim()).filter(Boolean) }
    : undefined;
  if (command === 'get-component' || command === 'set-component') {
    if (!values.component) throw new Error('--component is required');
    if (command === 'get-component') {
      const current = state?.[values.platform]?.components?.[values.component] ?? null;
      return { ok: true, needsVisual: componentNeedsVisual(state, values.platform, values.component, values.hash), current };
    }
    const next = setComponentState(state, { platform: values.platform, component: values.component, status: values.status, specHash: values.hash, visual, error: values.error });
    writeState(specDir, next);
    return { ok: true, current: next[values.platform].components[values.component] };
  }
  if (command === 'set-motion') {
    if (!values.page) throw new Error('--page is required');
    const next = setMotionState(state, { platform: values.platform, page: values.page, status: values.status, effects: values.effects !== undefined ? Number(values.effects) : undefined });
    writeState(specDir, next);
    return { ok: true, current: next[values.platform].motion[values.page] };
  }
  if (command === 'set-setup') {
    const next = setSetupState(state, { platform: values.platform, siteId: values['site-id'], status: values.status });
    writeState(specDir, next);
    return { ok: true, setup: next[values.platform].setup };
  }
  throw new Error(`unknown command "${command}"; use get | set-section | set-setup | get-component | set-component | set-motion`);
});
