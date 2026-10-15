# Agency Build Kit — Ciclo 1 (site-spec + Webflow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marketplace de Claude Code con dos plugins (`build-core`, `webflow-builder`) que convierten un Figma aprobado en un `site-spec` neutral y lo construyen en Webflow con Client-First, por fases revisables.

**Architecture:** Toda la lógica determinista (validación del spec, mapeo Client-First, planes de setup/sección, QA estructural, estado de construcción) vive en módulos Node puros en `src/lib`, expuestos como CLIs en `src/cli` y empaquetados con esbuild en `plugins/*/scripts/*.mjs` autocontenidos. Los comandos, skills y agentes Markdown orquestan: leen Figma vía Figma MCP, ejecutan los scripts y aplican sus planes vía Webflow MCP siguiendo el plugin oficial `webflow/webflow-skills`.

**Tech Stack:** Node ≥ 22 (ESM, `node:test`), `yaml`, `ajv` (draft-07), `esbuild`; Claude Code plugins (commands, skills, agents); Figma MCP; Webflow MCP; Webflow CLI ≥ 2.0.

**Spec:** `docs/superpowers/specs/2026-10-15-webflow-builder-design.md`

## Global Constraints

- Node ≥ 22; módulos ESM (`.mjs`); tests con `node --test`, sin frameworks extra.
- Dependencias runtime solo `yaml` y `ajv`, empaquetadas con esbuild; los scripts en `plugins/*/scripts/` no importan nada fuera de `node:*`.
- Todo CLI imprime JSON en stdout (`{ "ok": boolean, ... }`) y sale con código 1 cuando `ok` es `false`.
- El `site-spec` es neutral: nunca contiene nombres de clases de plataforma.
- Unidades: valores en px en el spec; salida Webflow en rem con base 16 (`pxToRem`).
- Breakpoints responsivos: `desktop → main`, `tablet → medium`, `mobile → small`; `tablet` ausente hereda `desktop`, `mobile` ausente hereda `tablet`; `tiny` hereda `small`.
- Naming Client-First: custom `[carpeta]_[elemento]` kebab-case con un solo `_`; combos `is-*`; utilities de la lista cerrada de `class-names.mjs`.
- Nunca publicar en Webflow sin confirmación explícita del dev.
- Gates del skill oficial `webflow-mcp:figma-to-webflow` se aplican sin cambios, salvo los 4 overrides: build mode headless, variables nuevas, naming Client-First, unidades rem.

## Review Focus

1. **Ids/nombres con mayúsculas o espacios** (`id: "Hero CTA"`, `name: "Card Grid"`): `validate-spec` debe rechazarlos con ruta exacta antes de que generen clases inválidas. → Test en Task 4.
2. **Copy con caracteres HTML** (`&`, `<`, `"`): el WHTML debe escaparlos, nunca inyectar etiquetas. → Test en Task 6.
3. **Spec editado después de construir:** `specHash` cambia si cambia la sección o un token que referencia, y no cambia si cambia un token ajeno. → Test en Task 6.
4. **Página declarada sin archivo, o archivo huérfano:** error claro, no excepción. → Test en Task 4.
5. **Token de spacing con nombre reservado** (`space.top`): colisionaría con la utility `margin-top`; `validate-spec` debe rechazarlo. → Test en Task 4.

---

## File Structure

```
agency-build-kit/
├─ package.json                         # scripts: test, build
├─ .gitignore
├─ README.md
├─ .claude-plugin/marketplace.json
├─ scripts/build.mjs                    # esbuild: src/cli/* → plugins/*/scripts/*
├─ src/
│  ├─ lib/
│  │  ├─ responsive.mjs                 # resolveResponsive, changedBreakpoints
│  │  ├─ units.mjs                      # pxToRem
│  │  ├─ variables.mjs                  # variableName, responsiveVariableNames
│  │  ├─ components.mjs                 # primaryVariantName
│  │  ├─ load-spec.mjs                  # loadSpec, SpecLoadError
│  │  ├─ validate-spec.mjs              # validateSpec
│  │  ├─ class-names.mjs                # validateClassName
│  │  ├─ spec-hash.mjs                  # stableStringify, collectRefs, sectionHash
│  │  ├─ plan-section.mjs               # planSection, escapeHtml
│  │  ├─ plan-setup.mjs                 # planSetup
│  │  ├─ qa-structural.mjs              # checkStructure, tokenValueIndex
│  │  ├─ build-state.mjs                # setSectionState, setSetupState, sectionNeedsBuild
│  │  └─ cli.mjs                        # runCli
│  └─ cli/                              # one entry per script (thin wrappers)
├─ plugins/
│  ├─ build-core/
│  │  ├─ .claude-plugin/plugin.json
│  │  ├─ commands/build-audit.md
│  │  ├─ agents/figma-auditor.md
│  │  ├─ skills/site-spec/SKILL.md
│  │  ├─ skills/site-spec/schemas/*.schema.json
│  │  ├─ skills/figma-extract/SKILL.md
│  │  └─ scripts/validate-spec.mjs      # generated
│  └─ webflow-builder/
│     ├─ .claude-plugin/plugin.json
│     ├─ commands/{wf-setup,wf-build,wf-qa,wf-component}.md
│     ├─ agents/wf-qa-reviewer.md
│     ├─ skills/{client-first,wf-bootstrap,wf-section-build}/SKILL.md
│     └─ scripts/*.mjs                  # generated
├─ tests/
│  ├─ helpers.mjs
│  ├─ fixtures/spec-valid/…
│  └─ *.test.mjs
└─ docs/e2e-checklist.md
```

---

### Task 1: Repo scaffold, manifests y test de estructura de plugins

**Files:**
- Create: `package.json`, `.gitignore`, `.claude-plugin/marketplace.json`
- Create: `plugins/build-core/.claude-plugin/plugin.json`, `plugins/webflow-builder/.claude-plugin/plugin.json`
- Test: `tests/plugin-structure.test.mjs`

**Interfaces:**
- Produces: `npm test` (corre `node --test tests/*.test.mjs`), `npm run build` (Task 10). El test de estructura valida cualquier `skills/*/SKILL.md`, `commands/*.md`, `agents/*.md` y referencias `${CLAUDE_PLUGIN_ROOT}/scripts/<x>.mjs` que se agreguen en tareas futuras.

- [ ] **Step 1: Crear `package.json` y `.gitignore`**

```json
{
  "name": "agency-build-kit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "build": "node scripts/build.mjs"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "esbuild": "^0.24.0"
  }
}
```

`.gitignore`:
```
node_modules/
.DS_Store
```

Run: `npm install`
Expected: instala ajv, yaml, esbuild sin errores. Si npm falla con `EACCES` en `~/.npm`, usar `npm install --cache "$(mktemp -d)"`.

- [ ] **Step 2: Escribir el test de estructura (falla porque no hay manifests)**

`tests/plugin-structure.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLUGINS = ['build-core', 'webflow-builder'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function frontmatter(path) {
  const match = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${path} has no frontmatter`);
  return parse(match[1]);
}

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return entry.endsWith('.md') ? [path] : [];
  });
}

test('marketplace lists both plugins with existing sources', () => {
  const market = readJson(join(ROOT, '.claude-plugin/marketplace.json'));
  assert.equal(market.name, 'agency-build-kit');
  assert.deepEqual(market.plugins.map((p) => p.name), PLUGINS);
  for (const plugin of market.plugins) {
    assert.ok(existsSync(join(ROOT, plugin.source, '.claude-plugin/plugin.json')), plugin.source);
  }
});

for (const plugin of PLUGINS) {
  const dir = join(ROOT, 'plugins', plugin);

  test(`${plugin}: plugin.json name and version`, () => {
    const manifest = readJson(join(dir, '.claude-plugin/plugin.json'));
    assert.equal(manifest.name, plugin);
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.ok(manifest.description.length > 20);
  });

  test(`${plugin}: skills have matching name and description`, () => {
    const skillsDir = join(dir, 'skills');
    if (!existsSync(skillsDir)) return;
    for (const skill of readdirSync(skillsDir)) {
      const fm = frontmatter(join(skillsDir, skill, 'SKILL.md'));
      assert.equal(fm.name, skill);
      assert.ok(fm.description?.length > 20, `${skill} description too short`);
    }
  });

  test(`${plugin}: commands have description`, () => {
    for (const file of markdownFiles(join(dir, 'commands'))) {
      assert.ok(frontmatter(file).description?.length > 10, file);
    }
  });

  test(`${plugin}: agents have matching name and description`, () => {
    for (const file of markdownFiles(join(dir, 'agents'))) {
      const fm = frontmatter(file);
      assert.equal(`${fm.name}.md`, file.split('/').pop());
      assert.ok(fm.description?.length > 20, file);
    }
  });

  test(`${plugin}: referenced scripts exist`, () => {
    for (const file of markdownFiles(dir)) {
      const text = readFileSync(file, 'utf8');
      for (const [, script] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([a-z-]+\.mjs)/g)) {
        assert.ok(existsSync(join(dir, 'scripts', script)), `${file} references missing scripts/${script}`);
      }
    }
  });
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `npm test`
Expected: FAIL — `ENOENT ... .claude-plugin/marketplace.json`.

- [ ] **Step 4: Crear manifests**

`.claude-plugin/marketplace.json`:
```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "agency-build-kit",
  "description": "Agency build agents: Figma → site-spec → platform builders (Webflow first)",
  "owner": { "name": "David Restrepo" },
  "plugins": [
    {
      "name": "build-core",
      "description": "Audit an approved Figma file into a neutral, reviewable site-spec shared by every platform builder",
      "source": "./plugins/build-core",
      "category": "development"
    },
    {
      "name": "webflow-builder",
      "description": "Build a site-spec in Webflow with Client-First naming via the Webflow MCP, with phase commands and QA",
      "source": "./plugins/webflow-builder",
      "category": "development"
    }
  ]
}
```

`plugins/build-core/.claude-plugin/plugin.json`:
```json
{
  "name": "build-core",
  "version": "0.1.0",
  "description": "Audit an approved Figma file into a neutral, reviewable site-spec shared by every platform builder",
  "author": { "name": "David Restrepo" }
}
```

`plugins/webflow-builder/.claude-plugin/plugin.json`:
```json
{
  "name": "webflow-builder",
  "version": "0.1.0",
  "description": "Build a site-spec in Webflow with Client-First naming via the Webflow MCP, with phase commands and QA",
  "author": { "name": "David Restrepo" }
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npm test`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .claude-plugin plugins tests/plugin-structure.test.mjs
git commit -m "chore: scaffold marketplace with build-core and webflow-builder plugins"
```

---

### Task 2: Helpers puros (responsive, units, variables, components)

**Files:**
- Create: `src/lib/responsive.mjs`, `src/lib/units.mjs`, `src/lib/variables.mjs`, `src/lib/components.mjs`
- Test: `tests/core.test.mjs`

**Interfaces:**
- Produces:
  - `resolveResponsive(value: number | {desktop, tablet?, mobile?}) → { main, medium, small }` (lanza `TypeError /Invalid responsive value/`)
  - `changedBreakpoints({main, medium, small}) → Array<[breakpoint, value]>` (siempre `main`; `medium` solo si ≠ main; `small` solo si ≠ medium)
  - `pxToRem(px: number) → string` (`16 → "1rem"`)
  - `variableName(token: string) → string` (`brand.primary → brand-primary`)
  - `responsiveVariableNames(token, value, suffix = '') → { main: {name, value}, medium?: {...}, small?: {...} }` (sufijos `-tablet`, `-mobile`)
  - `primaryVariantName(component) → string | null`

- [ ] **Step 1: Escribir tests**

`tests/core.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveResponsive, changedBreakpoints } from '../src/lib/responsive.mjs';
import { pxToRem } from '../src/lib/units.mjs';
import { variableName, responsiveVariableNames } from '../src/lib/variables.mjs';
import { primaryVariantName } from '../src/lib/components.mjs';

test('resolveResponsive: a number applies to every breakpoint', () => {
  assert.deepEqual(resolveResponsive(16), { main: 16, medium: 16, small: 16 });
});

test('resolveResponsive: tablet inherits desktop, mobile inherits tablet', () => {
  assert.deepEqual(resolveResponsive({ desktop: 64, mobile: 40 }), { main: 64, medium: 64, small: 40 });
  assert.deepEqual(resolveResponsive({ desktop: 48, tablet: 40 }), { main: 48, medium: 40, small: 40 });
});

test('resolveResponsive: rejects objects without desktop', () => {
  assert.throws(() => resolveResponsive({ mobile: 1 }), /Invalid responsive value/);
});

test('changedBreakpoints: desktop-only value emits only main', () => {
  assert.deepEqual(changedBreakpoints(resolveResponsive({ desktop: 32 })), [['main', 32]]);
});

test('changedBreakpoints: emits only real overrides', () => {
  assert.deepEqual(changedBreakpoints({ main: 64, medium: 64, small: 40 }), [['main', 64], ['small', 40]]);
  assert.deepEqual(changedBreakpoints({ main: 3, medium: 2, small: 1 }), [['main', 3], ['medium', 2], ['small', 1]]);
});

test('pxToRem converts with base 16', () => {
  assert.equal(pxToRem(16), '1rem');
  assert.equal(pxToRem(40), '2.5rem');
  assert.equal(pxToRem(18), '1.125rem');
  assert.throws(() => pxToRem('16'), /expects a number/);
});

test('variableName replaces dots with dashes', () => {
  assert.equal(variableName('brand.primary'), 'brand-primary');
});

test('responsiveVariableNames: only creates variables for changed breakpoints', () => {
  assert.deepEqual(responsiveVariableNames('space.md', { desktop: 24, mobile: 16 }), {
    main: { name: 'space-md', value: 24 },
    small: { name: 'space-md-mobile', value: 16 },
  });
  assert.deepEqual(responsiveVariableNames('heading.h1', 64, '-size'), {
    main: { name: 'heading-h1-size', value: 64 },
  });
});

test('primaryVariantName prefers "primary", else the first variant', () => {
  assert.equal(primaryVariantName({ variants: [{ name: 'secondary' }, { name: 'primary' }] }), 'primary');
  assert.equal(primaryVariantName({ variants: [{ name: 'solid' }, { name: 'ghost' }] }), 'solid');
  assert.equal(primaryVariantName({ variants: [] }), null);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/core.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/responsive.mjs'`.

- [ ] **Step 3: Implementar**

`src/lib/responsive.mjs`:
```js
export function resolveResponsive(value) {
  if (typeof value === 'number' || typeof value === 'string') {
    return { main: value, medium: value, small: value };
  }
  if (value && typeof value === 'object' && 'desktop' in value) {
    const main = value.desktop;
    const medium = value.tablet ?? main;
    const small = value.mobile ?? medium;
    return { main, medium, small };
  }
  throw new TypeError(`Invalid responsive value: ${JSON.stringify(value)}`);
}

export function changedBreakpoints(resolved) {
  const out = [['main', resolved.main]];
  if (resolved.medium !== resolved.main) out.push(['medium', resolved.medium]);
  if (resolved.small !== resolved.medium) out.push(['small', resolved.small]);
  return out;
}
```

`src/lib/units.mjs`:
```js
export function pxToRem(px) {
  if (typeof px !== 'number' || Number.isNaN(px)) {
    throw new TypeError(`pxToRem expects a number, got ${JSON.stringify(px)}`);
  }
  return `${Number((px / 16).toFixed(4))}rem`;
}
```

`src/lib/variables.mjs`:
```js
import { resolveResponsive } from './responsive.mjs';

export function variableName(token) {
  return token.replaceAll('.', '-');
}

export function responsiveVariableNames(token, value, suffix = '') {
  const resolved = resolveResponsive(value);
  const base = variableName(token) + suffix;
  const out = { main: { name: base, value: resolved.main } };
  if (resolved.medium !== resolved.main) out.medium = { name: `${base}-tablet`, value: resolved.medium };
  if (resolved.small !== resolved.medium) out.small = { name: `${base}-mobile`, value: resolved.small };
  return out;
}
```

`src/lib/components.mjs`:
```js
export function primaryVariantName(component) {
  if (!component?.variants?.length) return null;
  return component.variants.some((v) => v.name === 'primary') ? 'primary' : component.variants[0].name;
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `node --test tests/core.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib tests/core.test.mjs
git commit -m "feat: add responsive, unit and variable helpers"
```

---

### Task 3: JSON Schemas, fixture válido y `loadSpec`

**Files:**
- Create: `plugins/build-core/skills/site-spec/schemas/{common,project,tokens,components,page,assets}.schema.json`
- Create: `src/lib/load-spec.mjs`
- Create: `tests/helpers.mjs`
- Create: `tests/fixtures/spec-valid/{project.yaml,tokens.yaml,components.yaml,open-questions.md,pages/home.yaml,assets/manifest.yaml}`
- Test: `tests/load-spec.test.mjs`

**Interfaces:**
- Produces:
  - `loadSpec(dir: string) → { dir, project, tokens, components, assets, pages: Record<slug, page>, openQuestions: string, buildState: object | null }`
  - `class SpecLoadError extends Error { file: string }` — lanzado si falta un archivo requerido o el YAML es inválido.
  - `tests/helpers.mjs`: `VALID_SPEC` (ruta absoluta del fixture), `copyFixture() → dir`, `editYaml(dir, rel, mutate)`.

- [ ] **Step 1: Crear schemas**

`plugins/build-core/skills/site-spec/schemas/common.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "common.schema.json",
  "definitions": {
    "kebab": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "tokenName": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*(\\.[a-z0-9]+(-[a-z0-9]+)*)+$" },
    "figmaNode": { "type": "string", "pattern": "^[0-9]+[:-][0-9]+$" },
    "responsiveNumber": {
      "oneOf": [
        { "type": "number" },
        {
          "type": "object",
          "required": ["desktop"],
          "additionalProperties": false,
          "properties": {
            "desktop": { "type": "number" },
            "tablet": { "type": "number" },
            "mobile": { "type": "number" }
          }
        }
      ]
    }
  }
}
```

`plugins/build-core/skills/site-spec/schemas/project.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "project.schema.json",
  "type": "object",
  "required": ["name", "figma", "platforms", "units", "breakpoints", "pages"],
  "additionalProperties": false,
  "properties": {
    "name": { "$ref": "common.schema.json#/definitions/kebab" },
    "figma": {
      "type": "object",
      "required": ["fileKey", "url"],
      "additionalProperties": false,
      "properties": {
        "fileKey": { "type": "string", "minLength": 1 },
        "url": { "type": "string", "pattern": "^https://(www\\.)?figma\\.com/" }
      }
    },
    "platforms": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "enum": ["webflow", "shopify", "hubspot", "framer"] }
    },
    "units": { "enum": ["rem"] },
    "breakpoints": {
      "type": "object",
      "required": ["desktop", "tablet", "mobileLandscape", "mobile"],
      "additionalProperties": false,
      "properties": {
        "desktop": { "type": "integer" },
        "tablet": { "type": "integer" },
        "mobileLandscape": { "type": "integer" },
        "mobile": { "type": "integer" }
      }
    },
    "pages": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["slug", "figmaNode"],
        "additionalProperties": false,
        "properties": {
          "slug": { "$ref": "common.schema.json#/definitions/kebab" },
          "figmaNode": { "$ref": "common.schema.json#/definitions/figmaNode" }
        }
      }
    }
  }
}
```

`plugins/build-core/skills/site-spec/schemas/tokens.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "tokens.schema.json",
  "type": "object",
  "required": ["colors", "typography", "spacing", "fonts"],
  "additionalProperties": false,
  "properties": {
    "colors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "value"],
        "additionalProperties": false,
        "properties": {
          "name": { "$ref": "common.schema.json#/definitions/tokenName" },
          "value": { "type": "string", "pattern": "^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$" },
          "figmaVar": { "type": "string" },
          "role": { "enum": ["brand", "text", "background", "border", "accent", "state"] }
        }
      }
    },
    "typography": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "family", "weight", "size", "lineHeight"],
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string", "pattern": "^(heading\\.h[1-6]|text\\.[a-z0-9]+(-[a-z0-9]+)*)$" },
          "family": { "type": "string", "minLength": 1 },
          "weight": { "type": "integer", "minimum": 100, "maximum": 900 },
          "size": { "$ref": "common.schema.json#/definitions/responsiveNumber" },
          "lineHeight": { "type": "number" },
          "letterSpacing": { "type": "number" },
          "figmaVar": { "type": "string" }
        }
      }
    },
    "spacing": {
      "type": "object",
      "propertyNames": { "pattern": "^(section\\.(small|medium|large)|space\\.[a-z0-9]+(-[a-z0-9]+)*)$" },
      "additionalProperties": { "$ref": "common.schema.json#/definitions/responsiveNumber" }
    },
    "radii": { "type": "object", "additionalProperties": { "type": "number" } },
    "shadows": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "value"],
        "additionalProperties": false,
        "properties": {
          "name": { "$ref": "common.schema.json#/definitions/tokenName" },
          "value": { "type": "string" }
        }
      }
    },
    "fonts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["family", "weights", "source"],
        "additionalProperties": false,
        "properties": {
          "family": { "type": "string", "minLength": 1 },
          "weights": { "type": "array", "minItems": 1, "items": { "type": "integer" } },
          "source": { "enum": ["google", "upload"] },
          "files": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

`plugins/build-core/skills/site-spec/schemas/components.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "components.schema.json",
  "type": "object",
  "required": ["components"],
  "additionalProperties": false,
  "properties": {
    "components": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "figmaNode", "variants"],
        "additionalProperties": false,
        "properties": {
          "name": { "$ref": "common.schema.json#/definitions/kebab" },
          "figmaNode": { "$ref": "common.schema.json#/definitions/figmaNode" },
          "variants": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["name"],
              "additionalProperties": false,
              "properties": {
                "name": { "$ref": "common.schema.json#/definitions/kebab" },
                "styles": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "background": { "$ref": "common.schema.json#/definitions/tokenName" },
                    "color": { "$ref": "common.schema.json#/definitions/tokenName" },
                    "border": { "$ref": "common.schema.json#/definitions/tokenName" }
                  }
                }
              }
            }
          },
          "props": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

`plugins/build-core/skills/site-spec/schemas/assets.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "assets.schema.json",
  "type": "object",
  "required": ["assets"],
  "additionalProperties": false,
  "properties": {
    "assets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "figmaNode", "kind", "file"],
        "additionalProperties": false,
        "properties": {
          "id": { "$ref": "common.schema.json#/definitions/kebab" },
          "figmaNode": { "$ref": "common.schema.json#/definitions/figmaNode" },
          "kind": { "enum": ["svg", "raster"] },
          "file": { "type": "string", "minLength": 1 },
          "scale": { "type": "integer", "minimum": 1 },
          "alt": { "type": "string" }
        }
      }
    }
  }
}
```

`plugins/build-core/skills/site-spec/schemas/page.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "page.schema.json",
  "type": "object",
  "required": ["page", "figmaNode", "sections"],
  "additionalProperties": false,
  "properties": {
    "page": { "$ref": "common.schema.json#/definitions/kebab" },
    "figmaNode": { "$ref": "common.schema.json#/definitions/figmaNode" },
    "sections": { "type": "array", "minItems": 1, "items": { "$ref": "#/definitions/section" } }
  },
  "definitions": {
    "section": {
      "type": "object",
      "required": ["id", "figmaNode", "children"],
      "additionalProperties": false,
      "properties": {
        "id": { "$ref": "common.schema.json#/definitions/kebab" },
        "figmaNode": { "$ref": "common.schema.json#/definitions/figmaNode" },
        "spacing": { "type": "string", "pattern": "^section\\.(small|medium|large)$" },
        "container": { "enum": ["small", "medium", "large"] },
        "background": { "$ref": "common.schema.json#/definitions/tokenName" },
        "layout": { "$ref": "#/definitions/layout" },
        "children": { "type": "array", "items": { "$ref": "#/definitions/child" } },
        "notes": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "interaction": { "type": "string" },
            "responsive": { "type": "string" }
          }
        },
        "needsCodeComponent": { "type": "boolean" }
      }
    },
    "layout": {
      "type": "object",
      "required": ["type"],
      "additionalProperties": false,
      "properties": {
        "type": { "enum": ["grid", "flex", "stack"] },
        "columns": { "$ref": "common.schema.json#/definitions/responsiveNumber" },
        "gap": { "$ref": "common.schema.json#/definitions/tokenName" },
        "direction": { "enum": ["row", "column"] },
        "align": { "enum": ["flex-start", "center", "flex-end", "stretch", "baseline"] },
        "justify": { "enum": ["flex-start", "center", "flex-end", "space-between", "space-around"] }
      }
    },
    "child": {
      "type": "object",
      "required": ["type"],
      "additionalProperties": false,
      "properties": {
        "type": {
          "enum": ["heading", "text", "rich-text", "image", "svg", "link", "button", "list", "group", "component", "form", "embed-placeholder"]
        },
        "level": { "type": "integer", "minimum": 1, "maximum": 6 },
        "style": { "$ref": "common.schema.json#/definitions/tokenName" },
        "text": { "type": "string" },
        "href": { "type": "string" },
        "asset": { "$ref": "common.schema.json#/definitions/kebab" },
        "alt": { "type": "string" },
        "ratio": { "type": "string", "pattern": "^[0-9]+/[0-9]+$" },
        "items": { "type": "array", "items": { "type": "string" } },
        "name": { "$ref": "common.schema.json#/definitions/kebab" },
        "layout": { "$ref": "#/definitions/layout" },
        "children": { "type": "array", "items": { "$ref": "#/definitions/child" } },
        "ref": { "$ref": "common.schema.json#/definitions/kebab" },
        "variant": { "$ref": "common.schema.json#/definitions/kebab" },
        "props": { "type": "object" },
        "description": { "type": "string" }
      },
      "allOf": [
        { "if": { "properties": { "type": { "const": "heading" } } }, "then": { "required": ["level", "style", "text"], "properties": { "style": { "pattern": "^heading\\.h[1-6]$" } } } },
        { "if": { "properties": { "type": { "const": "text" } } }, "then": { "required": ["style", "text"], "properties": { "style": { "pattern": "^text\\." } } } },
        { "if": { "properties": { "type": { "const": "rich-text" } } }, "then": { "required": ["text"] } },
        { "if": { "properties": { "type": { "const": "image" } } }, "then": { "required": ["asset", "alt"] } },
        { "if": { "properties": { "type": { "const": "svg" } } }, "then": { "required": ["asset"] } },
        { "if": { "properties": { "type": { "const": "link" } } }, "then": { "required": ["text", "href"] } },
        { "if": { "properties": { "type": { "const": "button" } } }, "then": { "required": ["text", "href"] } },
        { "if": { "properties": { "type": { "const": "list" } } }, "then": { "required": ["items"] } },
        { "if": { "properties": { "type": { "const": "group" } } }, "then": { "required": ["name", "children"] } },
        { "if": { "properties": { "type": { "const": "component" } } }, "then": { "required": ["ref"] } },
        { "if": { "properties": { "type": { "const": "form" } } }, "then": { "required": ["description"] } },
        { "if": { "properties": { "type": { "const": "embed-placeholder" } } }, "then": { "required": ["description"] } }
      ]
    }
  }
}
```

- [ ] **Step 2: Crear fixture válido**

`tests/fixtures/spec-valid/project.yaml`:
```yaml
name: fixture-site
figma: { fileKey: "FIXTURE123", url: "https://www.figma.com/design/FIXTURE123/fixture" }
platforms: [webflow]
units: rem
breakpoints: { desktop: 1440, tablet: 991, mobileLandscape: 767, mobile: 478 }
pages:
  - { slug: home, figmaNode: "1:1" }
```

`tests/fixtures/spec-valid/tokens.yaml`:
```yaml
colors:
  - { name: brand.primary, value: "#1F4BFF", role: brand }
  - { name: brand.surface, value: "#F5F7FF", role: background }
  - { name: neutral.white, value: "#FFFFFF", role: background }
  - { name: neutral.black, value: "#0A0A0A", role: text }
typography:
  - { name: heading.h1, family: Inter, weight: 700, size: { desktop: 64, mobile: 40 }, lineHeight: 1.1, letterSpacing: -0.02 }
  - { name: heading.h2, family: Inter, weight: 700, size: { desktop: 48, tablet: 40, mobile: 32 }, lineHeight: 1.2 }
  - { name: text.large, family: Inter, weight: 400, size: { desktop: 20, mobile: 18 }, lineHeight: 1.5 }
  - { name: text.regular, family: Inter, weight: 400, size: 16, lineHeight: 1.5 }
spacing:
  section.large: { desktop: 128, mobile: 64 }
  section.medium: { desktop: 80, mobile: 48 }
  space.lg: 32
  space.md: { desktop: 24, mobile: 16 }
radii: { button: 8 }
shadows: []
fonts:
  - { family: Inter, weights: [400, 700], source: google }
```

`tests/fixtures/spec-valid/components.yaml`:
```yaml
components:
  - name: button
    figmaNode: "2:1"
    variants:
      - { name: primary, styles: { background: brand.primary, color: neutral.white, border: brand.primary } }
      - { name: secondary, styles: { background: neutral.white, color: brand.primary, border: brand.primary } }
    props: [text, href]
  - name: card
    figmaNode: "2:10"
    variants:
      - { name: default, styles: { background: neutral.white } }
    props: [title, body]
```

`tests/fixtures/spec-valid/pages/home.yaml`:
```yaml
page: home
figmaNode: "1:1"
sections:
  - id: hero
    figmaNode: "1:2"
    spacing: section.large
    container: large
    background: brand.surface
    layout: { type: grid, columns: { desktop: 2, tablet: 1 }, gap: space.lg }
    children:
      - { type: heading, level: 1, style: heading.h1, text: "Grow faster & smarter" }
      - { type: text, style: text.large, text: "Built for <teams> that ship." }
      - { type: component, ref: button, variant: primary, text: "Book a demo", href: "#contact" }
      - { type: image, asset: hero-mockup, alt: "Dashboard", ratio: "4/3" }
    notes: { interaction: "fade-up on load", responsive: "image below text on tablet" }
  - id: features
    figmaNode: "1:3"
    spacing: section.medium
    container: large
    layout: { type: stack, gap: space.md }
    children:
      - { type: heading, level: 2, style: heading.h2, text: "Features" }
      - type: group
        name: grid
        layout: { type: grid, columns: { desktop: 3, tablet: 2, mobile: 1 }, gap: space.md }
        children:
          - { type: component, ref: card, variant: default, props: { title: "Fast", body: "Ships quickly" } }
          - { type: component, ref: card, variant: default, props: { title: "Safe", body: "No surprises" } }
  - id: calculator
    figmaNode: "1:4"
    spacing: section.medium
    container: medium
    needsCodeComponent: true
    notes: { interaction: "live ROI calculation" }
    children:
      - { type: heading, level: 2, style: heading.h2, text: "ROI calculator" }
```

`tests/fixtures/spec-valid/assets/manifest.yaml`:
```yaml
assets:
  - { id: hero-mockup, figmaNode: "1:20", kind: raster, file: hero-mockup@2x.png, scale: 2, alt: "Dashboard" }
  - { id: logo, figmaNode: "1:21", kind: svg, file: logo.svg, alt: "Acme" }
```

`tests/fixtures/spec-valid/open-questions.md`:
```markdown
# Open questions

- [x] Hero copy confirmed by client
```

- [ ] **Step 3: Escribir helpers y tests de carga**

`tests/helpers.mjs`:
```js
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

export const VALID_SPEC = fileURLToPath(new URL('./fixtures/spec-valid', import.meta.url));

export function copyFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'site-spec-'));
  cpSync(VALID_SPEC, dir, { recursive: true });
  return dir;
}

export function editYaml(dir, rel, mutate) {
  const path = join(dir, rel);
  const data = parse(readFileSync(path, 'utf8'));
  mutate(data);
  writeFileSync(path, stringify(data));
}
```

`tests/load-spec.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSpec, SpecLoadError } from '../src/lib/load-spec.mjs';
import { VALID_SPEC, copyFixture } from './helpers.mjs';

test('loads every spec file', () => {
  const spec = loadSpec(VALID_SPEC);
  assert.equal(spec.project.name, 'fixture-site');
  assert.deepEqual(Object.keys(spec.pages), ['home']);
  assert.equal(spec.assets.assets.length, 2);
  assert.equal(spec.components.components.length, 2);
  assert.equal(spec.buildState, null);
  assert.match(spec.openQuestions, /\[x\]/);
});

test('missing required file throws SpecLoadError naming the file', () => {
  const dir = copyFixture();
  rmSync(join(dir, 'tokens.yaml'));
  assert.throws(() => loadSpec(dir), (err) => err instanceof SpecLoadError && err.file === 'tokens.yaml');
});

test('invalid YAML throws SpecLoadError naming the file', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'tokens.yaml'), 'colors: [\n');
  assert.throws(
    () => loadSpec(dir),
    (err) => err instanceof SpecLoadError && err.file === 'tokens.yaml' && /invalid YAML/.test(err.message),
  );
});

test('missing directory throws SpecLoadError', () => {
  assert.throws(() => loadSpec('/nonexistent/site-spec'), SpecLoadError);
});

test('reads build-state.json when present', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'build-state.json'), '{"webflow":{}}');
  assert.deepEqual(loadSpec(dir).buildState, { webflow: {} });
});
```

- [ ] **Step 4: Correr y ver fallar**

Run: `node --test tests/load-spec.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/load-spec.mjs'`.

- [ ] **Step 5: Implementar `loadSpec`**

`src/lib/load-spec.mjs`:
```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';

export class SpecLoadError extends Error {
  constructor(file, message) {
    super(`${file}: ${message}`);
    this.name = 'SpecLoadError';
    this.file = file;
  }
}

function readYaml(dir, rel) {
  const path = join(dir, rel);
  if (!existsSync(path)) throw new SpecLoadError(rel, 'file not found');
  try {
    return parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new SpecLoadError(rel, `invalid YAML: ${err.message}`);
  }
}

export function loadSpec(dir) {
  if (!existsSync(dir)) throw new SpecLoadError(dir, 'site-spec directory not found');

  const pages = {};
  const pagesDir = join(dir, 'pages');
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.yaml')).sort()) {
      pages[basename(file, '.yaml')] = readYaml(dir, join('pages', file));
    }
  }

  const openQuestionsPath = join(dir, 'open-questions.md');
  const buildStatePath = join(dir, 'build-state.json');
  let buildState = null;
  if (existsSync(buildStatePath)) {
    try {
      buildState = JSON.parse(readFileSync(buildStatePath, 'utf8'));
    } catch (err) {
      throw new SpecLoadError('build-state.json', `invalid JSON: ${err.message}`);
    }
  }

  return {
    dir,
    project: readYaml(dir, 'project.yaml'),
    tokens: readYaml(dir, 'tokens.yaml'),
    components: readYaml(dir, 'components.yaml'),
    assets: readYaml(dir, join('assets', 'manifest.yaml')),
    pages,
    openQuestions: existsSync(openQuestionsPath) ? readFileSync(openQuestionsPath, 'utf8') : '',
    buildState,
  };
}
```

- [ ] **Step 6: Correr y ver pasar**

Run: `node --test tests/load-spec.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add plugins/build-core/skills/site-spec/schemas src/lib/load-spec.mjs tests/helpers.mjs tests/fixtures tests/load-spec.test.mjs
git commit -m "feat: add site-spec schemas, fixture and loader"
```

---

### Task 4: `validateSpec` + helper CLI + CLI `validate-spec`

**Files:**
- Create: `src/lib/validate-spec.mjs`, `src/lib/cli.mjs`, `src/cli/validate-spec.mjs`
- Test: `tests/validate-spec.test.mjs`

**Interfaces:**
- Consumes: `loadSpec`, `SpecLoadError` (Task 3).
- Produces:
  - `validateSpec(spec, { requireResolvedQuestions = false } = {}) → { ok: boolean, errors: Array<{ file: string, path: string, message: string }> }`
  - `runCli(main: (argv: string[]) => object)` — imprime `JSON.stringify(result, null, 2)`; exit 1 si `result.ok === false` o si `main` lanza (entonces imprime `{ ok: false, errors: [{ file, path: '/', message }] }`).
  - CLI: `node src/cli/validate-spec.mjs [specDir=site-spec] [--require-resolved]`.

- [ ] **Step 1: Escribir tests**

`tests/validate-spec.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { validateSpec } from '../src/lib/validate-spec.mjs';
import { VALID_SPEC, copyFixture, editYaml } from './helpers.mjs';

function errorsFor(dir, options) {
  return validateSpec(loadSpec(dir), options).errors;
}

test('valid fixture passes', () => {
  const result = validateSpec(loadSpec(VALID_SPEC));
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('rejects non-kebab section id with exact path', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].id = 'Hero CTA'; });
  const errors = errorsFor(dir);
  assert.ok(errors.some((e) => e.file === 'pages/home.yaml' && e.path === '/sections/0/id'), JSON.stringify(errors));
});

test('rejects non-kebab group name', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].children[1].name = 'Card Grid'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/1/children/1/name'));
});

test('heading without level fails', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { delete p.sections[0].children[0].level; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/children/0' && /level/.test(e.message)));
});

test('page declared in project.yaml without a file', () => {
  const dir = copyFixture();
  editYaml(dir, 'project.yaml', (p) => { p.pages.push({ slug: 'about', figmaNode: '1:9' }); });
  assert.ok(errorsFor(dir).some((e) => /page "about" has no pages\/about\.yaml/.test(e.message)));
});

test('orphan page file not listed in project.yaml', () => {
  const dir = copyFixture();
  cpSync(join(dir, 'pages/home.yaml'), join(dir, 'pages/extra.yaml'));
  editYaml(dir, 'pages/extra.yaml', (p) => { p.page = 'extra'; });
  assert.ok(errorsFor(dir).some((e) => e.file === 'pages/extra.yaml' && /not listed in project\.yaml/.test(e.message)));
});

test('unknown color token', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].background = 'brand.missing'; });
  assert.ok(errorsFor(dir).some((e) => e.path === '/sections/0/background' && /unknown color token "brand\.missing"/.test(e.message)));
});

test('unknown component variant', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[2].variant = 'ghost'; });
  assert.ok(errorsFor(dir).some((e) => /unknown variant "ghost" for component "button"/.test(e.message)));
});

test('svg child must reference an svg asset', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children.push({ type: 'svg', asset: 'hero-mockup' }); });
  assert.ok(errorsFor(dir).some((e) => /must reference an asset of kind "svg"/.test(e.message)));
});

test('raster asset below 2x is rejected', () => {
  const dir = copyFixture();
  editYaml(dir, 'assets/manifest.yaml', (a) => { a.assets[0].scale = 1; });
  assert.ok(errorsFor(dir).some((e) => /scale 2 or higher/.test(e.message)));
});

test('duplicate section ids are rejected', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[1].id = 'hero'; });
  assert.ok(errorsFor(dir).some((e) => /duplicate section id "hero"/.test(e.message)));
});

test('reserved spacing token name is rejected', () => {
  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.spacing['space.top'] = 8; });
  assert.ok(errorsFor(dir).some((e) => e.file === 'tokens.yaml' && /reserved/.test(e.message)));
});

test('open questions only block with requireResolvedQuestions', () => {
  const dir = copyFixture();
  writeFileSync(join(dir, 'open-questions.md'), '# Open questions\n\n- [ ] Missing mobile frame\n- [x] Done\n');
  assert.equal(validateSpec(loadSpec(dir)).ok, true);
  const errors = errorsFor(dir, { requireResolvedQuestions: true });
  assert.deepEqual(errors, [{ file: 'open-questions.md', path: '/', message: 'unresolved: Missing mobile frame' }]);
});

test('CLI prints JSON and sets exit code', () => {
  const ok = spawnSync(process.execPath, ['src/cli/validate-spec.mjs', VALID_SPEC], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).ok, true);

  const missing = spawnSync(process.execPath, ['src/cli/validate-spec.mjs', '/nonexistent'], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).ok, false);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/validate-spec.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/validate-spec.mjs'`.

- [ ] **Step 3: Implementar `validateSpec`**

`src/lib/validate-spec.mjs`:
```js
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
const validators = {
  project: ajv.compile(projectSchema),
  tokens: ajv.compile(tokensSchema),
  components: ajv.compile(componentsSchema),
  page: ajv.compile(pageSchema),
  assets: ajv.compile(assetsSchema),
};

const RESERVED_SPACING = new Set(['top', 'bottom', 'left', 'right', 'horizontal', 'vertical']);

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
    if (asset.kind === 'raster' && (asset.scale ?? 1) < 2) {
      err('assets/manifest.yaml', `/assets/${i}`, `raster asset "${asset.id}" must be exported at scale 2 or higher`);
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

  const checkChild = (file, child, path, groupNames) => {
    if (child.style && !typography.has(child.style)) err(file, `${path}/style`, `unknown typography token "${child.style}"`);
    if (child.type === 'image' || child.type === 'svg') {
      const asset = assets.get(child.asset);
      const expected = child.type === 'svg' ? 'svg' : 'raster';
      if (!asset) err(file, `${path}/asset`, `unknown asset "${child.asset}"`);
      else if (asset.kind !== expected) err(file, `${path}/asset`, `${child.type} must reference an asset of kind "${expected}", "${child.asset}" is "${asset.kind}"`);
    }
    if (child.type === 'component') checkVariant(file, path, child.ref, child.variant);
    if (child.type === 'button' && child.variant) checkVariant(file, path, 'button', child.variant);
    if (child.type === 'group') {
      if (groupNames.has(child.name)) err(file, `${path}/name`, `duplicate group name "${child.name}" in section`);
      groupNames.add(child.name);
    }
    if (child.layout) checkLayout(file, child.layout, `${path}/layout`);
    (child.children ?? []).forEach((c, i) => checkChild(file, c, `${path}/children/${i}`, groupNames));
  };

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
```

- [ ] **Step 4: Implementar `runCli` y el CLI**

`src/lib/cli.mjs`:
```js
export function runCli(main) {
  let result;
  try {
    result = main(process.argv.slice(2));
  } catch (err) {
    result = { ok: false, errors: [{ file: err.file ?? null, path: '/', message: err.message }] };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok === false ? 1 : 0);
}
```

`src/cli/validate-spec.mjs`:
```js
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';

runCli((argv) => {
  const dir = argv.find((a) => !a.startsWith('--')) ?? 'site-spec';
  return validateSpec(loadSpec(dir), { requireResolvedQuestions: argv.includes('--require-resolved') });
});
```

- [ ] **Step 5: Correr y ver pasar**

Run: `node --test tests/validate-spec.test.mjs`
Expected: PASS (14 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validate-spec.mjs src/lib/cli.mjs src/cli/validate-spec.mjs tests/validate-spec.test.mjs
git commit -m "feat: validate site-spec schemas and cross references"
```

---

### Task 5: Validador de nombres Client-First

**Files:**
- Create: `src/lib/class-names.mjs`, `src/cli/validate-class-names.mjs`
- Test: `tests/class-names.test.mjs`

**Interfaces:**
- Consumes: `runCli` (Task 4).
- Produces:
  - `validateClassName(name: string) → { ok: true, kind: 'custom' | 'combo' | 'utility' } | { ok: false, reason: string }`
  - CLI: `node src/cli/validate-class-names.mjs <name>...` → `{ ok, results: [{ name, ok, kind?, reason? }] }`

- [ ] **Step 1: Escribir tests**

`tests/class-names.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateClassName } from '../src/lib/class-names.mjs';

const VALID = [
  ['section_hero', 'custom'],
  ['hero_image-wrapper', 'custom'],
  ['is-secondary', 'combo'],
  ['page-wrapper', 'utility'],
  ['padding-global', 'utility'],
  ['container-large', 'utility'],
  ['padding-section-large', 'utility'],
  ['heading-style-h1', 'utility'],
  ['text-size-large', 'utility'],
  ['text-color-brand-primary', 'utility'],
  ['background-color-neutral-white', 'utility'],
  ['margin-bottom', 'utility'],
  ['margin-lg', 'utility'],
  ['button', 'utility'],
  ['hide-mobile-portrait', 'utility'],
];

const INVALID = [
  ['', /non-empty/],
  ['Hero', /lowercase/],
  ['hero image', /spaces/],
  ['hero__image', /single underscore/],
  ['is-Secondary', /lowercase/],
  ['is-', /combo classes/],
  ['hero-image', /not a Client-First utility/],
  ['container-xl', /not a Client-First utility/],
];

for (const [name, kind] of VALID) {
  test(`valid: ${name}`, () => assert.deepEqual(validateClassName(name), { ok: true, kind }));
}

for (const [name, reason] of INVALID) {
  test(`invalid: "${name}"`, () => {
    const result = validateClassName(name);
    assert.equal(result.ok, false);
    assert.match(result.reason, reason);
  });
}

test('CLI exits 1 when any name is invalid', () => {
  const run = spawnSync(process.execPath, ['src/cli/validate-class-names.mjs', 'section_hero', 'Hero'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  const out = JSON.parse(run.stdout);
  assert.equal(out.ok, false);
  assert.deepEqual(out.results.map((r) => r.ok), [true, false]);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/class-names.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/class-names.mjs'`.

- [ ] **Step 3: Implementar**

`src/lib/class-names.mjs`:
```js
const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const CUSTOM = new RegExp(`^${SEGMENT}_${SEGMENT}$`);
const COMBO = new RegExp(`^is-${SEGMENT}$`);

const UTILITY_PATTERNS = [
  /^page-wrapper$/,
  /^main-wrapper$/,
  /^padding-global$/,
  /^container-(small|medium|large)$/,
  /^padding-section-(small|medium|large)$/,
  /^heading-style-h[1-6]$/,
  /^text-size-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^text-weight-(light|normal|medium|semibold|bold)$/,
  /^text-color-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^background-color-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^text-align-(left|center|right)$/,
  /^text-rich-text$/,
  /^(margin|padding)-(top|bottom|left|right|horizontal|vertical)$/,
  /^(margin|padding)-[a-z0-9]+(-[a-z0-9]+)*$/,
  /^max-width-(small|medium|large)$/,
  /^hide-(tablet|mobile-landscape|mobile-portrait)$/,
  /^button$/,
];

export function validateClassName(name) {
  if (typeof name !== 'string' || name.length === 0) return { ok: false, reason: 'class name must be a non-empty string' };
  if (/[A-Z]/.test(name)) return { ok: false, reason: 'class names must be lowercase' };
  if (/\s/.test(name)) return { ok: false, reason: 'class names cannot contain spaces' };
  if (name.startsWith('is-')) {
    return COMBO.test(name) ? { ok: true, kind: 'combo' } : { ok: false, reason: 'combo classes must match is-<kebab-case>' };
  }
  if (name.includes('_')) {
    return CUSTOM.test(name)
      ? { ok: true, kind: 'custom' }
      : { ok: false, reason: 'custom classes must match <folder>_<element> with a single underscore and kebab-case parts' };
  }
  return UTILITY_PATTERNS.some((p) => p.test(name))
    ? { ok: true, kind: 'utility' }
    : { ok: false, reason: `"${name}" is not a Client-First utility; custom classes need a folder prefix like section_ or hero_` };
}
```

`src/cli/validate-class-names.mjs`:
```js
import { runCli } from '../lib/cli.mjs';
import { validateClassName } from '../lib/class-names.mjs';

runCli((argv) => {
  const results = argv.map((name) => ({ name, ...validateClassName(name) }));
  return { ok: results.every((r) => r.ok), results };
});
```

- [ ] **Step 4: Correr y ver pasar**

Run: `node --test tests/class-names.test.mjs`
Expected: PASS (24 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/class-names.mjs src/cli/validate-class-names.mjs tests/class-names.test.mjs
git commit -m "feat: add Client-First class name validator"
```

---

### Task 6: `specHash` + `planSection` + CLI `plan-section`

**Files:**
- Create: `src/lib/spec-hash.mjs`, `src/lib/plan-section.mjs`, `src/cli/plan-section.mjs`
- Test: `tests/plan-section.test.mjs`

**Interfaces:**
- Consumes: `resolveResponsive`, `changedBreakpoints`, `variableName`, `responsiveVariableNames`, `primaryVariantName` (Task 2); `loadSpec` (Task 3); `validateSpec`, `runCli` (Task 4); `validateClassName` (Task 5, solo en tests).
- Produces:
  - `stableStringify(value) → string`
  - `collectRefs(section) → { tokens: string[], components: string[], assets: string[] }`
  - `sectionHash(section, spec) → "sha256:<64 hex>"`
  - `escapeHtml(text) → string`
  - `planSection(spec, pageSlug, sectionId) → Plan` donde
    ```
    Plan = {
      page, section, specHash,
      classesToCreate: string[],          // custom classes, orden de aparición
      utilitiesUsed: string[],            // utilities + combos usados (ordenados)
      whtml: string,
      styles: Array<{ class, breakpoint: 'main'|'medium'|'small', props: Record<string,string>, variables: Record<string,string> }>,
      assets: Array<{ id, kind: 'raster'|'svg', alt, targetClass, order }>,
      components: Array<{ ref, variant, props, targetClass, order }>,
      interactions: Array<{ note, targetClass }>,
      placeholders: Array<{ type: 'code-component'|'form'|'embed-placeholder', targetClass, order, description }>
    }
    ```
    `order` = posición 1-based entre elementos con la misma `targetClass`.
  - CLI: `node src/cli/plan-section.mjs <specDir> <page> <sectionId>` → `{ ok: true, ...Plan }` o `{ ok: false, errors }` si el spec no valida.

- [ ] **Step 1: Escribir tests**

`tests/plan-section.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { planSection, escapeHtml } from '../src/lib/plan-section.mjs';
import { validateClassName } from '../src/lib/class-names.mjs';
import { VALID_SPEC, copyFixture, editYaml } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);
const hero = planSection(spec, 'home', 'hero');

test('escapeHtml escapes &, <, > and quotes', () => {
  assert.equal(escapeHtml('a & <b> "c"'), 'a &amp; &lt;b&gt; &quot;c&quot;');
});

test('hero: Client-First wrapper structure', () => {
  assert.ok(hero.whtml.startsWith(
    '<section class="section_hero"><div class="padding-global"><div class="container-large"><div class="padding-section-large"><div class="hero_component">',
  ), hero.whtml);
  assert.ok(hero.whtml.endsWith('</div></div></div></div></section>'));
});

test('hero: copy is escaped, never injected as tags', () => {
  assert.ok(hero.whtml.includes('<h1 class="heading-style-h1">Grow faster &amp; smarter</h1>'));
  assert.ok(hero.whtml.includes('<p class="text-size-large">Built for &lt;teams&gt; that ship.</p>'));
  assert.ok(!hero.whtml.includes('<teams>'));
});

test('hero: classes and utilities', () => {
  assert.deepEqual(hero.classesToCreate, ['section_hero', 'hero_component', 'hero_image-wrapper', 'hero_image']);
  assert.deepEqual(hero.utilitiesUsed, ['button', 'container-large', 'heading-style-h1', 'padding-global', 'padding-section-large', 'text-size-large']);
  for (const name of [...hero.classesToCreate, ...hero.utilitiesUsed]) assert.ok(validateClassName(name).ok, name);
});

test('hero: background bound to a variable', () => {
  assert.deepEqual(hero.styles.find((s) => s.class === 'section_hero'), {
    class: 'section_hero', breakpoint: 'main', props: {}, variables: { 'background-color': 'brand-surface' },
  });
});

test('hero: grid styles only on breakpoints that change', () => {
  assert.deepEqual(hero.styles.filter((s) => s.class === 'hero_component'), [
    { class: 'hero_component', breakpoint: 'main', props: { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' }, variables: { 'row-gap': 'space-lg', 'column-gap': 'space-lg' } },
    { class: 'hero_component', breakpoint: 'medium', props: { 'grid-template-columns': 'repeat(1, minmax(0, 1fr))' }, variables: {} },
  ]);
});

test('hero: primary button has no combo class', () => {
  assert.ok(hero.whtml.includes('<a class="button" href="#contact">Book a demo</a>'));
});

test('hero: image asset and ratio', () => {
  assert.deepEqual(hero.assets, [{ id: 'hero-mockup', kind: 'raster', alt: 'Dashboard', targetClass: 'hero_image', order: 1 }]);
  assert.ok(hero.whtml.includes('<div class="hero_image-wrapper"><img class="hero_image" alt="Dashboard"></div>'));
  assert.equal(hero.styles.find((s) => s.class === 'hero_image-wrapper').props['aspect-ratio'], '4 / 3');
});

test('hero: interaction note targets the section', () => {
  assert.deepEqual(hero.interactions, [{ note: 'fade-up on load', targetClass: 'section_hero' }]);
});

test('features: group and ordered component slots', () => {
  const plan = planSection(spec, 'home', 'features');
  assert.ok(plan.whtml.includes('<div class="features_grid"><div class="features_card-slot"></div><div class="features_card-slot"></div></div>'));
  assert.deepEqual(plan.components.map((c) => [c.ref, c.variant, c.order, c.props.title]), [['card', 'default', 1, 'Fast'], ['card', 'default', 2, 'Safe']]);
  const grid = plan.styles.filter((s) => s.class === 'features_grid');
  assert.deepEqual(grid.map((s) => s.breakpoint), ['main', 'medium', 'small']);
  assert.deepEqual(grid[2].variables, { 'row-gap': 'space-md-mobile', 'column-gap': 'space-md-mobile' });
  const stack = plan.styles.filter((s) => s.class === 'features_component');
  assert.equal(stack[0].props['flex-direction'], 'column');
});

test('secondary button variant becomes an is- combo', () => {
  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].children[2].variant = 'secondary'; });
  const plan = planSection(loadSpec(dir), 'home', 'hero');
  assert.ok(plan.whtml.includes('<a class="button is-secondary" href="#contact">'));
  assert.ok(plan.utilitiesUsed.includes('is-secondary'));
});

test('calculator: code component slot after native children', () => {
  const plan = planSection(spec, 'home', 'calculator');
  assert.ok(plan.whtml.includes('<h2 class="heading-style-h2">ROI calculator</h2><div class="calculator_code-component-slot"></div>'));
  assert.deepEqual(plan.placeholders, [
    { type: 'code-component', targetClass: 'calculator_code-component-slot', order: 1, description: 'live ROI calculation' },
  ]);
  assert.deepEqual(plan.interactions, []);
});

test('unknown page or section throws', () => {
  assert.throws(() => planSection(spec, 'about', 'hero'), /unknown page "about"/);
  assert.throws(() => planSection(spec, 'home', 'nope'), /unknown section "nope"/);
});

test('specHash: stable, sensitive to section and referenced tokens only', () => {
  assert.match(hero.specHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(planSection(loadSpec(VALID_SPEC), 'home', 'hero').specHash, hero.specHash);

  const dir = copyFixture();
  editYaml(dir, 'tokens.yaml', (t) => { t.colors.find((c) => c.name === 'neutral.black').value = '#111111'; });
  assert.equal(planSection(loadSpec(dir), 'home', 'hero').specHash, hero.specHash, 'unrelated token must not change hash');

  editYaml(dir, 'tokens.yaml', (t) => { t.colors.find((c) => c.name === 'brand.surface').value = '#EEEEEE'; });
  assert.notEqual(planSection(loadSpec(dir), 'home', 'hero').specHash, hero.specHash, 'referenced token must change hash');

  const dir2 = copyFixture();
  editYaml(dir2, 'pages/home.yaml', (p) => { p.sections[0].children[0].text = 'New headline'; });
  assert.notEqual(planSection(loadSpec(dir2), 'home', 'hero').specHash, hero.specHash, 'section edit must change hash');
});

test('CLI validates the spec before planning', () => {
  const ok = spawnSync(process.execPath, ['src/cli/plan-section.mjs', VALID_SPEC, 'home', 'hero'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  const out = JSON.parse(ok.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.section, 'hero');

  const dir = copyFixture();
  editYaml(dir, 'pages/home.yaml', (p) => { p.sections[0].background = 'brand.missing'; });
  const bad = spawnSync(process.execPath, ['src/cli/plan-section.mjs', dir, 'home', 'hero'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/plan-section.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/plan-section.mjs'`.

- [ ] **Step 3: Implementar `spec-hash.mjs`**

`src/lib/spec-hash.mjs`:
```js
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
```

- [ ] **Step 4: Implementar `plan-section.mjs`**

`src/lib/plan-section.mjs`:
```js
import { changedBreakpoints, resolveResponsive } from './responsive.mjs';
import { responsiveVariableNames, variableName } from './variables.mjs';
import { primaryVariantName } from './components.mjs';
import { sectionHash } from './spec-hash.mjs';

const BREAKPOINTS = ['main', 'medium', 'small'];

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function layoutStyles(cls, layout, spec) {
  const props = { main: {}, medium: {}, small: {} };
  const vars = { main: {}, medium: {}, small: {} };
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
      vars[bp]['row-gap'] = name;
      vars[bp]['column-gap'] = name;
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
    const wrapperProps = { overflow: 'hidden' };
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

function renderChild(child, ctx) {
  const id = ctx.section.id;
  switch (child.type) {
    case 'heading': {
      const cls = `heading-style-${child.style.split('.')[1]}`;
      ctx.utilities.add(cls);
      return `<h${child.level} class="${cls}">${escapeHtml(child.text)}</h${child.level}>`;
    }
    case 'text': {
      const cls = `text-size-${child.style.split('.')[1]}`;
      ctx.utilities.add(cls);
      return `<p class="${cls}">${escapeHtml(child.text)}</p>`;
    }
    case 'rich-text': {
      ctx.utilities.add('text-rich-text');
      const paragraphs = String(child.text).split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('');
      return `<div class="text-rich-text">${paragraphs}</div>`;
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
      if (child.layout) ctx.plan.styles.push(...layoutStyles(cls, child.layout, ctx.spec));
      return `<div class="${cls}">${(child.children ?? []).map((c) => renderChild(c, ctx)).join('')}</div>`;
    }
    case 'component': {
      if (child.ref === 'button') return renderButton(child, ctx);
      const cls = `${id}_${child.ref}-slot`;
      ctx.custom.add(cls);
      ctx.plan.components.push({ ref: child.ref, variant: child.variant ?? null, props: child.props ?? {}, targetClass: cls, order: nextOrder(ctx, cls) });
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
  };
  const ctx = { spec, section, plan, custom: new Set(), utilities: new Set(), imageClasses: new Map(), counts: new Map() };

  const sectionClass = `section_${section.id}`;
  const componentClass = `${section.id}_component`;
  ctx.custom.add(sectionClass);
  ctx.custom.add(componentClass);
  ctx.utilities.add('padding-global');

  if (section.background) {
    plan.styles.push({ class: sectionClass, breakpoint: 'main', props: {}, variables: { 'background-color': variableName(section.background) } });
  }
  if (section.layout) plan.styles.push(...layoutStyles(componentClass, section.layout, spec));

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

  let body = `<div class="${componentClass}">${inner}</div>`;
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
  plan.whtml = `<section class="${sectionClass}"><div class="padding-global">${body}</div></section>`;
  plan.classesToCreate = [...ctx.custom];
  plan.utilitiesUsed = [...ctx.utilities].sort();
  return plan;
}
```

`src/cli/plan-section.mjs`:
```js
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';
import { planSection } from '../lib/plan-section.mjs';

runCli(([dir = 'site-spec', page, section]) => {
  if (!page || !section) throw new Error('usage: plan-section <specDir> <page> <sectionId>');
  const spec = loadSpec(dir);
  const validation = validateSpec(spec);
  if (!validation.ok) return validation;
  return { ok: true, ...planSection(spec, page, section) };
});
```

- [ ] **Step 5: Correr y ver pasar**

Run: `node --test tests/plan-section.test.mjs`
Expected: PASS (15 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/spec-hash.mjs src/lib/plan-section.mjs src/cli/plan-section.mjs tests/plan-section.test.mjs
git commit -m "feat: plan Client-First section builds from site-spec"
```

---

### Task 7: `planSetup` + CLI `plan-setup`

**Files:**
- Create: `src/lib/plan-setup.mjs`, `src/cli/plan-setup.mjs`
- Test: `tests/plan-setup.test.mjs`

**Interfaces:**
- Consumes: `pxToRem`, `resolveResponsive`, `variableName`, `responsiveVariableNames`, `primaryVariantName` (Task 2); `loadSpec`; `validateSpec`, `runCli`; `validateClassName` (tests).
- Produces:
  - `planSetup(spec) → SetupPlan` donde
    ```
    SetupPlan = {
      variables: Array<{ collection: 'Colors'|'Typography'|'Spacing', name, type: 'color'|'size', value }>,
      fonts: tokens.fonts,
      styles: Array<{ class, breakpoint: 'main'|'medium'|'small'|'tiny', props, variables, comboOf? }>,
      classes: string[],          // todas las utilities a crear (incluye las sin estilos)
      components: string[]        // componentes Webflow a crear (todos menos "button")
    }
    ```
    Nombres de variables idénticos a los que usa `planSection` (`responsiveVariableNames`; tipografía con sufijo `-size`).
  - CLI: `node src/cli/plan-setup.mjs <specDir>` → `{ ok: true, ...SetupPlan }` o errores de validación.

- [ ] **Step 1: Escribir tests**

`tests/plan-setup.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { planSetup } from '../src/lib/plan-setup.mjs';
import { planSection } from '../src/lib/plan-section.mjs';
import { validateClassName } from '../src/lib/class-names.mjs';
import { VALID_SPEC } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);
const setup = planSetup(spec);
const vars = (collection) => setup.variables.filter((v) => v.collection === collection).map((v) => [v.name, v.value]);

test('color variables keep hex values', () => {
  assert.deepEqual(vars('Colors'), [
    ['brand-primary', '#1F4BFF'], ['brand-surface', '#F5F7FF'], ['neutral-white', '#FFFFFF'], ['neutral-black', '#0A0A0A'],
  ]);
});

test('typography variables are responsive and in rem', () => {
  const typo = vars('Typography');
  assert.deepEqual(typo.filter(([n]) => n.startsWith('heading-h1')), [['heading-h1-size', '4rem'], ['heading-h1-size-mobile', '2.5rem']]);
  assert.deepEqual(typo.filter(([n]) => n.startsWith('heading-h2')), [
    ['heading-h2-size', '3rem'], ['heading-h2-size-tablet', '2.5rem'], ['heading-h2-size-mobile', '2rem'],
  ]);
});

test('heading utility binds font-size variables per breakpoint', () => {
  assert.deepEqual(setup.styles.filter((s) => s.class === 'heading-style-h1'), [
    { class: 'heading-style-h1', breakpoint: 'main', props: { 'font-family': 'Inter', 'font-weight': '700', 'line-height': '1.1', 'letter-spacing': '-0.02em' }, variables: { 'font-size': 'heading-h1-size' } },
    { class: 'heading-style-h1', breakpoint: 'small', props: {}, variables: { 'font-size': 'heading-h1-size-mobile' } },
  ]);
});

test('section padding uses spacing tokens and falls back to defaults', () => {
  assert.deepEqual(vars('Spacing').filter(([n]) => n.startsWith('section-')), [
    ['section-small', '3rem'], ['section-medium', '5rem'], ['section-medium-mobile', '3rem'], ['section-large', '8rem'], ['section-large-mobile', '4rem'],
  ]);
  assert.deepEqual(setup.styles.filter((s) => s.class === 'padding-section-large').map((s) => [s.breakpoint, s.variables['padding-top']]), [
    ['main', 'section-large'], ['small', 'section-large-mobile'],
  ]);
});

test('margin and padding size utilities come from space tokens', () => {
  assert.deepEqual(setup.styles.filter((s) => s.class === 'margin-md').map((s) => [s.breakpoint, s.variables['margin-top']]), [
    ['main', 'space-md'], ['small', 'space-md-mobile'],
  ]);
  assert.deepEqual(setup.styles.find((s) => s.class === 'margin-bottom').props, { 'margin-top': '0', 'margin-right': '0', 'margin-left': '0' });
});

test('button base and combos come from components.yaml', () => {
  const button = setup.styles.find((s) => s.class === 'button');
  assert.equal(button.variables['background-color'], 'brand-primary');
  assert.equal(button.variables.color, 'neutral-white');
  assert.equal(button.props['border-top-left-radius'], '0.5rem');
  const combo = setup.styles.find((s) => s.class === 'is-secondary');
  assert.equal(combo.comboOf, 'button');
  assert.equal(combo.variables.color, 'brand-primary');
});

test('hide utilities target their breakpoint', () => {
  assert.deepEqual(setup.styles.filter((s) => s.class.startsWith('hide-')).map((s) => [s.class, s.breakpoint]), [
    ['hide-tablet', 'medium'], ['hide-mobile-landscape', 'small'], ['hide-mobile-portrait', 'tiny'],
  ]);
});

test('every generated class is valid Client-First', () => {
  for (const name of setup.classes) assert.ok(validateClassName(name).ok, name);
  assert.ok(setup.classes.includes('page-wrapper'));
  assert.ok(setup.classes.includes('main-wrapper'));
});

test('every utility and variable a section plan uses exists in the setup plan', () => {
  const variableNames = new Set(setup.variables.map((v) => v.name));
  for (const section of spec.pages.home.sections) {
    const plan = planSection(spec, 'home', section.id);
    for (const utility of plan.utilitiesUsed) assert.ok(setup.classes.includes(utility), `${section.id}: ${utility}`);
    for (const style of plan.styles) {
      for (const variable of Object.values(style.variables)) assert.ok(variableNames.has(variable), `${section.id}: ${variable}`);
    }
  }
});

test('components to build exclude button', () => {
  assert.deepEqual(setup.components, ['card']);
});

test('CLI outputs ok plan', () => {
  const run = spawnSync(process.execPath, ['src/cli/plan-setup.mjs', VALID_SPEC], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).ok, true);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/plan-setup.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/plan-setup.mjs'`.

- [ ] **Step 3: Implementar**

`src/lib/plan-setup.mjs`:
```js
import { pxToRem } from './units.mjs';
import { responsiveVariableNames, variableName } from './variables.mjs';
import { primaryVariantName } from './components.mjs';

const CONTAINERS_REM = { small: 48, medium: 64, large: 80 };
const SECTION_DEFAULTS_PX = { small: 48, medium: 80, large: 128 };
const WEIGHTS = { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700 };
const MAX_WIDTHS_REM = { small: 20, medium: 32, large: 48 };
const SIDES = ['top', 'right', 'bottom', 'left'];
const VARIANT_PROPS = {
  background: ['background-color'],
  color: ['color'],
  border: SIDES.map((s) => `border-${s}-color`),
};

function variantVariables(variant) {
  const out = {};
  for (const [key, token] of Object.entries(variant?.styles ?? {})) {
    for (const prop of VARIANT_PROPS[key]) out[prop] = variableName(token);
  }
  return out;
}

export function planSetup(spec) {
  const variables = [];
  const styles = [];
  const classes = new Set(['page-wrapper', 'main-wrapper', 'text-rich-text']);

  const style = (cls, breakpoint, props = {}, vars = {}, extra = {}) => {
    classes.add(cls);
    styles.push({ class: cls, breakpoint, props, variables: vars, ...extra });
  };
  const sizeVariables = (collection, token, value, suffix = '') => {
    const names = responsiveVariableNames(token, value, suffix);
    for (const { name, value: px } of Object.values(names)) variables.push({ collection, name, type: 'size', value: pxToRem(px) });
    return names;
  };

  for (const color of spec.tokens.colors) {
    variables.push({ collection: 'Colors', name: variableName(color.name), type: 'color', value: color.value });
  }

  style('padding-global', 'main', { 'padding-left': '2.5rem', 'padding-right': '2.5rem' });
  style('padding-global', 'small', { 'padding-left': '1.25rem', 'padding-right': '1.25rem' });
  for (const [size, rem] of Object.entries(CONTAINERS_REM)) {
    style(`container-${size}`, 'main', { width: '100%', 'max-width': `${rem}rem`, 'margin-left': 'auto', 'margin-right': 'auto' });
  }
  for (const [size, px] of Object.entries(SECTION_DEFAULTS_PX)) {
    const token = `section.${size}`;
    const names = sizeVariables('Spacing', token, spec.tokens.spacing[token] ?? px);
    for (const [bp, { name }] of Object.entries(names)) {
      style(`padding-section-${size}`, bp, {}, { 'padding-top': name, 'padding-bottom': name });
    }
  }

  for (const type of spec.tokens.typography) {
    const [group, size] = type.name.split('.');
    const cls = group === 'heading' ? `heading-style-${size}` : `text-size-${size}`;
    const props = { 'font-family': type.family, 'font-weight': String(type.weight), 'line-height': String(type.lineHeight) };
    if (type.letterSpacing !== undefined) props['letter-spacing'] = `${type.letterSpacing}em`;
    const names = sizeVariables('Typography', type.name, type.size, '-size');
    for (const [bp, { name }] of Object.entries(names)) style(cls, bp, bp === 'main' ? props : {}, { 'font-size': name });
  }

  for (const [token, value] of Object.entries(spec.tokens.spacing)) {
    if (token.startsWith('section.')) continue;
    const size = token.slice('space.'.length);
    const names = sizeVariables('Spacing', token, value);
    for (const kind of ['margin', 'padding']) {
      for (const [bp, { name }] of Object.entries(names)) {
        style(`${kind}-${size}`, bp, {}, Object.fromEntries(SIDES.map((side) => [`${kind}-${side}`, name])));
      }
    }
  }
  for (const kind of ['margin', 'padding']) {
    for (const side of SIDES) {
      style(`${kind}-${side}`, 'main', Object.fromEntries(SIDES.filter((s) => s !== side).map((s) => [`${kind}-${s}`, '0'])));
    }
    style(`${kind}-horizontal`, 'main', { [`${kind}-top`]: '0', [`${kind}-bottom`]: '0' });
    style(`${kind}-vertical`, 'main', { [`${kind}-left`]: '0', [`${kind}-right`]: '0' });
  }

  for (const color of spec.tokens.colors) {
    const name = variableName(color.name);
    style(`text-color-${name}`, 'main', {}, { color: name });
    style(`background-color-${name}`, 'main', {}, { 'background-color': name });
  }
  for (const [name, weight] of Object.entries(WEIGHTS)) style(`text-weight-${name}`, 'main', { 'font-weight': String(weight) });
  for (const [name, rem] of Object.entries(MAX_WIDTHS_REM)) style(`max-width-${name}`, 'main', { width: '100%', 'max-width': `${rem}rem` });
  for (const align of ['left', 'center', 'right']) style(`text-align-${align}`, 'main', { 'text-align': align });
  style('hide-tablet', 'medium', { display: 'none' });
  style('hide-mobile-landscape', 'small', { display: 'none' });
  style('hide-mobile-portrait', 'tiny', { display: 'none' });

  const button = spec.components.components.find((c) => c.name === 'button');
  if (button) {
    const base = {
      display: 'inline-block',
      'padding-top': '0.75rem',
      'padding-bottom': '0.75rem',
      'padding-left': '1.5rem',
      'padding-right': '1.5rem',
      'text-decoration': 'none',
    };
    for (const side of SIDES) {
      base[`border-${side}-width`] = '1px';
      base[`border-${side}-style`] = 'solid';
    }
    const radius = spec.tokens.radii?.button;
    if (radius !== undefined) {
      for (const corner of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) base[`border-${corner}-radius`] = pxToRem(radius);
    }
    const primary = primaryVariantName(button);
    style('button', 'main', base, variantVariables(button.variants.find((v) => v.name === primary)));
    for (const variant of button.variants) {
      if (variant.name !== primary) style(`is-${variant.name}`, 'main', {}, variantVariables(variant), { comboOf: 'button' });
    }
  }

  return {
    variables,
    fonts: spec.tokens.fonts,
    styles,
    classes: [...classes],
    components: spec.components.components.filter((c) => c.name !== 'button').map((c) => c.name),
  };
}
```

`src/cli/plan-setup.mjs`:
```js
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { validateSpec } from '../lib/validate-spec.mjs';
import { planSetup } from '../lib/plan-setup.mjs';

runCli(([dir = 'site-spec']) => {
  const spec = loadSpec(dir);
  const validation = validateSpec(spec);
  if (!validation.ok) return validation;
  return { ok: true, ...planSetup(spec) };
});
```

- [ ] **Step 4: Correr y ver pasar**

Run: `node --test tests/plan-setup.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-setup.mjs src/cli/plan-setup.mjs tests/plan-setup.test.mjs
git commit -m "feat: plan Client-First bootstrap from tokens and components"
```

---

### Task 8: QA estructural (`checkStructure`) + CLI `qa-structural`

**Files:**
- Create: `src/lib/qa-structural.mjs`, `src/cli/qa-structural.mjs`
- Test: `tests/qa-structural.test.mjs`

**Interfaces:**
- Consumes: `validateClassName` (Task 5), `pxToRem`, `resolveResponsive` (Task 2), `loadSpec`, `runCli`.
- Produces:
  - Formato de dump (lo arma el agente desde Webflow MCP):
    ```
    Dump = {
      sections: Array<{ id, classes: string[], headings: number[], images: Array<{ alt }>, links: Array<{ href }> }>,  // orden DOM
      styles: Array<{ name, breakpoint, props: Record<string,string> }>
    }
    ```
  - `tokenValueIndex(spec) → Map<normalizedValue, tokenName>` (hex en minúscula, `Nrem` y `Npx`)
  - `checkStructure(spec, pageSlug, dump) → { ok: boolean, findings: Array<{ severity: 'high'|'medium', section: string|null, message }> }`; `ok = findings.length === 0`.
  - CLI: `node src/cli/qa-structural.mjs <specDir> <page> <dump.json>`

- [ ] **Step 1: Escribir tests**

`tests/qa-structural.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSpec } from '../src/lib/load-spec.mjs';
import { checkStructure } from '../src/lib/qa-structural.mjs';
import { VALID_SPEC } from './helpers.mjs';

const spec = loadSpec(VALID_SPEC);

function goodDump() {
  return {
    sections: [
      { id: 'hero', classes: ['section_hero', 'padding-global', 'container-large', 'padding-section-large', 'hero_component', 'heading-style-h1', 'text-size-large', 'button', 'hero_image-wrapper', 'hero_image'], headings: [1], images: [{ alt: 'Dashboard' }], links: [{ href: '#contact' }] },
      { id: 'features', classes: ['section_features', 'features_grid'], headings: [2], images: [], links: [] },
      { id: 'calculator', classes: ['section_calculator'], headings: [2], images: [], links: [] },
    ],
    styles: [{ name: 'hero_component', breakpoint: 'main', props: { display: 'grid' } }],
  };
}

test('clean page passes', () => {
  assert.deepEqual(checkStructure(spec, 'home', goodDump()), { ok: true, findings: [] });
});

test('missing section is high severity', () => {
  const dump = goodDump();
  dump.sections.pop();
  const result = checkStructure(spec, 'home', dump);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, [{ severity: 'high', section: 'calculator', message: 'section "calculator" from spec not found in Webflow' }]);
});

test('invalid class name is high severity', () => {
  const dump = goodDump();
  dump.sections[0].classes.push('Hero Title');
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => f.severity === 'high' && /invalid class "Hero Title"/.test(f.message)));
});

test('more than one h1 is high severity', () => {
  const dump = goodDump();
  dump.sections[1].headings = [1];
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => /exactly one h1, found 2/.test(f.message)));
});

test('heading level jump is medium severity', () => {
  const dump = goodDump();
  dump.sections[1].headings = [4];
  assert.ok(checkStructure(spec, 'home', dump).findings.some((f) => f.severity === 'medium' && /h1 to h4/.test(f.message)));
});

test('image without alt and link without href', () => {
  const dump = goodDump();
  dump.sections[0].images = [{ alt: ' ' }];
  dump.sections[0].links = [{ href: '' }];
  const messages = checkStructure(spec, 'home', dump).findings.map((f) => f.message);
  assert.ok(messages.includes('image without alt text'));
  assert.ok(messages.includes('link without href'));
});

test('hard-coded token values in custom classes are flagged, utilities are not', () => {
  const dump = goodDump();
  dump.styles.push({ name: 'hero_component', breakpoint: 'main', props: { 'background-color': '#f5f7ff', 'row-gap': '32px' } });
  dump.styles.push({ name: 'padding-global', breakpoint: 'main', props: { 'padding-left': '2rem' } });
  const messages = checkStructure(spec, 'home', dump).findings.map((f) => f.message);
  assert.ok(messages.some((m) => /background-color: #f5f7ff is hard-coded; bind variable for token "brand\.surface"/.test(m)));
  assert.ok(messages.some((m) => /row-gap: 32px is hard-coded; bind variable for token "space\.lg"/.test(m)));
  assert.ok(!messages.some((m) => m.startsWith('padding-global')));
});

test('CLI reads dump file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dump-'));
  const file = join(dir, 'dump.json');
  writeFileSync(file, JSON.stringify(goodDump()));
  const run = spawnSync(process.execPath, ['src/cli/qa-structural.mjs', VALID_SPEC, 'home', file], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).ok, true);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/qa-structural.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/qa-structural.mjs'`.

- [ ] **Step 3: Implementar**

`src/lib/qa-structural.mjs`:
```js
import { validateClassName } from './class-names.mjs';
import { pxToRem } from './units.mjs';
import { resolveResponsive } from './responsive.mjs';

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

export function checkStructure(spec, pageSlug, dump) {
  const page = spec.pages[pageSlug];
  if (!page) throw new Error(`unknown page "${pageSlug}"`);
  const findings = [];
  const add = (severity, message, section = null) => findings.push({ severity, section, message });

  const dumpSections = dump.sections ?? [];
  const found = new Set(dumpSections.map((s) => s.id));
  for (const section of page.sections) {
    if (!found.has(section.id)) add('high', `section "${section.id}" from spec not found in Webflow`, section.id);
  }

  const headings = [];
  for (const section of dumpSections) {
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

  const index = tokenValueIndex(spec);
  for (const style of dump.styles ?? []) {
    if (!style.name?.includes('_')) continue;
    for (const [prop, value] of Object.entries(style.props ?? {})) {
      const token = index.get(String(value).trim().toLowerCase());
      if (token) add('medium', `${style.name} (${style.breakpoint ?? 'main'}) ${prop}: ${value} is hard-coded; bind variable for token "${token}"`);
    }
  }

  return { ok: findings.length === 0, findings };
}
```

`src/cli/qa-structural.mjs`:
```js
import { readFileSync } from 'node:fs';
import { runCli } from '../lib/cli.mjs';
import { loadSpec } from '../lib/load-spec.mjs';
import { checkStructure } from '../lib/qa-structural.mjs';

runCli(([dir = 'site-spec', page, dumpFile]) => {
  if (!page || !dumpFile) throw new Error('usage: qa-structural <specDir> <page> <dump.json>');
  const dump = JSON.parse(readFileSync(dumpFile, 'utf8'));
  return checkStructure(loadSpec(dir), page, dump);
});
```

- [ ] **Step 4: Correr y ver pasar**

Run: `node --test tests/qa-structural.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/qa-structural.mjs src/cli/qa-structural.mjs tests/qa-structural.test.mjs
git commit -m "feat: add deterministic structural QA against site-spec"
```

---

### Task 9: `build-state` (lib + CLI con escritura atómica)

**Files:**
- Create: `src/lib/build-state.mjs`, `src/cli/build-state.mjs`
- Test: `tests/build-state.test.mjs`

**Interfaces:**
- Consumes: `runCli`.
- Produces:
  - `SECTION_STATUSES = ['pending', 'built', 'failed', 'qa-pass', 'qa-fail']`
  - `setSectionState(state, { platform, page, section, status, specHash?, elementIds?, error?, pageId? }) → newState` (no muta; conserva campos previos no provistos; `error` queda `null` salvo `status === 'failed'`; agrega `at` ISO)
  - `setSetupState(state, { platform, siteId, status }) → newState`
  - `sectionNeedsBuild(state, platform, page, section, specHash) → boolean` (`false` solo si status ∈ {built, qa-pass} y `specHash` coincide)
  - `readState(specDir) → object`, `writeState(specDir, state)` (tmp + rename)
  - CLI:
    - `node src/cli/build-state.mjs get <specDir> --platform webflow --page home --section hero --hash <h>` → `{ ok: true, needsBuild, current }`
    - `node src/cli/build-state.mjs set-section <specDir> --platform webflow --page home --section hero --status built [--hash h] [--ids a,b] [--error msg] [--page-id id]` → `{ ok: true, current }`
    - `node src/cli/build-state.mjs set-setup <specDir> --platform webflow --site-id X --status done` → `{ ok: true, setup }`

- [ ] **Step 1: Escribir tests**

`tests/build-state.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sectionNeedsBuild, setSectionState, setSetupState } from '../src/lib/build-state.mjs';
import { copyFixture } from './helpers.mjs';

const base = { platform: 'webflow', page: 'home', section: 'hero' };

test('sectionNeedsBuild follows status and hash', () => {
  let state = {};
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), true);
  state = setSectionState(state, { ...base, status: 'built', specHash: 'sha256:a', elementIds: ['e1'] });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), false);
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:b'), true);
  state = setSectionState(state, { ...base, status: 'qa-pass' });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), false);
  state = setSectionState(state, { ...base, status: 'qa-fail' });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), true);
  state = setSectionState(state, { ...base, status: 'failed', error: 'boom' });
  assert.equal(sectionNeedsBuild(state, 'webflow', 'home', 'hero', 'sha256:a'), true);
});

test('setSectionState keeps previous fields and does not mutate', () => {
  const first = setSectionState({}, { ...base, status: 'built', specHash: 'sha256:a', elementIds: ['e1'], pageId: 'p1' });
  const second = setSectionState(first, { ...base, status: 'qa-pass' });
  assert.equal(first.webflow.pages.home.sections.hero.status, 'built');
  const entry = second.webflow.pages.home.sections.hero;
  assert.equal(entry.status, 'qa-pass');
  assert.equal(entry.specHash, 'sha256:a');
  assert.deepEqual(entry.elementIds, ['e1']);
  assert.equal(entry.error, null);
  assert.equal(second.webflow.pages.home.pageId, 'p1');
});

test('invalid status throws', () => {
  assert.throws(() => setSectionState({}, { ...base, status: 'done' }), /invalid status "done"/);
});

test('setSetupState records site and status', () => {
  const state = setSetupState({}, { platform: 'webflow', siteId: 's1', status: 'done' });
  assert.equal(state.webflow.siteId, 's1');
  assert.equal(state.webflow.setup.status, 'done');
});

test('CLI set-section then get', () => {
  const dir = copyFixture();
  const set = spawnSync(process.execPath, [
    'src/cli/build-state.mjs', 'set-section', dir, '--platform', 'webflow', '--page', 'home', '--section', 'hero',
    '--status', 'built', '--hash', 'sha256:a', '--ids', 'e1,e2', '--page-id', 'p1',
  ], { encoding: 'utf8' });
  assert.equal(set.status, 0, set.stdout);
  const file = JSON.parse(readFileSync(join(dir, 'build-state.json'), 'utf8'));
  assert.deepEqual(file.webflow.pages.home.sections.hero.elementIds, ['e1', 'e2']);

  const get = spawnSync(process.execPath, [
    'src/cli/build-state.mjs', 'get', dir, '--platform', 'webflow', '--page', 'home', '--section', 'hero', '--hash', 'sha256:a',
  ], { encoding: 'utf8' });
  assert.equal(JSON.parse(get.stdout).needsBuild, false);
});

test('CLI rejects unknown command', () => {
  const run = spawnSync(process.execPath, ['src/cli/build-state.mjs', 'nope', copyFixture()], { encoding: 'utf8' });
  assert.equal(run.status, 1);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/build-state.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/build-state.mjs'`.

- [ ] **Step 3: Implementar**

`src/lib/build-state.mjs`:
```js
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SECTION_STATUSES = ['pending', 'built', 'failed', 'qa-pass', 'qa-fail'];
const UP_TO_DATE = new Set(['built', 'qa-pass']);

export function setSectionState(state, { platform, page, section, status, specHash, elementIds, error, pageId }) {
  if (!SECTION_STATUSES.includes(status)) throw new Error(`invalid status "${status}"`);
  const platformState = state[platform] ?? {};
  const pages = platformState.pages ?? {};
  const pageState = pages[page] ?? { sections: {} };
  const previous = pageState.sections?.[section] ?? {};
  const entry = {
    ...previous,
    status,
    specHash: specHash ?? previous.specHash ?? null,
    elementIds: elementIds ?? previous.elementIds ?? [],
    error: status === 'failed' ? (error ?? 'unknown error') : null,
    at: new Date().toISOString(),
  };
  return {
    ...state,
    [platform]: {
      ...platformState,
      pages: {
        ...pages,
        [page]: {
          ...pageState,
          ...(pageId ? { pageId } : {}),
          sections: { ...pageState.sections, [section]: entry },
        },
      },
    },
  };
}

export function setSetupState(state, { platform, siteId, status }) {
  const platformState = state[platform] ?? {};
  return {
    ...state,
    [platform]: {
      ...platformState,
      ...(siteId ? { siteId } : {}),
      setup: { status, at: new Date().toISOString() },
    },
  };
}

export function sectionNeedsBuild(state, platform, page, section, specHash) {
  const entry = state?.[platform]?.pages?.[page]?.sections?.[section];
  return !(entry && UP_TO_DATE.has(entry.status) && entry.specHash === specHash);
}

export function readState(specDir) {
  const path = join(specDir, 'build-state.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

export function writeState(specDir, state) {
  const path = join(specDir, 'build-state.json');
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}
```

`src/cli/build-state.mjs`:
```js
import { parseArgs } from 'node:util';
import { runCli } from '../lib/cli.mjs';
import { readState, sectionNeedsBuild, setSectionState, setSetupState, writeState } from '../lib/build-state.mjs';

const OPTIONS = {
  platform: { type: 'string', default: 'webflow' },
  page: { type: 'string' },
  section: { type: 'string' },
  status: { type: 'string' },
  hash: { type: 'string' },
  ids: { type: 'string' },
  error: { type: 'string' },
  'page-id': { type: 'string' },
  'site-id': { type: 'string' },
};

runCli((argv) => {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, specDir = 'site-spec'] = positionals;
  const state = readState(specDir);

  if (command === 'get') {
    const current = state?.[values.platform]?.pages?.[values.page]?.sections?.[values.section] ?? null;
    return { ok: true, needsBuild: sectionNeedsBuild(state, values.platform, values.page, values.section, values.hash), current };
  }
  if (command === 'set-section') {
    const next = setSectionState(state, {
      platform: values.platform,
      page: values.page,
      section: values.section,
      status: values.status,
      specHash: values.hash,
      elementIds: values.ids ? values.ids.split(',').filter(Boolean) : undefined,
      error: values.error,
      pageId: values['page-id'],
    });
    writeState(specDir, next);
    return { ok: true, current: next[values.platform].pages[values.page].sections[values.section] };
  }
  if (command === 'set-setup') {
    const next = setSetupState(state, { platform: values.platform, siteId: values['site-id'], status: values.status });
    writeState(specDir, next);
    return { ok: true, setup: next[values.platform].setup };
  }
  throw new Error(`unknown command "${command}"; use get | set-section | set-setup`);
});
```

- [ ] **Step 4: Correr y ver pasar**

Run: `node --test tests/build-state.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/build-state.mjs src/cli/build-state.mjs tests/build-state.test.mjs
git commit -m "feat: track per-section build state with atomic writes"
```

---

### Task 10: Bundle con esbuild a scripts autocontenidos

**Files:**
- Create: `scripts/build.mjs`
- Create (generados): `plugins/build-core/scripts/validate-spec.mjs`, `plugins/webflow-builder/scripts/{validate-spec,validate-class-names,plan-setup,plan-section,qa-structural,build-state}.mjs`
- Test: `tests/bundle.test.mjs`

**Interfaces:**
- Consumes: todos los `src/cli/*.mjs` (Tasks 4–9).
- Produces: scripts que corren con `node <script>` desde cualquier carpeta sin `node_modules`. Comandos Markdown los invocan como `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs"`.

- [ ] **Step 1: Escribir test**

`tests/bundle.test.mjs`:
```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALID_SPEC } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function runIsolated(plugin, script, args) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  const target = join(dir, script);
  copyFileSync(join(ROOT, 'plugins', plugin, 'scripts', script), target);
  return spawnSync(process.execPath, [target, ...args], { encoding: 'utf8', cwd: dir });
}

before(() => {
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
});

test('build-core validate-spec runs without node_modules', () => {
  const run = runIsolated('build-core', 'validate-spec.mjs', [VALID_SPEC]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).ok, true);
});

for (const [script, args] of [
  ['validate-spec.mjs', [VALID_SPEC]],
  ['validate-class-names.mjs', ['section_hero']],
  ['plan-setup.mjs', [VALID_SPEC]],
  ['plan-section.mjs', [VALID_SPEC, 'home', 'hero']],
]) {
  test(`webflow-builder ${script} runs without node_modules`, () => {
    const run = runIsolated('webflow-builder', script, args);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(JSON.parse(run.stdout).ok, true);
  });
}

test('webflow-builder build-state and qa-structural are bundled', () => {
  const run = runIsolated('webflow-builder', 'build-state.mjs', ['get', VALID_SPEC, '--page', 'home', '--section', 'hero', '--hash', 'x']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).needsBuild, true);
  const qa = runIsolated('webflow-builder', 'qa-structural.mjs', []);
  assert.equal(qa.status, 1);
  assert.match(JSON.parse(qa.stdout).errors[0].message, /usage: qa-structural/);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/bundle.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/build.mjs'`.

- [ ] **Step 3: Implementar build**

`scripts/build.mjs`:
```js
import { build } from 'esbuild';

const TARGETS = [
  ['src/cli/validate-spec.mjs', ['plugins/build-core/scripts/validate-spec.mjs', 'plugins/webflow-builder/scripts/validate-spec.mjs']],
  ['src/cli/validate-class-names.mjs', ['plugins/webflow-builder/scripts/validate-class-names.mjs']],
  ['src/cli/plan-setup.mjs', ['plugins/webflow-builder/scripts/plan-setup.mjs']],
  ['src/cli/plan-section.mjs', ['plugins/webflow-builder/scripts/plan-section.mjs']],
  ['src/cli/qa-structural.mjs', ['plugins/webflow-builder/scripts/qa-structural.mjs']],
  ['src/cli/build-state.mjs', ['plugins/webflow-builder/scripts/build-state.mjs']],
];

for (const [entry, outfiles] of TARGETS) {
  for (const outfile of outfiles) {
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      banner: {
        js: "// Generated by scripts/build.mjs from src/ — do not edit.\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
      },
      logLevel: 'warning',
    });
    console.log(`built ${outfile}`);
  }
}
```

- [ ] **Step 4: Correr build y tests**

Run: `npm run build && node --test tests/bundle.test.mjs`
Expected: 7 líneas `built ...`; PASS (6 tests).

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS en todos los archivos.

- [ ] **Step 6: Commit**

```bash
git add scripts/build.mjs plugins/build-core/scripts plugins/webflow-builder/scripts tests/bundle.test.mjs
git commit -m "build: bundle CLIs into self-contained plugin scripts"
```

---

### Task 11: Plugin `build-core` (skills, agente, comando `/build-audit`)

**Files:**
- Create: `plugins/build-core/skills/site-spec/SKILL.md`
- Create: `plugins/build-core/skills/figma-extract/SKILL.md`
- Create: `plugins/build-core/agents/figma-auditor.md`
- Create: `plugins/build-core/commands/build-audit.md`
- Test: `tests/plugin-structure.test.mjs` (existente, Task 1)

**Interfaces:**
- Consumes: `plugins/build-core/scripts/validate-spec.mjs` (Task 10), schemas (Task 3).
- Produces: `/build-audit <figma-url>` que deja `site-spec/` válido + `open-questions.md` en el repo del proyecto del cliente. Contrato del agente `figma-auditor`: escribe solo `site-spec/pages/<slug>.yaml` y devuelve un bloque YAML `discovered:` con `tokens`, `components`, `assets`, `questions`.

- [ ] **Step 1: Escribir `site-spec/SKILL.md`**

````markdown
---
name: site-spec
description: Reference for the neutral site-spec contract (project, tokens, components, pages, assets, open questions, build state) that sits between Figma and every platform builder. Use whenever reading, writing, editing or validating files under a site-spec/ directory.
---

# site-spec

`site-spec/` lives in the client project repo. It is the contract between the Figma audit (`build-core`) and platform builders (`webflow-builder`, future Shopify/HubSpot/Framer). JSON Schemas: `schemas/` next to this file.

## Files

| File | Who writes it | Content |
|---|---|---|
| `project.yaml` | `/build-audit` | name (kebab), figma fileKey + url, platforms, `units: rem`, breakpoints, pages (slug + figmaNode) |
| `tokens.yaml` | `/build-audit` | colors, typography, spacing, radii, shadows, fonts — values in **px** |
| `components.yaml` | `/build-audit` | repeated pieces (button, card, navbar, footer) with variants and color-token styles |
| `pages/<slug>.yaml` | `figma-auditor` | ordered sections → neutral element tree |
| `assets/manifest.yaml` + files | `/build-audit` | svg / raster@2x exports |
| `open-questions.md` | `/build-audit` | ambiguities as `- [ ]` checkboxes; dev marks `- [x]` when resolved |
| `build-state.json` | platform builders only (via `build-state.mjs`) | never edit by hand |

## Rules

1. **Neutral.** Never write platform class names (`heading-style-h1`, `section_hero`). Use semantic roles: `heading.h1`, `text.large`, `section.large`, `space.md`, `container: large`.
2. **Token names:** `group.name` lowercase kebab parts (`brand.primary`). Typography: `heading.h1`–`heading.h6` or `text.<size>`. Spacing: `section.small|medium|large` or `space.<size>`; `space.top|bottom|left|right|horizontal|vertical` are reserved.
3. **Responsive values:** a number, or `{ desktop, tablet?, mobile? }`. Missing `tablet` inherits `desktop`; missing `mobile` inherits `tablet`.
4. **Ids:** section `id`, group `name`, asset `id`, component `name`: lowercase kebab-case, unique in their scope.
5. **Never invent copy.** Placeholder text repeated across instances → add an open question instead.
6. **Assets:** logos/icons `kind: svg`; photos/mockups `kind: raster` with `scale: 2`.
7. **Code components:** set `needsCodeComponent: true` on sections whose behavior native Webflow cannot express (calculators, complex filters, carousels with logic).

## Child types

`heading` (level, style, text) · `text` (style, text) · `rich-text` (text; blank line = new paragraph) · `image` (asset, alt, ratio "w/h") · `svg` (asset) · `link` (text, href) · `button` (text, href, variant?) · `list` (items) · `group` (name, layout?, children) · `component` (ref, variant?, text?, href?, props?) · `form` (description) · `embed-placeholder` (description)

Layout: `{ type: grid|flex|stack, columns?, gap?, direction?, align?, justify? }` — `gap` is a spacing token.

## Example section

```yaml
- id: hero
  figmaNode: "12:341"
  spacing: section.large
  container: large
  background: brand.surface
  layout: { type: grid, columns: { desktop: 2, tablet: 1 }, gap: space.lg }
  children:
    - { type: heading, level: 1, style: heading.h1, text: "Crece más rápido" }
    - { type: text, style: text.large, text: "…" }
    - { type: component, ref: button, variant: primary, text: "Agenda demo", href: "#contact" }
    - { type: image, asset: hero-mockup, alt: "Dashboard", ratio: "4/3" }
  notes: { interaction: "fade-up on load", responsive: "imagen debajo del texto en tablet" }
```

## Validate

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec
```

Output is JSON `{ ok, errors: [{ file, path, message }] }`. Fix every error before handing off. Builders run it with `--require-resolved`, which also fails on unchecked open questions.
````

- [ ] **Step 2: Escribir `figma-extract/SKILL.md`**

````markdown
---
name: figma-extract
description: How to read an approved Figma file through the Figma MCP and translate frames, variables, text styles, component instances and assets into site-spec YAML. Use when auditing Figma for /build-audit or when a figma-auditor agent extracts a page.
---

# Figma → site-spec extraction

Read the `site-spec` skill first; it defines the output format.

## Prerequisites

- Figma MCP connected (`get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`). If tools fail with auth errors, stop and tell the user to authorize the Figma MCP via `/mcp`.
- Load the `figma:figma-design-to-code` skill before the first `get_design_context` call (it is mandatory for that tool).

## Procedure per page

1. `get_metadata` on the page frame → list top-level children; each full-width child frame is a **section**, top to bottom.
2. For each section: `get_design_context` on the section frame (not the whole page — keeps responses small).
3. Map Figma → spec:

| Figma | site-spec |
|---|---|
| Section frame name ("Hero", "Features") | `id` in kebab-case (`hero`, `features`) |
| Vertical padding of section | `spacing: section.small|medium|large` (closest token) |
| Inner max-width (~768 / ~1024 / ~1280px) | `container: small|medium|large` |
| Auto-layout horizontal with equal children | `layout: { type: grid, columns }` |
| Auto-layout vertical | `layout: { type: stack }` |
| Auto-layout horizontal, unequal children | `layout: { type: flex, align, justify }` |
| Auto-layout gap | `gap:` closest `space.*` token |
| Text with heading style | `heading` (level from semantic order, style `heading.hN`) |
| Body text | `text` with `text.<size>` |
| Instance of a library component | `component` with `ref` + `variant` |
| Vector / icon / logo | `svg` asset |
| Image fill / photo | `image` raster asset, `ratio` from frame size |
| Nested frame grouping children | `group` with kebab `name` |
| Mobile/tablet frames of the same section | responsive values (`columns`, sizes) and `notes.responsive` |

4. Tokens: `get_variable_defs` → colors, spacing, radii; text styles → typography (size per breakpoint when mobile frames exist). Keep `figmaVar` ids.
5. Assets: download asset URLs returned by `get_design_context` into `site-spec/assets/`; rasters at 2x. If only a raster exists for a logo/icon, record an open question instead of using it.
6. Anything ambiguous → an open question line: `- [ ] <section>: <question>`. Typical: placeholder copy repeated, missing mobile frame, unclear interaction, font not available on Google Fonts.

## Never

- Invent copy, links or alt text that is not in Figma (use an open question).
- Write platform class names.
- Round tokens silently: if a value does not match any token, record an open question.
````

- [ ] **Step 3: Escribir agente `figma-auditor.md`**

````markdown
---
name: figma-auditor
description: Read-only auditor that extracts ONE Figma page into site-spec/pages/<slug>.yaml and reports discovered tokens, components, assets and open questions. Dispatched by /build-audit, one instance per page, in parallel.
---

You audit a single Figma page and write exactly one file: `site-spec/pages/<slug>.yaml`.

Input from the dispatcher: Figma `fileKey`, page `figmaNode`, page `slug`, and the current `site-spec/tokens.yaml` / `components.yaml` if they exist.

Rules:
- Follow the `figma-extract` and `site-spec` skills.
- Use Figma MCP tools only for reading. Never modify Figma.
- Do NOT write `tokens.yaml`, `components.yaml`, `assets/manifest.yaml` or `open-questions.md` — other auditors run in parallel. Report those findings instead.
- Download asset files you reference into `site-spec/assets/` (unique file names prefixed with the page slug when ambiguous).

Final message format (the dispatcher parses it):

```yaml
page: <slug>
file: site-spec/pages/<slug>.yaml
discovered:
  tokens:
    colors: []        # same shape as tokens.yaml entries
    typography: []
    spacing: {}
  components: []      # same shape as components.yaml entries
  assets: []          # same shape as assets/manifest.yaml entries
  questions:
    - "<slug>/<section>: <question>"
```
````

- [ ] **Step 4: Escribir comando `/build-audit`**

````markdown
---
description: Audit an approved Figma file into site-spec/ (tokens, components, pages, assets, open questions) for any platform builder
argument-hint: <figma-url>
---

# /build-audit

Figma URL: $ARGUMENTS

Goal: produce a valid `site-spec/` in the current project repo, then stop for developer review. Do not touch any platform.

1. Load the `site-spec` and `figma-extract` skills.
2. Parse `fileKey` (and optional node id) from the URL. If `$ARGUMENTS` is empty, ask for the URL and stop.
3. `get_metadata` on the file → list pages/top-level frames that are site pages. Ask the developer to confirm the page list and slugs (one question) unless there is only one obvious page.
4. Write `site-spec/project.yaml` (platforms: ask which platform if not obvious; units `rem`; Webflow default breakpoints 1440/991/767/478).
5. Extract global tokens: `get_variable_defs` + text styles → `site-spec/tokens.yaml`. Detect components used across pages → `site-spec/components.yaml`.
6. Dispatch one `figma-auditor` agent per page **in parallel**, passing fileKey, page node, slug and the paths of tokens/components files.
7. Merge each auditor's `discovered` block: add missing tokens/components/assets (dedupe by name/id; on conflicting values add an open question instead of choosing), append questions to `site-spec/open-questions.md` as `- [ ] ...`.
8. Validate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec
   ```
   Fix every error (re-read Figma when needed) until `ok: true`.
9. Report to the developer: pages and section counts, token counts, components, assets, sections flagged `needsCodeComponent`, and the open questions list. Tell them the next step is resolving open questions (mark `- [x]`) and then running the platform setup command (e.g. `/wf-setup`).
````

- [ ] **Step 5: Correr test de estructura**

Run: `node --test tests/plugin-structure.test.mjs`
Expected: PASS (build-core skills/commands/agents válidos; script referenciado existe).

- [ ] **Step 6: Commit**

```bash
git add plugins/build-core
git commit -m "feat: add build-core skills, figma-auditor agent and /build-audit"
```

---

### Task 12: Plugin `webflow-builder` (skills, agente, comandos)

**Files:**
- Create: `plugins/webflow-builder/skills/client-first/SKILL.md`
- Create: `plugins/webflow-builder/skills/wf-bootstrap/SKILL.md`
- Create: `plugins/webflow-builder/skills/wf-section-build/SKILL.md`
- Create: `plugins/webflow-builder/agents/wf-qa-reviewer.md`
- Create: `plugins/webflow-builder/commands/{wf-setup,wf-build,wf-qa,wf-component}.md`
- Test: `tests/plugin-structure.test.mjs` (existente)

**Interfaces:**
- Consumes: scripts empaquetados (Task 10) con los formatos de plan de Tasks 6–9; plugin oficial `webflow-skills` (skills `figma-to-webflow`, `designer-tools`, `interactions`, `accessibility-audit`, `component-scaffold`, `pre-deploy-check`, `devlink-command`, `safe-publish`).
- Produces: comandos `/wf-setup`, `/wf-build <page> [--section <id>]`, `/wf-qa <page>`, `/wf-component <section-id>`.

- [ ] **Step 1: Escribir `client-first/SKILL.md`**

````markdown
---
name: client-first
description: Finsweet Client-First naming and structure rules used by this agency for every Webflow build, with the site-spec to Client-First mapping and the class-name validator. Use whenever creating, naming or reviewing Webflow classes.
---

# Client-First (agency rules)

## Page structure

`page-wrapper` > `main-wrapper` > `section_[id]` > `padding-global` > `container-[small|medium|large]` > `padding-section-[small|medium|large]` > `[id]_component` > content.

## Class kinds

| Kind | Pattern | Examples |
|---|---|---|
| Custom | `[folder]_[element]`, kebab parts, exactly one `_` | `section_hero`, `hero_component`, `hero_image-wrapper` |
| Utility | closed list below | `padding-global`, `heading-style-h1`, `margin-bottom` |
| Combo | `is-[kebab]`, stacked on a base class | `button is-secondary` |

Utilities: `page-wrapper`, `main-wrapper`, `padding-global`, `container-*`, `padding-section-*`, `heading-style-h1..h6`, `text-size-*`, `text-weight-light|normal|medium|semibold|bold`, `text-color-*`, `background-color-*`, `text-align-*`, `text-rich-text`, `margin-|padding-` + `top|bottom|left|right|horizontal|vertical` or a size, `max-width-small|medium|large`, `hide-tablet|mobile-landscape|mobile-portrait`, `button`.

Spacing utilities combine: `margin-bottom margin-md` = bottom margin only.

## site-spec → Client-First

| Spec | Client-First |
|---|---|
| section `id` | `section_<id>` + wrappers above |
| `spacing: section.large` | `padding-section-large` |
| `container: large` | `container-large` |
| `heading.hN` | `heading-style-hN` on the semantic `<hN>` |
| `text.<size>` | `text-size-<size>` |
| `group` `name` | `<id>_<name>` |
| `button` variant ≠ primary | `button is-<variant>` |
| image | `<id>_image-wrapper` > `<id>_image` |
| token `brand.primary` | Webflow variable `brand-primary` |

All of this is computed by `plan-section.mjs`; do not hand-roll class names.

## Validate names

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-class-names.mjs" section_hero hero_component is-secondary
```

Any `ok: false` → stop and fix the spec or plan, never create the class.
````

- [ ] **Step 2: Escribir `wf-bootstrap/SKILL.md`**

````markdown
---
name: wf-bootstrap
description: Executes the plan-setup.mjs output in an empty Webflow site through the Webflow MCP — variables, fonts, Client-First utilities, style guide page, shared components. Use only from /wf-setup.
---

# Webflow bootstrap from plan-setup

Before acting, load `webflow-mcp:figma-to-webflow` (official plugin) and read its `references/css-rules.md`. Its gates apply. Agency overrides for its required prompts: build mode **headless**, variables **create new system**, naming **Client-First**, units **rem**. Do not ask those four questions.

## Input

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-setup.mjs" site-spec > /tmp/wf-setup-plan.json
```

Shape: `{ ok, variables[], fonts[], styles[], classes[], components[] }` (`styles[]` items: `{ class, breakpoint, props, variables, comboOf? }`).

## Order (stop on the first failed step)

1. `webflow_guide_tool` once; `whoami` + `get_site` → record `siteId`.
2. **Variables:** create collections `Colors`, `Typography`, `Spacing` and every entry of `variables[]` (`type: color` → color variable, `type: size` → size variable in rem). Use the variable tool named by `webflow_guide_tool`. Skip variables that already exist with the same value; if one exists with a different value, stop and report.
3. **Fonts:** `data_fonts_tool` for each `fonts[]` entry (Google source or upload). Never add `<link>` tags to head.
4. **Classes:** for every name in `classes[]` call `data_style_tool create_style` (combos from entries with `comboOf` are created as combo classes on their base). Then verify with `query_styles` that all exist.
5. **Styles:** for each `styles[]` entry call `data_style_tool update_style` on its breakpoint (`main`, `medium`, `small`, `tiny`) with `props` as native longhand properties and each `variables` entry bound with `variable_as_value`. Never use WHTML `css` or embed `<style>`.
6. **Style guide page:** create page `style-guide` (`data_pages_tool`) and build sections with `data_whtml_builder` showing every color (background-color utility swatches), every `heading-style-*` / `text-size-*` sample, spacing samples and every button variant.
7. **Components:** for each name in `components[]`, build it from `components.yaml` + Figma (`get_design_context` on its `figmaNode`) as a Webflow component. Navbar: follow the official CSS-only navbar pattern (`references/navbar.md`); ask the developer which breakpoint collapses to hamburger.
8. Record setup:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-setup site-spec --platform webflow --site-id <siteId> --status done
   ```

MCP call fails → retry once → if it still fails, stop and report the exact call and error. Never continue on top of a failure.
````

- [ ] **Step 3: Escribir `wf-section-build/SKILL.md`**

````markdown
---
name: wf-section-build
description: Executes one plan-section.mjs plan in Webflow through the Webflow MCP — create custom classes, build WHTML, apply breakpoint styles bound to variables, attach assets, insert components, record build state. Use only from /wf-build.
---

# Build one section from its plan

Official gates from `webflow-mcp:figma-to-webflow` apply (read `references/css-rules.md` and `references/assets-and-svg.md` once per session).

## Input

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section>
```

Plan: `{ ok, page, section, specHash, classesToCreate[], utilitiesUsed[], whtml, styles[], assets[], components[], interactions[], placeholders[] }`.

## Steps

1. Validate names:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-class-names.mjs" <every classesToCreate and utilitiesUsed name>
   ```
2. `query_styles`: every `utilitiesUsed` must already exist (created by `/wf-setup`). Missing → stop: setup is incomplete.
3. `data_style_tool create_style` for each `classesToCreate` not yet existing.
4. `data_whtml_builder` with `whtml` (structure only, one call, appended after the previous section inside `main-wrapper` of the target page). Capture returned element ids.
5. `data_style_tool update_style` for each `styles[]` entry on its breakpoint; bind `variables` with `variable_as_value`.
6. Assets — for each `assets[]` entry, target the `order`-th element with `targetClass`:
   - `raster`: `data_assets_tool create_asset` from `site-spec/assets/<file>` (2x), then `set_image_asset` + alt.
   - `svg`: insert an HtmlEmbed inside the target with the cleaned inline SVG (`data_element_tool set_settings`).
7. Components — for each `components[]` entry, replace the `order`-th `targetClass` slot with an instance of the Webflow component `ref` (variant, props).
8. Interactions — for each `interactions[]` entry use the official `interactions` skill (IX3) on `targetClass`.
9. Placeholders stay as empty slots; list them in the final report.
10. Verify with `query_elements` that every class in `classesToCreate` is present on an element (Webflow silently drops unknown classes). Missing → recreate class, reapply, recheck once.
11. Record:
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status built --hash <specHash> --ids <comma-separated element ids> --page-id <pageId>
    ```

On a failure that persists after one retry:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section> --status failed --error "<tool>: <message>"
```
then stop.
````

- [ ] **Step 4: Escribir agente `wf-qa-reviewer.md`**

````markdown
---
name: wf-qa-reviewer
description: Visual QA reviewer that compares one built Webflow section against its Figma frame and lists differences by severity. Read-only; dispatched by /wf-qa, one per section.
---

You compare ONE section. Inputs: Figma `fileKey` + section `figmaNode`, the Webflow page id and the section class `section_<id>`, and the section YAML from the site-spec.

1. Figma: `get_screenshot` of the section node.
2. Webflow: `element_snapshot_tool` of the `section_<id>` element (Designer Bridge must be connected and its tab foregrounded; if not, return `status: unverified` with the reason).
3. Compare: layout/alignment, spacing, typography (family, size, weight, line-height), colors, image crop/ratio, missing or extra elements, copy differences.
4. Severity: **high** = wrong/missing content, broken layout, wrong colors or fonts; **medium** = spacing or size off by more than ~8px, alignment; **low** = sub-pixel or anti-aliasing differences.

Do not modify Webflow or Figma.

Final message:

```yaml
section: <id>
status: compared | unverified
diffs:
  - { severity: high|medium|low, what: "<element>", expected: "<figma>", actual: "<webflow>" }
notes: "<anything the developer must check manually>"
```
````

- [ ] **Step 5: Escribir comando `/wf-setup`**

````markdown
---
description: Bootstrap an empty Webflow site with Client-First variables, utilities, style guide and shared components from site-spec
argument-hint: "[site name or id]"
---

# /wf-setup

Target site: $ARGUMENTS (ask if empty and more than one site is available).

## 1. Prerequisites — stop with an exact message if any fails

- Official plugin `webflow-skills` is installed (skill `webflow-mcp:figma-to-webflow` is available). If not: tell the developer to run `/plugin marketplace add webflow/webflow-skills` and `/plugin install webflow-skills@webflow-skills`.
- Webflow MCP authenticated: `webflow_guide_tool`, then `whoami` + `get_site`.
- Figma MCP authenticated.
- Spec valid and questions resolved:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec --require-resolved
  ```
- The site is empty or only contains Webflow defaults. If it already has custom classes or variables, stop and ask how to proceed.

## 2. Bootstrap

Load the `client-first` and `wf-bootstrap` skills and follow `wf-bootstrap` exactly.

## 3. Report

List created variables (count per collection), utilities, components and the style-guide page link. Ask the developer to review the style guide in Designer before running `/wf-build <page>`. Do not publish.
````

- [ ] **Step 6: Escribir comando `/wf-build`**

````markdown
---
description: Build one page (or one section) of the site-spec in Webflow, section by section, resuming from build-state
argument-hint: <page> [--section <id>]
---

# /wf-build

Arguments: $ARGUMENTS → `<page>` and optional `--section <id>`.

## 1. Preconditions

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.mjs" site-spec --require-resolved
```
Then read `site-spec/build-state.json`: `webflow.setup.status` must be `done`, otherwise tell the developer to run `/wf-setup` and stop. Confirm Webflow MCP (`webflow_guide_tool`, `whoami`).

Ensure the page exists in Webflow (`data_pages_tool`; create it with slug `<page>` and the `page-wrapper` > `main-wrapper` structure if missing). Remember its `pageId`.

## 2. Sections

Load `client-first` and `wf-section-build`. For each section of `site-spec/pages/<page>.yaml` in order (or only `--section`):

1. Get the plan: `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section>`.
2. Check state: `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" get site-spec --platform webflow --page <page> --section <section> --hash <specHash>`.
   - `needsBuild: false` and no `--section` flag → skip.
   - `needsBuild: true` and the section already has `elementIds` (spec changed or previous failure) → delete those elements first, then rebuild.
3. Follow `wf-section-build`.
4. A section ending in `failed` stops the command.

## 3. Report

Table: section → built / skipped / failed / placeholder. List placeholders (code components → `/wf-component <section>`, forms → build natively in Designer). Suggest `/wf-qa <page>`. Do not publish.
````

- [ ] **Step 7: Escribir comando `/wf-qa`**

````markdown
---
description: QA a built Webflow page against site-spec and Figma — structural checks, visual diffs per section, accessibility audit
argument-hint: <page>
---

# /wf-qa

Page: $ARGUMENTS

## 1. Structural (deterministic)

1. With `query_elements` / `get_all_elements` on the page and `query_styles`, build a dump and save it to `site-spec/qa/<page>.dump.json`:
   ```json
   {
     "sections": [{ "id": "<section id from section_<id> class>", "classes": [], "headings": [1, 2], "images": [{ "alt": "" }], "links": [{ "href": "" }] }],
     "styles": [{ "name": "<class>", "breakpoint": "main", "props": { "<css-prop>": "<raw value, not variable>" } }]
   }
   ```
   `sections` in DOM order; `headings` in DOM order within each section; `styles` only raw (non-variable) values.
2. Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/qa-structural.mjs" site-spec <page> site-spec/qa/<page>.dump.json
   ```

## 2. Visual

Dispatch one `wf-qa-reviewer` agent per built section in parallel (Designer Bridge connected, tab foregrounded). Tablet/mobile: ask the developer whether to publish to the `.webflow.io` staging subdomain; only on an explicit yes use the official `safe-publish` flow for staging, then capture 1440/768/375 px screenshots with the browser. Otherwise mark tablet/mobile as **unverified**.

## 3. Accessibility

Run the official `accessibility-audit` skill on the page.

## 4. Report and state

Write `site-spec/qa/<page>.md`: structural findings, per-section visual diffs (high/medium/low), accessibility findings, unverified items. A section is `qa-pass` when it has no structural findings and no high visual diff; otherwise `qa-fail`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <id> --status qa-pass
```

Do not fix anything. Tell the developer to fix the spec or run `/wf-build <page> --section <id>` for failing sections.
````

- [ ] **Step 8: Escribir comando `/wf-component`**

````markdown
---
description: Build a React code component with the Webflow CLI for a site-spec section marked needsCodeComponent and place it in its slot
argument-hint: <page> <section-id>
---

# /wf-component

Arguments: $ARGUMENTS → `<page> <section-id>`.

1. Read the section in `site-spec/pages/<page>.yaml`; it must have `needsCodeComponent: true` and status `built` (the slot exists). Otherwise stop.
2. Check the CLI: `webflow --version` must be ≥ 2.0 and Node ≥ 22.13. If missing: `npm install -g @webflow/webflow-cli`, then `webflow auth login` (the developer completes login).
3. Use the official skills in order: `component-scaffold` (component in the project's `webflow-components/` folder, name `<section-id>`), implement it from the Figma frame (`get_design_context` on the section `figmaNode`) and `notes.interaction`, using Webflow variables names from site-spec tokens as CSS custom properties; then `pre-deploy-check`; then `devlink-command` to import (`webflow devlink import`).
4. Insert an instance of the shared component into `<section-id>_code-component-slot` of the page.
5. Record `built` again with the same plan `specHash`:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-section.mjs" site-spec <page> <section-id>
   node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" set-section site-spec --platform webflow --page <page> --section <section-id> --status built --hash <specHash>
   ```
6. Report the component name, library and anything to verify in preview.
````

- [ ] **Step 9: Correr test de estructura y suite**

Run: `npm test`
Expected: PASS (incluye skills/commands/agents de webflow-builder y scripts referenciados existentes).

- [ ] **Step 10: Commit**

```bash
git add plugins/webflow-builder
git commit -m "feat: add webflow-builder skills, QA agent and phase commands"
```

---

### Task 13: README, checklist e2e y verificación final

**Files:**
- Create: `README.md`
- Create: `docs/e2e-checklist.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: instrucciones de instalación para el equipo y el checklist manual de la corrida end-to-end (spec §7).

- [ ] **Step 1: Escribir `README.md`**

````markdown
# Agency Build Kit

Claude Code plugins that turn an approved Figma into a built site, phase by phase.

| Plugin | Commands |
|---|---|
| `build-core` | `/build-audit <figma-url>` → `site-spec/` |
| `webflow-builder` | `/wf-setup` · `/wf-build <page> [--section <id>]` · `/wf-qa <page>` · `/wf-component <page> <section>` |

## Install (each developer)

```text
/plugin marketplace add webflow/webflow-skills
/plugin install webflow-skills@webflow-skills
/plugin marketplace add <git-url-of-this-repo>
/plugin install build-core@agency-build-kit
/plugin install webflow-builder@agency-build-kit
```

Also required: Figma MCP and Webflow MCP authorized (`/mcp`), Node ≥ 22, Webflow CLI ≥ 2.0 only for `/wf-component`.

## Workflow

1. In the client project repo: `/build-audit <figma-url>` → review `site-spec/`, resolve `open-questions.md`.
2. `/wf-setup` → review the `style-guide` page in Designer.
3. `/wf-build home` (repeat per page).
4. `/wf-qa home` → read `site-spec/qa/home.md`; fix and rebuild sections as needed.
5. Publish manually (or with the official `safe-publish` skill) after review.

## Development

```bash
npm install
npm test
npm run build   # regenerates plugins/*/scripts from src/ — commit the output
```

Scripts in `plugins/*/scripts/` are generated; edit `src/` instead.
````

- [ ] **Step 2: Escribir `docs/e2e-checklist.md`**

````markdown
# End-to-end checklist (cycle 1)

Fixture: agency Figma landing (navbar, hero, cards grid, testimonials, CTA, footer) + empty Webflow sandbox site.

## /build-audit
- [ ] `site-spec/` created; `validate-spec` → `ok: true`
- [ ] Every Figma section appears once, in order, with kebab ids
- [ ] No invented copy; ambiguities listed in `open-questions.md`
- [ ] Logos/icons are `svg`; photos are raster `scale: 2`

## /wf-setup
- [ ] Refuses to run while open questions are unchecked
- [ ] Variables in Colors / Typography / Spacing with rem values
- [ ] Utilities exist and pass `validate-class-names`
- [ ] Style guide page matches Figma tokens
- [ ] Navbar and footer exist as components; navbar collapses CSS-only

## /wf-build home
- [ ] Every section reaches `built` without manual intervention
- [ ] Re-running skips built sections; editing one section's YAML rebuilds only that section
- [ ] No embed `<style>`, no hard-coded token values in custom classes
- [ ] Code-component sections leave an empty slot and are reported

## /wf-qa home
- [ ] Structural QA `ok: true`
- [ ] No unexplained high-severity visual diffs
- [ ] Accessibility audit attached to the report
- [ ] Unverified breakpoints listed explicitly

## Pilot metrics (real project)
- Dev hours vs. baseline: ____ vs ____
- Manual corrections per section (avg): ____
````

- [ ] **Step 3: Verificación final**

Run: `npm run build && npm test && git status --short`
Expected: todos los tests PASS; `git status` sin cambios en `plugins/*/scripts` (bundles al día).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/e2e-checklist.md
git commit -m "docs: add install guide and end-to-end checklist"
```
