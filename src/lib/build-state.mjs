import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// building: structure partly written (ids kept for cleanup); structure-built: headless phase done, visual loop pending.
export const SECTION_STATUSES = ['pending', 'building', 'structure-built', 'built', 'failed', 'qa-pass', 'qa-fail'];
const STRUCTURE_UP_TO_DATE = new Set(['structure-built', 'built', 'qa-pass']);
export const SETUP_STATUSES = ['pending', 'done', 'failed'];

export function setSectionState(state, { platform, page, section, status, specHash, elementIds, error, pageId, visual }) {
  if (!SECTION_STATUSES.includes(status)) throw new Error(`invalid status "${status}"`);
  const platformState = state[platform] ?? {};
  const pages = platformState.pages ?? {};
  const pageState = pages[page] ?? { sections: {} };
  const previous = pageState.sections?.[section] ?? {};
  const entry = {
    ...previous,
    status,
    specHash: specHash ?? previous.specHash ?? null,
    elementIds: elementIds ?? previous.elementIds ?? [],
    error: status === 'failed' ? (error ?? 'unknown error') : null,
    ...(visual ? { visual } : {}),
    at: new Date().toISOString(),
  };
  return {
    ...state,
    [platform]: {
      ...platformState,
      pages: {
        ...pages,
        [page]: {
          ...pageState,
          ...(pageId ? { pageId } : {}),
          sections: { ...pageState.sections, [section]: entry },
        },
      },
    },
  };
}

export function setSetupState(state, { platform, siteId, status }) {
  if (!SETUP_STATUSES.includes(status)) throw new Error(`invalid setup status "${status}"`);
  const platformState = state[platform] ?? {};
  return {
    ...state,
    [platform]: {
      ...platformState,
      ...(siteId ? { siteId } : {}),
      setup: { status, at: new Date().toISOString() },
    },
  };
}

export function sectionNeedsBuild(state, platform, page, section, specHash) {
  const entry = state?.[platform]?.pages?.[page]?.sections?.[section];
  return !(entry && STRUCTURE_UP_TO_DATE.has(entry.status) && entry.specHash === specHash);
}

export function sectionNeedsVisual(state, platform, page, section, specHash) {
  const entry = state?.[platform]?.pages?.[page]?.sections?.[section];
  return Boolean(entry && entry.status === 'structure-built' && entry.specHash === specHash);
}

export function readState(specDir) {
  const path = join(specDir, 'build-state.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

export function writeState(specDir, state) {
  const path = join(specDir, 'build-state.json');
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}

// Shared components (navbar, footer…) built by wf-setup go through the same visual loop as sections.
export const COMPONENT_STATUSES = ['structure-built', 'built', 'failed'];

export function setComponentState(state, { platform, component, status, specHash, visual, error }) {
  if (!COMPONENT_STATUSES.includes(status)) throw new Error(`invalid component status "${status}"`);
  const platformState = state[platform] ?? {};
  const previous = platformState.components?.[component] ?? {};
  const entry = {
    ...previous,
    status,
    specHash: specHash ?? previous.specHash ?? null,
    error: status === 'failed' ? (error ?? 'unknown error') : null,
    ...(visual ? { visual } : {}),
    at: new Date().toISOString(),
  };
  return { ...state, [platform]: { ...platformState, components: { ...platformState.components, [component]: entry } } };
}

export function componentNeedsVisual(state, platform, component, specHash) {
  const entry = state?.[platform]?.components?.[component];
  return !(entry && entry.status === 'built' && entry.specHash === specHash);
}

export const MOTION_STATUSES = ['done', 'skipped'];

export function setMotionState(state, { platform, page, status, effects }) {
  if (!MOTION_STATUSES.includes(status)) throw new Error(`invalid motion status "${status}" (done | skipped)`);
  const platformState = state[platform] ?? {};
  const entry = { status, effects: effects ?? 0, at: new Date().toISOString() };
  return { ...state, [platform]: { ...platformState, motion: { ...platformState.motion, [page]: entry } } };
}
