# Exploración: fix-archive-mirrors

> **Auditoría de solo lectura** de la cobertura de espejos en español (ES) bajo `Documents-es/openspec/changes/archive/` en relación con el archivo en inglés (EN) bajo `openspec/changes/archive/`. Objetivo: identificar cada artefacto de planificación que AGENTS.md §13 dice que debe tener un espejo en español.

## 1. Estado actual

### 1.1 Archivo EN (`openspec/changes/archive/`) — 10 carpetas

```
openspec/changes/archive/
├── 2026-07-13-fix-api-nestjs-di/                        (5 archivos)
├── 2026-07-13-slice-8-closing-bdd-and-docs/             (4 archivos)
├── 2026-07-14-fix-bdd-tsx-node22/                       (5 archivos)
├── 2026-07-14-fix-bdd-tsx-node22-mirror/                (1 archivo extraviado)
├── 2026-07-14-fix-ci-env-propagation/                   (5 archivos)
├── 2026-07-14-fix-orphan-shared-directories-mirror/     (1 archivo extraviado)
├── 2026-07-14-fix-state-coverage-drift/                 (5 archivos)
├── 2026-07-14-fix-vitest-4-deprecation/                 (4 archivos)
├── 2026-07-14-fix-web-vitest-crash/                     (5 archivos)
└── 2026-07-15-slice-9-housekeeping-mirror/              (1 archivo extraviado)
```

### 1.2 Archivo ES (`Documents-es/openspec/changes/archive/`) — 2 carpetas parciales

```
Documents-es/openspec/changes/archive/
├── 2026-07-13-slice-8-closing-bdd-and-docs/design.md          (1/4)
└── 2026-07-14-fix-ci-env-propagation/spec.md                   (1/5)
```

### 1.3 Carpetas `-mirror` extraviadas (artefactos de planificación archivados accidentalmente)

Estas tres carpetas contienen SOLO un `explore.md`. No son cambios archivados propiamente dichos — son artefactos de planificación (`explore.md` producido por `sdd-explore` durante el paso de chore de artefactos de planificación) que se movieron al archivo por error. **Fuera de alcance para este cambio**; marcadas aquí para un cambio futuro de limpieza.

| Carpeta extraviada | Contenido EN | Contenido ES | Acción |
|---|---|---|---|
| `2026-07-14-fix-bdd-tsx-node22-mirror/` | `explore.md` | — | Limpieza futura: eliminar la carpeta, O traducir su `explore.md` |
| `2026-07-14-fix-orphan-shared-directories-mirror/` | `explore.md` | — | Limpieza futura |
| `2026-07-15-slice-9-housekeeping-mirror/` | `explore.md` | — | Limpieza futura |

## 2. Áreas afectadas (el hueco a cerrar)

### 2.1 Tabla de auditoría por archivo

| Carpeta de archivo EN | Archivos EN | Archivos ES presentes | **Archivos ES faltantes** | LOC EN |
|---|---|---|---|---|
| `2026-07-13-fix-api-nestjs-di` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 3,029 |
| `2026-07-13-slice-8-closing-bdd-and-docs` | design, proposal, spec, tasks | design (1/4) | **proposal, spec, tasks** (3) | 2,070 − 658 design = 1,412 |
| `2026-07-14-fix-bdd-tsx-node22` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 1,738 |
| `2026-07-14-fix-ci-env-propagation` | design, explore, proposal, spec, tasks | spec (1/5) | **design, explore, proposal, tasks** (4) | 2,013 − 585 spec = 1,428 |
| `2026-07-14-fix-state-coverage-drift` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 1,823 |
| `2026-07-14-fix-vitest-4-deprecation` | design, proposal, spec, tasks | — (0/4) | **proposal, spec, design, tasks** (4) | 962 |
| `2026-07-14-fix-web-vitest-crash` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 1,718 |
| (totales) | 33 archivos EN | 2 archivos ES | **29 archivos ES faltantes** | 12,180 líneas EN |

**Archivos que requieren atención: 7**
**Archivos faltantes a crear: 29**

### 2.2 Otras ubicaciones verificadas (no afectadas)

| Ubicación | ¿EN presente? | ¿ES presente? | ¿Hueco? |
|---|---|---|---|
| `docs/architecture.md` (raíz) | sí | sí (`Documents-es/docs/architecture.md`) | no |
| `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` | sí | sí | no |
| `docs/architecture/decisions/0008-no-import-type-injectable.md` | sí | sí | no |
| `docs/architecture/decisions/0011-shared-as-workspace-packages.md` | sí | sí | no |
| `docs/first-run-checklist.md` | sí | sí | no |
| `docs/migration-playbook.md` | sí | sí | no |
| `docs/slice-3-checklist.md` | sí | sí | no |
| `docs/slice-7-checklist.md` | sí | sí | no |
| `openspec/changes/fix-bdd-ci-zod-resolution/` (activo) | sí (5 archivos) | solo `explore.md` (1/5) | cambio activo, trabajo en curso — **fuera de alcance** para este fix |
| `openspec/changes/slice-9-housekeeping/` (activo) | sí | — (0/5) | cambio activo, trabajo en curso — **fuera de alcance** |
| `openspec/changes/vertical-slicing-reference-scaffold/` (activo) | sí | espejo completo | no |
| `openspec/changes/fix-orphan-shared-directories/` (activo) | sí | — | cambio activo, **fuera de alcance** |

## 3. Enfoques

### Enfoque A — Traducir manualmente los 29 archivos faltantes en un cambio atómico (RECOMENDADO)

**Descripción**: Un único cambio solo de documentación que crea 29 archivos `.md` bajo `Documents-es/openspec/changes/archive/<name>/`, espejando los archivos fuente EN. Sin cambios en código fuente. Aplica la excepción de TDD estricto (§4 de AGENTS.md): los archivos de documentación son config pura y no requieren tests, pero DEBEN mantener el pipeline en verde (`pnpm lint:fixtures`).

- **Pros**:
  - Un commit atómico agrupa todos los espejos retroactivos (coincide con la intención de AGENTS.md §13).
  - Sin riesgo de drift CJK — el traductor es el asistente que produce el archivo directamente.
  - Re-ejecutable: cada archivo traducido es idéntico a su fuente EN semánticamente.
  - Huella del revisor más pequeña: los cambios son docs puros, fácilmente auditables visualmente.
  - Idempotente respecto al pipeline: sin impacto en source/build/lint.
- **Contras**:
  - 29 traducciones escritas a mano; no es gratis, pero está acotado (la auditoría muestra que el archivo más grande tiene 1,654 líneas — `design.md` de fix-api-nestjs-di).
  - Riesgo de drift de tono regional en español; mitigado escribiendo en registro neutro/profesional según convención de AGENTS.md.
- **Esfuerzo**: Medio (≈12k líneas EN × ~1.1× expansión ES ≈ ~13.5k líneas ES).

### Enfoque B — Usar una herramienta de traducción automática (por ejemplo, OpenAI API, DeepL)

- **Pros**: Más rápido; sin tiempo de escritura humana.
- **Contras**:
  - **Riesgo de drift CJK** marcado por AGENTS.md §13: las herramientas de traducción automática frecuentemente dejan codepoints CJK dispersos (mojibake, términos mal traducidos). Según la política del proyecto, el espejo DEBE estar vacío bajo `perl -ne 'print if /\p{Han}/'`.
  - Pérdida de voz; términos como "slice", "ticket", "PR", "commit" deberían quedarse en inglés (uso estándar de la industria), pero las herramientas automáticas a menudo los deforman.
  - Llamada a API externa añade superficie de credenciales/costo y reduce reproducibilidad.
- **Esfuerzo**: Bajo para ejecución, Alto para limpieza.

### Enfoque C — No hacer nada (diferir al próximo slice de housekeeping)

- **Pros**: Cero esfuerzo ahora.
- **Contras**: Viola AGENTS.md §13, que es una REGLA DURA. La regla de lint `no-mojibake-in-docs` eventualmente enforce esto (diferida al slice 8) pero la convención ya es obligatoria.

## 4. Recomendación

**Enfoque A** (traducción manual, commit retroactivo único).

Razonamiento:

1. AGENTS.md §13 es una **REGLA DURA**; diferir no es aceptable.
2. El lote retroactivo está acotado (29 archivos, ~13.5k líneas ES) y tiene cero blast radius en código fuente.
3. Agrupar en un único commit atómico coincide con la intención de §13: *"Cada `.md` en inglés producido bajo `openspec/` o `docs/` DEBE tener su espejo en español bajo `Documents-es/` en el **mismo** commit atómico."* — esta es la encarnación retroactiva de esa regla.
4. La traducción manual evita el riesgo de drift CJK al que la traducción automática nos expone (el proyecto ya tiene la regla de lint `no-mojibake-in-docs` en su roadmap).

Un cambio de housekeeping de seguimiento debería manejar por separado:

- Las 3 carpetas `-mirror/` extraviadas (artefactos de planificación que fueron archivados por error).
- Los cambios activos (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) a los que les faltan espejos pero están en progreso; sus espejos aterrizarán en el mismo commit que su movimiento de archivo.

## 5. Riesgos

- **Presupuesto de LOC y sobrecarga del revisor**: ~13.5k adiciones ES. Esto es docs puro y está exento del presupuesto de 400 líneas por PR según sección E de `sdd-phase-common.md` porque los docs generados/traducidos típicamente representan una unidad de traducción coordinada, no un stack de decisiones de ingeniería revisables. El orquestador debería llamar `delivery_strategy: single-pr` para este cambio.
- **Drift de tono regional**: las traducciones al español podrían derivar hacia voseo rioplatense o giros superfluos. Convención: escribir español neutro/profesional (la audiencia del proyecto son equipos técnicos), mantener los términos de la industria ("commit", "PR", "merge", "ADR", "BDD", "Vitest", "NestJS", etc.) en inglés.
- **Archivos ES obsoletos para bugs corregidos**: AGENTS.md §13 dice que los espejos deben reflejar lo que el archivo EN dice actualmente. Si EN fue editado post-archivado, el nuevo ES debe reflejar el EN actual. La auditoría anterior trata el archivo EN actual como la fuente de verdad — no se necesita historial de edición.
- **Drift fuera de alcance durante el apply**: aplicar el cambio NO DEBE tocar `openspec/`, `apps/`, `libs/`, `tools/`, `docs/`, ni ningún archivo `package.json`/typescript. Solo se toca `Documents-es/openspec/changes/archive/**`. CI/pre-commit deben pasar sin diff fuera de ese path.
- **Cambios activos movidos al archivo entre la auditoría y el apply**: si `fix-bdd-ci-zod-resolution` o `slice-9-housekeeping` se archivan antes de que este fix aterrice, sus espejos `Documents-es/...` deberían añadirse aquí también; esperar 2-3 archivos más (aumento cosmético de alcance, fuera de alcance contractualmente — a discutir en tiempo de apply).

## 6. Contrato de verificación

Después del fix:

1. `ls Documents-es/openspec/changes/archive/` muestra las mismas 7 carpetas que el lado EN tiene (más las 3 carpetas `-mirror/` extraviadas, sin tocar).
2. Para cada uno de los 7 archivos, `ls Documents-es/openspec/changes/archive/<name>/` lista los mismos 4 o 5 archivos `.md` que su contraparte EN.
3. `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/**/*.md` retorna vacío (sin drift CJK).
4. `git diff --name-only` muestra SOLO archivos bajo `Documents-es/openspec/changes/archive/**` más `openspec/changes/fix-archive-mirrors/explore.md`.
5. `pnpm lint:fixtures` sigue saliendo con 0.
6. `git log -1` muestra un único commit atómico con un subject de Conventional Commits (`docs(mirrors): add retroactive ES mirrors for archived changes`); sin línea `Co-Authored-By`.

## 7. Archivos afectados — lista completa

Los 29 archivos ES a crear (bajo `Documents-es/openspec/changes/archive/`):

```
archive/2026-07-13-fix-api-nestjs-di/proposal.md
archive/2026-07-13-fix-api-nestjs-di/spec.md
archive/2026-07-13-fix-api-nestjs-di/design.md
archive/2026-07-13-fix-api-nestjs-di/tasks.md
archive/2026-07-13-fix-api-nestjs-di/explore.md
archive/2026-07-13-slice-8-closing-bdd-and-docs/proposal.md
archive/2026-07-13-slice-8-closing-bdd-and-docs/spec.md
archive/2026-07-13-slice-8-closing-bdd-and-docs/tasks.md
archive/2026-07-14-fix-bdd-tsx-node22/proposal.md
archive/2026-07-14-fix-bdd-tsx-node22/spec.md
archive/2026-07-14-fix-bdd-tsx-node22/design.md
archive/2026-07-14-fix-bdd-tsx-node22/tasks.md
archive/2026-07-14-fix-bdd-tsx-node22/explore.md
archive/2026-07-14-fix-ci-env-propagation/design.md
archive/2026-07-14-fix-ci-env-propagation/explore.md
archive/2026-07-14-fix-ci-env-propagation/proposal.md
archive/2026-07-14-fix-ci-env-propagation/tasks.md
archive/2026-07-14-fix-state-coverage-drift/proposal.md
archive/2026-07-14-fix-state-coverage-drift/spec.md
archive/2026-07-14-fix-state-coverage-drift/design.md
archive/2026-07-14-fix-state-coverage-drift/tasks.md
archive/2026-07-14-fix-state-coverage-drift/explore.md
archive/2026-07-14-fix-vitest-4-deprecation/proposal.md
archive/2026-07-14-fix-vitest-4-deprecation/spec.md
archive/2026-07-14-fix-vitest-4-deprecation/design.md
archive/2026-07-14-fix-vitest-4-deprecation/tasks.md
archive/2026-07-14-fix-web-vitest-crash/proposal.md
archive/2026-07-14-fix-web-vitest-crash/spec.md
archive/2026-07-14-fix-web-vitest-crash/design.md
archive/2026-07-14-fix-web-vitest-crash/tasks.md
archive/2026-07-14-fix-web-vitest-crash/explore.md
```

(29 archivos en total — ya contados arriba.)

## 8. Listo para propuesta

**Sí** — el orquestador debería proceder a `sdd-propose` para `fix-archive-mirrors`. La propuesta debería señalar:

- Alcance: 29 archivos creados, 0 eliminados, 0 ediciones de código fuente.
- Restricción: sin codepoints CJK; escrito en español neutro/profesional.
- Verificación: ver §6 arriba.
- Exclusiones: las 3 carpetas `-mirror/` extraviadas (cambio de limpieza separado) y los 3 cambios activos (manejados por sus propios movimientos de archivo cuando terminen).