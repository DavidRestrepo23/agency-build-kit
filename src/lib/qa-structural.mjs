import { validateClassName } from './class-names.mjs';
import { pxToRem } from './units.mjs';
import { resolveResponsive } from './responsive.mjs';
import { planSection } from './plan-section.mjs';

export function tokenValueIndex(spec) {
  const index = new Map();
  // First token wins: spacing is indexed before typography, so shared values point to spacing tokens.
  const put = (key, token) => { if (!index.has(key)) index.set(key, token); };
  for (const color of spec.tokens.colors) put(color.value.toLowerCase(), color.name);
  const addSize = (token, value) => {
    for (const px of new Set(Object.values(resolveResponsive(value)))) {
      put(pxToRem(px), token);
      put(`${px}px`, token);
    }
  };
  for (const [token, value] of Object.entries(spec.tokens.spacing)) addSize(token, value);
  for (const type of spec.tokens.typography) addSize(type.name, type.size);
  return index;
}

function sectionOfClass(name, page) {
  const [folder] = name.split('_');
  const id = folder === 'section' ? name.slice('section_'.length) : folder;
  return page.sections.some((s) => s.id === id) ? id : null;
}

const PLACEHOLDER = /this is some text inside of a div block|lorem ipsum|^heading$|^text block$/i;
const norm = (t) => String(t).replace(/\*\*|\*/g, '').replace(/\s+/g, ' ').trim();
const DECOR = /_decor(-\d+)?$/;
const FIXED_PX = /^-?\d+(\.\d+)?px$/;

// Every piece of copy the spec puts on the page for a section.
export function specTexts(section) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'rich-text') out.push(...String(node.text).split(/\n\s*\n/));
    else if (['heading', 'text', 'link', 'button', 'component'].includes(node.type) && node.text) out.push(node.text);
    if (node.type === 'list') out.push(...node.items);
    if (node.behavior?.labels) out.push(...node.behavior.labels);
    if (node.behavior?.trigger) out.push(node.behavior.trigger);
    for (const child of node.children ?? []) visit(child);
  };
  for (const child of section.children ?? []) visit(child);
  return out.map(norm).filter(Boolean);
}

export function checkStructure(spec, pageSlug, dump) {
  const page = spec.pages[pageSlug];
  if (!page) throw new Error(`unknown page "${pageSlug}"`);
  const findings = [];
  const add = (severity, message, section = null) => findings.push({ severity, section, message });

  const dumpSections = dump.sections ?? [];
  const found = new Set(dumpSections.map((s) => s.id));
  const specOrder = page.sections.map((s) => s.id).filter((id) => found.has(id));
  const dumpOrder = dumpSections.map((s) => s.id).filter((id) => specOrder.includes(id));
  if (specOrder.join() !== dumpOrder.join()) {
    add('medium', `section order in Webflow (${dumpOrder.join(', ')}) differs from spec (${specOrder.join(', ')})`);
  }
  for (const section of page.sections) {
    if (!found.has(section.id)) add('high', `section "${section.id}" from spec not found in Webflow`, section.id);
  }

  const headings = [];
  for (const section of dumpSections) {
    if (page.sections.some((s) => s.id === section.id)) {
      const plan = planSection(spec, pageSlug, section.id);
      for (const cls of [...plan.classesToCreate, ...plan.utilitiesUsed]) {
        if (!(section.classes ?? []).includes(cls)) add('high', `class "${cls}" from plan not found in Webflow`, section.id);
      }
      for (const native of plan.natives) {
        const built = (section.natives ?? []).filter((n) => n.type === native.type && n.targetClass === native.targetClass)[native.order - 1];
        const expected = native.items.length;
        if (!built) add('high', `native ${native.type} inside "${native.targetClass}" not found in Webflow (behavior not built)`, section.id);
        else if (expected && built.items !== expected) add('high', `native ${native.type} inside "${native.targetClass}": ${expected} items expected, found ${built.items}`, section.id);
      }
    }
    for (const cls of section.classes ?? []) {
      const result = validateClassName(cls);
      if (!result.ok) add('high', `invalid class "${cls}": ${result.reason}`, section.id);
    }
    for (const level of section.headings ?? []) headings.push({ level, section: section.id });
    for (const image of section.images ?? []) if (!String(image.alt ?? '').trim()) add('medium', 'image without alt text', section.id);
    for (const link of section.links ?? []) {
      const href = String(link.href ?? '').trim();
      if (!href) add('medium', 'link without href', section.id);
      else if (href === '#') add('low', 'link to "#": destination pending — list it for the developer', section.id);
    }
    const specSection = page.sections.find((s) => s.id === section.id);
    if (specSection && Array.isArray(section.texts)) {
      const built = section.texts.map(norm);
      for (const t of built) if (PLACEHOLDER.test(t)) add('high', `placeholder text "${t}" left in Webflow (set_text did not apply; read text back)`, section.id);
      const joined = ` ${built.join(' | ')} `;
      for (const t of specTexts(specSection)) if (!joined.includes(t)) add('high', `copy "${t}" not found in Webflow (missing or rewritten)`, section.id);
    }
  }

  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count !== 1) add('high', `page must have exactly one h1, found ${h1Count}`);
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      add('medium', `heading level jumps from h${headings[i - 1].level} to h${headings[i].level}`, headings[i].section);
    }
  }

  // A global class stacked as a second class lands in Webflow as a combo with no properties: its styles never apply.
  for (const style of dump.styles ?? []) {
    if (style.isComboClass && !Object.keys(style.props ?? {}).length && !Object.keys(style.variables ?? {}).length) {
      add('high', `empty combo class "${style.name}" (${style.breakpoint ?? 'main'}): stacked classes have no effect; put the props on the element's own class`, sectionOfClass(style.name.split(/[\s.]+/)[0], page));
    }
  }

  // Structure audit: content must flow (flex/grid), boxes must not be fixed in px, nothing left hidden.
  for (const style of dump.styles ?? []) {
    const name = style.name ?? '';
    if (!name.includes('_') || DECOR.test(name.split(/[\s.]+/)[0])) continue;
    const where = sectionOfClass(name.split(/[\s.]+/)[0], page);
    const bp = style.breakpoint ?? 'main';
    const props = style.props ?? {};
    if (props.position === 'absolute' || props.position === 'fixed') add('medium', `${name} (${bp}) position: ${props.position} on a content class; use flex/grid, or mark the layer decorative`, where);
    for (const prop of ['width', 'height']) {
      if (FIXED_PX.test(String(props[prop] ?? '').trim())) add('medium', `${name} (${bp}) ${prop}: ${props[prop]} is a fixed px box; use %, fr, max-width or min-height`, where);
    }
    if (bp === 'main' && props.display === 'none') add('medium', `${name} hidden on desktop (display: none): remove it or list it for the developer to delete`, where);
  }

  const index = tokenValueIndex(spec);
  for (const style of dump.styles ?? []) {
    if (!style.name?.includes('_')) continue;
    for (const [prop, value] of Object.entries(style.props ?? {})) {
      const token = index.get(String(value).trim().toLowerCase());
      if (token) add('medium', `${style.name} (${style.breakpoint ?? 'main'}) ${prop}: ${value} is hard-coded; bind variable for token "${token}"`, sectionOfClass(style.name, page));
    }
  }

  return { ok: findings.length === 0, findings };
}
