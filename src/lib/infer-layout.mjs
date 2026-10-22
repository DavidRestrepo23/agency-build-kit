// Infers an auto-layout equivalent from absolute positions in Figma get_metadata XML,
// so designs without auto layout still produce a site-spec layout.

const TOL = 2;             // px tolerance for alignment
const TOKEN_TOL = 1;       // px a gap may differ from a spacing token and still count as that token
const BETWEEN_MIN = 64;    // a uniform gap this large with symmetric padding reads as space-between
const DECORATIVE_TAGS = new Set(['ellipse', 'line']);
const DECORATIVE_NAME = /^(ellipse|glow|blur|decor|shape)\b|(^|[\s_-])(bg|background)([\s_-]|$)/i;
const LEAF_TAGS = new Set(['text', 'vector', 'ellipse', 'line', 'rounded-rectangle', 'rectangle', 'star', 'polygon']);

const unescape = (s) => s
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function parseMetadata(xml) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  for (const [, close, tag, attrs, selfClose] of String(xml).matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    if (close) { stack.pop(); continue; }
    const a = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, unescape(v)]));
    const node = {
      id: a.id, tag, name: a.name ?? '',
      x: Number(a.x ?? 0), y: Number(a.y ?? 0), width: Number(a.width ?? 0), height: Number(a.height ?? 0),
      hidden: a.hidden === 'true', children: [],
    };
    stack.at(-1).children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root.children.length === 1 ? root.children[0] : root.children[0] ?? null;
}

const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
const round = (n) => Math.round(n * 10) / 10;

// Figma groups keep their children in the parent's coordinate space.
function localChildren(node) {
  const kids = node.children.filter((c) => !c.hidden);
  const fits = (dx, dy) => kids.every((c) => c.x - dx >= -TOL && c.y - dy >= -TOL
    && c.x - dx + c.width <= node.width + TOL && c.y - dy + c.height <= node.height + TOL);
  const shift = !fits(0, 0) && fits(node.x, node.y);
  return kids.map((c) => (shift ? { ...c, x: c.x - node.x, y: c.y - node.y } : c));
}

function isDecorative(c, node) {
  if (DECORATIVE_TAGS.has(c.tag) || DECORATIVE_NAME.test(c.name)) return true;
  const outX = Math.max(0, -c.x) + Math.max(0, c.x + c.width - node.width);
  const outY = Math.max(0, -c.y) + Math.max(0, c.y + c.height - node.height);
  return outX > c.width * 0.1 || outY > c.height * 0.1;
}

// True when the boxes, sorted on one axis, never overlap on it.
function sequential(kids, pos, size) {
  const sorted = [...kids].sort((a, b) => a[pos] - b[pos]);
  for (let i = 1; i < sorted.length; i++) if (sorted[i][pos] < sorted[i - 1][pos] + sorted[i - 1][size] - TOL) return null;
  return sorted;
}

function gapsOf(sorted, pos, size) {
  return sorted.slice(1).map((c, i) => round(c[pos] - (sorted[i][pos] + sorted[i][size])));
}

function gapConfidence(gaps) {
  if (!gaps.length) return { level: 'high' };
  const spread = Math.max(...gaps) - Math.min(...gaps);
  if (spread <= TOL) return { level: 'high' };
  if (spread <= 8 || spread <= median(gaps) * 0.15) return { level: 'medium', reason: `gaps vary ${gaps.join('/')}px` };
  return { level: 'low', reason: `gaps too uneven (${gaps.join('/')}px)` };
}

function gapToken(px, spacing) {
  let best = null;
  for (const [name, value] of Object.entries(spacing ?? {})) {
    if (!name.startsWith('space.')) continue;
    const v = typeof value === 'number' ? value : value?.desktop;
    if (typeof v !== 'number') continue;
    if (!best || Math.abs(v - px) < Math.abs(best.value - px)) best = { name, value: v };
  }
  if (!best) return { token: null, reason: `gap ${px}px has no spacing token` };
  if (near(best.value, px, TOKEN_TOL)) return { token: best.name };
  return { token: best.name, reason: `gap ${px}px has no token; nearest ${best.name} (${best.value}px)` };
}

function crossAlign(kids, pos, size) {
  if (kids.every((c) => near(c[pos], kids[0][pos]))) return 'flex-start';
  const centers = kids.map((c) => c[pos] + c[size] / 2);
  if (centers.every((v) => near(v, centers[0]))) return 'center';
  if (kids.every((c) => near(c[pos] + c[size], kids[0][pos] + kids[0][size]))) return 'flex-end';
  return null;
}

function rank(levels) {
  return levels.includes('low') ? 'low' : levels.includes('medium') ? 'medium' : 'high';
}

export function inferLayout(node, spacing = {}) {
  const all = localChildren(node);
  const decorative = all.filter((c) => isDecorative(c, node));
  const kids = all.filter((c) => !decorative.includes(c));
  const base = { figmaNode: node.id, name: node.name, decorative: decorative.map((c) => c.id), reasons: [] };
  if (kids.length < 2) return { ...base, layout: kids.length ? { type: 'stack' } : null, padding: null, gapPx: null, confidence: kids.length ? 'high' : 'low' };

  const padding = {
    top: round(Math.min(...kids.map((c) => c.y))),
    right: round(node.width - Math.max(...kids.map((c) => c.x + c.width))),
    bottom: round(node.height - Math.max(...kids.map((c) => c.y + c.height))),
    left: round(Math.min(...kids.map((c) => c.x))),
  };
  const levels = [];
  const withGap = (layout, gaps) => {
    const conf = gapConfidence(gaps);
    levels.push(conf.level);
    if (conf.reason) base.reasons.push(conf.reason);
    const gapPx = gaps.length ? median(gaps) : null;
    if (gapPx !== null) {
      const t = gapToken(gapPx, spacing);
      if (t.reason) { base.reasons.push(t.reason); levels.push('medium'); }
      if (t.token) layout.gap = t.token;
    }
    return gapPx;
  };

  const row = sequential(kids, 'x', 'width');
  const col = row ? null : sequential(kids, 'y', 'height');
  if (row) {
    const gaps = gapsOf(row, 'x', 'width');
    const layout = { type: 'flex', direction: 'row' };
    const align = crossAlign(kids, 'y', 'height');
    if (align) layout.align = align; else { levels.push('medium'); base.reasons.push('children not aligned vertically'); }
    const symmetric = near(padding.left, padding.right);
    const conf = gapConfidence(gaps);
    let gapPx = median(gaps);
    if (symmetric && conf.level === 'high' && gapPx >= BETWEEN_MIN) {
      layout.justify = 'space-between';
      levels.push('high');
    } else {
      gapPx = withGap(layout, gaps);
      if (symmetric && padding.left > TOL) layout.justify = 'center';
    }
    return { ...base, layout, padding, gapPx, confidence: rank(levels) };
  }
  if (col) {
    const gaps = gapsOf(col, 'y', 'height');
    const layout = { type: 'stack' };
    const gapPx = withGap(layout, gaps);
    const centers = kids.map((c) => c.x + c.width / 2);
    let align;
    if (kids.every((c) => near(c.x, kids[0].x))) align = near(kids[0].x * 2 + kids[0].width, node.width) && kids.every((c) => near(c.width, kids[0].width)) && kids[0].x > TOL ? 'center' : 'flex-start';
    else if (centers.every((v) => near(v, centers[0]))) align = 'center';
    else if (kids.every((c) => near(c.x + c.width, kids[0].x + kids[0].width))) align = 'flex-end';
    if (align) layout.align = align; else { levels.push('medium'); base.reasons.push('children not aligned horizontally'); }
    return { ...base, layout, padding, gapPx, confidence: rank(levels) };
  }

  // Grid: rows of boxes that do not overlap horizontally, same column count, similar widths.
  const rows = [];
  for (const c of [...kids].sort((a, b) => a.y - b.y)) {
    const r = rows.find((rw) => near(rw[0].y, c.y, 4));
    if (r) r.push(c); else rows.push([c]);
  }
  const sortedRows = rows.map((r) => sequential(r, 'x', 'width'));
  const columns = Math.max(...rows.map((r) => r.length));
  const widthsEqual = kids.every((c) => near(c.width, kids[0].width, 4));
  if (rows.length > 1 && sortedRows.every(Boolean) && columns > 1 && widthsEqual && rows.slice(0, -1).every((r) => r.length === columns)) {
    const colGaps = sortedRows.flatMap((r) => gapsOf(r, 'x', 'width'));
    const rowGaps = rows.slice(1).map((r, i) => round(r[0].y - (rows[i][0].y + rows[i][0].height)));
    const layout = { type: 'grid', columns };
    const gapPx = withGap(layout, colGaps);
    if (!near(median(rowGaps), gapPx)) { levels.push('medium'); base.reasons.push(`row gap ${median(rowGaps)}px differs from column gap ${gapPx}px`); }
    return { ...base, layout, padding, gapPx, confidence: rank(levels) };
  }

  base.reasons.push('children overlap or follow no row/column/grid pattern — needs a manual layout');
  return { ...base, layout: null, padding, gapPx: null, confidence: 'low' };
}

// Every container with two or more visible children, depth first.
export function inferTree(xml, spacing = {}) {
  const root = typeof xml === 'string' ? parseMetadata(xml) : xml;
  const out = [];
  const visit = (node) => {
    if (!node || LEAF_TAGS.has(node.tag)) return;
    const visible = node.children.filter((c) => !c.hidden);
    if (visible.length >= 2) out.push(inferLayout(node, spacing));
    for (const c of visible) visit(c);
  };
  visit(root);
  return out;
}
