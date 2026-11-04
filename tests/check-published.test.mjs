import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const HTML = `<!DOCTYPE html><!-- Last Published: Tue Nov 04 2026 15:02:11 GMT+0000 (Coordinated Universal Time) -->
<html class="w-mod-ix3"><body><section id="hero" class="section_hero"><div data-anim="marquee"></div></section>
<script src="https://cdn.prod.website-files.com/gsap/3.12/gsap.min.js"></script></body></html>`;

async function run(args) {
  let seen = '';
  const server = createServer((req, res) => { seen = req.url; res.end(HTML); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const child = spawn(process.execPath, ['src/cli/check-published.mjs', `http://127.0.0.1:${server.address().port}/`, ...args]);
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  const code = await new Promise((r) => child.on('close', r));
  server.close();
  return { code, out: JSON.parse(out), seen };
}

test('reads the published HTML without cache: date, markers, scripts, IX3', async () => {
  const { code, out, seen } = await run(['section_hero', 'data-anim="marquee"']);
  assert.equal(code, 0);
  assert.match(seen, /\?nc=\d+/);
  assert.equal(out.lastPublished, 'Tue Nov 04 2026 15:02:11 GMT+0000 (Coordinated Universal Time)');
  assert.deepEqual(out.markers, { section_hero: 1, 'data-anim="marquee"': 1 });
  assert.deepEqual(out.missing, []);
  assert.equal(out.ix3, true);
  assert.deepEqual(out.scripts, ['https://cdn.prod.website-files.com/gsap/3.12/gsap.min.js']);
});

test('a missing marker fails', async () => {
  const { code, out } = await run(['section_pricing']);
  assert.equal(code, 1);
  assert.deepEqual(out.missing, ['section_pricing']);
});
