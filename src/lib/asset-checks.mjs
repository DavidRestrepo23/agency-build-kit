import { inflateSync } from 'node:zlib';

// Reads a PNG and reports whether it has an alpha channel and the alpha of its four corners.
// Supports 8-bit, non-interlaced images (what Figma exports); returns null corners otherwise.
export function pngAlpha(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const [depth, colorType, , , interlace] = buf.subarray(24, 29);
  const hasAlpha = colorType === 6 || colorType === 4;
  if (!hasAlpha || depth !== 8 || interlace !== 0) return { width, height, hasAlpha, corners: null };
  const idat = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 2;
  const stride = width * bpp;
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c;
      const pred = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1
        : filter === 4 ? (Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c) : 0;
      line[i] = (line[i] + pred) & 0xff;
    }
    rows.push(line);
    prev = line;
  }
  const alphaAt = (x, y) => rows[y][x * bpp + bpp - 1];
  return { width, height, hasAlpha, corners: [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)] };
}

export function svgIssues(text) {
  const issues = [];
  if (!/<svg[^>]*\sviewBox=/i.test(text)) issues.push('has no viewBox (it will not scale)');
  if (/<image[\s>]/i.test(text)) issues.push('has an embedded raster <image> (not a real vector)');
  return issues;
}
