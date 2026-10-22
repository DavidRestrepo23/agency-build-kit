import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMetadata, inferLayout, inferTree } from '../src/lib/infer-layout.mjs';
import { VALID_SPEC } from './helpers.mjs';

const SPACING = { 'space.sm': 16, 'space.md': 24, 'space.lg': 32, 'space.xl': 48 };

const frame = (attrs, children = '') => `<frame ${attrs}>${children}</frame>`;
const text = (id, x, y, w, h) => `<text id="${id}" name="t${id}" x="${x}" y="${y}" width="${w}" height="${h}" />`;
const box = (id, x, y, w, h, tag = 'frame', name = `b${id}`) => `<${tag} id="${id}" name="${name}" x="${x}" y="${y}" width="${w}" height="${h}" />`;

function infer(xml) {
  return inferLayout(parseMetadata(xml), SPACING);
}

test('parseMetadata builds the tree and unescapes names', () => {
  const root = parseMetadata(frame('id="1:1" name="CTA&#39;s &amp; more" x="0" y="0" width="10" height="20"', text('1:2', 1, 2, 3, 4)));
  assert.equal(root.name, "CTA's & more");
  assert.equal(root.children[0].id, '1:2');
  assert.deepEqual([root.children[0].x, root.children[0].height], [1, 4]);
});

test('vertical stack with uniform gaps maps to the nearest spacing token, high confidence', () => {
  const r = infer(frame('id="1:1" name="Col" x="0" y="0" width="600" height="248"',
    text('1:2', 40, 40, 300, 40) + text('1:3', 40, 104, 300, 40) + text('1:4', 40, 168, 300, 40)));
  assert.deepEqual(r.layout, { type: 'stack', gap: 'space.md', align: 'flex-start' });
  assert.equal(r.gapPx, 24);
  assert.deepEqual(r.padding, { top: 40, right: 260, bottom: 40, left: 40 });
  assert.equal(r.confidence, 'high');
});

test('horizontal row with big symmetric gaps is space-between, vertically centered', () => {
  const r = infer(frame('id="2:1" name="header" x="0" y="0" width="1440" height="115"',
    box('2:2', 96, 24, 420, 67) + box('2:3', 609.5, 31.5, 221, 52) + box('2:4', 924, 30.5, 420, 54)));
  assert.deepEqual(r.layout, { type: 'flex', direction: 'row', align: 'center', justify: 'space-between' });
  assert.deepEqual([r.padding.left, r.padding.right], [96, 96]);
  assert.equal(r.confidence, 'high');
});

test('equal boxes in rows become a grid', () => {
  const cards = [24, 432, 840].flatMap((x, i) => [box(`3:${i + 2}`, x, 24, 384, 245), box(`3:${i + 5}`, x, 293, 384, 245)]).join('');
  const r = infer(frame('id="3:1" name="Cards" x="0" y="0" width="1248" height="562"', cards));
  assert.deepEqual(r.layout, { type: 'grid', columns: 3, gap: 'space.md' });
  assert.equal(r.confidence, 'high');
});

test('slightly uneven gaps lower the confidence; very uneven gaps are low', () => {
  const col = (gaps) => {
    let y = 0;
    const kids = [text('4:2', 0, 0, 100, 20)];
    gaps.forEach((g, i) => { y += 20 + g; kids.push(text(`4:${i + 3}`, 0, y, 100, 20)); });
    return infer(frame(`id="4:1" name="Col" x="0" y="0" width="100" height="${y + 20}"`, kids.join('')));
  };
  assert.equal(col([24, 25, 26]).confidence, 'high');
  assert.equal(col([24, 28, 30]).confidence, 'medium');
  assert.equal(col([24, 31, 48]).confidence, 'low');
});

test('gap without a matching token keeps the nearest token and says so', () => {
  const r = infer(frame('id="5:1" name="Col" x="0" y="0" width="100" height="100"', text('5:2', 0, 0, 100, 35) + text('5:3', 0, 65, 100, 35)));
  assert.equal(r.layout.gap, 'space.lg');
  assert.equal(r.confidence, 'medium');
  assert.ok(r.reasons.some((m) => /30px.*space\.lg \(32px\)/.test(m)), r.reasons.join(' | '));
});

test('ellipses and children bleeding out of the frame are decorative and ignored for layout', () => {
  const r = infer(frame('id="6:1" name="Hero" x="0" y="0" width="1440" height="600"',
    box('6:2', -207, 100, 566, 566, 'ellipse', 'Ellipse 3') + text('6:3', 420, 100, 600, 80) + text('6:4', 420, 204, 600, 40) + box('6:5', 1300, -50, 200, 200, 'frame', 'sticker')));
  assert.deepEqual(r.decorative, ['6:2', '6:5']);
  assert.equal(r.layout.type, 'stack');
  assert.equal(r.layout.align, 'center');
});

test('overlapping content children cannot be laid out: low confidence, no layout', () => {
  const r = infer(frame('id="7:1" name="Collage" x="0" y="0" width="1000" height="500"',
    box('7:2', 0, 100, 400, 400) + box('7:3', 250, 60, 380, 420) + box('7:4', 500, 80, 360, 400)));
  assert.equal(r.layout, null);
  assert.equal(r.confidence, 'low');
  assert.ok(r.reasons.some((m) => /overlap/.test(m)));
});

test('group children in parent coordinates are normalised', () => {
  const r = infer(frame('id="8:1" name="Group 60" x="40" y="253" width="147" height="167"',
    box('8:2', 40, 253, 98, 40) + box('8:3', 40, 317, 98, 40) + box('8:4', 40, 381, 98, 40)));
  assert.equal(r.layout.type, 'stack');
  assert.equal(r.gapPx, 24);
  assert.equal(r.padding.top, 0);
});

test('inferTree reports every container with two or more children, depth first', () => {
  const xml = frame('id="9:1" name="Section" x="0" y="0" width="800" height="400"',
    frame('id="9:2" name="Row" x="0" y="0" width="800" height="100"', box('9:3', 0, 0, 340, 100) + box('9:4', 460, 0, 340, 100))
    + text('9:5', 0, 140, 800, 60));
  const frames = inferTree(xml, SPACING);
  assert.deepEqual(frames.map((f) => f.figmaNode), ['9:1', '9:2']);
  assert.equal(frames[1].layout.justify, 'space-between');
});

test('CLI reads a metadata file and the spec spacing tokens', () => {
  const dir = mkdtempSync(join(tmpdir(), 'infer-'));
  const file = join(dir, 'meta.xml');
  writeFileSync(file, frame('id="1:1" name="Col" x="0" y="0" width="100" height="100"', text('1:2', 0, 0, 100, 34) + text('1:3', 0, 66, 100, 34)));
  const run = spawnSync(process.execPath, ['src/cli/infer-layout.mjs', file, '--spec', VALID_SPEC], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.frames[0].layout.gap, 'space.lg');
});
