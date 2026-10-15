# Agency Build Kit — Ciclo 1.1: surfaces (estilos de caja) + excepción del gate de raster

- **Fecha:** 2026-10-15
- **Estado:** diseño aprobado en conversación, pendiente revisión del spec escrito
- **Base:** `docs/superpowers/specs/2026-10-15-webflow-builder-design.md` (ciclo 1). Este documento solo describe cambios.

## 1. Contexto

La prueba end-to-end con el Figma real de Adgrowers (Home) mostró que el `site-spec` no puede describir **estilos de caja en grupos**: cards con fondo, borde, radio y padding; badges/píldoras; paneles destacados. Solo las secciones admiten `background`. Casi cualquier diseño de la agencia usa cards, así que es la limitación prioritaria.

También mostró que el gate de raster (`scale ≥ 2`) bloquea la validación cuando el diseño solo tiene fuentes de menor resolución, sin forma de registrar una excepción aprobada.

**Éxito:** re-auditar Adgrowers con surfaces y que `/wf-build home` produzca cards, badges y paneles con fondo, borde, radio y padding correctos; `validate-spec` pasa con las imágenes del portafolio aprobadas explícitamente.

### Fuera de alcance (siguen como limitaciones documentadas)

- Degradados (fondos y texto).
- Texto con estilos mezclados (spans) y transformaciones de texto (uppercase).
- Overlays (hijo sobre imagen) y decorativos con posición absoluta.

## 2. Schema

### 2.1 `tokens.yaml` → `surfaces` (opcional)

```yaml
surfaces:
  card:
    background: neutral.glass                          # token de color
    border: { color: neutral.border-strong, width: 2 } # width en px (entero ≥ 1)
    radius: card                                       # clave existente en radii
    padding: { x: space.xl, y: space.xl }              # tokens de spacing (space.*)
  pill:
    background: neutral.glass
    border: { color: neutral.border-strong, width: 1 }
    radius: button
    padding: { x: space.sm, y: space.xs }
```

- Nombre de surface: kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`).
- Propiedades permitidas: `background`, `border` (`color` y `width` ambos requeridos si hay `border`), `radius`, `padding` (`x` y/o `y`). Ninguna otra propiedad.
- Al menos una propiedad por surface.

### 2.2 Páginas → `surface`

- Nuevo campo opcional `surface: <nombre>` en `section` y en hijos `group`.
- Una `section` no puede tener `background` y `surface` a la vez.

### 2.3 `assets/manifest.yaml` → `scaleApproved`

- Nuevo campo opcional en assets: `scaleApproved: "<motivo>"` (string, mínimo 3 caracteres).
- Si existe, un asset `raster` con `scale < 2` no produce error.

## 3. Validación (`validate-spec`)

Errores nuevos (archivo y ruta exactos, mismo formato que ciclo 1):

| Caso | Archivo / ruta | Mensaje |
|---|---|---|
| Surface referencia color inexistente | `tokens.yaml` `/surfaces/<name>/background` o `/border/color` | `unknown color token "<t>"` |
| Surface referencia spacing inexistente | `tokens.yaml` `/surfaces/<name>/padding/<x|y>` | `unknown spacing token "<t>"` |
| Surface referencia radio inexistente | `tokens.yaml` `/surfaces/<name>/radius` | `unknown radius "<k>"` |
| Página referencia surface inexistente | `pages/<slug>.yaml` `<ruta>/surface` | `unknown surface "<name>"` |
| Sección con `background` y `surface` | `pages/<slug>.yaml` `/sections/<i>` | `section cannot have both background and surface` |
| Raster `scale < 2` sin `scaleApproved` | sin cambios respecto a ciclo 1 | sin cambios |

Las formas inválidas (surface sin propiedades, `border` sin `width`, propiedades desconocidas, `scaleApproved` vacío) las rechaza el JSON Schema.

## 4. Adaptador Webflow

### 4.1 Validador de clases

Nueva utility permitida: `^surface-[a-z0-9]+(-[a-z0-9]+)*$`.

### 4.2 `plan-setup`

Por cada surface `<name>` genera estilos de la clase global `surface-<name>`:

- `background` → `variables: { background-color: <var del color> }`.
- `border` → props `border-{top,right,bottom,left}-width: <width>px` y `-style: solid`; `variables: { border-{side}-color: <var> }`.
- `radius` → props `border-{top-left,top-right,bottom-right,bottom-left}-radius: pxToRem(radii[radius])` y `overflow: hidden`.
- `padding.y` → `padding-top`/`padding-bottom`; `padding.x` → `padding-left`/`padding-right`; ligados a las variables de spacing por breakpoint (`responsiveVariableNames`), una entrada de estilo por breakpoint que cambie.

La clase se agrega a `classes`. Los nombres de variables coinciden con los ya creados por `plan-setup` para colores y spacing.

### 4.3 `plan-section`

- Grupo con surface: `<div class="<id>_<name> surface-<surface>">`.
- Sección con surface: `<section class="section_<id> surface-<surface>">`.
- `surface-<surface>` se agrega a `utilitiesUsed` (no a `classesToCreate`).
- El layout del grupo sigue en su clase propia.
- `specHash`: cambia si cambia la surface asignada (es parte del YAML de la sección). No cambia si cambia la definición de la surface: eso es responsabilidad del setup, igual que los estilos de `button`.

### 4.4 `/wf-setup --update`

- Sin `--update`: comportamiento del ciclo 1 (exige sitio vacío).
- Con `--update`: exige `webflow.setup.status = done`; re-ejecuta el plan de setup de forma idempotente: crea variables/clases faltantes, actualiza valores de variables existentes que cambiaron (reportando cada cambio) y re-aplica todos los estilos con `update_style`. No crea de nuevo la página `style-guide` ni los componentes si ya existen.

### 4.5 Documentación de skills

- `site-spec/SKILL.md`: sección "Surfaces" con ejemplo, regla de `background` vs `surface`, y `scaleApproved`.
- `figma-extract/SKILL.md`: frames con fill/stroke/radius/padding repetidos → surface nombrada (no duplicar); un estilo de caja usado una sola vez también se nombra.
- `client-first/SKILL.md`: utility `surface-*` y su apilamiento.
- `build-audit.md`: el reporte final lista los assets con `scaleApproved` y su motivo.

## 5. Testing

- `validate-spec`: fixture válido con surfaces pasa; cada fila de la tabla de §3 tiene un test; `scaleApproved` evita el error de scale.
- `class-names`: `surface-card` válido (utility); `surface_` y `surface-` inválidos.
- `plan-setup`: surface `card` genera background, bordes, radio con `overflow`, padding responsivo; todas las clases generadas pasan el validador.
- `plan-section`: grupo y sección con surface generan la clase apilada; `utilitiesUsed` la incluye; `specHash` cambia al cambiar la surface asignada y no al cambiar su definición; cada surface usada por un plan existe en `planSetup().classes`.
- Fixture: agrega `surfaces.card` y `surfaces.pill`, `radii.card`, colores `neutral.glass` y `neutral.border-strong`, y usa `surface` en un grupo y en una sección.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Webflow convierte la segunda clase en combo en vez de apilar la global | Las surfaces se crean en setup antes de cualquier uso (como las utilities de spacing); QA estructural verifica las clases presentes |
| `--update` cambia variables usadas por el cliente | Reporta cada valor cambiado; nunca borra variables ni clases |

## 7. Adenda (durante la prueba E2E, aprobada por el desarrollador)

- **Bloque `page` en `tokens.yaml`:** `page: { background, color, text }` (tokens de color y tipografía). `plan-setup` estiliza `page-wrapper` con `background-color`, `color` (variables), `font-family`, `font-weight`, `line-height` y `font-size` responsivo ligado a la variable `<text>-size`. Validación: tokens inexistentes → `unknown color token` / `unknown typography token` en `/page/<clave>`.
- **Bug corregido:** los gaps de layout se emiten como `grid-row-gap` / `grid-column-gap` (claves con las que Webflow guarda el gap, también en flex), no `row-gap` / `column-gap`.
