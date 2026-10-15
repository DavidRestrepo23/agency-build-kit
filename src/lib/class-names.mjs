const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const CUSTOM = new RegExp(`^${SEGMENT}_${SEGMENT}$`);
const COMBO = new RegExp(`^is-${SEGMENT}$`);

const UTILITY_PATTERNS = [
  /^page-wrapper$/,
  /^main-wrapper$/,
  /^padding-global$/,
  /^container-(small|medium|large)$/,
  /^padding-section-(small|medium|large)$/,
  /^heading-style-h[1-6]$/,
  /^text-size-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^text-weight-(light|normal|medium|semibold|bold)$/,
  /^text-color-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^background-color-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^text-align-(left|center|right)$/,
  /^text-rich-text$/,
  /^(margin|padding)-(top|bottom|left|right|horizontal|vertical)$/,
  /^(margin|padding)-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^max-width-(small|medium|large)$/,
  /^hide-(tablet|mobile-landscape|mobile-portrait)$/,
  /^button$/,
];

export function validateClassName(name) {
  if (typeof name !== 'string' || name.length === 0) return { ok: false, reason: 'class name must be a non-empty string' };
  if (/[A-Z]/.test(name)) return { ok: false, reason: 'class names must be lowercase' };
  if (/\s/.test(name)) return { ok: false, reason: 'class names cannot contain spaces' };
  if (name.startsWith('is-')) {
    return COMBO.test(name) ? { ok: true, kind: 'combo' } : { ok: false, reason: 'combo classes must match is-<kebab-case>' };
  }
  if (name.includes('_')) {
    return CUSTOM.test(name)
      ? { ok: true, kind: 'custom' }
      : { ok: false, reason: 'custom classes must match <folder>_<element> with a single underscore and kebab-case parts' };
  }
  return UTILITY_PATTERNS.some((p) => p.test(name))
    ? { ok: true, kind: 'utility' }
    : { ok: false, reason: `"${name}" is not a Client-First utility; custom classes need a folder prefix like section_ or hero_` };
}
