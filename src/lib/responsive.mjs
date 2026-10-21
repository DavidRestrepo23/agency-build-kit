// Webflow breakpoints: main (desktop), medium (tablet ≤991), small (mobile landscape ≤767), tiny (mobile portrait ≤478).
// Missing values inherit downwards; without mobileLandscape, mobile applies from 767px down.
export function resolveResponsive(value) {
  if (typeof value === 'number' || typeof value === 'string') {
    return { main: value, medium: value, small: value, tiny: value };
  }
  if (value && typeof value === 'object' && 'desktop' in value) {
    const main = value.desktop;
    const medium = value.tablet ?? main;
    const small = value.mobileLandscape ?? value.mobile ?? medium;
    const tiny = value.mobile ?? small;
    return { main, medium, small, tiny };
  }
  throw new TypeError(`Invalid responsive value: ${JSON.stringify(value)}`);
}

export function changedBreakpoints(resolved) {
  const out = [['main', resolved.main]];
  if (resolved.medium !== resolved.main) out.push(['medium', resolved.medium]);
  if (resolved.small !== resolved.medium) out.push(['small', resolved.small]);
  if (resolved.tiny !== undefined && resolved.tiny !== resolved.small) out.push(['tiny', resolved.tiny]);
  return out;
}
