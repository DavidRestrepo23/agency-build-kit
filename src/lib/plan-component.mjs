import { createContext, layoutStyles, renderChild, withSurface, withTextAlign } from './plan-section.mjs';

const COLLAPSE_BREAKPOINT = { tablet: 'medium', 'mobile-landscape': 'small' };

function addCollapse(plan, ctx, name, collapse) {
  const bp = COLLAPSE_BREAKPOINT[collapse];
  const root = `${name}_component`;
  const burger = `${name}_burger`;
  const bar = `${name}_burger-bar`;
  const menu = `${name}_menu`;
  ctx.custom.add(burger);
  ctx.custom.add(bar);
  plan.styles.push(
    { class: root, breakpoint: 'main', props: { position: 'relative' }, variables: {} },
    { class: burger, breakpoint: 'main', props: { display: 'none' }, variables: {} },
    { class: burger, breakpoint: bp, props: { display: 'flex', 'flex-direction': 'column', 'grid-row-gap': '5px', cursor: 'pointer' }, variables: {} },
    { class: bar, breakpoint: 'main', props: { display: 'block', width: '1.5rem', height: '2px', 'background-color': 'currentColor' }, variables: {} },
    {
      class: menu,
      breakpoint: bp,
      props: { display: 'none', position: 'absolute', top: '100%', left: '0', right: '0', 'flex-direction': 'column', 'align-items': 'flex-start' },
      variables: {},
    },
  );
  plan.interactions.push({
    type: 'toggle-display',
    trigger: 'click',
    triggerClass: burger,
    targetClass: menu,
    display: 'flex',
    breakpoint: bp,
    note: `click on ${burger} toggles ${menu} between display none and flex below the ${collapse} breakpoint`,
  });
  return `<div class="${burger}"><div class="${bar}"></div><div class="${bar}"></div><div class="${bar}"></div></div>`;
}

export function planComponent(spec, name) {
  const component = spec.components.components.find((c) => c.name === name);
  if (!component) throw new Error(`unknown component "${name}"`);

  const plan = {
    component: name,
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
  // The component name is the Client-First folder (navbar_*), like a section id.
  const ctx = createContext(spec, { id: name }, plan);
  const root = `${name}_component`;
  ctx.custom.add(root);
  if (component.layout) plan.styles.push(...layoutStyles(root, component.layout, spec));

  let inner = (component.children ?? []).map((child) => renderChild(child, ctx)).join('');
  if (!component.children?.length) {
    // Props-only components (cards, items) have no structure in components.yaml: build the shell, report the gap.
    const slot = `${name}_component-slot`;
    ctx.custom.add(slot);
    inner = `<div class="${slot}"></div>`;
    plan.placeholders.push({
      type: 'component-content',
      targetClass: slot,
      order: 1,
      description: `component "${name}" has no children in components.yaml; build its content from Figma node ${component.figmaNode} (props: ${(component.props ?? []).join(', ') || 'none'})`,
    });
  }
  if (component.collapse) inner += addCollapse(plan, ctx, name, component.collapse);

  const tag = component.tag ?? 'div';
  plan.whtml = `<${tag} class="${withTextAlign(withSurface(root, component.surface, ctx), component.layout, ctx)}">${inner}</${tag}>`;
  plan.classesToCreate = [...ctx.custom];
  plan.utilitiesUsed = [...ctx.utilities].sort();
  return plan;
}
