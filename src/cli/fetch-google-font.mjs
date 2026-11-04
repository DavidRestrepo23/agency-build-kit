// Downloads a Google Fonts family (latin, woff2) for upload to Webflow with data_fonts_tool create_font.
// usage: fetch-google-font <family> <weights e.g. 400,500,700> <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCliAsync } from '../lib/cli.mjs';
import { GOOGLE_CSS_BASE, googleCssUrl, parseGoogleFontsCss } from '../lib/google-fonts.mjs';

// A modern browser user agent makes the CSS2 API answer with woff2 files.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

await runCliAsync(async (argv) => {
  const [family, weightsArg, outDir] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--css-base');
  if (!family || !weightsArg || !outDir) throw new Error('usage: fetch-google-font <family> <weights> <out-dir>');
  const baseIndex = argv.indexOf('--css-base');
  const base = baseIndex >= 0 ? argv[baseIndex + 1] : GOOGLE_CSS_BASE;
  const weights = weightsArg.split(',').map(Number);
  const res = await fetch(googleCssUrl(family, weights, base), { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS ${res.status} for "${family}" — check the family name`);
  const faces = parseGoogleFontsCss(await res.text()).filter((f) => f.style === 'normal');
  const missing = weights.filter((w) => !faces.some((f) => f.weight === w));
  if (missing.length) throw new Error(`weights not available for "${family}": ${missing.join(', ')}`);
  mkdirSync(outDir, { recursive: true });
  const slug = family.trim().toLowerCase().replace(/\s+/g, '-');
  // Google serves variable families as one file for every weight: download it once.
  const byUrl = new Map();
  for (const face of faces) byUrl.set(face.url, [...(byUrl.get(face.url) ?? []), face.weight]);
  const files = [];
  for (const [url, ws] of byUrl) {
    const variable = ws.length > 1;
    const file = join(outDir, `${slug}-${variable ? 'variable' : ws[0]}.woff2`);
    const font = await fetch(url);
    if (!font.ok) throw new Error(`download ${url}: ${font.status}`);
    writeFileSync(file, Buffer.from(await font.arrayBuffer()));
    files.push({ weights: ws, variable, file });
  }
  return { ok: true, family, license: 'Google Fonts (SIL Open Font License) — confirm for non-Google families', files };
});
