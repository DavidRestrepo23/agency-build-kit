import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'asset-'));
const file = join(dir, 'hero-mockup@2x.png');
writeFileSync(file, 'hello');

test('md5 reports name, size, md5 and content type for create_asset', () => {
  const run = spawnSync(process.execPath, ['src/cli/asset-upload.mjs', 'md5', file], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
  assert.deepEqual(JSON.parse(run.stdout), {
    ok: true, name: 'hero-mockup@2x.png', size: 5, md5: '5d41402abc4b2a76b9719d911017c592', contentType: 'image/png',
  });
});

test('upload posts the file as multipart with the signed fields (Webflow response shape)', async () => {
  let body = '';
  const server = createServer((req, res) => {
    req.on('data', (c) => { body += c; });
    req.on('end', () => { res.statusCode = 201; res.end(); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const response = join(dir, 'response.json');
  writeFileSync(response, JSON.stringify({ uploadUrl: `http://127.0.0.1:${server.address().port}/`, uploadDetails: { key: 'abc/hero.png', 'Content-Type': 'image/png' } }));
  const child = spawn(process.execPath, ['src/cli/asset-upload.mjs', 'upload', file, response]);
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  const code = await new Promise((r) => child.on('close', r));
  server.close();
  assert.equal(code, 0, out);
  assert.equal(JSON.parse(out).status, 201);
  assert.match(body, /name="key"\r\n\r\nabc\/hero\.png/);
  assert.match(body, /filename="hero-mockup@2x\.png"/);
  assert.match(body, /hello/);
});
