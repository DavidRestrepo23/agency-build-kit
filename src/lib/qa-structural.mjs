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
    }
    for (const cls of section.classes ?? []) {
      const result = validateClassName(cls);
      if (!result.ok) add('high', `invalid class "${cls}": ${result.reason}`, section.id);
    }
    for (const level of section.headings ?? []) headings.push({ level, section: section.id });
    for (const image of section.images ?? []) if (!String(image.alt ?? '').trim()) add('medium', 'image without alt text', section.id);
    for (const link of section.links ?? []) if (!String(link.href ?? '').trim()) add('medium', 'link without href', section.id);
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
