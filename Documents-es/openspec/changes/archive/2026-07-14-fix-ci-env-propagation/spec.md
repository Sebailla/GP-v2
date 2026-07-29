# Especificación Delta — `fix-ci-env-propagation`

> **Cambio**: `fix-ci-env-propagation` · **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` → tracker `feat/fix-ci-env-propagation`
> **Modo**: auto · **Almacén de artefactos**: hybrid (Engram + OpenSpec) · **Entrega**: PR único (NO auto-chain)
> **Fecha**: 2026-07-14 (enmendada 2026-07-14 por `slice-9-housekeeping` — ver R3, Q3, AC8 abajo)
> **Forma del fix**: **A** — declaración `env` en `turbo.json`. 2 arreglos `env` (~14 LOC, 7 vars × 2 tareas) + breadcrumb de 2 líneas en el cuerpo del PR (NO dentro de `turbo.json`).
> **PR único**: 1 archivo en alcance, 14 LOC netas
> **Propuesta**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
> **Brief de exploración**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`)

---

## 1. Encabezado

| Campo | Valor |
|-------|-------|
| Proyecto | `gastos-personales-reference` |
| Clave del proyecto | `gp-v2` |
| Rama | `feat/fix-ci-env-propagation` (cortada desde `develop`) |
| Fecha | 2026-07-14 (amend: 2026-07-14) |
| Autor | Orquestador SDD → `sdd-spec` (ejecutor · modelo `MiniMax-M3`) |
| Estado | merged · fase de archivo (enmendado en `slice-9-housekeeping`) |
| Fuente | Propuesta Engram `#2343`; Exploración Engram `#2340` |
| Forma del fix | A (según propuesta §0 + §3) |
| Almacén de artefactos | hybrid (Engram + OpenSpec) |
| Estrategia de entrega | PR único — `auto-chain` NO disparado (14 LOC netas < presupuesto de revisión de 400 líneas) |
| TDD estricto | activo (AGENTS.md §4) — fix solo de configuración; no se requiere test RED (no se toca código de producción; los Tests 1–5 del brief de exploración SON la evidencia empírica RED→GREEN según explore §4) |

---

## 2. Intención

El trabajo del gate BDD de CI en `develop` estaba roto: el job `BDD (Cucumber)` fallaba con errores Zod durante la recolección de `page-data` de `web#build` porque Turbo's strict-mode descarta variables de entorno no declaradas en `turbo.json#tasks.bdd.env`, y `@core/config` valida esas variables en module-load. El fix declara los 7 env vars que `.github/workflows/ci.yml` exporta en el job BDD dentro de los arreglos `env` de las tareas `build` y `bdd` de `turbo.json` (no `passThroughEnv` — debe participar en la clave de caché). El breadcrumb de 2 líneas que documenta la rationale vive en el cuerpo del PR / mensaje de commit squash, NO dentro de `turbo.json` (RFC 8259 §2 — JSON no admite comentarios; AC10 exige `cat turbo.json | python3 -m json.tool` exit 0).

---

## 3. Metas

- **G1** — El job `BDD (Cucumber)` de CI pasa por primera vez desde el PR #61.
- **G2** — Los 4 jobs de CI quedan verdes (Static analysis, Build, Unit + integration, BDD).
- **G3** — Los 43 escenarios BDD siguen pasando local y en CI.
- **G4** — El comportamiento local de dev no cambia.
- **G5** — La invalidación de caché funciona cuando cambian las env vars.
- **G6** — El diff toca solo `turbo.json`.

---

## 4. No-metas

- Sin lógica de producción. Sin nuevas dependencias. Sin cambios en `apps/api/**` o `apps/web/**` source. Sin tests BDD nuevos. Sin escenarios de e2e nuevos. Sin merges forzados.

---

## 5. Requisitos funcionales

### R1 — La tarea `bdd` de `turbo.json` declara un arreglo `env` con 7 vars

La tarea `bdd` (actualmente en líneas 25-28 de `turbo.json` en `develop@pre-fix`) DEBE declarar un campo `env` cuyo valor es un arreglo JSON que contiene, en este orden exacto: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`. El arreglo DEBE ser idéntico posición por posición al bloque de env del job BDD en `.github/workflows/ci.yml:214-221` (la fuente de verdad del contrato).

### R2 — La tarea `build` de `turbo.json` declara el mismo arreglo `env`

La tarea `build` (actualmente en líneas 5-8) DEBE declarar un campo `env` con el mismo arreglo de 7 entradas en el mismo orden que R1. Rationale: `pnpm turbo run bdd` dispara `web#build` transitivamente vía `bdd.dependsOn: ["build"]`, y Turbo forwardea las env vars declaradas a través de la cadena; tareas no declaradas en cualquier punto (build OR bdd) bloquearían la propagación.

### R3 — El campo `env` es `env`, NO `passThroughEnv`; el breadcrumb vive en el cuerpo del PR, no en `turbo.json`  *(ENMENDADO 2026-07-14 por `slice-9-housekeeping`)*

El nuevo campo agregado por R1 y R2 DEBE ser la clave JSON `"env"`. NO DEBE ser `"passThroughEnv"`, `"globalEnv"`, o `"globalPassThroughEnv"`. La descripción del PR en el commit mergeado DEBE incluir un breadcrumb de 2 líneas explicando (a) **por qué** existe el arreglo (Turbo strict-mode descarta env vars no declaradas) y (b) **cuál es el contrato** (debe estar en sincronía con el bloque de env del job BDD en `.github/workflows/ci.yml`). El mismo breadcrumb DEBE aplicar tanto para el campo `env` de la tarea `build` como para el de la tarea `bdd` — un párrafo en el cuerpo del PR cubre ambos.

El breadcrumb NO DEBE estar embebido dentro de `turbo.json`. JSON no admite comentarios (RFC 8259 §2 — "no additional syntax is allowed"), y colocar tokens `//` dentro del archivo (a) rompería la invariante de JSON estricto de AC10 (`cat turbo.json | python3 -m json.tool` exit 0) y (b) rompería cualquier herramienta futura que parsee el archivo con un parser JSON estricto (p. ej., `node -e "JSON.parse(require('fs').readFileSync('turbo.json'))"`). La convención del repositorio para documentos que no pueden llevar comentarios inline es poner el breadcrumb en el artefacto que vive con ellos — para un PR cerrado cuyo `turbo.json` ya está mergeado, ese artefacto es el cuerpo del PR / mensaje del commit squash, no el contenido del archivo.

La distinción `env` vs `passThroughEnv` es: `env` participa en la clave de caché (los valores invalidan la caché), `passThroughEnv` NO participa (los valores llegan al entorno del proceso pero builds obsoletos podrían servirse). Dado que la validación de `@core/config` corre en module-load y los outputs de build (bundles de `page-data` de Next.js) embeben valores derivados de env, los cambios de env DEBEN invalidar la caché — `env` es el único nombre correcto.

> **Reemplazado por** la decisión de la fase de apply documentada en el mensaje del commit squash de PR #65. El texto original de R3 mandaba un breadcrumb JSDoc-style de dos líneas `//` dentro de `turbo.json` (contenido: una línea mencionando "turbo strict-mode" y una línea de seguimiento mencionando "ci.yml" / ".github/workflows"). El R3 original era INTERNAMENTE CONTRADICTORIO con AC10 (`cat turbo.json | python3 -m json.tool` exit 0 — el archivo DEBE ser parseable como JSON estricto, lo cual los comentarios `//` invalidan). La fase de apply honró correctamente AC10 (archivo JSON estricto con 7 claves `env` válidas) y omitió el breadcrumb `//`, llevando la rationale al cuerpo del PR. El breadcrumb ahora se manda en §5 R3 (arriba) como párrafo del cuerpo del PR. El texto histórico de R3 se preserva aquí en prosa para trazabilidad; futuros autores de spec que lean este archive NO DEBEN copiar el patrón `//`-en-JSON. El mismo defecto fue identificado en `fix-bdd-ci-zod-resolution` (no enmendado en este PR; diferido a un cambio futuro de housekeeping según `slice-9-housekeeping/explore.md` §2).
>
> Intención original de R3, preservada en forma prosa (las dos líneas `//` que mandaba el R3 original se resumen arriba para honrar la invariante de JSON estricto — ver Q3 enmendado para la rationale completa):
>
> > R3 (original) — El campo `env` es `env`, NO `passThroughEnv`; el spec original mandaba un breadcrumb JSDoc-style de exactamente 2 líneas inmediatamente arriba del nuevo campo `env` de la tarea `bdd`, con contenido resumiendo por qué existe el arreglo `env` (Turbo strict-mode descarta env vars no declaradas) y cuál es su contrato de sincronización (debe estar en sincronía con el bloque de env del job BDD en `.github/workflows/ci.yml`). El mismo contenido debía aplicar al campo `env` de la tarea `build`. El defecto fue que el formato de breadcrumb prescrito (líneas `//` consecutivas dentro del archivo JSON) es incompatible con JSON estricto según RFC 8259 §2 y con la propia invariante de JSON estricto de AC10 en este spec — la fase de apply preservó la rationale pero reubicó el breadcrumb al cuerpo del PR.

### R4 — Diff mínimo: ninguna otra línea de `turbo.json` se toca

El fix DEBE editar SOLO los 2 bloques de arreglo `env` requeridos por R1 y R2. Ninguna otra clave, valor, orden o whitespace en `turbo.json` PUEDE cambiar.

### R5 — `pnpm turbo run bdd` exit 0 en CI con el job `BDD (Cucumber)` reportando `success`

`pnpm turbo run bdd` DEBE exit 0 cuando se corre en Node 22.13.0 + pnpm 11.10.0 en el entorno CI (Postgres 16-alpine, timeout 30 min) en `feat/fix-ci-env-propagation`. El job `BDD (Cucumber)` de GitHub Actions DEBE reportar `success` en el nuevo PR. El log del job DEBE contener `43 scenarios (43 passed)`.

### R6 — Los 43 escenarios BDD siguen pasando local Y en CI

Los **43** escenarios BDD DEBEN pasar después del fix: 18 escenarios auth + 25 escenarios transactions. Cero escenarios deben skipearse, marcarse `pending`, marcarse `todo`, eliminarse, o cortocircuitarse de otro modo por el fix.

### R7 — Los 4 jobs de CI reportan `success`

Los 4 jobs de GitHub Actions DEBEN reportar `success` en `feat/fix-ci-env-propagation`: Static analysis, Build, Unit + integration, BDD (Cucumber).

### R8 — Ningún archivo `.ts` source se modifica

El fix NO DEBE tocar `apps/api/**`, `apps/web/**`, `libs/**`, ni ningún archivo `.ts` / `.tsx` source. La cobertura de tests no cambia.

### R9 — Ninguna dependencia nueva se agrega

El fix NO DEBE agregar dependencias a `package.json`, `pnpm-lock.yaml`, ni a ningún manifest de workspace.

### R10 — La invalidación de caché funciona cuando cambian las env vars

Después de `pnpm turbo run build` con `DATABASE_URL=<A>`, re-correr con `DATABASE_URL=<B>` (sin `--force`) DEBE ser un cache miss para `web#build` y `api#build`; ambos re-ejecutan. Esto valida que el campo `env` (no `passThroughEnv`) participa correctamente en la clave de caché.

### R11 — La descripción del PR destaca la historia de bypass de BDD en 4 PRs y explica por qué este es el fix estructural

El cuerpo del PR DEBE documentar que PR #61 mergeó la config del job BDD rica en env, y que 4 PRs subsiguientes (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) se admin-mergearon con el gate BDD bypaseado por este bug latente. El PR actual cierra el gate subyacente permanentemente.

### R12 — La descripción del PR contrasta `env` vs `passThroughEnv` para futuros mantenedores

El cuerpo del PR DEBE explicar por qué `env` (no `passThroughEnv`) es el campo correcto: `env` participa en la clave de caché, así que cambiar cualquier var (p. ej., `API_URL` de staging a prod) invalida la caché de `web#build` y `bdd`; `passThroughEnv` expone valores sin hashearlos, y un `.next/` obsoleto producido bajo `API_URL=staging` se serviría alegremente bajo `API_URL=production`.

---

## 6. Escenarios

(7 escenarios Gherkin ejecutables; ver spec EN §6 para los bloques Given/When/Then completos.)

---

## 7. Tabla de criterios de aceptación (AC) — enfocada en AC8 (enmendado)

| # | Criterio | Condición de pasa |
|---|----------|-------------------|
| AC1 | `build.env` contiene las 7 vars | `jq '.tasks.build.env' turbo.json` retorna arreglo de 7 elementos |
| AC2 | `bdd.env` contiene las 7 vars | `jq '.tasks.bdd.env' turbo.json` retorna el mismo arreglo de 7 elementos |
| AC3 | Mismo orden en ambos arreglos | los 2 arreglos retornados por AC1 y AC2 son idénticos posición por posición |
| AC4 | Orden coincide con el bloque env del job CI | cada arreglo coincide con las claves en `.github/workflows/ci.yml:214-221` |
| AC5 | El nuevo campo es `env` | ambos campos nuevos son `env`; `passThroughEnv` no aparece |
| AC6 | Sin `passThroughEnv` en `turbo.json` | `grep -c '"passThroughEnv"' turbo.json` retorna 0 |
| AC7 | Sin `globalEnv` / `globalPassThroughEnv` en root | `jq 'has("globalEnv") or has("globalPassThroughEnv")' turbo.json` retorna `false` |
| **AC8** | **La descripción del PR lleva el breadcrumb de 2 líneas** *(ENMENDADO 2026-07-14)* | la descripción del PR mergeado (o mensaje de commit squash) contiene 2 líneas consecutivas mencionando "turbo strict-mode" (o equivalente) y "ci.yml" (o equivalente), explicando la rationale de los arreglos `bdd.env` y `build.env`. El breadcrumb NO se requiere dentro de `turbo.json` (JSON no admite comentarios según RFC 8259 §2). |
| AC9 | Solo `turbo.json` modificado | `git diff develop --name-only` lista exactamente `turbo.json` |
| AC10 | `turbo.json` post-fix es JSON estructuralmente válido | `jq . turbo.json` exit 0; `cat turbo.json | python3 -m json.tool` exit 0 |
| AC11 | `turbo.json` cumple el schema | `pnpm exec turbo --root=. run --dry=json bdd` exit 0 con task graph válido |
| AC12 | Ningún archivo `.ts` / `.tsx` source modificado | `git diff develop --name-only -- '*.ts' '*.tsx'` retorna vacío |
| AC13 | Ningún `package.json` modificado | `git diff develop --name-only -- 'package.json' ...` retorna vacío |
| AC14 | Ningún `pnpm-lock.yaml` modificado | `git diff develop --stat -- pnpm-lock.yaml` retorna sin cambios |
| AC15 | Ningún `.github/workflows/ci.yml` modificado | `git diff develop --name-only -- .github/workflows/ci.yml` retorna vacío |
| AC16 | Ningún `.env*` modificado | `git diff develop --name-only -- '*.env' '*.env.*'` retorna vacío |
| AC17 | Ningún archivo de ESLint / boundary-plugin modificado | `git diff develop --name-only -- 'tools/eslint-plugin-boundary/**' 'eslint.config.*'` retorna vacío |
| AC18 | `pnpm turbo run bdd` exit 0 localmente con env de CI | exit 0; imprime `43 scenarios (43 passed)` |
| AC19 | Auth BDD exit 0 | `pnpm --filter @features/auth bdd` exit 0; 18/18 |
| AC20 | Transactions BDD exit 0 | `pnpm --filter @features/transactions bdd` exit 0; 25/25 |
| AC21 | 0 escenarios BDD skip/pending/todo | log BDD muestra 43 ejecutados, 0 skip, 0 pending, 0 todo |
| AC22 | `web#build` y `api#build` pasan en el mismo grafo | log de `pnpm turbo run bdd --force` incluye ambos con `> SUCCESS` |
| AC23 | Invalidación de caché en cambio de env | tras `pnpm turbo run build` con `DATABASE_URL=<A>`, re-correr con `DATABASE_URL=<B>` es cache miss |

---

## 11. Preguntas abiertas — resueltas

### Q3 — Ubicación del breadcrumb (en `turbo.json` vs en el cuerpo del PR)  *(ENMENDADO 2026-07-14)*

**Resuelto**: **CUERPO DEL PR** — R3 (según enmendado) manda un breadcrumb de 2 líneas en la descripción del PR / mensaje de commit squash, NO dentro de `turbo.json`.

Rationale: la decisión original "en `turbo.json` como líneas `//`" era INTERNAMENTE CONTRADICTORIA con la propia AC10 de este spec (`cat turbo.json | python3 -m json.tool` exit 0 — invariante de JSON estricto). La fase de apply honró correctamente AC10 sobre R3 y llevó la rationale al cuerpo del commit squash de PR #65. Futuros autores de spec deben ser conscientes de que JSON no admite comentarios (RFC 8259 §2); un breadcrumb dentro de un archivo JSON rompe cualquier parser JSON estricto (Python `json.tool`, `JSON.parse`, jq con configuración por defecto, etc.). Para documentos que no pueden llevar comentarios inline, el breadcrumb pertenece al artefacto que vive con ellos — típicamente el mensaje de commit squash / cuerpo del PR para un PR cerrado cuyo `.json` ya está mergeado, o un archivo `.md` hermano para un spec abierto. El breadcrumb debe (a) nombrar la causa raíz ("Turbo strict-mode descarta env vars no declaradas") para que futuros contribuidores no se pregunten por qué se agregó un arreglo `env` si no han leído el brief de exploración, y (b) nombrar la fuente del contrato (bloque de env del job BDD en `.github/workflows/ci.yml`) para que el próximo contribuidor que agregue una env var a CI sea impulsado a mirrorarla en `turbo.json`. Dos líneas es el contenido mínimo suficiente; prosa más larga infla el diff sin agregar valor de review. El mismo patrón de defecto fue identificado en el archive predecesor `fix-bdd-ci-zod-resolution` y está flagged como housekeeping futuro según `slice-9-housekeeping/explore.md` §2 (fuera de alcance para slice-9).

---

## Cross-references

- **Propuesta**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
- **Brief de exploración**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`)
- **Spec EN (fuente de verdad)**: `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` (Enmendado por `slice-9-housekeeping`, Engram `#2410` design + Engram `#2409` spec)
- **Replica-de-huella del defecto original**: el R3 original de este spec queda preservado en prosa bajo el blockquote «Reemplazado por» arriba. El mismo defecto fue identificado en `fix-bdd-ci-zod-resolution` (no enmendado en este PR; diferido a un cambio futuro de housekeeping según `slice-9-housekeeping/explore.md` §2).
- **Convenciones de proyecto**: AGENTS.md §2 (branch — develop → tracker `feat/fix-ci-env-propagation`), §3 (quality gates), §4 (strict TDD — config-only fix), §5 (atomic commits), §6 (Conventional Commits), §13 (mirror español — el spec archivado ahora tiene mirror ES en `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` creado por `slice-9-housekeeping`).
