// Numeric comparison of expected values (from Figma, or from the plan) against the styles read back
// from Webflow. "Looks the same" is not a check: every value is compared as a number or a colour.
import { planSetup } from './plan-setup.mjs';

const TOLERANCE_PX = 1;
const MEDIUM_PX = 8;

export function toPx(value) {
  if (typeof value === 'number') return value;
  const m = String(value ?? '').trim().match(/^(-?\d*\.?\d+)(px|rem)?$/);
  if (!m) return null;
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
}

function normColor(value) {
  const v = String(value ?? '').trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (!hex) return null;
  const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
  return h.length === 8 && h.endsWith('ff') ? h.slice(0, 6) : h;
}

function variableValues(spec) {
  return new Map(planSetup(spec).variables.map((v) => [v.name, v.value]));
}

export function compareValues(expected, styles, spec, { tolerancePx = TOLERANCE_PX } = {}) {
  const vars = variableValues(spec);
  const diffs = [];
  for (const exp of expected) {
    const breakpoint = exp.breakpoint ?? 'main';
    const style = styles.find((s) => s.name === exp.class && (s.breakpoint ?? 'main') === breakpoint);
    const variable = style?.variables?.[exp.prop];
    const raw = style?.props?.[exp.prop] ?? (variable !== undefined ? vars.get(variable) ?? `var(${variable})` : undefined);
    const base = { class: exp.class, breakpoint, prop: exp.prop, label: exp.label ?? null, expected: String(exp.value) };
    if (raw === undefined) {
      diffs.push({ ...base, actual: 'missing (not set on this class/breakpoint)', delta: null, severity: 'medium' });
      continue;
    }
    const actual = variable !== undefined && style?.props?.[exp.prop] === undefined ? `${raw} (var ${variable})` : String(raw);
    const [ec, ac] = [normColor(exp.value), normColor(raw)];
    if (ec || ac) {
      if (ec !== ac) diffs.push({ ...base, actual, delta: null, severity: 'high' });
      continue;
    }
    const [ep, ap] = [toPx(exp.value), toPx(raw)];
    if (ep !== null && ap !== null) {
      const delta = Math.round((ap - ep) * 100) / 100;
      if (Math.abs(delta) > tolerancePx) diffs.push({ ...base, actual, delta, severity: Math.abs(delta) > MEDIUM_PX ? 'medium' : 'low' });
      continue;
    }
    if (String(raw).trim().toLowerCase() !== String(exp.value).trim().toLowerCase()) diffs.push({ ...base, actual, delta: null, severity: 'medium' });
  }
  return { ok: !diffs.some((d) => d.severity !== 'low'), checked: expected.length, diffs };
}

// Every value a plan sets, as checks: verifies that what the plan intended actually landed in Webflow.
export function planExpectations(plan, spec) {
  const vars = variableValues(spec);
  const out = [];
  for (const s of plan.styles) {
    if (s.comboOf) continue;
    for (const [prop, value] of Object.entries(s.props)) out.push({ class: s.class, breakpoint: s.breakpoint, prop, value });
    for (const [prop, name] of Object.entries(s.variables)) out.push({ class: s.class, breakpoint: s.breakpoint, prop, value: vars.get(name) ?? `var(${name})` });
  }
  return out;
}
