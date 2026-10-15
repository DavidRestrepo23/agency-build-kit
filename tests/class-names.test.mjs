import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateClassName } from '../src/lib/class-names.mjs';

const VALID = [
  ['section_hero', 'custom'],
  ['hero_image-wrapper', 'custom'],
  ['is-secondary', 'combo'],
  ['page-wrapper', 'utility'],
  ['padding-global', 'utility'],
  ['container-large', 'utility'],
  ['padding-section-large', 'utility'],
  ['heading-style-h1', 'utility'],
  ['text-size-large', 'utility'],
  ['text-color-brand-primary', 'utility'],
  ['background-color-neutral-white', 'utility'],
  ['margin-bottom', 'utility'],
  ['margin-lg', 'utility'],
  ['button', 'utility'],
  ['hide-mobile-portrait', 'utility'],
  ['surface-card', 'utility'],
  ['surface-cta-panel', 'utility'],
];

const INVALID = [
  ['', /non-empty/],
  ['Hero', /lowercase/],
  ['hero image', /spaces/],
  ['hero__image', /single underscore/],
  ['is-Secondary', /lowercase/],
  ['is-', /combo classes/],
  ['hero-image', /not a Client-First utility/],
  ['container-xl', /not a Client-First utility/],
  ['surface-', /not a Client-First utility/],
  ['surface_', /single underscore/],
];

for (const [name, kind] of VALID) {
  test(`valid: ${name}`, () => assert.deepEqual(validateClassName(name), { ok: true, kind }));
}

for (const [name, reason] of INVALID) {
  test(`invalid: "${name}"`, () => {
    const result = validateClassName(name);
    assert.equal(result.ok, false);
    assert.match(result.reason, reason);
  });
}

test('CLI exits 1 when any name is invalid', () => {
  const run = spawnSync(process.execPath, ['src/cli/validate-class-names.mjs', 'section_hero', 'Hero'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  const out = JSON.parse(run.stdout);
  assert.equal(out.ok, false);
  assert.deepEqual(out.results.map((r) => r.ok), [true, false]);
});
