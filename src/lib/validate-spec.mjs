import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import AjvModule from 'ajv';
import { tokenValueIndex } from './qa-structural.mjs';
import { pngAlpha, svgIssues } from './asset-checks.mjs';
import { MOTION_PRESETS } from './motion-presets.mjs';
import { stableStringify } from './spec-hash.mjs';
import { validateClassName } from './class-names.mjs';
import commonSchema from '../../plugins/build-core/skills/site-spec/schemas/common.schema.json' with { type: 'json' };
import projectSchema from '../../plugins/build-core/skills/site-spec/schemas/project.schema.json' with { type: 'json' };
import tokensSchema from '../../plugins/build-core/skills/site-spec/schemas/tokens.schema.json' with { type: 'json' };
import componentsSchema from '../../plugins/build-core/skills/site-spec/schemas/components.schema.json' with { type: 'json' };
import pageSchema from '../../plugins/build-core/skills/site-spec/schemas/page.schema.json' with { type: 'json' };
import assetsSchema from '../../plugins/build-core/skills/site-spec/schemas/assets.schema.json' with { type: 'json' };

const Ajv = AjvModule.default ?? AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(commonSchema);
ajv.addSchema(pageSchema);
const validators = {
  project: ajv.compile(projectSchema),
  tokens: ajv.compile(tokensSchema),
  components: ajv.compile(componentsSchema),
  page: ajv.getSchema('page.schema.json'),
  assets: ajv.compile(assetsSchema),
};

// space.<name> becomes margin-<name>/padding-<name>; these names collide with Client-First utilities.
const RESERVED_SPACING = new Set([
  'top', 'bottom', 'left', 'right', 'horizontal', 'vertical',
  'global', 'section-small', 'section-medium', 'section-large',
]);
// Group names that would collide with classes planSection generates (<id>_<name>).
const RESERVED_GROUP = /^(component|icon|link|list|list-item|form|embed-placeholder|code-component-slot|image(-wrapper)?(-\d+)?|.+-slot)$/;

function schemaErrors(file, validate, data) {
  if (validate(data)) return [];
  return validate.errors.map((e) => ({ file, path: e.instancePath || '/', message: e.message }));
}

function crossReferenceErrors(spec, warnings = []) {
  const errors = [];
  const err = (file, path, message) => errors.push({ file, path, message });
  const colors = new Set(spec.tokens.colors.map((c) => c.name));
  const typography = new Set(spec.tokens.typography.map((t) => t.name));
  const spacing = new Set(Object.keys(spec.tokens.spacing));
  const components = new Map(spec.components.components.map((c) => [c.name, c]));
  const assets = new Map(spec.assets.assets.map((a) => [a.id, a]));
  const surfaces = new Map(Object.entries(spec.tokens.surfaces ?? {}));
  const radii = spec.tokens.radii ?? {};
  for (const [name, surface] of surfaces) {
    const base = `/surfaces/${name}`;
    if (surface.background && !colors.has(surface.background)) err('tokens.yaml', `${base}/background`, `unknown color token "${surface.background}"`);
    if (surface.border && !colors.has(surface.border.color)) err('tokens.yaml', `${base}/border/color`, `unknown color token "${surface.border.color}"`);
    for (const axis of ['x', 'y']) {
      const token = surface.padding?.[axis];
      if (token && !spacing.has(token)) err('tokens.yaml', `${base}/padding/${axis}`, `unknown spacing token "${token}"`);
    }
    if (surface.radius !== undefined && !Object.hasOwn(radii, surface.radius)) err('tokens.yaml', `${base}/radius`, `unknown radius "${surface.radius}"`);
  }
  const page = spec.tokens.page ?? {};
  for (const key of ['background', 'color']) {
    if (page[key] && !colors.has(page[key])) err('tokens.yaml', `/page/${key}`, `unknown color token "${page[key]}"`);
  }
  if (page.text && !typography.has(page.text)) err('tokens.yaml', '/page/text', `unknown typography token "${page.text}"`);
  const checkSurface = (file, path, name) => {
    if (name && !surfaces.has(name)) err(file, `${path}/surface`, `unknown surface "${name}"`);
  };

  for (const token of spacing) {
    const [group, name] = token.split('.');
    if (group === 'space' && RESERVED_SPACING.has(name)) {
      err('tokens.yaml', `/spacing/${token}`, `spacing token "${token}" uses a reserved name (collides with Client-First direction utilities)`);
    }
  }

  spec.components.components.forEach((component, ci) => {
    component.variants.forEach((variant, vi) => {
      for (const [key, token] of Object.entries(variant.styles ?? {})) {
        if (!colors.has(token)) err('components.yaml', `/components/${ci}/variants/${vi}/styles/${key}`, `unknown color token "${token}"`);
      }
    });
  });

  spec.assets.assets.forEach((asset, i) => {
    if (asset.kind === 'raster' && (asset.scale ?? 1) < 2 && !asset.scaleApproved) {
      err('assets/manifest.yaml', `/assets/${i}`, `raster asset "${asset.id}" must be exported at scale 2 or higher`);
    }
    const path = spec.dir && join(spec.dir, 'assets', asset.file);
    if (path && !existsSync(path)) {
      err('assets/manifest.yaml', `/assets/${i}/file`, `asset file "${asset.file}" not found in assets/`);
    } else if (path) {
      const at = `/assets/${i}/file`;
      const kb = Math.round(statSync(path).size / 1024);
      if (kb > 500) warnings.push({ file: 'assets/manifest.yaml', path: at, message: `${asset.file} is ${kb}KB (over ~500KB): propose WebP/compression to the developer` });
      if (asset.file.toLowerCase().endsWith('.svg')) {
        for (const issue of svgIssues(readFileSync(path, 'utf8'))) err('assets/manifest.yaml', at, `${asset.file} ${issue}`);
      }
      if (asset.transparent) {
        const png = asset.file.toLowerCase().endsWith('.png') ? pngAlpha(readFileSync(path)) : null;
        if (!png || !png.hasAlpha) err('assets/manifest.yaml', at, `${asset.file} is marked transparent but has no alpha channel (export it as a transparent PNG)`);
        else if (png.corners && png.corners.some((a) => a !== 0)) err('assets/manifest.yaml', at, `${asset.file} is marked transparent but its corners are opaque (alpha ${png.corners.join('/')}): the export was flattened`);
      }
    }
  });

  const checkVariant = (file, path, ref, variant) => {
    const component = components.get(ref);
    if (!component) return err(file, `${path}/ref`, `unknown component "${ref}"`);
    if (variant && !component.variants.some((v) => v.name === variant)) {
      err(file, `${path}/variant`, `unknown variant "${variant}" for component "${ref}"`);
    }
  };

  const checkLayout = (file, layout, path) => {
    if (layout?.gap && !spacing.has(layout.gap)) err(file, `${path}/gap`, `unknown spacing token "${layout.gap}"`);
  };

  const checkBehavior = (file, child, path) => {
    const behavior = child.behavior;
    const children = child.children ?? [];
    if (child.type !== 'group') return err(file, path, `only groups can have a behavior, found it on a ${child.type}`);
    if (['slider', 'tabs', 'accordion'].includes(behavior.type) && children.length === 0) {
      err(file, path, `${behavior.type} needs at least one child (one per slide / tab / item)`);
    }
    if (behavior.type === 'tabs' && (behavior.labels ?? []).length !== children.length) {
      err(file, `${path}/labels`, `tabs need one label per child: ${children.length} children, ${(behavior.labels ?? []).length} labels`);
    }
    if (behavior.type === 'accordion') {
      children.forEach((item, i) => {
        if (item.type !== 'group' || (item.children ?? []).length < 2) {
          err(file, `${path.replace(/\/behavior$/, '')}/children/${i}`, 'accordion item must be a group whose first child is the toggle and the rest the content');
        }
      });
    }
    if (['video', 'lightbox'].includes(behavior.type) && !behavior.url) err(file, `${path}/url`, `${behavior.type} needs the video url`);
    if (behavior.type === 'modal' && !behavior.trigger) err(file, `${path}/trigger`, 'modal needs the trigger button text');
  };

  const tokenNames = new Set([...colors, ...spacing]);
  const valueIndex = tokenValueIndex(spec);
  // owner: a section ({ id }) or a component ({ id: name, component: true }).
  const checkOverrides = (file, owner, path) => {
    for (const [cls, breakpoints] of Object.entries(owner.overrides ?? {})) {
      const own = owner.component ? cls.startsWith(`${owner.id}_`) : cls === `section_${owner.id}` || cls.startsWith(`${owner.id}_`);
      if (!own) {
        const allowed = owner.component ? `${owner.id}_*` : `section_${owner.id}, ${owner.id}_*`;
        err(file, `${path}/${cls}`, `overrides may only target the ${owner.component ? 'component' : "section"}'s own classes (${allowed})`);
        continue;
      }
      for (const [bp, props] of Object.entries(breakpoints)) {
        for (const [prop, value] of Object.entries(props)) {
          const at = `${path}/${cls}/${bp}/${prop}`;
          if (value.startsWith('$')) {
            if (!tokenNames.has(value.slice(1))) err(file, at, `unknown token "${value.slice(1)}"`);
            continue;
          }
          if (prop === 'height' && /^-?[\d.]+(px|rem|em)$/.test(value.trim()) && !/_decor(-\d+)?$/.test(cls)) {
            err(file, at, `height: ${value} fixes the box height and cuts content when it grows; use min-height (decorative wrappers excepted)`);
            continue;
          }
          const token = valueIndex.get(value.trim().toLowerCase());
          if (token) err(file, at, `${prop}: ${value} matches token "${token}"; write "$${token}" so it binds the variable`);
        }
      }
    }
  };

  let currentComponent = null; // set while checking components.yaml children
  const checkChild = (file, child, path, groupNames) => {
    for (const key of ['prop', 'hrefProp']) {
      if (!child[key]) continue;
      if (!currentComponent) err(file, `${path}/${key}`, `${key} binds a component prop: use it only inside components.yaml children`);
      else if (!(currentComponent.props ?? []).includes(child[key])) err(file, `${path}/${key}`, `prop "${child[key]}" is not in ${currentComponent.name}.props`);
    }
    if (child.type === 'component' && child.props && components.get(child.ref)?.props) {
      for (const key of Object.keys(child.props)) {
        if (!components.get(child.ref).props.includes(key)) err(file, `${path}/props/${key}`, `"${key}" is not a prop of component "${child.ref}" (props: ${components.get(child.ref).props.join(', ')})`);
      }
    }
    if (child.style && !typography.has(child.style)) err(file, `${path}/style`, `unknown typography token "${child.style}"`);
    if (child.color && !colors.has(child.color)) err(file, `${path}/color`, `unknown color token "${child.color}"`);
    if (child.type === 'image' || child.type === 'svg') {
      const asset = assets.get(child.asset);
      const expected = child.type === 'svg' ? 'svg' : 'raster';
      if (!asset) err(file, `${path}/asset`, `unknown asset "${child.asset}"`);
      else if (asset.kind !== expected) err(file, `${path}/asset`, `${child.type} must reference an asset of kind "${expected}", "${child.asset}" is "${asset.kind}"`);
    }
    if (child.type === 'component') checkVariant(file, path, child.ref, child.variant);
    if (child.type === 'button') checkVariant(file, path, 'button', child.variant);
    if (child.behavior) checkBehavior(file, child, `${path}/behavior`);
    if (!child.decorative) {
      if (child.position) err(file, `${path}/position`, 'position is only for decorative: true children');
      if (child.keepOnMobile !== undefined) err(file, `${path}/keepOnMobile`, 'keepOnMobile is only for decorative: true children');
    }
    if (child.type === 'group') {
      checkSurface(file, path, child.surface);
      if (RESERVED_GROUP.test(child.name)) err(file, `${path}/name`, `group name "${child.name}" is reserved (collides with generated class names)`);
      if (groupNames.has(child.name)) err(file, `${path}/name`, `duplicate group name "${child.name}" in section`);
      groupNames.add(child.name);
    }
    if (child.layout) checkLayout(file, child.layout, `${path}/layout`);
    (child.children ?? []).forEach((c, i) => checkChild(file, c, `${path}/children/${i}`, groupNames));
  };

  spec.components.components.forEach((component, ci) => {
    const base = `/components/${ci}`;
    currentComponent = component;
    checkSurface('components.yaml', base, component.surface);
    checkLayout('components.yaml', component.layout, `${base}/layout`);
    const groupNames = new Set();
    (component.children ?? []).forEach((child, i) => {
      if (child.type === 'component' && child.ref !== 'button') {
        err('components.yaml', `${base}/children/${i}`, `component "${component.name}" cannot contain other components (only buttons)`);
        return;
      }
      checkChild('components.yaml', child, `${base}/children/${i}`, groupNames);
    });
    checkOverrides('components.yaml', { id: component.name, overrides: component.overrides, component: true }, `${base}/overrides`);
    currentComponent = null;
    if (component.collapse && !(component.children ?? []).some((c) => c.type === 'group' && c.name === 'menu')) {
      err('components.yaml', `${base}/collapse`, `collapse requires a group named "menu" among the component children`);
    }
  });

  const declared = new Set(spec.project.pages.map((p) => p.slug));
  spec.project.pages.forEach((p, i) => {
    if (!spec.pages[p.slug]) err('project.yaml', `/pages/${i}`, `page "${p.slug}" has no pages/${p.slug}.yaml`);
  });

  // Classes come from section ids, so one id must mean one section across the whole site.
  const seenIds = new Map();
  const pageOrder = [...new Set([...spec.project.pages.map((p) => p.slug), ...Object.keys(spec.pages)])].filter((slug) => spec.pages[slug]);
  for (const slug of pageOrder) {
    spec.pages[slug].sections.forEach((section, si) => {
      const { figmaNode, ...content } = section;
      const signature = stableStringify(content);
      const first = seenIds.get(section.id);
      if (!first) seenIds.set(section.id, { slug, signature, pages: [slug] });
      else if (first.signature !== signature) {
        err(`pages/${slug}.yaml`, `/sections/${si}/id`, `section id "${section.id}" is also on page "${first.slug}" with different content: its classes would collide — rename it (e.g. "${section.id}-${slug}") or make it a shared component`);
      } else first.pages.push(slug);
    });
  }
  for (const [id, { pages }] of seenIds) {
    if (pages.length > 1) warnings.push({ file: 'pages', path: '/', message: `section "${id}" is identical on pages ${pages.join(', ')}: make it a shared component so it is built once and edited in one place` });
  }

  for (const [slug, page] of Object.entries(spec.pages)) {
    const file = `pages/${slug}.yaml`;
    if (!declared.has(slug)) err(file, '/', `page "${slug}" is not listed in project.yaml`);
    if (page.page !== slug) err(file, '/page', `"page" must equal the file name "${slug}"`);
    const ids = new Set();
    page.sections.forEach((section, si) => {
      const base = `/sections/${si}`;
      if (ids.has(section.id)) err(file, `${base}/id`, `duplicate section id "${section.id}"`);
      ids.add(section.id);
      if (section.spacing && !spacing.has(section.spacing)) err(file, `${base}/spacing`, `unknown spacing token "${section.spacing}"`);
      if (section.background && !colors.has(section.background)) err(file, `${base}/background`, `unknown color token "${section.background}"`);
      checkSurface(file, base, section.surface);
      if (section.background && section.surface) err(file, base, 'section cannot have both background and surface');
      checkLayout(file, section.layout, `${base}/layout`);
      const groupNames = new Set();
      section.children.forEach((child, i) => checkChild(file, child, `${base}/children/${i}`, groupNames));
      checkOverrides(file, section, `${base}/overrides`);
    });
  }
  return errors;
}

function motionErrors(motion) {
  if (!motion) return [];
  const errors = [];
  const err = (path, message) => errors.push({ file: 'motion.yaml', path, message });
  if (motion.intensity && !['subtle', 'medium', 'bold'].includes(motion.intensity)) err('/intensity', 'intensity must be subtle, medium or bold');
  if (!Array.isArray(motion.effects)) return [...errors, { file: 'motion.yaml', path: '/effects', message: 'effects must be a list' }];
  const ids = new Set();
  motion.effects.forEach((e, i) => {
    const at = `/effects/${i}`;
    if (!e?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) err(`${at}/id`, 'id must be kebab-case');
    else if (ids.has(e.id)) err(`${at}/id`, `duplicate effect id "${e.id}"`);
    ids.add(e?.id);
    if (!MOTION_PRESETS[e?.preset]) err(`${at}/preset`, `unknown preset "${e?.preset}" (available: ${Object.keys(MOTION_PRESETS).join(', ')})`);
    if (!Array.isArray(e?.targets) || !e.targets.length) err(`${at}/targets`, 'targets must list at least one class');
    for (const cls of e?.targets ?? []) {
      if (!validateClassName(cls).ok) err(`${at}/targets`, `target "${cls}" is not a valid class name: ${validateClassName(cls).reason}`);
    }
  });
  return errors;
}

function openQuestionErrors(markdown) {
  return [...markdown.matchAll(/^\s*[-*] \[ \] (.+)$/gm)].map(([, text]) => ({
    file: 'open-questions.md',
    path: '/',
    message: `unresolved: ${text.trim()}`,
  }));
}

export function validateSpec(spec, { requireResolvedQuestions = false } = {}) {
  const errors = [
    ...schemaErrors('project.yaml', validators.project, spec.project),
    ...schemaErrors('tokens.yaml', validators.tokens, spec.tokens),
    ...schemaErrors('components.yaml', validators.components, spec.components),
    ...schemaErrors('assets/manifest.yaml', validators.assets, spec.assets),
  ];
  for (const [slug, page] of Object.entries(spec.pages)) {
    errors.push(...schemaErrors(`pages/${slug}.yaml`, validators.page, page));
  }
  const warnings = [];
  if (errors.length === 0) errors.push(...crossReferenceErrors(spec, warnings));
  errors.push(...motionErrors(spec.motion));
  if (requireResolvedQuestions) errors.push(...openQuestionErrors(spec.openQuestions));
  return { ok: errors.length === 0, errors, warnings };
}
