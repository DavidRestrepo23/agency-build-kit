# Agency Build Kit

Plugins de Claude Code que convierten un diseño aprobado en **Figma** en un sitio construido en **Webflow**, por fases y con revisión entre cada una. El resultado tiene nomenclatura **Client-First**, variables, `rem`, flex/grid y elementos nativos, y se compara contra Figma por número y por imagen.

**Versión actual: 0.13.0** · ¿Primera vez? Sigue la guía paso a paso: [docs/onboarding.md](docs/onboarding.md).

| Plugin | Qué hace | Comandos |
|---|---|---|
| `build-core` | Lee el Figma y genera la ficha técnica neutral del sitio (`site-spec/`). No depende de la plataforma. | `/build-core:build-audit` |
| `webflow-builder` | Construye el `site-spec/` en Webflow por el MCP oficial y lo verifica contra Figma. | `/webflow-builder:wf-setup` · `wf-build` · `wf-qa` · `wf-motion` · `wf-component` |

```text
Figma ─▶ /build-audit ─▶ resuelves open-questions.md ─▶ /wf-setup ─▶ /wf-build <página>
     ─▶ /wf-qa <página> [--fix] ─▶ ¿Todo OK? ─▶ /wf-motion <página> (opcional) ─▶ publicas tú
```

---

## Requisitos

| Requisito | Para qué |
|---|---|
| Claude Code (terminal, app de escritorio o IDE) | El agente |
| Node.js ≥ 22 | Scripts deterministas del kit (sin `npm install`) |
| Plugin oficial `webflow-skills` | Skills y MCP de Webflow en los que se apoya el kit |
| MCP de **Figma** y de **Webflow** autorizados (`/mcp` o claude.ai → Connectors) | Leer el diseño, construir el sitio |
| Sitio de Webflow **creado en el dashboard** (puede estar vacío) | Destino; el MCP no puede crear sitios |
| Webflow Designer abierto en Chrome con la **MCP Bridge app** | Solo para la fase visual de `wf-build`, el QA y `wf-motion` |
| Webflow CLI ≥ 2.0 | Solo para `/webflow-builder:wf-component` |

## Instalación

```bash
git clone https://github.com/DavidRestrepo23/agency-build-kit.git ~/Agencia/agency-build-kit
claude plugin marketplace add webflow/webflow-skills
claude plugin install webflow-skills@webflow-skills
claude plugin marketplace add ~/Agencia/agency-build-kit
claude plugin install build-core@agency-build-kit
claude plugin install webflow-builder@agency-build-kit
```

Verifica con `claude plugin list | grep -A4 agency-build-kit`: los dos plugins en `0.13.0` y `✔ enabled`. Dentro de Claude Code, `/build-audit` debe autocompletar `/build-core:build-audit`.

**Actualizar:** `git -C ~/Agencia/agency-build-kit pull` y abre una sesión nueva (o `/reload-plugins`). Si `claude plugin list` no muestra `Read from: …/plugins/…`, corre además `claude plugin marketplace update agency-build-kit` y `claude plugin update <plugin>@agency-build-kit`.

---

## Comandos

### `/build-core:build-audit <url-figma>`
Convierte el Figma en `site-spec/`. Usa un link al frame de la página (*Copy link to selection*, con `node-id`).

- Pregunta primero el **idioma** de las respuestas y de `open-questions.md`, y lo guarda en `project.yaml`.
- Detecta las secciones aunque estén dentro de frames genéricos ("Frame 82") o con el navbar dentro del hero.
- Tokens desde las variables de Figma o, si no hay, inferidos de los valores. `letterSpacing` en px y `textTransform`. Breakpoints desktop, tablet, `mobileLandscape` y mobile.
- **Sin auto layout no es problema:** `infer-layout.mjs` calcula fila, columna o grid, gap, padding y alineación a partir de las posiciones. Solo pregunta los casos de baja confianza. Glows, stickers y capas superpuestas pasan a `decorative`.
- **Comportamiento:** te muestra todas las secciones con su suposición (estática, slider, tabs, acordeón, lightbox, video, modal, marquee, contador, código) y te pregunta los detalles.
- Assets: SVG con `viewBox`, rasters exportados a 2x reales, recortes con transparencia verificada.
- **Sitios de varias páginas:** `shared-sections.mjs` detecta las secciones repetidas (idénticas o con la misma estructura y distinto copy) y te propone convertirlas en **componentes compartidos con props**: se construyen y se comparan con Figma una sola vez, y en cada página se colocan instancias con su propio copy.
- No inventa copy, links ni alt: todo lo dudoso va a `open-questions.md`.

### `/webflow-builder:wf-setup [sitio] [--update]`
Prepara el sitio vacío. Exige que no queden preguntas abiertas.

- Crea las variables (Colors, Typography, Spacing en `rem`) y las utilidades Client-First. Los títulos y párrafos quedan sin márgenes por defecto.
- **Fuentes:** las Google Fonts se descargan y se suben como archivo (`fetch-google-font.mjs`). Las de Adobe se agregan a mano.
- Crea la página `style-guide`.
- Crea los componentes (navbar, footer…) desde `plan-component.mjs` y **los compara con Figma**, incluido el navbar colapsado.
- `--update` aplica cambios de tokens o surfaces sobre un sitio ya preparado.

### `/webflow-builder:wf-build <página> [--section <id> | --sections <a,b>] [--phase all|structure|visual]`
Construye la página sección por sección y retoma donde quedó (`build-state.json`).

| Fase | Qué hace | Designer |
|---|---|---|
| `structure` | Estructura, clases (una por elemento), estilos ligados a variables, assets subidos headless, nativos (Slider, Tabs, Dropdown, Lightbox, Video, Modal), interacciones IX3. Relee el copy y verifica los valores aplicados (`compare-values --plan`). | No |
| `visual` | Por sección: números de Figma vs. estilos de Webflow + snapshot vs. screenshot de Figma; corrige escribiendo `overrides` en el YAML (hasta 3 vueltas). Antes, los componentes pendientes. | Sí |
| `all` (por defecto) | Primero `structure` para todo, después `visual`. | Solo en la segunda fase |

Si quedan 3 o más secciones, avisa y ofrece **repartir la fase `structure` entre agentes** (otras sesiones de Claude Code, Codex o Antigravity), con un prompt listo para cada grupo. La fase `visual` la hace un solo agente.

### `/webflow-builder:wf-qa <página> [--fix]`
QA en dos pasadas, más accesibilidad:

1. **Conformidad con el spec:** estructura, clases, copy (placeholders o texto reescrito), combos vacíos, nativos, absolutos, px fijos, links `#`, valores aplicados.
2. **Fidelidad con Figma, ignorando el spec:** recorre los frames de Figma, no el YAML (`figma-coverage.mjs`), así que entran el navbar, el footer y lo que el audit haya omitido. Cada diferencia se clasifica como error de build, error del spec, omisión o spec desactualizado.

- `--fix`: con una sola confirmación, corrige **en el spec**, reconstruye solo lo afectado y vuelve a comparar (hasta 3 vueltas).
- Staging, solo si lo confirmas: lee el **publicado** sin caché (`check-published.mjs`) y revisa 14 anchos (375 a 2560), scroll horizontal en 0, textos y botones táctiles.
- Al final pregunta **"¿Todo OK?"** y ofrece pasar a `wf-motion`.

### `/webflow-builder:wf-motion <página>` (opcional, después del QA)
Le da vida al sitio sin cambiar el diseño aprobado.

- Busca 5–8 referencias del rubro y el tono del sitio (Webflow Showcase, Awwwards, Godly…). Solo las observa; no copia código.
- Propone un plan por sección con intensidad `subtle`, `medium` o `bold`. Presets: `hover-lift`, `hover-scale`, `hover-image-zoom`, `hover-darken`, `hover-fade`, `hover-underline`, `scroll-fade-up`, `scroll-fade-in`, `scroll-scale-in`, `scroll-stagger-children`, `heading-line-reveal`, `scroll-parallax-y`, `load-fade-up`.
- Lo que elijas queda en `site-spec/motion.yaml`. Se aplica con estados hover nativos e interacciones IX3 vía `data-anim`, respetando `prefers-reduced-motion`.
- Solo anima transform, opacity, filter y shadow, así que no hay saltos de layout. Al terminar verifica que en reposo siga igual a Figma.

### `/webflow-builder:wf-component <página> <sección>`
Construye con la Webflow CLI el code component (React) de una sección marcada `code` o `needsCodeComponent` y lo coloca en su slot.

---

## Memoria del proyecto (retomar después de cerrar la sesión)

- Cada comando registra sus hitos en `site-spec/progress.md`.
- Al abrir Claude Code en la carpeta de un proyecto con `site-spec/`, el kit te dice **dónde quedó el trabajo y cuál es el siguiente comando**.
- Para consultarlo a mano: `node <kit>/plugins/build-core/scripts/progress.mjs status site-spec --text`.

## Seguridad

- **El kit nunca publica por su cuenta.** Un hook (`guard.mjs`) pide confirmación antes de publicar y antes de borrar estilos, variables o páginas.
- Una vez que `build-state.json` registra el `siteId` del proyecto, el guard bloquea las llamadas a otros sitios.
- No inventa copy ni links. Lo que no pudo verificar lo reporta como "no verificado".

## Qué hay en `site-spec/` (en el repo del cliente)

| Archivo | Contenido |
|---|---|
| `project.yaml` | Nombre, Figma, idioma, plataforma, breakpoints, páginas |
| `tokens.yaml` | Colores, tipografía, espaciado, radios, sombras, surfaces, fuentes (en px) |
| `components.yaml` | Botones, navbar, footer… con variantes, hijos y `overrides` |
| `pages/<slug>.yaml` | Secciones → árbol neutral; `behavior` (slider, tabs…), `decorative`, `overrides` del ciclo visual |
| `assets/` | `manifest.yaml` + archivos |
| `open-questions.md` | Dudas del audit (`- [ ]` → `- [x]`) |
| `motion.yaml` | Efectos elegidos en `wf-motion` |
| `build-state.json` | Estado por sección y componente (no editar a mano) |
| `progress.md` | Memoria del proyecto |
| `qa/` | Reportes y dumps del QA |

## Scripts deterministas

Los comandos usan scripts de Node sin dependencias, en `plugins/*/scripts/`:

| Script | Uso |
|---|---|
| `validate-spec.mjs` | Schemas + referencias cruzadas + assets (`--require-resolved` exige las preguntas resueltas) |
| `infer-layout.mjs` | Layout a partir de posiciones de Figma, con nivel de confianza |
| `shared-sections.mjs` | Secciones repetidas entre páginas → candidatas a componente compartido |
| `plan-setup.mjs` · `plan-section.mjs` · `plan-component.mjs` · `plan-motion.mjs` | Planes que ejecuta el agente en Webflow |
| `compare-values.mjs` | Comparación numérica Figma/plan vs. Webflow |
| `qa-structural.mjs` · `figma-coverage.mjs` | Pasadas 1 y 2 del QA |
| `build-state.mjs` · `progress.mjs` | Estado y memoria del proyecto |
| `asset-upload.mjs` · `fetch-google-font.mjs` | Subida headless de assets y fuentes |
| `check-published.mjs` | Verifica el HTML publicado |
| `guard.mjs` · `session-resume.mjs` | Hooks: guard de Webflow y punto de retorno al iniciar sesión |

## Límites conocidos del MCP de Webflow (v2.0.1)

- Una autorización = un workspace. Los sitios se crean en el dashboard.
- El Slider nativo no admite slides nuevos por API (el kit usa un slider "donante") y el loop infinito se configura a mano.
- El "initial appearance" de las interacciones y el contador animado no se pueden hacer por API: se reportan como trabajo manual.
- Snapshots, navegación del canvas y `upload_image_by_url` requieren el Designer con la Bridge app.

## Desarrollo del kit

```bash
npm install
npm test          # suite completa
npm run build     # regenera plugins/*/scripts desde src/ — haz commit del resultado
```

Edita siempre `src/` (los scripts de `plugins/*/scripts/` se generan). Cambios por rama, con tests (TDD), y sube la `version` en `plugins/*/.claude-plugin/plugin.json` y `package.json`.
