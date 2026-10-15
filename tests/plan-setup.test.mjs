import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { planSetup } from '../src/lib/plan-setup.mjs';
import { planSection } from '../src/lib/plan-section.mjs';
import { validateClassName } from '../src/lib/class-names.mjs';
import { VALID_SPEC } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);
const setup = planSetup(spec);
const vars = (collection) => setup.variables.filter((v) => v.collection === collection).map((v) => [v.name, v.value]);

test('color variables keep hex values', () => {
  assert.deepEqual(vars('Colors'), [
    ['brand-primary', '#1F4BFF'], ['brand-surface', '#F5F7FF'], ['neutral-white', '#FFFFFF'], ['neutral-black', '#0A0A0A'],
    ['neutral-glass', '#FFFFFF0D'], ['neutral-border-strong', '#FFFFFFE6'],
  ]);
});

test('typography variables are responsive and in rem', () => {
  const typo = vars('Typography');
  assert.deepEqual(typo.filter(([n]) => n.startsWith('heading-h1')), [['heading-h1-size', '4rem'], ['heading-h1-size-mobile', '2.5rem']]);
  assert.deepEqual(typo.filter(([n]) => n.startsWith('heading-h2')), [
    ['heading-h2-size', '3rem'], ['heading-h2-size-tablet', '2.5rem'], ['heading-h2-size-mobile', '2rem'],
  ]);
});

test('heading utility binds font-size variables per breakpoint', () => {
  assert.deepEqual(setup.styles.filter((s) => s.class === 'heading-style-h1'), [
    { class: 'heading-style-h1', breakpoint: 'main', props: { 'font-family': 'Inter', 'font-weight': '700', 'line-height': '1.1', 'letter-spacing': '-0.02em' }, variables: { 'font-size': 'heading-h1-size' } },
    { class: 'heading-style-h1', breakpoint: 'small', props: {}, variables: { 'font-size': 'heading-h1-size-mobile' } },
  ]);
});

test('section padding uses spacing tokens and falls back to defaults', () => {
  assert.deepEqual(vars('Spacing').filter(([n]) => n.startsWith('section-')), [
    ['section-small', '3rem'], ['section-medium', '5rem'], ['section-medium-mobile', '3rem'], ['section-large', '8rem'], ['section-large-mobile', '4rem'],
  ]);
  assert.deepEqual(setup.styles.filter((s) => s.class === 'padding-section-large').map((s) => [s.breakpoint, s.variables['padding-top']]), [
    ['main', 'section-large'], ['small', 'section-large-mobile'],
  ]);
});

test('margin and padding size utilities come from space tokens', () => {
  assert.deepEqual(setup.styles.filter((s) => s.class === 'margin-md').map((s) => [s.breakpoint, s.variables['margin-top']]), [
    ['main', 'space-md'], ['small', 'space-md-mobile'],
  ]);
  assert.deepEqual(setup.styles.find((s) => s.class === 'margin-bottom').props, { 'margin-top': '0', 'margin-right': '0', 'margin-left': '0' });
});

test('button base and combos come from components.yaml', () => {
  const button = setup.styles.find((s) => s.class === 'button');
  assert.equal(button.variables['background-color'], 'brand-primary');
  assert.equal(button.variables.color, 'neutral-white');
  assert.equal(button.props['border-top-left-radius'], '0.5rem');
  const combo = setup.styles.find((s) => s.class === 'is-secondary');
  assert.equal(combo.comboOf, 'button');
  assert.equal(combo.variables.color, 'brand-primary');
});

test('hide utilities target their breakpoint', () => {
  assert.deepEqual(setup.styles.filter((s) => s.class.startsWith('hide-')).map((s) => [s.class, s.breakpoint]), [
    ['hide-tablet', 'medium'], ['hide-mobile-landscape', 'small'], ['hide-mobile-portrait', 'tiny'],
  ]);
});

test('every generated class is valid Client-First', () => {
  for (const name of setup.classes) assert.ok(validateClassName(name).ok, name);
  assert.ok(setup.classes.includes('page-wrapper'));
  assert.ok(setup.classes.includes('main-wrapper'));
});

test('every utility and variable a section plan uses exists in the setup plan', () => {
  const variableNames = new Set(setup.variables.map((v) => v.name));
  for (const section of spec.pages.home.sections) {
    const plan = planSection(spec, 'home', section.id);
    for (const utility of plan.utilitiesUsed) assert.ok(setup.classes.includes(utility), `${section.id}: ${utility}`);
    for (const style of plan.styles) {
      for (const variable of Object.values(style.variables)) assert.ok(variableNames.has(variable), `${section.id}: ${variable}`);
    }
  }
});

test('components to build exclude button', () => {
  assert.deepEqual(setup.components, ['card']);
});

test('CLI outputs ok plan', () => {
  const run = spawnSync(process.execPath, ['src/cli/plan-setup.mjs', VALID_SPEC], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).ok, true);
});

test('surfaces: card gets background, borders, radius and responsive padding', () => {
  const card = setup.styles.filter((s) => s.class === 'surface-card');
  assert.deepEqual(card.map((s) => s.breakpoint), ['main', 'small']);
  const main = card[0];
  assert.equal(main.variables['background-color'], 'neutral-glass');
  assert.equal(main.props['border-top-width'], '2px');
  assert.equal(main.props['border-left-style'], 'solid');
  assert.equal(main.variables['border-right-color'], 'neutral-border-strong');
  assert.equal(main.props['border-top-left-radius'], '2.5rem');
  assert.equal(main.props.overflow, 'hidden');
  assert.equal(main.variables['padding-left'], 'space-lg');
  assert.equal(main.variables['padding-top'], 'space-md');
  assert.deepEqual(card[1].props, {});
  assert.deepEqual(card[1].variables, { 'padding-top': 'space-md-mobile', 'padding-bottom': 'space-md-mobile' });
});

test('surfaces: pill without padding has a single main style', () => {
  const pill = setup.styles.filter((s) => s.class === 'surface-pill');
  assert.equal(pill.length, 1);
  assert.equal(pill[0].props['border-top-left-radius'], '0.5rem');
  assert.equal(pill[0].props['border-top-width'], undefined);
  assert.ok(setup.classes.includes('surface-pill'));
});

test('final review 1.1: every surface used by a plan exists in the setup classes', () => {
  for (const section of spec.pages.home.sections) {
    const plan = planSection(spec, 'home', section.id);
    for (const cls of plan.utilitiesUsed.filter((u) => u.startsWith('surface-'))) assert.ok(setup.classes.includes(cls), cls);
  }
});

test('page: page-wrapper gets base background, color and text', () => {
  const wrapper = setup.styles.filter((s) => s.class === 'page-wrapper');
  assert.equal(wrapper.length, 1);
  assert.deepEqual(wrapper[0].props, { 'font-family': 'Inter', 'font-weight': '400', 'line-height': '1.5' });
  assert.deepEqual(wrapper[0].variables, { 'background-color': 'neutral-white', color: 'neutral-black', 'font-size': 'text-regular-size' });
});
