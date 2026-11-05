// Finds sections repeated across pages (or within one) so the audit can turn them into shared
// components: built once in Webflow, placed as instances, edited in one place.
import { stableStringify } from './spec-hash.mjs';

const CONTENT_KEYS = new Set(['text', 'href', 'alt', 'asset', 'items', 'labels', 'url', 'trigger']);
const strip = ({ id, figmaNode, figmaComponent, ...rest }) => rest;

function mask(node) {
  if (Array.isArray(node)) return node.map(mask);
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, CONTENT_KEYS.has(k) ? '§' : mask(v)]));
  }
  return node;
}

function leaves(node, path = [], out = []) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) {
      if (CONTENT_KEYS.has(k)) out.push({ path: [...path, k], node, key: k, value: v });
      else leaves(v, [...path, k], out);
    }
  } else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, [...path, i], out));
  return out;
}

const KIND = { href: 'link', url: 'link', asset: 'image' };

export function findSharedSections(spec) {
  const order = [...new Set([...spec.project.pages.map((p) => p.slug), ...Object.keys(spec.pages)])].filter((s) => spec.pages[s]);
  const byShape = new Map();
  for (const page of order) {
    for (const section of spec.pages[page].sections) {
      const only = section.children.length === 1 && section.children[0].type === 'component';
      if (only) continue; // already a shared component instance
      const key = section.figmaComponent ? `figma:${section.figmaComponent}` : stableStringify(mask(strip(section)));
      if (!byShape.has(key)) byShape.set(key, []);
      byShape.get(key).push({ page, section });
    }
  }

  const groups = [];
  for (const [key, members] of byShape) {
    if (members.length < 2) continue;
    const full = new Set(members.map((m) => stableStringify(strip(m.section))));
    const shapes = new Set(members.map((m) => stableStringify(mask(strip(m.section)))));
    const match = full.size === 1 ? 'identical' : shapes.size === 1 ? 'same-structure' : 'figma-component';
    const props = [];
    if (match === 'same-structure') {
      const counts = new Map();
      const perMember = members.map((m) => leaves(strip(m.section)));
      perMember[0].forEach((leaf, i) => {
        const values = Object.fromEntries(members.map((m, j) => [`${m.page}/${m.section.id}`, perMember[j][i].value]));
        if (new Set(Object.values(values).map((v) => stableStringify(v))).size === 1) return;
        const kind = KIND[leaf.key] ?? 'text';
        const base = `${leaf.node.type === 'component' ? leaf.node.ref : leaf.node.type ?? 'item'}${kind === 'text' ? '' : `-${kind}`}`;
        const n = (counts.get(base) ?? 0) + 1;
        counts.set(base, n);
        props.push({ path: leaf.path.join('.'), name: n === 1 ? base : `${base}-${n}`, kind, values });
      });
    }
    groups.push({
      key: key.startsWith('figma:') ? key : undefined,
      match,
      suggestedName: members[0].section.id.replace(/-\d+$/, ''),
      sections: members.map((m) => ({ page: m.page, id: m.section.id })),
      props,
    });
  }
  return { ok: true, groups };
}
