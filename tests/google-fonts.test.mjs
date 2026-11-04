import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { googleCssUrl, parseGoogleFontsCss } from '../src/lib/google-fonts.mjs';

const CSS = `/* cyrillic-ext */
@font-face {
  font-family: 'Plus Jakarta Sans';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/pjs/v8/cyr.woff2) format('woff2');
  unicode-range: U+0460-052F;
}
/* latin */
@font-face {
  font-family: 'Plus Jakarta Sans';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/pjs/v8/latin-400.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
/* latin */
@font-face {
  font-family: 'Plus Jakarta Sans';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/pjs/v8/latin-700.woff2) format('woff2');
}`;

test('googleCssUrl asks the CSS2 API for the exact weights', () => {
  assert.equal(googleCssUrl('Plus Jakarta Sans', [700, 400, 500]),
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700&display=swap');
});

test('parseGoogleFontsCss keeps the latin subset, one file per weight', () => {
  assert.deepEqual(parseGoogleFontsCss(CSS), [
    { family: 'Plus Jakarta Sans', weight: 400, style: 'normal', subset: 'latin', url: 'https://fonts.gstatic.com/s/pjs/v8/latin-400.woff2' },
    { family: 'Plus Jakarta Sans', weight: 700, style: 'normal', subset: 'latin', url: 'https://fonts.gstatic.com/s/pjs/v8/latin-700.woff2' },
  ]);
});

test('CLI downloads every weight as <family>-<weight>.woff2', async () => {
  const server = createServer((req, res) => {
    if (req.url.startsWith('/css2')) {
      const base = `http://127.0.0.1:${server.address().port}`;
      res.end(CSS.replaceAll('https://fonts.gstatic.com', base));
    } else res.end(`font:${req.url}`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const out = mkdtempSync(join(tmpdir(), 'fonts-'));
  const child = spawn(process.execPath, ['src/cli/fetch-google-font.mjs', 'Plus Jakarta Sans', '400,700', out,
    '--css-base', `http://127.0.0.1:${server.address().port}`]);
  let stdout = '';
  child.stdout.on('data', (c) => { stdout += c; });
  const code = await new Promise((r) => child.on('close', r));
  server.close();
  assert.equal(code, 0, stdout);
  assert.deepEqual(readdirSync(out).sort(), ['plus-jakarta-sans-400.woff2', 'plus-jakarta-sans-700.woff2']);
  assert.equal(readFileSync(join(out, 'plus-jakarta-sans-700.woff2'), 'utf8'), 'font:/s/pjs/v8/latin-700.woff2');
  assert.deepEqual(JSON.parse(stdout).files.map((f) => [f.weights, f.variable]), [[[400], false], [[700], false]]);
});

test('variable fonts (same file for every weight) are downloaded once', async () => {
  const VAR = CSS.replaceAll('latin-400.woff2', 'latin-var.woff2').replaceAll('latin-700.woff2', 'latin-var.woff2');
  const server = createServer((req, res) => {
    if (req.url.startsWith('/css2')) res.end(VAR.replaceAll('https://fonts.gstatic.com', `http://127.0.0.1:${server.address().port}`));
    else res.end('var');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const out = mkdtempSync(join(tmpdir(), 'fonts-'));
  const child = spawn(process.execPath, ['src/cli/fetch-google-font.mjs', 'Plus Jakarta Sans', '400,700', out, '--css-base', `http://127.0.0.1:${server.address().port}`]);
  let stdout = '';
  child.stdout.on('data', (c) => { stdout += c; });
  await new Promise((r) => child.on('close', r));
  server.close();
  assert.deepEqual(readdirSync(out), ['plus-jakarta-sans-variable.woff2']);
  assert.deepEqual(JSON.parse(stdout).files, [{ weights: [400, 700], variable: true, file: join(out, 'plus-jakarta-sans-variable.woff2') }]);
});
