import { pxToRem } from './units.mjs';
import { responsiveVariableNames, variableName } from './variables.mjs';
import { primaryVariantName } from './components.mjs';

const CONTAINERS_REM = { small: 48, medium: 64, large: 80 };
const SECTION_DEFAULTS_PX = { small: 48, medium: 80, large: 128 };
const WEIGHTS = { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700 };
const MAX_WIDTHS_REM = { small: 20, medium: 32, large: 48 };
const SIDES = ['top', 'right', 'bottom', 'left'];
const VARIANT_PROPS = {
  background: ['background-color'],
  color: ['color'],
  border: SIDES.map((s) => `border-${s}-color`),
};

function variantVariables(variant) {
  const out = {};
  for (const [key, token] of Object.entries(variant?.styles ?? {})) {
    for (const prop of VARIANT_PROPS[key]) out[prop] = variableName(token);
  }
  return out;
}

export function planSetup(spec) {
  const variables = [];
  const styles = [];
  const classes = new Set(['page-wrapper', 'main-wrapper', 'text-rich-text']);

  const style = (cls, breakpoint, props = {}, vars = {}, extra = {}) => {
    classes.add(cls);
    styles.push({ class: cls, breakpoint, props, variables: vars, ...extra });
  };
  const sizeVariables = (collection, token, value, suffix = '') => {
    const names = responsiveVariableNames(token, value, suffix);
    for (const { name, value: px } of Object.values(names)) variables.push({ collection, name, type: 'size', value: pxToRem(px) });
    return names;
  };

  for (const color of spec.tokens.colors) {
    variables.push({ collection: 'Colors', name: variableName(color.name), type: 'color', value: color.value });
  }

  style('padding-global', 'main', { 'padding-left': '2.5rem', 'padding-right': '2.5rem' });
  style('padding-global', 'small', { 'padding-left': '1.25rem', 'padding-right': '1.25rem' });
  for (const [size, rem] of Object.entries(CONTAINERS_REM)) {
    style(`container-${size}`, 'main', { width: '100%', 'max-width': `${rem}rem`, 'margin-left': 'auto', 'margin-right': 'auto' });
  }
  for (const [size, px] of Object.entries(SECTION_DEFAULTS_PX)) {
    const token = `section.${size}`;
    const names = sizeVariables('Spacing', token, spec.tokens.spacing[token] ?? px);
    for (const [bp, { name }] of Object.entries(names)) {
      style(`padding-section-${size}`, bp, {}, { 'padding-top': name, 'padding-bottom': name });
    }
  }

  for (const type of spec.tokens.typography) {
    const [group, size] = type.name.split('.');
    const cls = group === 'heading' ? `heading-style-${size}` : `text-size-${size}`;
    const props = { 'font-family': type.family, 'font-weight': String(type.weight), 'line-height': String(type.lineHeight) };
    if (type.letterSpacing !== undefined) props['letter-spacing'] = `${type.letterSpacing}em`;
    const names = sizeVariables('Typography', type.name, type.size, '-size');
    for (const [bp, { name }] of Object.entries(names)) style(cls, bp, bp === 'main' ? props : {}, { 'font-size': name });
  }

  for (const [token, value] of Object.entries(spec.tokens.spacing)) {
    if (token.startsWith('section.')) continue;
    const size = token.slice('space.'.length);
    const names = sizeVariables('Spacing', token, value);
    for (const kind of ['margin', 'padding']) {
      for (const [bp, { name }] of Object.entries(names)) {
        style(`${kind}-${size}`, bp, {}, Object.fromEntries(SIDES.map((side) => [`${kind}-${side}`, name])));
      }
    }
  }
  for (const kind of ['margin', 'padding']) {
    for (const side of SIDES) {
      style(`${kind}-${side}`, 'main', Object.fromEntries(SIDES.filter((s) => s !== side).map((s) => [`${kind}-${s}`, '0'])));
    }
    style(`${kind}-horizontal`, 'main', { [`${kind}-top`]: '0', [`${kind}-bottom`]: '0' });
    style(`${kind}-vertical`, 'main', { [`${kind}-left`]: '0', [`${kind}-right`]: '0' });
  }

  for (const color of spec.tokens.colors) {
    const name = variableName(color.name);
    style(`text-color-${name}`, 'main', {}, { color: name });
    style(`background-color-${name}`, 'main', {}, { 'background-color': name });
  }
  for (const [name, weight] of Object.entries(WEIGHTS)) style(`text-weight-${name}`, 'main', { 'font-weight': String(weight) });
  for (const [name, rem] of Object.entries(MAX_WIDTHS_REM)) style(`max-width-${name}`, 'main', { width: '100%', 'max-width': `${rem}rem` });
  for (const align of ['left', 'center', 'right']) style(`text-align-${align}`, 'main', { 'text-align': align });
  style('hide-tablet', 'medium', { display: 'none' });
  style('hide-mobile-landscape', 'small', { display: 'none' });
  style('hide-mobile-portrait', 'tiny', { display: 'none' });

  for (const [name, surface] of Object.entries(spec.tokens.surfaces ?? {})) {
    const cls = `surface-${name}`;
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
      for (const corner of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) {
        props[`border-${corner}-radius`] = pxToRem(spec.tokens.radii[surface.radius]);
      }
      props.overflow = 'hidden';
    }
    const padding = { main: {}, medium: {}, small: {} };
    for (const [axis, sides] of [['y', ['top', 'bottom']], ['x', ['left', 'right']]]) {
      const token = surface.padding?.[axis];
      if (!token) continue;
      for (const [bp, { name: variable }] of Object.entries(responsiveVariableNames(token, spec.tokens.spacing[token]))) {
        for (const side of sides) padding[bp][`padding-${side}`] = variable;
      }
    }
    style(cls, 'main', props, { ...vars, ...padding.main });
    for (const bp of ['medium', 'small']) {
      if (Object.keys(padding[bp]).length) style(cls, bp, {}, padding[bp]);
    }
  }

  const button = spec.components.components.find((c) => c.name === 'button');
  if (button) {
    const base = {
      display: 'inline-block',
      'padding-top': '0.75rem',
      'padding-bottom': '0.75rem',
      'padding-left': '1.5rem',
      'padding-right': '1.5rem',
      'text-decoration': 'none',
    };
    for (const side of SIDES) {
      base[`border-${side}-width`] = '1px';
      base[`border-${side}-style`] = 'solid';
    }
    const radius = spec.tokens.radii?.button;
    if (radius !== undefined) {
      for (const corner of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) base[`border-${corner}-radius`] = pxToRem(radius);
    }
    const primary = primaryVariantName(button);
    style('button', 'main', base, variantVariables(button.variants.find((v) => v.name === primary)));
    for (const variant of button.variants) {
      if (variant.name !== primary) style(`is-${variant.name}`, 'main', {}, variantVariables(variant), { comboOf: 'button' });
    }
  }

  return {
    variables,
    fonts: spec.tokens.fonts,
    styles,
    classes: [...classes],
    components: spec.components.components.filter((c) => c.name !== 'button').map((c) => c.name),
  };
}
