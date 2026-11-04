// Headless asset upload for the Webflow MCP (no Designer needed):
//   1. node asset-upload.mjs md5 <file>             → name, size, md5, contentType for data_assets_tool create_asset
//                                                     (or data_fonts_tool create_font)
//   2. save the upload part of that response as JSON ({ uploadUrl, uploadDetails } or { url, fields })
//   3. node asset-upload.mjs upload <file> <response.json> → POST multipart to the signed URL (expires in minutes)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

const print = (result) => {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
};

const [command, file, responseFile] = process.argv.slice(2);
try {
  if (!file || !['md5', 'upload'].includes(command)) throw new Error('usage: asset-upload md5 <file> | upload <file> <response.json>');
  const data = readFileSync(file);
  const name = basename(file);
  const contentType = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  if (command === 'md5') {
    print({ ok: true, name, size: data.length, md5: createHash('md5').update(data).digest('hex'), contentType });
  } else {
    if (!responseFile) throw new Error('usage: asset-upload upload <file> <response.json>');
    const response = JSON.parse(readFileSync(responseFile, 'utf8'));
    const url = response.uploadUrl ?? response.url;
    const fields = response.uploadDetails ?? response.fields ?? {};
    if (!url) throw new Error('response JSON needs uploadUrl (or url)');
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    form.append('file', new Blob([data], { type: fields['Content-Type'] ?? contentType }), name);
    const res = await fetch(url, { method: 'POST', body: form });
    const ok = res.status >= 200 && res.status < 300;
    print({ ok, name, status: res.status, ...(ok ? {} : { error: (await res.text()).slice(0, 400) }) });
  }
} catch (err) {
  print({ ok: false, errors: [{ path: '/', message: err.message }] });
}
