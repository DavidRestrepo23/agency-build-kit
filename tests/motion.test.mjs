import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { validateSpec } from '../src/lib/validate-spec.mjs';
import { planMotion } from '../src/lib/plan-motion.mjs';
import { MOTION_PRESETS } from '../src/lib/motion-presets.mjs';
import { copyFixture } from './helpers.mjs';

function withMotion(motion) {
  const dir = copyFixture();
  writeFileSync(join(dir, 'motion.yaml'), stringify(motion));
  return dir;
}

const MOTION = {
  intensity: 'subtle',
  references: [{ url: 'https://example.com/ref', note: 'soft lift on CTAs' }],
  effects: [
    { id: 'cta-hover', preset: 'hover-lift', targets: ['button'] },
    { id: 'card-zoom', preset: 'hover-image-zoom', targets: ['hero_image'] },
    { id: 'hero-intro', preset: 'load-fade-up', targets: ['hero_component'] },
    { id: 'reveal', preset: 'scroll-stagger-children', targets: ['features_grid'], stagger: 0.1 },
  ],
};

test('motion.yaml is optional and loaded when present', () => {
  assert.equal(loadSpec(copyFixture()).motion, null);
  assert.equal(loadSpec(withMotion(MOTION)).motion.effects.length, 4);
  assert.deepEqual(validateSpec(loadSpec(withMotion(MOTION))).errors, []);
});

test('motion validation: unknown preset, bad class, duplicate id', () => {
  const errors = validateSpec(loadSpec(withMotion({ ...MOTION, effects: [
    { id: 'a', preset: 'spin-forever', targets: ['button'] },
    { id: 'a', preset: 'hover-lift', targets: ['Hero Button'] },
  ] }))).errors;
  assert.ok(errors.some((e) => e.file === 'motion.yaml' && /unknown preset "spin-forever"/.test(e.message)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /"Hero Button"/.test(e.message)));
  assert.ok(errors.some((e) => /duplicate effect id "a"/.test(e.message)));
});

test('every preset only animates transform, opacity, filter, box-shadow or text-decoration (no layout shift)', () => {
  const allowed = /^(transform|opacity|filter|box-shadow|text-decoration-line|text-underline-offset|transition)$/;
  for (const [name, p] of Object.entries(MOTION_PRESETS)) {
    for (const prop of Object.keys({ ...p.base, ...p.hover })) assert.match(prop, allowed, `${name}: ${prop}`);
    for (const prop of Object.keys(p.from ?? {})) assert.match(prop, /^(opacity|y|x|scale)$/, `${name}: ${prop}`);
  }
});

test('planMotion: hover presets become base transition + hover state styles; scroll/load become IX3 entries with data-anim', () => {
  const plan = planMotion(loadSpec(withMotion(MOTION)));
  const lift = plan.styles.filter((s) => s.class === 'button');
  assert.deepEqual(lift.map((s) => s.state ?? 'none'), ['none', 'hover']);
  assert.match(lift[0].props.transition, /transform/);
  assert.equal(lift[1].props.transform, 'translateY(-2px)');
  assert.ok(plan.styles.some((s) => s.class === 'hero_image' && s.state === 'hover' && /scale/.test(s.props.transform)));
  assert.deepEqual(plan.attributes, [
    { targetClass: 'hero_component', name: 'data-anim', value: 'hero-intro' },
    { targetClass: 'features_grid', name: 'data-anim', value: 'reveal' },
  ]);
  const reveal = plan.interactions.find((i) => i.id === 'reveal');
  assert.deepEqual([reveal.trigger, reveal.selector, reveal.target, reveal.stagger, reveal.reducedMotion], ['scroll', '[data-anim="reveal"]', 'children', 0.1, 'skip-to-end']);
  assert.equal(plan.interactions.find((i) => i.id === 'hero-intro').trigger, 'load');
});

test('CLI plan-motion', () => {
  const run = spawnSync(process.execPath, ['src/cli/plan-motion.mjs', withMotion(MOTION)], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
  assert.equal(JSON.parse(run.stdout).interactions.length, 2);
});
