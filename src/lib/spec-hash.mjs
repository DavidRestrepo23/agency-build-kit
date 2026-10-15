import { createHash } from 'node:crypto';

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function collectRefs(section) {
  const tokens = new Set();
  const components = new Set();
  const assets = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of ['spacing', 'background', 'style']) if (typeof node[key] === 'string') tokens.add(node[key]);
    if (node.layout?.gap) tokens.add(node.layout.gap);
    if (node.type === 'component') components.add(node.ref);
    if (node.type === 'button') components.add('button');
    if (node.asset) assets.add(node.asset);
    for (const child of node.children ?? []) visit(child);
  };
  visit(section);
  return { tokens: [...tokens].sort(), components: [...components].sort(), assets: [...assets].sort() };
}

export function sectionHash(section, spec) {
  const refs = collectRefs(section);
  const tokens = new Set(refs.tokens);
  const payload = {
    section,
    colors: spec.tokens.colors.filter((c) => tokens.has(c.name)),
    typography: spec.tokens.typography.filter((t) => tokens.has(t.name)),
    spacing: Object.fromEntries(Object.entries(spec.tokens.spacing).filter(([k]) => tokens.has(k))),
    components: spec.components.components.filter((c) => refs.components.includes(c.name)),
    assets: spec.assets.assets.filter((a) => refs.assets.includes(a.id)),
  };
  return `sha256:${createHash('sha256').update(stableStringify(payload)).digest('hex')}`;
}
