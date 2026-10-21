import { pxToRem } from './units.mjs';
import { resolveResponsive } from './responsive.mjs';
import { responsiveVariableNames, variableName } from './variables.mjs';

export const SIDES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

// Figma letter spacing is in px; em keeps it proportional when the font size changes per breakpoint.
export function letterSpacingEm(type) {
  const size = resolveResponsive(type.size).main;
  return `${Number((type.letterSpacing / size).toFixed(4))}em`;
}

// Styles of a typography token on any class: static props on main, font-size variable per breakpoint.
export function typographyStyles(cls, type) {
  const props = { 'font-family': type.family, 'font-weight': String(type.weight), 'line-height': String(type.lineHeight) };
  if (type.letterSpacing !== undefined) props['letter-spacing'] = letterSpacingEm(type);
  if (type.textTransform !== undefined) props['text-transform'] = type.textTransform;
  return Object.entries(responsiveVariableNames(type.name, type.size, '-size')).map(([bp, { name }]) => ({
    class: cls,
    breakpoint: bp,
    props: bp === 'main' ? props : {},
    variables: { 'font-size': name },
  }));
}

// Box styles of a tokens.yaml surface on any class.
export function surfaceStyles(cls, surface, spec) {
  const props = {};
  const vars = {};
  if (surface.background) vars['background-color'] = variableName(surface.background);
  if (surface.border) {
    for (const side of SIDES) {
      props[`border-${side}-width`] = `${surface.border.width}px`;
      props[`border-${side}-style`] = 'solid';
      vars[`border-${side}-color`] = variableName(surface.border.color);
    }
  }
  if (surface.radius !== undefined) {
    for (const corner of CORNERS) props[`border-${corner}-radius`] = pxToRem(spec.tokens.radii[surface.radius]);
    props.overflow = 'hidden';
  }
  const padding = {};
  for (const [axis, sides] of [['y', ['top', 'bottom']], ['x', ['left', 'right']]]) {
    const token = surface.padding?.[axis];
    if (!token) continue;
    for (const [bp, { name }] of Object.entries(responsiveVariableNames(token, spec.tokens.spacing[token]))) {
      padding[bp] ??= {};
      for (const side of sides) padding[bp][`padding-${side}`] = name;
    }
  }
  const out = [{ class: cls, breakpoint: 'main', props, variables: { ...vars, ...padding.main } }];
  for (const [bp, variables] of Object.entries(padding)) {
    if (bp !== 'main') out.push({ class: cls, breakpoint: bp, props: {}, variables });
  }
  return out;
}

// Adds style entries to a list, merging entries for the same class and breakpoint.
export function mergeStyles(list, entries) {
  for (const entry of entries) {
    const existing = list.find((s) => s.class === entry.class && s.breakpoint === entry.breakpoint && s.comboOf === entry.comboOf);
    if (existing) {
      Object.assign(existing.props, entry.props);
      Object.assign(existing.variables, entry.variables);
    } else {
      list.push({ ...entry, props: { ...entry.props }, variables: { ...entry.variables } });
    }
  }
  return list;
}
