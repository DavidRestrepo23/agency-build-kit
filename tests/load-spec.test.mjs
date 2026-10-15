import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSpec, SpecLoadError } from '../src/lib/load-spec.mjs';
import { VALID_SPEC, copyFixture } from './helpers.mjs';

test('loads every spec file', () => {
  const spec = loadSpec(VALID_SPEC);
  assert.equal(spec.project.name, 'fixture-site');
  assert.deepEqual(Object.keys(spec.pages), ['home']);
  assert.equal(spec.assets.assets.length, 2);
  assert.equal(spec.components.components.length, 2);
  assert.equal(spec.buildState, null);
  assert.match(spec.openQuestions, /\[x\]/);
});

test('missing required file throws SpecLoadError naming the file', () => {
  const dir = copyFixture();
  rmSync(join(dir, 'tokens.yaml'));
  assert.throws(() => loadSpec(dir), (err) => err instanceof SpecLoadError && err.file === 'tokens.yaml');
});

test('invalid YAML throws SpecLoadError naming the file', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'tokens.yaml'), 'colors: [\n');
  assert.throws(
    () => loadSpec(dir),
    (err) => err instanceof SpecLoadError && err.file === 'tokens.yaml' && /invalid YAML/.test(err.message),
  );
});

test('missing directory throws SpecLoadError', () => {
  assert.throws(() => loadSpec('/nonexistent/site-spec'), SpecLoadError);
});

test('reads build-state.json when present', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'build-state.json'), '{"webflow":{}}');
  assert.deepEqual(loadSpec(dir).buildState, { webflow: {} });
});
