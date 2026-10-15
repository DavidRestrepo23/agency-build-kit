export function resolveResponsive(value) {
  if (typeof value === 'number' || typeof value === 'string') {
    return { main: value, medium: value, small: value };
  }
  if (value && typeof value === 'object' && 'desktop' in value) {
    const main = value.desktop;
    const medium = value.tablet ?? main;
    const small = value.mobile ?? medium;
    return { main, medium, small };
  }
  throw new TypeError(`Invalid responsive value: ${JSON.stringify(value)}`);
}

export function changedBreakpoints(resolved) {
  const out = [['main', resolved.main]];
  if (resolved.medium !== resolved.main) out.push(['medium', resolved.medium]);
  if (resolved.small !== resolved.medium) out.push(['small', resolved.small]);
  return out;
}
