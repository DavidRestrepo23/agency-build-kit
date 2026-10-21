import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveResponsive, changedBreakpoints } from '../src/lib/responsive.mjs';
import { pxToRem } from '../src/lib/units.mjs';
import { variableName, responsiveVariableNames } from '../src/lib/variables.mjs';
import { primaryVariantName } from '../src/lib/components.mjs';

test('resolveResponsive: a number applies to every breakpoint', () => {
  assert.deepEqual(resolveResponsive(16), { main: 16, medium: 16, small: 16, tiny: 16 });
});

test('resolveResponsive: tablet inherits desktop, mobile inherits tablet', () => {
  assert.deepEqual(resolveResponsive({ desktop: 64, mobile: 40 }), { main: 64, medium: 64, small: 40, tiny: 40 });
  assert.deepEqual(resolveResponsive({ desktop: 48, tablet: 40 }), { main: 48, medium: 40, small: 40, tiny: 40 });
});

test('resolveResponsive: rejects objects without desktop', () => {
  assert.throws(() => resolveResponsive({ mobile: 1 }), /Invalid responsive value/);
});

test('changedBreakpoints: desktop-only value emits only main', () => {
  assert.deepEqual(changedBreakpoints(resolveResponsive({ desktop: 32 })), [['main', 32]]);
});

test('changedBreakpoints: emits only real overrides', () => {
  assert.deepEqual(changedBreakpoints({ main: 64, medium: 64, small: 40 }), [['main', 64], ['small', 40]]);
  assert.deepEqual(changedBreakpoints({ main: 3, medium: 2, small: 1 }), [['main', 3], ['medium', 2], ['small', 1]]);
});

test('pxToRem converts with base 16', () => {
  assert.equal(pxToRem(16), '1rem');
  assert.equal(pxToRem(40), '2.5rem');
  assert.equal(pxToRem(18), '1.125rem');
  assert.throws(() => pxToRem('16'), /expects a number/);
});

test('variableName replaces dots with dashes', () => {
  assert.equal(variableName('brand.primary'), 'brand-primary');
});

test('responsiveVariableNames: only creates variables for changed breakpoints', () => {
  assert.deepEqual(responsiveVariableNames('space.md', { desktop: 24, mobile: 16 }), {
    main: { name: 'space-md', value: 24 },
    small: { name: 'space-md-mobile', value: 16 },
  });
  assert.deepEqual(responsiveVariableNames('heading.h1', 64, '-size'), {
    main: { name: 'heading-h1-size', value: 64 },
  });
});

test('primaryVariantName prefers "primary", else the first variant', () => {
  assert.equal(primaryVariantName({ variants: [{ name: 'secondary' }, { name: 'primary' }] }), 'primary');
  assert.equal(primaryVariantName({ variants: [{ name: 'solid' }, { name: 'ghost' }] }), 'solid');
  assert.equal(primaryVariantName({ variants: [] }), null);
});

test('report: mobileLandscape gets its own breakpoint (small), mobile becomes tiny', () => {
  const r = resolveResponsive({ desktop: 64, tablet: 56, mobileLandscape: 48, mobile: 40 });
  assert.deepEqual(r, { main: 64, medium: 56, small: 48, tiny: 40 });
  assert.deepEqual(changedBreakpoints(r), [['main', 64], ['medium', 56], ['small', 48], ['tiny', 40]]);
  assert.deepEqual(resolveResponsive({ desktop: 64, mobileLandscape: 48 }), { main: 64, medium: 64, small: 48, tiny: 48 });
});

test('report: responsive variable names for mobileLandscape', () => {
  assert.deepEqual(responsiveVariableNames('space.md', { desktop: 24, mobileLandscape: 20, mobile: 16 }), {
    main: { name: 'space-md', value: 24 },
    small: { name: 'space-md-mobile-landscape', value: 20 },
    tiny: { name: 'space-md-mobile', value: 16 },
  });
});
