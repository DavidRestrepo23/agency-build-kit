# Onboarding: tu primer sitio con Agency Build Kit

Guía para un dev que nunca usó el kit. Al terminar vas a haber construido una página real en Webflow a partir de un Figma, revisando cada fase.

**Tiempo estimado:** 30 min de instalación (una sola vez) + 1–2 h para una landing de prueba.

---

## 1. Qué es (2 minutos de contexto)

El kit son dos plugins de Claude Code:

| Plugin | Qué hace | Comandos |
|---|---|---|
| `build-core` | Lee el Figma aprobado y genera una **ficha técnica** del sitio (`site-spec/`): tokens, componentes, páginas, secciones, assets y preguntas abiertas. No depende de la plataforma. | `/build-core:build-audit` |
| `webflow-builder` | Toma esa ficha y construye el sitio en Webflow con nomenclatura **Client-First**, por fases. | `/webflow-builder:wf-setup`, `/webflow-builder:wf-build`, `/webflow-builder:wf-qa`, `/webflow-builder:wf-component` |

El flujo siempre es:

```text
Figma aprobado → /build-core:build-audit → (resuelves preguntas) → /webflow-builder:wf-setup → (revisas style guide)
→ /webflow-builder:wf-build <página> → /webflow-builder:wf-qa <página> → (ajustes) → publicas tú, a mano
```

Reglas que conviene saber desde el principio:

- **El agente no inventa.** Si algo del Figma no es claro (copy de relleno, falta mobile, un elemento que podría ser slider), lo pregunta o lo deja en `open-questions.md`.
- **El agente nunca publica.** Publicar es siempre una decisión tuya.
- **Tú revisas entre fases.** Cada comando se detiene para que confirmes antes de seguir.

---

## 2. Instalación (una sola vez por computador)

### 2.1 Requisitos

| Requisito | Cómo verificar |
|---|---|
| Claude Code en terminal | `claude --version` |
| Node.js 22 o superior | `node -v` |
| Git instalado y acceso al repo del kit en GitHub | `git --version`; el acceso lo da quien administra el repo |
| Cuenta de Figma con acceso al archivo del cliente | — |
| Cuenta de Webflow con acceso al workspace de la agencia | — |
| Google Chrome (recomendado para Webflow Designer) | — |

> Los comandos `/plugin` solo funcionan en Claude Code **en terminal**, no en el chat de la app de escritorio.

### 2.2 Clonar el repo del kit

Crea la carpeta de trabajo de la agencia y clona el kit dentro:

```bash
mkdir -p ~/Agencia/clientes && cd ~/Agencia && git clone git@github.com:DavidRestrepo23/agency-build-kit.git
```

¿No tienes llave SSH configurada en GitHub? Usa HTTPS (te pedirá iniciar sesión):

```bash
cd ~/Agencia && git clone https://github.com/DavidRestrepo23/agency-build-kit.git
```

Queda así:

```text
~/Agencia/
├─ agency-build-kit/   ← el kit (no trabajes proyectos aquí)
└─ clientes/           ← aquí van los proyectos de cliente
```

**Comprobación:**

```bash
ls ~/Agencia/agency-build-kit/plugins
```

Debe mostrar `build-core` y `webflow-builder`.

> No necesitas ejecutar `npm install`: los scripts que usan los plugins ya vienen listos en `plugins/*/scripts/`. `npm install` solo hace falta si vas a modificar el kit.

### 2.3 Instalar los plugins

Abre una terminal y entra a Claude Code:

```bash
claude
```

Dentro de `claude`, ejecuta uno por uno:

```text
/plugin marketplace add webflow/webflow-skills
/plugin install webflow-skills@webflow-skills
/plugin marketplace add ~/Agencia/agency-build-kit
/plugin install build-core@agency-build-kit
/plugin install webflow-builder@agency-build-kit
```

> **Importante — usa tu ruta real del kit.** `~/Agencia/agency-build-kit` es la ruta sugerida en el paso 2.2. Si clonaste el kit en otra carpeta, reemplázala en `/plugin marketplace add` por la ruta donde quedó (por ejemplo `/plugin marketplace add ~/Documents/agency-build-kit`). Para saber la ruta exacta, entra a la carpeta del kit en la terminal y ejecuta `pwd`. Si la ruta tiene espacios, escríbela entre comillas: `/plugin marketplace add "~/Desktop/Agents IA/agency-build-kit"`.

Sal (`/exit`) y vuelve a entrar con `claude`.

**Comprobación:** escribe `/` y verifica que aparecen `/build-core:build-audit`, `/webflow-builder:wf-setup`, `/webflow-builder:wf-build`, `/webflow-builder:wf-qa` y `/webflow-builder:wf-component`.

> Los comandos de un plugin siempre llevan el nombre del plugin como prefijo (`/build-core:…`, `/webflow-builder:…`). Es normal. Puedes escribir solo el final (`/build-audit`, `/wf-setup`) y el autocompletado te ofrece el comando completo.

### 2.4 Conectar Figma y Webflow

1. En claude.ai → **Settings → Connectors**, conecta **Figma** y **Webflow** (en Webflow elige el workspace de la agencia).
2. Dentro de `claude`, ejecuta `/mcp` y confirma que ambos aparecen conectados.
3. El plugin `webflow-skills` trae su propio servidor MCP de Webflow. Si en `/mcp` aparece `webflow-skills:webflow` como *needs authentication*, selecciónalo y autorízalo (o ignóralo si ya tienes el conector de Webflow de claude.ai conectado: basta con uno).

### 2.5 Ajuste de Chrome (evita desconexiones con Designer)

1. Abre `chrome://settings/performance`.
2. En **"Always keep these sites active"** agrega `webflow.com`.

### 2.6 Actualizar el kit más adelante

Cuando haya una versión nueva del kit (usa la ruta donde clonaste el kit):

```bash
cd ~/Agencia/agency-build-kit && git pull
```

Y dentro de `claude`:

```text
/plugin marketplace update agency-build-kit
```

Reinicia `claude` para que tome los cambios.

---

## 3. Antes de cada proyecto

### 3.1 El Figma debe estar listo

- [ ] **Aprobado** por el cliente (el kit no reemplaza la aprobación de diseño).
- [ ] Hecho con **auto-layout** (sin elementos sueltos con posición absoluta, salvo decorativos).
- [ ] Idealmente con **variables** de color y espaciado, y **estilos de texto**.
- [ ] Con los **frames mobile** de cada página, si existen.
- [ ] Componentes (botón, card, navbar) usados como **instancias**, no copiados.
- [ ] Copy final, sin "Lorem ipsum".

Copia el link **del frame de la página**: clic derecho sobre el frame → *Copy link to selection*.

### 3.2 Sitio de Webflow

- Crea un **sitio nuevo y vacío** en el workspace de la agencia.
- No uses un sitio que ya tenga clases o variables: `/webflow-builder:wf-setup` se niega a correr ahí.

### 3.3 Carpeta y repositorio del proyecto

Cada cliente tiene **su propia carpeta y su propio repo privado**. Nunca crees proyectos dentro del repo del kit.

```text
~/Agencia/
├─ agency-build-kit/          ← el kit
└─ clientes/
   └─ <cliente>-webflow/      ← cada proyecto
```

```bash
mkdir -p ~/Agencia/clientes/<cliente>-webflow && cd ~/Agencia/clientes/<cliente>-webflow && git init && printf ".DS_Store\nnode_modules/\n" > .gitignore
```

Abre Claude Code **dentro de esa carpeta**:

```bash
claude
```

---

## 4. Fase 1 — Auditar el Figma (`/build-core:build-audit`)

```text
/build-core:build-audit <link del frame de Figma>
```

**Qué hace el agente:**

1. Te pregunta qué páginas incluir y para qué plataforma.
2. Lee el Figma sección por sección.
3. **Te pregunta por cada elemento que parezca interactivo** (sliders, tiras de logos, videos, tabs, acordeones, contadores, animaciones). Responde con lo que diga el diseño o el cliente; si no sabes, dilo y queda como pregunta abierta.
4. Genera `site-spec/` y valida que esté completo.

**Qué revisas tú (checkpoint obligatorio):**

| Archivo | Qué mirar |
|---|---|
| `site-spec/pages/<página>.yaml` | Secciones en orden, nombres claros, copy completo y correcto |
| `site-spec/tokens.yaml` | Colores, tipografías, espaciados y `surfaces` (cards, badges) parecidos al Figma |
| `site-spec/components.yaml` | Botón, navbar, footer detectados |
| `site-spec/open-questions.md` | **Resuelve cada pregunta** (con diseño o cliente) y márcala `- [x]` |

Puedes editar los YAML a mano si algo está mal. Después:

```bash
git add site-spec && git commit -m "audit: site-spec inicial"
```

> No pases a la fase 2 con preguntas sin marcar: `/webflow-builder:wf-setup` se va a negar.

---

## 5. Fase 2 — Preparar Webflow (`/webflow-builder:wf-setup`)

```text
/webflow-builder:wf-setup <nombre del sitio en Webflow>
```

**Qué hace el agente:**

1. Verifica requisitos (plugins, conexiones, spec válido, preguntas resueltas, sitio vacío).
2. Te pregunta en qué breakpoint colapsa el navbar (recomienda tablet si hay muchos links).
3. Crea en Webflow: variables (colores, tipografía, espaciado), la fuente, las clases Client-First, la página `style-guide`, y el navbar y footer como componentes.

**Qué revisas tú:**

- Abre el sitio en Webflow Designer → página **`style-guide`**: colores, tamaños de texto y botones como en el Figma.
- Panel **Variables**: las tres colecciones (Colors, Typography, Spacing).

¿Cambiaste algo en `tokens.yaml` después? Vuelve a aplicar con:

```text
/webflow-builder:wf-setup <sitio> --update
```

---

## 6. Fase 3 — Construir páginas (`/webflow-builder:wf-build`)

```text
/webflow-builder:wf-build home
```

Para probar de a poco, una sección a la vez:

```text
/webflow-builder:wf-build home --section hero
```

**Qué hace el agente:** construye sección por sección con elementos nativos de Webflow (editables por el cliente), sube imágenes y guarda el progreso en `site-spec/build-state.json`.

**Qué revisas tú:**

- En Designer: secciones en orden, con clases tipo `section_hero`, `hero_component`, etc.
- El resumen final: qué se construyó, qué se saltó, qué quedó pendiente.
- **Pendientes típicos:**
  - Formularios → se arman a mano en Designer.
  - Secciones marcadas como code component → `/webflow-builder:wf-component home <sección>`.

Si se corta o falla a mitad, vuelve a ejecutar `/webflow-builder:wf-build home`: retoma donde quedó y salta lo ya construido. Si editas una sección del YAML, solo esa se reconstruye.

```bash
git add site-spec && git commit -m "build: home"
```

---

## 7. Fase 4 — Revisar calidad (`/webflow-builder:wf-qa`)

Antes de correrlo, conecta Designer (necesario para las capturas):

1. Abre el sitio en Webflow Designer, en la página que vas a revisar.
2. Presiona **E** (panel Apps) → **Webflow MCP Bridge App** → **Launch**.
3. Deja esa pestaña **al frente**.

```text
/webflow-builder:wf-qa home
```

**Qué revisas tú:** el reporte `site-spec/qa/home.md`:

- **Estructural:** clases, headings, textos alternativos, links.
- **Visual:** diferencias contra el Figma por sección (alta / media / baja).
- **Accesibilidad.**

Corrige lo que haga falta (en el YAML o en Designer) y reconstruye solo esa sección:

```text
/webflow-builder:wf-build home --section <id>
```

---

## 8. Publicar

El agente no publica. Cuando todo esté revisado:

- Publica tú desde Webflow (primero al subdominio `.webflow.io` para revisión), o
- pide explícitamente al agente usar el flujo `safe-publish`.

```bash
git add site-spec && git commit -m "qa: home revisada" && git push
```

---

## 9. Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| No aparecen los comandos `/build-core:build-audit`, `/wf-*` | Revisa que el kit esté clonado (sección 2.2), reinstala los plugins (sección 2.3) y reinicia `claude` |
| "Unable to connect to Webflow Designer" | Abre Designer con la app MCP Bridge (sección 7), pestaña al frente; revisa el ajuste de Chrome (2.5); reintenta |
| "Too Many Requests" (429) de Webflow | Normal en sitios grandes: espera un minuto y vuelve a ejecutar el mismo comando (retoma solo) |
| `/webflow-builder:wf-setup` se niega a correr | Hay preguntas sin marcar en `open-questions.md`, o el sitio no está vacío |
| Las capturas de una sección salen en blanco | Limitación de las capturas aisladas; revisa la página completa o directamente en Designer |
| El Figma no tiene variables | Normal: el agente infiere los tokens y te deja una pregunta para confirmarlos |

---

## 10. Lo que el kit todavía no hace

Para no esperarlo durante la prueba:

- **Degradados** (en fondos y textos) y **texto con estilos mezclados** (una palabra en itálica o color distinto dentro de un título).
- **Elementos decorativos con posición libre** (brillos, íconos flotantes, badges rotados).
- **Overlays** (por ejemplo, un ícono de play encima de una imagen).
- Sliders, tabs y videos se **detectan y se preguntan**, pero se construyen como code component o a mano.
- El menú hamburguesa del navbar es nuevo y todavía no se probó en un sitio real: revísalo en Preview.

---

## 11. Al terminar tu primera prueba

Comparte con el equipo del kit, por fase:

1. ¿Dónde se detuvo o qué pidió que no entendiste? (copia el mensaje)
2. ¿Qué tuviste que hacer a mano que debería hacer el agente?
3. ¿Qué quedó distinto del Figma?
4. ¿Cuánto tardó cada fase?

Con eso se arma el siguiente ciclo de mejoras.
