import { existsSync } from 'node:fs';
import { join } from 'node:path';
import AjvModule from 'ajv';
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

function crossReferenceErrors(spec) {
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
    if (spec.dir && !existsSync(join(spec.dir, 'assets', asset.file))) {
      err('assets/manifest.yaml', `/assets/${i}/file`, `asset file "${asset.file}" not found in assets/`);
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

  const checkChild = (file, child, path, groupNames) => {
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
    if (component.collapse && !(component.children ?? []).some((c) => c.type === 'group' && c.name === 'menu')) {
      err('components.yaml', `${base}/collapse`, `collapse requires a group named "menu" among the component children`);
    }
  });

  const declared = new Set(spec.project.pages.map((p) => p.slug));
  spec.project.pages.forEach((p, i) => {
    if (!spec.pages[p.slug]) err('project.yaml', `/pages/${i}`, `page "${p.slug}" has no pages/${p.slug}.yaml`);
  });

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
    });
  }
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
  if (errors.length === 0) errors.push(...crossReferenceErrors(spec));
  if (requireResolvedQuestions) errors.push(...openQuestionErrors(spec.openQuestions));
  return { ok: errors.length === 0, errors };
}
