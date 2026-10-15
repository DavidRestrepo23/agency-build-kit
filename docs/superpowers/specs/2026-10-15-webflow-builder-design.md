# Agency Build Kit — Ciclo 1: núcleo `site-spec` + adaptador Webflow

- **Fecha:** 2026-10-15
- **Estado:** diseño aprobado en conversación, pendiente revisión del spec escrito
- **Autor:** David Restrepo (con Claude)

## 1. Contexto y objetivo

La agencia construye sitios en Webflow, Framer, HubSpot y Shopify. El diseño UX (Figma) ya funciona bien; el desarrollo se hace de forma tradicional una vez el Figma está aprobado, con ayuda ad-hoc de Claude.

**Objetivo:** un plugin de Claude Code, compartido por el equipo, con comandos por fase que tomen un Figma aprobado y construyan el sitio en la plataforma indicada, con checkpoints de revisión humana entre fases.

**Éxito (este ciclo):** sobre una landing fixture, todas las secciones llegan a `built` sin intervención manual, el QA estructural pasa al 100 % y no quedan diffs visuales de severidad "alta" sin justificar. En el piloto real se mide tiempo de desarrollo vs. línea base actual y número de correcciones manuales por sección.

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Plataforma del primer ciclo | Webflow |
| Output en Webflow | Construcción nativa en Designer vía Webflow MCP; Webflow CLI solo para code components |
| Convención de clases | Finsweet Client-First |
| Punto de partida | Sitio Webflow vacío (el agente crea variables, utilities y style guide) |
| Autonomía | Comandos por fase con revisión del dev entre fases |
| Distribución | Plugin/marketplace de Claude Code versionado en git |
| Arquitectura | Spec intermedio neutral (`site-spec`) + adaptadores por plataforma |

### Fuera de alcance (ciclos posteriores)

- Adaptadores Shopify, HubSpot y Framer (reutilizarán `build-core` y `site-spec`).
- CMS (colecciones, migración de contenido): se cubrirá con los skills oficiales `cms-*` en un ciclo futuro.
- Publicación a dominio de producción (siempre manual, vía skill oficial `safe-publish`).
- Auto-corrección de diffs de QA.

## 2. Dependencias externas

- **Plugin oficial `webflow/webflow-skills`** (MIT, https://github.com/webflow/webflow-skills). Se usa, no se copia. Skills que consumimos: `figma-to-webflow` (gates y referencias de construcción), `designer-tools`, `interactions`, `accessibility-audit`, `component-scaffold`, `pre-deploy-check`, `devlink-command`, `safe-publish`.
- **Webflow MCP** (v2.x: herramientas `data_*` headless + Designer Bridge para snapshots).
- **Figma MCP** (`get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`) y el skill `figma:figma-design-to-code` como prerequisito de `get_design_context`.
- **Webflow CLI ≥ 2.0** (Node ≥ 22.13) solo para `/wf-component`.
- **Node ≥ 22** para los scripts del plugin. Fuentes en `src/`; las dependencias (`yaml`, `ajv`) se empaquetan con esbuild en scripts autocontenidos `plugins/*/scripts/*.mjs`, así el plugin instalado no necesita `npm install`.

## 3. Arquitectura

```
Figma ──/build-audit──▶ site-spec/ (repo del cliente) ──/wf-setup, /wf-build──▶ Webflow
                              ▲                                    │
                              └────────── build-state.json ◀───────┘
                                             /wf-qa ──▶ site-spec/qa/<página>.md
```

### 3.1 Estructura del repo

```
agency-build-kit/
├─ .claude-plugin/marketplace.json
├─ plugins/
│  ├─ build-core/
│  │  ├─ .claude-plugin/plugin.json
│  │  ├─ commands/build-audit.md
│  │  ├─ skills/site-spec/            # SKILL.md + schemas/*.schema.json + ejemplos
│  │  ├─ skills/figma-extract/        # SKILL.md: Figma MCP → site-spec
│  │  ├─ agents/figma-auditor.md      # subagente read-only, uno por página Figma
│  │  └─ scripts/validate-spec.mjs
│  └─ webflow-builder/
│     ├─ .claude-plugin/plugin.json
│     ├─ commands/wf-setup.md
│     ├─ commands/wf-build.md
│     ├─ commands/wf-qa.md
│     ├─ commands/wf-component.md
│     ├─ skills/client-first/         # tabla de mapeo + reglas de naming
│     ├─ skills/wf-bootstrap/
│     ├─ skills/wf-section-build/
│     ├─ agents/wf-qa-reviewer.md
│     └─ scripts/                     # bundles generados desde src/ (commiteados)
│        ├─ validate-spec.mjs
│        ├─ validate-class-names.mjs
│        ├─ plan-setup.mjs            # tokens + components → plan JSON de bootstrap
│        ├─ plan-section.mjs          # spec + tokens → plan JSON determinista
│        ├─ qa-structural.mjs         # spec + dump de Webflow → hallazgos
│        └─ build-state.mjs           # lee/escribe build-state.json de forma segura
├─ src/                                # fuentes de los scripts (lib/ + cli/)
├─ tests/                              # node:test + fixtures + golden files
└─ docs/superpowers/specs/
```

### 3.2 Responsabilidades

| Unidad | Hace | Depende de |
|---|---|---|
| `/build-audit <figma-url>` | Lanza un `figma-auditor` por página, consolida en `site-spec/`, corre `validate-spec`, lista `open-questions.md` | Figma MCP, `figma-extract`, `site-spec` |
| `figma-auditor` (agente) | Lee una página Figma (solo lectura) y devuelve su `pages/<slug>.yaml` + tokens/componentes/assets detectados | Figma MCP |
| `validate-spec.mjs` | Valida cada archivo contra su JSON Schema y referencias cruzadas (tokens, componentes y assets referenciados existen) | — |
| `/wf-setup` | Verifica prerequisitos y hace el bootstrap Client-First | Webflow MCP, `wf-bootstrap`, `client-first` |
| `/wf-build <página> [--section <id>]` | Loop por sección: plan → ejecutar vía MCP → registrar estado | `plan-section.mjs`, `wf-section-build`, skills oficiales |
| `plan-section.mjs` | Función pura: sección + tokens + componentes → plan JSON | — |
| `plan-setup.mjs` | Función pura: tokens + components → variables, utilities Client-First y componentes a crear | — |
| `qa-structural.mjs` | Compara spec vs dump JSON de Webflow (secciones, clases, headings, alt, href, valores hard-coded) | — |
| `build-state.mjs` | `get` / `set-section` / `set-setup` sobre `build-state.json` con escritura atómica | — |
| `validate-class-names.mjs` | Valida nombres contra reglas Client-First | — |
| `/wf-qa <página>` | QA estructural, visual y de accesibilidad; escribe reporte y estados | `wf-qa-reviewer`, `accessibility-audit` |
| `/wf-component <nombre>` | Code component vía CLI para piezas marcadas `needsCodeComponent` | Webflow CLI, skills oficiales de code components |

## 4. `site-spec` (contrato neutral)

Vive en el repo del proyecto del cliente. YAML para lo que el dev revisa/edita; JSON para estado de máquina. Cada archivo tiene JSON Schema en `plugins/build-core/skills/site-spec/schemas/`.

```
site-spec/
├─ project.yaml
├─ tokens.yaml
├─ components.yaml
├─ pages/<slug>.yaml
├─ assets/manifest.yaml  (+ archivos exportados)
├─ open-questions.md
├─ build-state.json
└─ qa/<slug>.md
```

**Regla:** el spec es neutral. Usa roles semánticos (`heading.h1`, `text.large`, `section.large`, `container: large`); nunca nombres de clases de una plataforma. Cada adaptador hace su mapeo.

### 4.1 `project.yaml`

```yaml
name: acme-site
figma: { fileKey: "AbC123", url: "https://www.figma.com/design/AbC123/..." }
platforms: [webflow]
units: rem            # base 16px
breakpoints: { desktop: 1440, tablet: 991, mobileLandscape: 767, mobile: 478 }
pages:
  - { slug: home, figmaNode: "12:340" }
```

### 4.2 `tokens.yaml`

```yaml
colors:
  - { name: brand.primary, value: "#1F4BFF", figmaVar: "VariableID:1:2", role: brand }
typography:
  - { name: heading.h1, family: Inter, weight: 700, size: { desktop: 64, mobile: 40 }, lineHeight: 1.1, letterSpacing: -0.02 }
  - { name: text.large, family: Inter, weight: 400, size: { desktop: 20, mobile: 18 }, lineHeight: 1.5 }
spacing:
  section.large: { desktop: 128, mobile: 64 }
  space.lg: 32
radii: { md: 8 }
shadows: []
fonts:
  - { family: Inter, weights: [400, 700], source: google }   # o "upload" con ruta
```

Valores en px en el spec; la conversión a rem la hace el adaptador.

Valores responsivos (`size`, `spacing`, `columns`) aceptan claves `desktop`, `tablet`, `mobile`. Herencia: `tablet` ausente hereda `desktop`; `mobile` ausente hereda `tablet`. Mapeo a breakpoints Webflow: `desktop → main`, `tablet → medium`, `mobile → small` (y `tiny` hereda de `small`). Un número sin claves aplica a todos.

### 4.3 `components.yaml`

Piezas repetidas detectadas en Figma (`button`, `card`, `navbar`, `footer`…), con `figmaNode`, variantes y propiedades editables (texto, href, imagen). Cada variante puede declarar `styles` con tokens de color (`background`, `color`, `border`):

```yaml
components:
  - name: button
    figmaNode: "2:1"
    variants:
      - { name: primary, styles: { background: brand.primary, color: neutral.white, border: brand.primary } }
      - { name: secondary, styles: { background: neutral.white, color: brand.primary, border: brand.primary } }
    props: [text, href]
```

La variante `primary` (o la primera, si no existe `primary`) define la clase `button`; las demás se vuelven combos `is-<variante>`.

### 4.4 `pages/<slug>.yaml`

```yaml
page: home
figmaNode: "12:340"
sections:
  - id: hero
    figmaNode: "12:341"
    spacing: section.large
    container: large
    background: brand.surface
    layout: { type: grid, columns: { desktop: 2, tablet: 1, mobile: 1 }, gap: space.lg }
    children:
      - { type: heading, level: 1, style: heading.h1, text: "Crece más rápido" }
      - { type: text, style: text.large, text: "…" }
      - { type: component, ref: button, variant: primary, text: "Agenda demo", href: "#contact" }
      - { type: image, asset: hero-mockup, alt: "Dashboard", ratio: "4/3" }
    notes:
      interaction: "fade-up on load"
      responsive: "imagen debajo del texto en tablet"
    needsCodeComponent: false
```

Tipos de hijo permitidos: `heading`, `text`, `rich-text`, `image`, `svg`, `link`, `button`, `list`, `group` (contenedor con `name` kebab-case único en la sección, su propio `layout` y `children`), `component`, `form`, `embed-placeholder`. Nombres de spacing reservados: `space.top|bottom|left|right|horizontal|vertical|global|section-small|section-medium|section-large` (colisionan con utilities Client-First). Nombres de group reservados: `component`, `image`, `image-wrapper`, `icon`, `link`, `list`, `list-item`, `form`, `embed-placeholder` y `*-slot`. El radio del botón sale de `radii.button`.

### 4.5 `assets/manifest.yaml`

`id`, `figmaNode`, `kind` (`svg` | `raster`), `file`, `scale` (raster: 2), `alt`. Logos/íconos siempre `svg`.

### 4.6 `open-questions.md`

El audit nunca inventa. Registra: copy placeholder repetido, frames mobile/tablet ausentes, elementos de intención ambigua, fuentes no disponibles. `/wf-setup` se niega a correr si quedan preguntas sin marcar como resueltas (`- [x]`).

### 4.7 `build-state.json`

```json
{
  "webflow": {
    "siteId": "…",
    "setup": { "status": "done", "at": "2026-10-15T18:00:00Z" },
    "pages": {
      "home": {
        "pageId": "…",
        "sections": {
          "hero": { "status": "built", "specHash": "sha256:…", "elementIds": ["…"], "error": null }
        }
      }
    }
  }
}
```

Estados de sección: `pending | built | failed | qa-pass | qa-fail`. `specHash` = hash de la sección en el YAML + tokens que referencia; si cambia, la sección se considera desactualizada y `/wf-build` la reconstruye.

## 5. Adaptador Webflow

### 5.1 Prerequisitos (verificados por `/wf-setup` y `/wf-build`)

1. Plugin `webflow-skills` instalado.
2. Webflow MCP autenticado; `whoami` + `get_site` responden y el sitio objetivo está identificado.
3. Figma MCP autenticado.
4. `site-spec/` pasa `validate-spec` y `open-questions.md` no tiene ítems abiertos.

Si falla alguno: detenerse y decir exactamente qué falta.

### 5.2 Overrides sobre `webflow-mcp:figma-to-webflow`

Respondemos sus cuatro prompts obligatorios con valores fijos de agencia:

| Prompt oficial | Valor agencia |
|---|---|
| Build mode | Headless; Bridge solo para snapshots en `/wf-qa` |
| Variables | Crear sistema nuevo desde `tokens.yaml` |
| Style naming | Client-First (no FlowKit) |
| Units | rem |

Todos los demás gates del skill oficial se aplican sin cambios (clases creadas antes de usarse, estilos vía `data_style_tool`, variables con `variable_as_value`, SVG inline, raster 2x por asset ID, navbar solo CSS, no publicar por defecto, verificación antes de declarar terminado).

### 5.3 Mapeo Client-First (skill `client-first`)

| Spec | Client-First |
|---|---|
| wrapper de página | `page-wrapper` > `main-wrapper` |
| sección `<id>` | `section_<id>` > `padding-global` > `container-<size>` > `padding-section-<size>` |
| hijos con estructura propia | `<id>_component`, `<id>_content`, `<id>_image-wrapper`… (patrón `[carpeta]_[elemento]`) |
| `heading.hN` | `heading-style-hN` (tag semántico según `level`) |
| `text.<size>` | `text-size-<size>` |
| pesos / colores de texto | `text-weight-*`, `text-color-*` |
| fondos | `background-color-*` |
| variante de componente | combo class `is-<variante>` |
| espaciado puntual | `margin-<dir> margin-<size>` / `padding-<dir> padding-<size>` |
| ocultar por breakpoint | `hide-tablet`, `hide-mobile-landscape`, `hide-mobile-portrait` |

`validate-class-names.mjs` rechaza: mayúsculas, espacios, carpetas sin `_`, combos que no empiezan con `is-`, utilities inexistentes.

### 5.4 `/wf-setup` (bootstrap en sitio vacío)

1. Verificar prerequisitos (5.1).
2. Crear variables Webflow desde `tokens.yaml` en colecciones Colors, Typography, Spacing (px → rem).
3. Subir fuentes con `data_fonts_tool`.
4. Crear utilities Client-First base (crear estilo → aplicar estilos por breakpoint, ligados a variables): `padding-global`, `container-small|medium|large`, `padding-section-small|medium|large`, `heading-style-h1..h6`, `text-size-*`, `text-weight-*`, `text-color-*`, `background-color-*`, `margin-*`/`padding-*`, `max-width-*`, `hide-*`, `button` + combos.
5. Crear página `style-guide` mostrando colores, tipografía, espaciados y botones.
6. Crear navbar y footer como componentes Webflow desde `components.yaml` (navbar con patrón CSS-only del skill oficial).
7. Registrar `setup.status = done` en `build-state.json` y pedir revisión al dev.

### 5.5 `/wf-build <página> [--section <id>]`

Para cada sección en orden (o solo `--section`):

1. Si `status ∈ {built, qa-pass}` y `specHash` vigente → saltar.
2. Si `needsCodeComponent: true` → insertar placeholder, anotar en el reporte, seguir.
3. Ejecutar `plan-section.mjs` → plan JSON:
   ```json
   {
     "section": "hero",
     "classesToCreate": ["section_hero", "hero_component"],
     "whtml": "<section class=\"section_hero\">…</section>",
     "styles": [{ "class": "hero_component", "breakpoint": "main", "props": { "display": "grid", "grid-template-columns": "1fr 1fr" }, "variables": { "grid-column-gap": "space.lg" } }],
     "assets": [{ "id": "hero-mockup", "kind": "raster", "targetSelector": "hero_image" }],
     "interactions": [{ "type": "fade-up", "trigger": "load", "target": "section_hero" }]
   }
   ```
4. Validar nombres con `validate-class-names.mjs`.
5. Crear clases faltantes (`data_style_tool create_style`).
6. Construir estructura con `data_whtml_builder` (una sección por llamada).
7. Aplicar estilos con `update_style` en `main → medium → small → tiny`.
8. Subir y enlazar assets (raster por asset ID, SVG inline embed).
9. Interacciones simples vía skill oficial `interactions` (IX3).
10. Escribir `built`, `specHash`, `elementIds` en `build-state.json`.

Al terminar: resumen con secciones construidas, saltadas, fallidas y placeholders.

### 5.6 `/wf-component <nombre>`

Para secciones con `needsCodeComponent: true`: skill oficial `component-scaffold` → implementación React → `pre-deploy-check` → `webflow devlink import` → reemplazar placeholder por la instancia del componente → marcar `built`.

### 5.7 Manejo de errores

- Fallo de llamada MCP: un reintento. Si persiste: sección `failed` con mensaje en `error`, detener el comando y reportar. Nunca seguir construyendo sobre un error.
- Clase silenciosamente descartada (detectada con `query_elements` tras construir): recrear clase y reaplicar; si persiste, `failed`.
- Bridge desconectada: continuar trabajo estructural headless; snapshots quedan pendientes para `/wf-qa`.
- Spec inválido o preguntas abiertas: no ejecutar nada en Webflow.

## 6. QA (`/wf-qa <página>`)

Escribe `site-spec/qa/<página>.md` y marca cada sección `qa-pass` o `qa-fail`. No corrige automáticamente; el dev decide y usa `/wf-build <página> --section <id>`.

1. **Estructural (determinista, headless, `qa-structural.mjs`):** el agente arma un dump JSON con `query_elements`/`query_styles` y el script verifica: cada sección del spec existe; nombres pasan `validate-class-names`; no hay valores hard-coded donde existe token; un solo `h1` y jerarquía correcta; imágenes con alt; links con href.
2. **Visual:** `wf-qa-reviewer` compara `get_screenshot` de Figma vs snapshot de Designer por sección; lista diffs (espaciado, color, tipografía, alineación) con severidad alta/media/baja. Para tablet/mobile: si el dev confirma publicar a staging `.webflow.io`, capturas en navegador a 1440/768/375 px; si no, esos breakpoints quedan marcados "no verificado".
3. **Accesibilidad:** skill oficial `accessibility-audit`.

Una sección es `qa-pass` si la capa estructural pasa y no hay diffs visuales "alta" sin justificación escrita.

## 7. Testing del plugin

- **Unit (`node:test`):**
  - `validate-spec`: fixtures válidos e inválidos (schema y referencias cruzadas).
  - `validate-class-names`: casos válidos/inválidos.
  - `plan-section`: golden files (sección spec → plan esperado) para hero, grid de cards, CTA, sección con componente y sección con `needsCodeComponent`.
- **End-to-end:** Figma fixture de la agencia (landing 5–6 secciones: navbar, hero, grid de cards, testimonios, CTA, footer) + sitio Webflow sandbox vacío. Corrida `/build-audit → /wf-setup → /wf-build home → /wf-qa home` revisada con checklist.
- **Piloto:** un proyecto real; medir tiempo vs línea base y correcciones manuales por sección.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Webflow MCP cambia herramientas (beta/experimental) | Depender del skill oficial para la mecánica; nuestro código solo produce planes; fijar versión mínima de MCP en la doc |
| Figma desordenado (sin auto-layout, sin variables) produce spec pobre | `open-questions.md` + revisión del dev tras `/build-audit`; documentar requisitos mínimos del Figma para diseño |
| Estilos complejos fallan vía MCP | Construir por sección, verificar con `query_elements`, estado `failed` explícito |
| QA visual imprecisa | Severidades + revisión humana; QA estructural determinista como base |
