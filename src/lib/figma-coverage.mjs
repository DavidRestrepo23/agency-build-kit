// Figma-first coverage for QA: lists the page's section frames (descending through generic
// wrappers, plus nested header/nav/footer frames) and says which spec section or component
// covers each one — so QA can compare Figma with Webflow even where the spec missed something.
import { parseMetadata } from './infer-layout.mjs';

const GENERIC = /^(frame|group|content|container|wrapper|main)(\s+\d+)?$/i;
const CHROME = /^(header|nav|navbar|navigation|menu|top ?bar|footer)$/i;

export function figmaCoverage(spec, pageSlug, xml) {
  const page = spec.pages[pageSlug];
  if (!page) throw new Error(`unknown page "${pageSlug}"`);
  const root = typeof xml === 'string' ? parseMetadata(xml) : xml;
  const owners = new Map([
    ...page.sections.map((s) => [s.figmaNode.replace('-', ':'), `section:${s.id}`]),
    ...spec.components.components.map((c) => [c.figmaNode.replace('-', ':'), `component:${c.name}`]),
  ]);

  const frames = [];
  const fullWidth = (n) => n.width >= root.width - 2;
  const visit = (node, offsetY) => {
    for (const child of node.children.filter((c) => !c.hidden).sort((a, b) => a.y - b.y)) {
      const y = offsetY + child.y;
      if (!fullWidth(child) || child.tag === 'text') continue;
      if (GENERIC.test(child.name) && !owners.has(child.id) && child.children.some(fullWidth)) {
        visit(child, y);
        continue;
      }
      frames.push({ figmaNode: child.id, name: child.name, y, covered: owners.get(child.id) ?? null });
      for (const inner of child.children) {
        if (CHROME.test(inner.name) || owners.get(inner.id)?.startsWith('component:')) {
          frames.push({ figmaNode: inner.id, name: inner.name, y: y + inner.y, covered: owners.get(inner.id) ?? null });
        }
      }
    }
  };
  visit(root, 0);

  const seen = new Set();
  const walk = (n) => { seen.add(n.id); n.children.forEach(walk); };
  walk(root);
  const missingInFigma = page.sections.filter((s) => !seen.has(s.figmaNode.replace('-', ':'))).map((s) => `section:${s.id} (${s.figmaNode})`);
  const uncovered = frames.filter((f) => !f.covered);
  return { ok: uncovered.length === 0 && missingInFigma.length === 0, frames, uncovered, missingInFigma };
}
