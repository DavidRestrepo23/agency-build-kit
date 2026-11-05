import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { validateSpec } from '../src/lib/validate-spec.mjs';
import { planComponent } from '../src/lib/plan-component.mjs';
import { validateClassName } from '../src/lib/class-names.mjs';
import { VALID_SPEC, copyFixture, editYaml } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);
const nav = planComponent(spec, 'navbar');
const errorsFor = (dir) => validateSpec(loadSpec(dir)).errors;

test('component: root uses the declared tag and folder-prefixed classes', () => {
  assert.ok(nav.whtml.startsWith('<nav class="navbar_component">'), nav.whtml);
  assert.ok(nav.whtml.includes('<div class="navbar_menu"><a class="navbar_link" href="/">Inicio</a><a class="navbar_link" href="#contacto">Contacto</a></div>'));
  assert.ok(nav.whtml.includes('<div class="navbar_icon"></div>'));
  assert.ok(nav.whtml.includes('<a class="button" href="#contact">Agendar</a>'));
  assert.ok(nav.whtml.endsWith('</nav>'));
  for (const name of [...nav.classesToCreate, ...nav.utilitiesUsed]) assert.ok(validateClassName(name).ok, name);
});

test('component: layout styles land on the root class', () => {
  const root = nav.styles.find((s) => s.class === 'navbar_component' && s.props.display);
  assert.deepEqual(root.props, { display: 'flex', 'flex-direction': 'row', 'align-items': 'center', 'justify-content': 'space-between' });
});

test('collapse: burger, menu hiding and click interaction for the chosen breakpoint', () => {
  assert.ok(nav.whtml.includes('<div class="navbar_burger"><div class="navbar_burger-bar"></div><div class="navbar_burger-bar"></div><div class="navbar_burger-bar"></div></div>'));
  const burger = nav.styles.filter((s) => s.class === 'navbar_burger');
  assert.deepEqual(burger.map((s) => [s.breakpoint, s.props.display]), [['main', 'none'], ['medium', 'flex']]);
  const menu = nav.styles.find((s) => s.class === 'navbar_menu' && s.breakpoint === 'medium');
  assert.equal(menu.props.display, 'none');
  assert.equal(menu.props.position, 'absolute');
  assert.ok(nav.styles.some((s) => s.class === 'navbar_component' && s.props.position === 'relative'));
  assert.deepEqual(nav.interactions, [{
    type: 'toggle-display', trigger: 'click', triggerClass: 'navbar_burger', targetClass: 'navbar_menu', display: 'flex', breakpoint: 'medium',
    note: 'click on navbar_burger toggles navbar_menu between display none and flex below the tablet breakpoint',
  }]);
});

test('component: unknown name throws', () => {
  assert.throws(() => planComponent(spec, 'ghost'), /unknown component "ghost"/);
});

test('report: component without children is accepted as an empty shell with a placeholder', () => {
  const plan = planComponent(spec, 'card');
  assert.equal(plan.whtml, '<div class="card_component"><div class="card_component-slot"></div></div>');
  assert.deepEqual(plan.classesToCreate, ['card_component', 'card_component-slot']);
  assert.equal(plan.placeholders.length, 1);
  assert.equal(plan.placeholders[0].type, 'component-content');
  assert.match(plan.placeholders[0].description, /card.*no children.*2:10/);
});

test('validation: fixture with a buildable navbar is valid', () => {
  assert.deepEqual(validateSpec(spec).errors, []);
});

test('validation: collapse requires a group named menu', () => {
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => { c.components[2].children[0].name = 'links'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/components/2/collapse' && /requires a group named "menu"/.test(e.message)));
});

test('validation: components cannot contain other components except button', () => {
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => { c.components[2].children.push({ type: 'component', ref: 'card' }); });
  assert.ok(errorsFor(dir).some((e) => e.path === '/components/2/children/3' && /cannot contain other components/.test(e.message)));
});

test('validation: component children are cross-checked like page children', () => {
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => { c.components[2].children[1].asset = 'missing'; c.components[2].layout.gap = 'space.huge'; });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.file === 'components.yaml' && e.path === '/components/2/children/1/asset'));
  assert.ok(errors.some((e) => e.file === 'components.yaml' && e.path === '/components/2/layout/gap'));
});

test('CLI plan-component', () => {
  const run = spawnSync(process.execPath, ['src/cli/plan-component.mjs', VALID_SPEC, 'navbar'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
  assert.equal(JSON.parse(run.stdout).component, 'navbar');
});

test('qa: component overrides apply to the component own classes; plan has a specHash', async () => {
  const { copyFixture, editYaml } = await import('./helpers.mjs');
  const { loadSpec } = await import('../src/lib/load-spec.mjs');
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => {
    c.components.find((x) => x.name === 'navbar').overrides = { navbar_component: { main: { 'padding-top': '$space.md', 'justify-content': 'center' } } };
  });
  const s = loadSpec(dir);
  const plan = planComponent(s, 'navbar');
  const root = plan.styles.find((x) => x.class === 'navbar_component' && x.breakpoint === 'main');
  assert.equal(root.variables['padding-top'], 'space-md');
  assert.equal(root.props['justify-content'], 'center');
  assert.match(plan.specHash, /^sha256:/);
  assert.notEqual(plan.specHash, planComponent(spec, 'navbar').specHash, 'overrides change the hash');
});

test('shared: children marked prop/hrefProp get data-prop attributes and become component props', () => {
  const dir = copyFixture();
  editYaml(dir, 'components.yaml', (c) => {
    c.components.push({
      name: 'cta-band', figmaNode: '4:1', variants: [{ name: 'default' }], props: ['title', 'body', 'cta-text', 'cta-link', 'photo'],
      layout: { type: 'stack', gap: 'space.md' },
      children: [
        { type: 'heading', level: 2, style: 'heading.h2', text: 'Ready?', prop: 'title' },
        { type: 'text', style: 'text.regular', text: 'Talk to us.', prop: 'body' },
        { type: 'button', text: 'Book', href: '#contact', prop: 'cta-text', hrefProp: 'cta-link' },
        { type: 'image', asset: 'hero-mockup', alt: 'Team', ratio: '4/3', prop: 'photo' },
      ],
    });
  });
  const plan = planComponent(loadSpec(dir), 'cta-band');
  assert.ok(plan.whtml.includes('<h2 class="heading-style-h2" data-prop="title">Ready?</h2>'), plan.whtml);
  assert.ok(plan.whtml.includes('<a class="button" href="#contact" data-prop="cta-text" data-prop-href="cta-link">Book</a>'));
  assert.ok(plan.whtml.includes('data-prop="photo"'));
  assert.deepEqual(plan.props, [
    { name: 'title', kind: 'text', default: 'Ready?' },
    { name: 'body', kind: 'text', default: 'Talk to us.' },
    { name: 'cta-text', kind: 'text', default: 'Book' },
    { name: 'cta-link', kind: 'link', default: '#contact' },
    { name: 'photo', kind: 'image', default: 'hero-mockup' },
  ]);
});
