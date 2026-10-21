import { resolveResponsive } from './responsive.mjs';

export function variableName(token) {
  return token.replaceAll('.', '-');
}

export function responsiveVariableNames(token, value, suffix = '') {
  const resolved = resolveResponsive(value);
  const base = variableName(token) + suffix;
  const out = { main: { name: base, value: resolved.main } };
  if (resolved.medium !== resolved.main) out.medium = { name: `${base}-tablet`, value: resolved.medium };
  const landscape = value && typeof value === 'object' && value.mobileLandscape !== undefined;
  if (resolved.small !== resolved.medium) out.small = { name: `${base}-${landscape ? 'mobile-landscape' : 'mobile'}`, value: resolved.small };
  if (resolved.tiny !== resolved.small) out.tiny = { name: `${base}-mobile`, value: resolved.tiny };
  return out;
}
