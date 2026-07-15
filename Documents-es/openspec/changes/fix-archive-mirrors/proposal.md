# Propuesta — `fix-archive-mirrors`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Modo**: auto · **Almacén de artefactos**: hybrid · **Estrategia de entrega**: `auto-chain` (se desvía de la recomendación `Approach A` de `explore.md` §3 — ver §3 abajo) · **Forma del fix**: A (documentación pura)

## 1. Intención

`AGENTS.md §13` es una regla dura: cada `.md` en inglés producido bajo `openspec/` o `docs/` DEBE tener su espejo en español bajo `Documents-es/...` en el **mismo** commit atómico. La auditoría de `openspec/changes/archive/` (según `explore.md`) muestra que **7 carpetas de cambios archivados** faltan o tienen espejo parcial bajo `Documents-es/openspec/changes/archive/` — totalizando **29 archivos ES faltantes** y ~13.5k líneas ES de backlog. AGENTS.md §13 también prohíbe la traducción automática (riesgo de drift CJK bajo `Documents-es/`); el único camino aceptable es la traducción manual. El fix: traducir manualmente cada archivo EN faltante a ES, luego agrupar los espejos en **un commit atómico por archivo** (NO un mega-commit), y entregar como **PRs encadenados** porque 13.5k LOC excede el presupuesto de revisión de 400 líneas. Cero cambios en código fuente; documentación pura.

## 2. Alcance

### En alcance (29 archivos ES a través de 7 archivos)

Por archivo, el conjunto estándar de 5 archivos SDD es `proposal.md`, `spec.md`, `design.md`, `tasks.md`, `explore.md`. Los archivos a los que les falta `explore.md` en EN solo se traducen a lo que EN realmente tiene.

| Archivo | Archivos en EN | Archivos ES faltantes | Alcance por PR |
|---|---|---|---|
| `2026-07-13-fix-api-nestjs-di` | 5 | **5** (proposal, spec, design, tasks, explore) | Todos los 5 |
| `2026-07-14-fix-bdd-tsx-node22` | 5 | **5** (proposal, spec, design, tasks, explore) | Todos los 5 |
| `2026-07-14-fix-state-coverage-drift` | 5 | **5** (proposal, spec, design, tasks, explore) | Todos los 5 |
| `2026-07-14-fix-vitest-4-deprecation` | 4 | **4** (proposal, spec, design, tasks) | Todos los 4 |
| `2026-07-14-fix-web-vitest-crash` | 5 | **5** (proposal, spec, design, tasks, explore) | Todos los 5 |
| `2026-07-14-fix-ci-env-propagation` | 5 | **4** (design, explore, proposal, tasks) — `spec.md` ya espejado | Completar 4 huecos |
| `2026-07-13-slice-8-closing-bdd-and-docs` | 4 | **3** (proposal, spec, tasks) — `design.md` ya espejado | Completar 3 huecos |
| **Totales** | **33 EN** | **29 archivos ES a crear** | **~13,500 LOC netas** |

### Fuera de alcance

- **3 carpetas `-mirror/` extraviadas** (`fix-bdd-tsx-node22-mirror/`, `fix-orphan-shared-directories-mirror/`, `slice-9-housekeeping-mirror/`) — cada una contiene solo un artefacto de planificación `explore.md` que se archivó por error. La limpieza pertenece a un cambio separado.
- **3 cambios activos** aún en progreso (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) — sus espejos aterrizan en el mismo commit que su movimiento de archivo, no aquí.
- **6 ADRs bajo `docs/architecture/decisions/`** — ya espejados según verificación de `slice-9-housekeeping` (según `explore.md §2.2`).
- **Re-espejado** de los 2 archivos parciales (`slice-8-closing-bdd-and-docs` y `fix-ci-env-propagation`) — verificar que sus archivos ES existentes estén intactos; solo completar los huecos.
- **Código fuente**, reglas ESLint, CI, scripts pnpm, o cualquier edición de `apps/`/`libs/`/`tools/`.

## 3. Enfoque

### Decisión: 7 PRs encadenados (uno por archivo), NO un único mega-commit

Esta es una **desviación intencional** de `explore.md §3 Approach A`, que recomendaba un commit atómico agrupando los 29 archivos ES. El pre-flight del orquestador reevaluó contra el presupuesto de revisión de 400 líneas y seleccionó `auto-chain`. Razonamiento:

1. **Cumplimiento del presupuesto de revisión.** ~13.5k líneas ES en un único PR viola §3 de AGENTS.md (presupuesto de revisión de 400 líneas). Cada PR por archivo aterriza ~500–3000 LOC netas (bien dentro del presupuesto).
2. **Atomicidad por archivo preservada.** AGENTS.md §13 dice que los espejos van en el mismo commit atómico que su fuente. Para *espejos retroactivos* de cambios ya archivados, la unidad atómica se convierte en "el conjunto de espejos ES de este archivo" — un commit por archivo. Esto honra el espíritu de §13.
3. **Revisión independiente por archivo.** Los revisores auditan una unidad de traducción acotada a la vez, pueden comparar contra una única fuente EN, y pueden rechazar una traducción incorrecta sin bloquear el resto.
4. **Orden de cadena = más antiguo primero** (según recomendación Q2): el orden histórico de espejos refleja el orden en que los cambios fueron archivados.

### Método de traducción: solo traducción manual (Approach A en explore.md)

- **Sin herramientas de traducción automática** (DeepL, OpenAI, Google Translate). AGENTS.md §13 lo prohíbe por riesgo de drift CJK. La regla ESLint `no-mojibake-in-docs` (roadmap) eventualmente enforce que `perl -ne 'print if /\p{Han}/'` retorne vacío.
- **Registro en español neutro/profesional**, coincidiendo con el tono ya establecido por `slice-8-closing-bdd-and-docs/design.md` y `fix-ci-env-propagation/spec.md` (los dos espejos ES existentes). Sin voseo rioplatense, sin jerga, sin giros regionales.
- **Términos de la industria quedan en inglés**: `commit`, `merge`, `PR`, `ADR`, `BDD`, `Vitest`, `NestJS`, `package.json`, `tsconfig`, `paths`, `slice`, `chore`, `monorepo`, `Turborepo`, `pnpm`. Según los espejos existentes y AGENTS.md §13, los términos técnicos que son inglés estándar de la industria quedan en inglés.

### Quality gate por PR

Cada PR debe verificar:

- `ls Documents-es/openspec/changes/archive/<name>/` muestra los mismos archivos `.md` que el lado EN (sin extras, sin faltantes).
- `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<name>/*.md` retorna vacío (sin drift CJK).
- `pnpm lint:fixtures` sale con 0 (sanity del plugin de boundary).
- `git diff --name-only` muestra SOLO archivos bajo `Documents-es/openspec/changes/archive/<name>/` para ese PR.
- El mensaje de commit usa Conventional Commits (`docs(mirrors): add retroactive ES mirrors for <archive>`); sin línea `Co-Authored-By`; sin atribución de IA.

## 4. Inventario de archivos afectados

7 PRs × ~3–5 archivos ES cada uno = 29 archivos a crear. Sin ediciones, sin eliminaciones. Sin blast radius en código fuente.

| PR | Archivo | Archivos a crear | LOC neta est. | Orden de cadena |
|----|---------|------------------|--------------|-----------------|
| PR 1 | `2026-07-13-fix-api-nestjs-di` | 5 (proposal, spec, design, tasks, explore) | ~3,000 | más antiguo primero |
| PR 2 | `2026-07-14-fix-bdd-tsx-node22` | 5 (proposal, spec, design, tasks, explore) | ~1,500 | ↑ |
| PR 3 | `2026-07-14-fix-state-coverage-drift` | 5 (proposal, spec, design, tasks, explore) | ~1,500 | ↑ |
| PR 4 | `2026-07-14-fix-vitest-4-deprecation` | 4 (proposal, spec, design, tasks) | ~1,500 | ↑ |
| PR 5 | `2026-07-14-fix-web-vitest-crash` | 5 (proposal, spec, design, tasks, explore) | ~2,500 | ↑ |
| PR 6 | `2026-07-14-fix-ci-env-propagation` | 4 (design, explore, proposal, tasks — `spec.md` ya espejado) | ~1,500 | ↑ |
| PR 7 | `2026-07-13-slice-8-closing-bdd-and-docs` | 3 (proposal, spec, tasks — `design.md` ya espejado) | ~1,500 | verify-only |
| **Total** | **7 archivos** | **29 archivos ES** | **~13,000 LOC ES** | — |

**Forma A** — documentación pura, sin código fuente. PR 1 crea la cadena (según la estrategia `auto-chain` del orquestador).

## 5. Metas (numeradas G)

- **G1**: 7 PRs abiertos, uno por archivo, en orden del más antiguo al más reciente (PR 1 = `fix-api-nestjs-di`, PR 7 = `slice-8-closing-bdd-and-docs`).
- **G2**: Cada PR crea los archivos ES faltantes para su archivo (o completa los huecos de los 2 espejos parciales).
- **G3**: Cada archivo ES pasa la verificación de drift CJK: `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<name>/*.md` retorna vacío.
- **G4**: Cumplimiento de AGENTS.md §13 restaurado para los 7 archivos (las 3 carpetas `-mirror/` extraviadas quedan fuera de alcance).
- **G5**: Cero cambios en código fuente; `git diff --name-only` por PR muestra SOLO archivos bajo `Documents-es/openspec/changes/archive/<name>/`.
- **G6**: Los 2 espejos parciales existentes (`slice-8-closing-bdd-and-docs/design.md`, `fix-ci-env-propagation/spec.md`) verificados intactos y no sobrescritos.
- **G7**: Los 7 PRs mergean sin reintroducir el hueco original (verificado reejecutando la tabla de auditoría de `explore.md §2.1`).
- **G8**: Cada PR pasa `pnpm lint:fixtures` con 0; sin regresión de CI.

## 6. No-metas

- Sin features nuevas, sin refactors, sin cambios arquitectónicos.
- Sin ediciones de código fuente en ningún lugar de `apps/`, `libs/`, `tools/`, `pnpm-workspace.yaml`, o `package.json` raíz.
- Sin cambios de reglas ESLint; `no-mojibake-in-docs` queda en estado roadmap-deferred (slice 8 wiring).
- Sin espejos ES para los 6 ADRs ya hechos en `slice-9-housekeeping` (según `explore.md §2.2`).
- Sin espejos ES para las 3 carpetas `-mirror/` extraviadas (cambio de limpieza separado).
- Sin espejos ES para los 3 cambios activos (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) — sus espejos aterrizan con su movimiento de archivo.
- Sin re-traducción de archivos EN; los espejos reflejan solo el contenido EN actual.
- Sin herramientas de traducción automática; solo traducción manual.

## 7. Riesgos

| ID | Riesgo | Probabilidad | Mitigación |
|----|--------|--------------|------------|
| R1 | 7 PRs encadenados añaden 13.5k LOC; fatiga del revisor o conflictos de merge entre cadenas. | Media | Cada PR se revisa independientemente sobre su propio archivo; la cadena es la opción amigable para el revisor (cada PR es ~500–3000 LOC, bien bajo el presupuesto de 400 líneas). Los títulos de PR usan un prefijo consistente `docs(mirrors):` y una etiqueta `[mirror-batch]` en la descripción para tracking. |
| R2 | Drift de tono regional en español a través de 7 PRs (voseo rioplatense, jerga, giros). | Media | Todos los traductores usan registro neutro/profesional en español; referirse a los espejos existentes (`slice-8-closing-bdd-and-docs/design.md`, `fix-ci-env-propagation/spec.md`) como referencia de tono. Los términos de la industria (commit, PR, ADR, BDD, etc.) quedan en inglés según AGENTS.md §13. |
| R3 | Errores de traducción introducen imprecisiones técnicas en los espejos ES. | Baja–Media | EN es autoritativo; los espejos ES son traducciones de significado, no reescrituras creativas. Verificación cruzada de referencias (paths, nombres de paquetes, números de versión) contra EN. Los revisores comparan con EN lado a lado. |
| R4 | Cambios activos (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) se archivan a mitad de cadena, expandiendo alcance. | Baja | Si algún cambio activo se archiva antes de que esta cadena aterrice, re-evaluar el alcance en el siguiente límite de PR; documentar en el proposal/apply report. AGENTS.md §13 ya requiere que el espejo aterrice con el archivo, así que esto se absorbe naturalmente. |
| R5 | Los 2 espejos parciales existentes se sobrescriben o se saltean accidentalmente. | Baja | PRs 6 y 7 verifican explícitamente que el archivo ES existente (`design.md` para slice-8, `spec.md` para fix-ci-env-propagation) esté intacto antes de añadir nuevos archivos; `git status` por PR muestra cambios no intencionales. |
| R6 | Conflictos de merge en cadena porque dos PRs tocan el mismo `Documents-es/openspec/changes/archive/` padre (improbable — cada PR tiene una subcarpeta de archivo distinta). | Muy baja | Cada PR apunta a una subcarpeta de archivo distinta; sin paths solapados. |
| R7 | Drift CJK se cuela en un archivo traducido (residuo de traducción automática, artefacto de copy-paste). | Baja | La verificación CJK por archivo (`perl -ne 'print if /\p{Han}/'`) es parte de la verificación de cada PR; si algún archivo falla, regenerar ese archivo a mano antes del merge. |

## 8. Preguntas abiertas para la fase de Spec

- **Q1**: ¿7 PRs en cadena, o 1 mega-PR? **Recomendación: 7 PRs (cadena)** — ya decidido por el pre-flight del orquestador (estrategia `auto-chain`) para cumplimiento del presupuesto de revisión de 400 líneas. La fase de spec confirma esta forma.
- **Q2**: ¿PRs por archivo en orden de dependencia (más antiguo primero) o inverso? **Recomendación: MÁS ANTIGUO PRIMERO** — preserva el orden histórico de espejos; PR 1 = `fix-api-nestjs-di` (más antiguo), PR 7 = `slice-8-closing-bdd-and-docs` (más reciente de los 7).
- **Q3**: ¿Se deberían marcar los PRs como "mirror batch" en título/etiqueta para tracking? **Recomendación: SÍ** — usar un prefijo de título consistente `docs(mirrors): add retroactive ES mirrors for <archive>` y una etiqueta `[mirror-batch]` en la descripción del PR; etiqueta opcional de GitHub `docs/mirror-batch` si el vocabulario de etiquetas del repo lo permite.
- **Q4**: ¿Se deberían verificar los 2 espejos parciales (slice-8, fix-ci-env-propagation) y completar los huecos en la misma cadena? **Recomendación: SÍ** — PRs 6 y 7 verifican explícitamente que el archivo ES existente esté intacto y solo completan los archivos faltantes. Estado limpio al final de la cadena.
- **Q5**: ¿Debería la cadena incluir un PR-8 final que ejecute la auditoría completa de `explore.md §2.1` como paso de verificación? **Recomendación: OPCIONAL** — la verificación se puede hacer en la descripción del PR 7; un PR separado añade carga al revisor sin valor ingenieril. Omitir a menos que se solicite explícitamente.
- **Q6**: ¿Debería la verificación de cada PR incluir una verificación de `git diff` de que ningún otro path (fuera de `Documents-es/openspec/changes/archive/<name>/`) fue tocado? **Recomendación: SÍ** — esto es parte de G5 y protege contra drift accidental de código fuente. Añadir al contrato de verificación.

## 9. Plan de rollback

Cada PR es independientemente reversible vía `git revert <sha>`. Como cada PR toca una única subcarpeta de archivo bajo `Documents-es/openspec/changes/archive/`, revertir cualquier PR elimina SOLO los espejos ES de ese archivo (y opcionalmente los re-añade si los archivos ES se crearon incorrectamente). No se necesitan reverts de código fuente. La cadena completa se puede revertir PR por PR en orden inverso (PR 7 → PR 1) sin romper el árbol de trabajo en ningún estado intermedio, porque cada commit es autocontenido dentro de su subcarpeta de archivo.

## 10. Criterios de éxito

- [ ] `ls Documents-es/openspec/changes/archive/` muestra las 7 subcarpetas de archivos pobladas (espejos parciales existentes verificados, huecos completados).
- [ ] Para cada uno de los 7 archivos, `ls Documents-es/openspec/changes/archive/<name>/` lista los mismos archivos `.md` (por nombre) que la contraparte EN.
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/**/*.md` retorna vacío (sin drift CJK en ningún lado).
- [ ] `git log` muestra 7 commits convencionales `docs(mirrors):` (sin líneas `Co-Authored-By`, sin atribución de IA).
- [ ] `pnpm lint:fixtures` sale con 0 a través de los 7 PRs.
- [ ] `git diff <before-chain>..<after-chain> --name-only` muestra SOLO archivos bajo `Documents-es/openspec/changes/archive/**` (más `openspec/changes/fix-archive-mirrors/{explore,proposal,spec,design,tasks}.md` de los artefactos de planificación).
- [ ] La auditoría de AGENTS.md §13 (tabla de `explore.md §2.1`) reejecutada muestra 0 archivos ES faltantes para los 7 archivos en alcance.