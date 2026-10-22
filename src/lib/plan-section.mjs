import { changedBreakpoints, resolveResponsive } from './responsive.mjs';
import { responsiveVariableNames, variableName } from './variables.mjs';
import { primaryVariantName } from './components.mjs';
import { sectionHash } from './spec-hash.mjs';
import { mergeStyles, surfaceStyles, typographyStyles } from './styles.mjs';
import { pxToRem } from './units.mjs';

const BREAKPOINTS = ['main', 'medium', 'small', 'tiny'];

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function layoutStyles(cls, layout, spec) {
  const props = { main: {}, medium: {}, small: {}, tiny: {} };
  const vars = { main: {}, medium: {}, small: {}, tiny: {} };
  if (layout.type === 'grid') {
    props.main.display = 'grid';
    for (const [bp, n] of changedBreakpoints(resolveResponsive(layout.columns ?? 1))) {
      props[bp]['grid-template-columns'] = `repeat(${n}, minmax(0, 1fr))`;
    }
  } else {
    props.main.display = 'flex';
    props.main['flex-direction'] = layout.type === 'stack' ? 'column' : (layout.direction ?? 'row');
    if (layout.align) props.main['align-items'] = layout.align;
    if (layout.justify) props.main['justify-content'] = layout.justify;
  }
  if (layout.gap) {
    for (const [bp, { name }] of Object.entries(responsiveVariableNames(layout.gap, spec.tokens.spacing[layout.gap]))) {
      // Webflow stores gaps under grid-*-gap keys, also for flex layouts.
      vars[bp]['grid-row-gap'] = name;
      vars[bp]['grid-column-gap'] = name;
    }
  }
  return BREAKPOINTS
    .filter((bp) => bp === 'main' || Object.keys(props[bp]).length || Object.keys(vars[bp]).length)
    .map((bp) => ({ class: cls, breakpoint: bp, props: props[bp], variables: vars[bp] }));
}

function nextOrder(ctx, cls) {
  const n = (ctx.counts.get(cls) ?? 0) + 1;
  ctx.counts.set(cls, n);
  return n;
}

function imageClasses(ctx, ratio) {
  if (!ctx.imageClasses.has(ratio)) {
    const n = ctx.imageClasses.size;
    const suffix = n === 0 ? '' : `-${n + 1}`;
    const wrapper = `${ctx.section.id}_image-wrapper${suffix}`;
    const image = `${ctx.section.id}_image${suffix}`;
    ctx.custom.add(wrapper);
    ctx.custom.add(image);
    const wrapperProps = { width: '100%', overflow: 'hidden' };
    if (ratio) wrapperProps['aspect-ratio'] = ratio.replace('/', ' / ');
    ctx.plan.styles.push({ class: wrapper, breakpoint: 'main', props: wrapperProps, variables: {} });
    ctx.plan.styles.push({ class: image, breakpoint: 'main', props: { width: '100%', height: '100%', 'object-fit': 'cover' }, variables: {} });
    ctx.imageClasses.set(ratio, { wrapper, image });
  }
  return ctx.imageClasses.get(ratio);
}

function renderButton(child, ctx) {
  ctx.utilities.add('button');
  const classes = ['button'];
  const primary = primaryVariantName(ctx.spec.components.components.find((c) => c.name === 'button'));
  if (child.variant && child.variant !== primary) {
    classes.push(`is-${child.variant}`);
    ctx.utilities.add(`is-${child.variant}`);
  }
  return `<a class="${classes.join(' ')}" href="${escapeHtml(child.href ?? '#')}">${escapeHtml(child.text ?? '')}</a>`;
}

// Webflow turns a second class into an empty combo, so global utilities are never stacked:
// when an element needs more than its base utility, it gets its own class carrying the props.
function addStyles(ctx, entries) {
  mergeStyles(ctx.plan.styles, entries);
}

// Text-like child: the typography utility alone, or an own class with typography + color.
function textClass(utility, child, ctx) {
  if (!child.color) {
    ctx.utilities.add(utility);
    return utility;
  }
  const type = ctx.spec.tokens.typography.find((t) => t.name === child.style);
  const role = child.style.replace('.', '-');
  const cls = `${ctx.section.id}_${role}-${variableName(child.color)}`;
  if (!ctx.custom.has(cls)) {
    ctx.custom.add(cls);
    addStyles(ctx, [...typographyStyles(cls, type), { class: cls, breakpoint: 'main', props: {}, variables: { color: variableName(child.color) } }]);
  }
  return cls;
}

// Writes layout.textAlign on the element's own class.
export function withTextAlign(cls, layout, ctx) {
  if (layout?.textAlign) addStyles(ctx, [{ class: cls, breakpoint: 'main', props: { 'text-align': layout.textAlign }, variables: {} }]);
  return cls;
}

// Writes the surface's box styles on the element's own class.
export function withSurface(cls, surface, ctx) {
  if (surface) addStyles(ctx, surfaceStyles(cls, ctx.spec.tokens.surfaces[surface], ctx.spec));
  return cls;
}

// Rich text keeps copy escaped; only **bold** and *italic* become tags.
function richTextHtml(text) {
  return escapeHtml(text)
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(\S(?:.*?\S)?)\*/g, '<em>$1</em>');
}

const renderAll = (children, ctx) => (children ?? []).map((c) => renderChild(c, ctx)).join('');

function own(ctx, cls) {
  ctx.custom.add(cls);
  return cls;
}

// Groups with a behavior become native Webflow elements (Slider, Tabs, Dropdown, Lightbox, Video, Modal)
// built by the section builder inside the group's own div, or IX3 interactions for marquee/counter.
function renderBehavior(child, cls, ctx) {
  const b = child.behavior;
  const box = (inner = '') => `<div class="${withTextAlign(withSurface(cls, child.surface, ctx), child.layout, ctx)}">${inner}</div>`;
  const native = (type, extra) => {
    ctx.plan.natives.push({ type, targetClass: cls, order: nextOrder(ctx, cls), ...extra });
    return box();
  };
  const pick = (keys) => Object.fromEntries(keys.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

  switch (b.type) {
    case 'slider': {
      const slide = own(ctx, `${cls}-slide`);
      const widths = changedBreakpoints(resolveResponsive(b.perView ?? 1))
        .map(([bp, n]) => ({ class: slide, breakpoint: bp, props: { width: `${Number((100 / n).toFixed(4))}%` }, variables: {} }));
      addStyles(ctx, widths);
      if (child.layout) addStyles(ctx, layoutStyles(slide, child.layout, ctx.spec));
      return native('Slider', {
        options: pick(['arrows', 'dots', 'autoplay', 'interval', 'loop']),
        classes: { slide },
        items: child.children.map((c) => ({ whtml: renderChild(c, ctx) })),
      });
    }
    case 'tabs':
      return native('Tabs', {
        options: {},
        classes: { menu: own(ctx, `${cls}-menu`), tab: own(ctx, `${cls}-tab`), pane: own(ctx, `${cls}-pane`) },
        items: child.children.map((c, i) => ({ label: b.labels[i], whtml: renderChild(c, ctx) })),
      });
    case 'accordion': {
      const content = own(ctx, `${cls}-content`);
      addStyles(ctx, [{ class: content, breakpoint: 'main', props: { position: 'static', display: 'block' }, variables: {} }]);
      return native('Dropdown', {
        options: { mode: 'accordion' },
        classes: { item: own(ctx, `${cls}-item`), toggle: own(ctx, `${cls}-toggle`), content },
        items: child.children.map((item) => ({
          toggle: renderChild(item.children[0], ctx),
          content: renderAll(item.children.slice(1), ctx),
        })),
      });
    }
    case 'lightbox':
      return native('Lightbox', { options: { url: b.url }, classes: {}, items: [{ whtml: renderAll(child.children, ctx) }] });
    case 'video':
      return native(/youtube\.com|youtu\.be/.test(b.url) ? 'YouTubeVideo' : 'Video', { options: { url: b.url }, classes: {}, items: [] });
    case 'modal':
      return native('Modal', { options: { trigger: b.trigger }, classes: {}, items: [{ whtml: renderAll(child.children, ctx) }] });
    case 'marquee': {
      const track = own(ctx, `${cls}-track`);
      addStyles(ctx, [
        { class: cls, breakpoint: 'main', props: { overflow: 'hidden' }, variables: {} },
        { class: track, breakpoint: 'main', props: { display: 'flex', width: 'max-content' }, variables: {} },
      ]);
      if (child.layout?.gap) addStyles(ctx, layoutStyles(track, { type: 'flex', gap: child.layout.gap }, ctx.spec));
      const direction = b.direction ?? 'left';
      const speed = b.speed ?? 30;
      ctx.plan.interactions.push({
        type: 'marquee', targetClass: track, direction, speed,
        note: `loop ${track} horizontally to the ${direction}, one full cycle every ${speed}s, moving ${direction === 'left' ? '-50%' : '50%'} (content is duplicated)`,
      });
      const inner = renderAll(child.children, ctx);
      return box(`<div class="${track}">${inner}${inner}</div>`);
    }
    case 'counter':
      ctx.plan.interactions.push({ type: 'counter', targetClass: cls, note: `count the numbers inside ${cls} up from 0 when it scrolls into view` });
      return box(renderAll(child.children, ctx));
    case 'code':
      ctx.plan.placeholders.push({ type: 'code-component', targetClass: cls, order: nextOrder(ctx, cls), description: b.description ?? `code component for ${cls}` });
      return box();
    default:
      throw new Error(`unsupported behavior "${b.type}"`);
  }
}

export function createContext(spec, section, plan) {
  return { spec, section, plan, custom: new Set(), utilities: new Set(), imageClasses: new Map(), counts: new Map() };
}

// Decorative layers (glows, stickers, floating icons) sit in an absolutely positioned wrapper of their own;
// the container they belong to becomes position: relative. Hidden from mobile landscape down unless keepOnMobile.
function renderDecorative(child, ctx) {
  const n = (ctx.decorCount = (ctx.decorCount ?? 0) + 1);
  const cls = own(ctx, `${ctx.section.id}_decor${n === 1 ? '' : `-${n}`}`);
  const props = { position: 'absolute', 'pointer-events': 'none', 'z-index': '0' };
  for (const [key, px] of Object.entries(child.position ?? {})) props[key] = pxToRem(px);
  const styles = [{ class: cls, breakpoint: 'main', props, variables: {} }];
  if (!child.keepOnMobile) styles.push({ class: cls, breakpoint: 'small', props: { display: 'none' }, variables: {} });
  addStyles(ctx, styles);
  const { decorative, position, keepOnMobile, ...inner } = child;
  return `<div class="${cls}" aria-hidden="true">${renderChild(inner, ctx)}</div>`;
}

export function relativeIfDecorated(cls, children, ctx) {
  if ((children ?? []).some((c) => c.decorative)) addStyles(ctx, [{ class: cls, breakpoint: 'main', props: { position: 'relative' }, variables: {} }]);
  return cls;
}

export function renderChild(child, ctx) {
  if (child.decorative) return renderDecorative(child, ctx);
  const id = ctx.section.id;
  switch (child.type) {
    case 'heading': {
      const cls = textClass(`heading-style-${child.style.split('.')[1]}`, child, ctx);
      return `<h${child.level} class="${cls}">${escapeHtml(child.text)}</h${child.level}>`;
    }
    case 'text': {
      const cls = textClass(`text-size-${child.style.split('.')[1]}`, child, ctx);
      return `<p class="${cls}">${escapeHtml(child.text)}</p>`;
    }
    case 'rich-text': {
      const paragraphs = String(child.text).split(/\n\s*\n/).map((p) => `<p>${richTextHtml(p.trim())}</p>`).join('');
      let cls = 'text-rich-text';
      if (child.color) {
        cls = `${id}_rich-text-${variableName(child.color)}`;
        ctx.custom.add(cls);
        addStyles(ctx, [{ class: cls, breakpoint: 'main', props: {}, variables: { color: variableName(child.color) } }]);
      } else {
        ctx.utilities.add(cls);
      }
      return `<div class="${cls}">${paragraphs}</div>`;
    }
    case 'image': {
      const { wrapper, image } = imageClasses(ctx, child.ratio ?? null);
      ctx.plan.assets.push({ id: child.asset, kind: 'raster', alt: child.alt, targetClass: image, order: nextOrder(ctx, image) });
      return `<div class="${wrapper}"><img class="${image}" alt="${escapeHtml(child.alt)}"></div>`;
    }
    case 'svg': {
      const cls = `${id}_icon`;
      ctx.custom.add(cls);
      ctx.plan.assets.push({ id: child.asset, kind: 'svg', alt: child.alt ?? '', targetClass: cls, order: nextOrder(ctx, cls) });
      return `<div class="${cls}"></div>`;
    }
    case 'link': {
      const cls = `${id}_link`;
      ctx.custom.add(cls);
      return `<a class="${cls}" href="${escapeHtml(child.href)}">${escapeHtml(child.text)}</a>`;
    }
    case 'button':
      return renderButton(child, ctx);
    case 'list': {
      const list = `${id}_list`;
      const item = `${id}_list-item`;
      ctx.custom.add(list);
      ctx.custom.add(item);
      return `<ul class="${list}">${child.items.map((t) => `<li class="${item}">${escapeHtml(t)}</li>`).join('')}</ul>`;
    }
    case 'group': {
      const cls = `${id}_${child.name}`;
      ctx.custom.add(cls);
      if (child.behavior) return renderBehavior(child, cls, ctx);
      if (child.layout) addStyles(ctx, layoutStyles(cls, child.layout, ctx.spec));
      relativeIfDecorated(cls, child.children, ctx);
      return `<div class="${withTextAlign(withSurface(cls, child.surface, ctx), child.layout, ctx)}">${(child.children ?? []).map((c) => renderChild(c, ctx)).join('')}</div>`;
    }
    case 'component': {
      if (child.ref === 'button') return renderButton(child, ctx);
      const cls = `${id}_${child.ref}-slot`;
      ctx.custom.add(cls);
      const props = { ...(child.props ?? {}) };
      if (child.text !== undefined) props.text = child.text;
      if (child.href !== undefined) props.href = child.href;
      ctx.plan.components.push({ ref: child.ref, variant: child.variant ?? null, props, targetClass: cls, order: nextOrder(ctx, cls) });
      return `<div class="${cls}"></div>`;
    }
    case 'form':
    case 'embed-placeholder': {
      const cls = `${id}_${child.type}`;
      ctx.custom.add(cls);
      ctx.plan.placeholders.push({ type: child.type, targetClass: cls, order: nextOrder(ctx, cls), description: child.description });
      return `<div class="${cls}"></div>`;
    }
    default:
      throw new Error(`unsupported child type "${child.type}"`);
  }
}

export function planSection(spec, pageSlug, sectionId) {
  const page = spec.pages[pageSlug];
  if (!page) throw new Error(`unknown page "${pageSlug}"`);
  const section = page.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`unknown section "${sectionId}" in page "${pageSlug}"`);

  const plan = {
    page: pageSlug,
    section: section.id,
    specHash: sectionHash(section, spec),
    classesToCreate: [],
    utilitiesUsed: [],
    whtml: '',
    styles: [],
    assets: [],
    components: [],
    interactions: [],
    placeholders: [],
    natives: [],
  };
  const ctx = createContext(spec, section, plan);

  const sectionClass = `section_${section.id}`;
  const componentClass = `${section.id}_component`;
  ctx.custom.add(sectionClass);
  ctx.custom.add(componentClass);
  ctx.utilities.add('padding-global');

  if (section.background) {
    addStyles(ctx, [{ class: sectionClass, breakpoint: 'main', props: {}, variables: { 'background-color': variableName(section.background) } }]);
  }
  if (section.layout) addStyles(ctx, layoutStyles(componentClass, section.layout, spec));
  relativeIfDecorated(componentClass, section.children, ctx);

  let inner = section.children.map((child) => renderChild(child, ctx)).join('');
  if (section.needsCodeComponent) {
    const slot = `${section.id}_code-component-slot`;
    ctx.custom.add(slot);
    inner += `<div class="${slot}"></div>`;
    plan.placeholders.push({
      type: 'code-component',
      targetClass: slot,
      order: nextOrder(ctx, slot),
      description: section.notes?.interaction ?? `code component for section ${section.id}`,
    });
  } else if (section.notes?.interaction) {
    plan.interactions.push({ note: section.notes.interaction, targetClass: sectionClass });
  }

  let body = `<div class="${withTextAlign(componentClass, section.layout, ctx)}">${inner}</div>`;
  if (section.spacing) {
    const cls = `padding-section-${section.spacing.split('.')[1]}`;
    ctx.utilities.add(cls);
    body = `<div class="${cls}">${body}</div>`;
  }
  if (section.container) {
    const cls = `container-${section.container}`;
    ctx.utilities.add(cls);
    body = `<div class="${cls}">${body}</div>`;
  }
  plan.whtml = `<section id="${section.id}" class="${withSurface(sectionClass, section.surface, ctx)}"><div class="padding-global">${body}</div></section>`;
  plan.classesToCreate = [...ctx.custom];
  plan.utilitiesUsed = [...ctx.utilities].sort();
  return plan;
}
