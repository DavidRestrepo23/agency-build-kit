import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SECTION_STATUSES = ['pending', 'built', 'failed', 'qa-pass', 'qa-fail'];
const UP_TO_DATE = new Set(['built', 'qa-pass']);

export function setSectionState(state, { platform, page, section, status, specHash, elementIds, error, pageId }) {
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
  return !(entry && UP_TO_DATE.has(entry.status) && entry.specHash === specHash);
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
