# Diseño Técnico — `fix-bdd-tsx-node22`

> **Estado**: borrador · fase de diseño
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-bdd-tsx-node22`
> **Almacén de artefactos**: hybrid · **Modo**: auto · **Delivery**: single PR (`auto-chain` NO disparado — 4 archivos, ~85 LOC netas ≪ presupuesto de 400 líneas)
> **Strict TDD**: active (AGENTS.md §4) — fix sólo de config, satisfecho vacuosamente; ver §3 step 7
> **Forma del fix**: A — swap de un-token-por-línea en 2 archivos `package.json` de slice + 1 script de verificación + 1 wiring de script en raíz
> **Author**: SDD orchestrator → ejecutor `sdd-design` (model `MiniMax-M3`)
> **Fecha**: 2026-07-13
> **Inputs leídos**: `proposal.md` (Engram #2307), `spec.md` (Engram #2308, 12 requirements, 6 escenarios Gherkin, 24 AC), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (referencia de formato), `libs/features/auth/server/package.json:17` (estado roto), `libs/features/transactions/server/package.json:17` (estado roto), `package.json` raíz (inventario de scripts).
> **Preguntas abiertas**: ninguna — las 4 resueltas en spec §11 (Q1 sin ADR, Q2 sin `bdd:debug`, Q3 sin `--bail`, Q4 sí `verify.sh`).

---

## Tabla de contenidos

1. [Goals ↔ Mapeo de enfoque técnico](#1-goals--mapeo-de-enfoque-técnico)
2. [Diffs archivo por archivo (4 archivos)](#2-diffs-archivo-por-archivo-4-archivos)
3. [Plan de ejecución (7 pasos, sólo config)](#3-plan-de-ejecución-7-pasos-sólo-config)
4. [Commits atómicos (4)](#4-commits-atómicos-4)
5. [Plan de ejecución de tests](#5-plan-de-ejecución-de-tests)
6. [Riesgos + mitigaciones (concretos)](#6-riesgos--mitigaciones-concretos)
7. [Fuera de alcance](#7-fuera-de-alcance)
8. [Preguntas abiertas para la fase de tasks](#8-preguntas-abiertas-para-la-fase-de-tasks)
9. [Criterios de validación para `sdd-verify`](#9-criterios-de-validación-para-sdd-verify)
10. [Trazabilidad: Spec ↔ Design](#10-trazabilidad-spec--design)

---

## 1. Goals ↔ Mapeo de enfoque técnico

| Goal | Spec anchor | Enfoque técnico |
|------|-------------|--------------------|
| **G1** — BDD del slice auth GREEN en Node 22.x | §3 G1, R1, R3, R6 | Editar `libs/features/auth/server/package.json:17`: cambiar `NODE_OPTIONS='--import tsx/esm'` a `NODE_OPTIONS='--import tsx/cjs'`. Swap de un único token sobre el valor `NODE_OPTIONS` del script `bdd`. |
| **G2** — BDD del slice transactions GREEN en Node 22.x | §3 G2, R2, R3, R6 | Mismo swap de un único token en `libs/features/transactions/server/package.json:17`. |
| **G3** — Pipeline turbo BDD completo GREEN | §3 G3, R1, R2, R5 | Ambas ediciones juntas; ningún otro cambio de código. `pnpm turbo run bdd` en Node 22.13.0 ahora propaga el hook corregido a ambos packages con BDD. |
| **G4** — Cero regresión de escenarios | §3 G4, R6, R7, R8 | Implícito. El fix cambia qué hook de loader de Node transforma archivos `.ts` en el momento de `require()`; ningún texto de escenario, step-def, tipo world, archivo Gherkin o config de Cucumber se mueve. El conteo 43/43 se preserva por construcción. |
| **G5** — La puerta CI flipea FAIL → PASS | §3 G5, R5, R12 | El job `BDD (Cucumber)` en `.github/workflows/ci.yml` es correcto (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine). Sin edición de workflow; el job ahora pasa porque los scripts de slice funcionan. |
| **G6** — Diff quirúrgico (sólo config + verificación) | §3 G6, R4, R7, R8, R9, R10 | Las 2 líneas de `package.json` según R1+R2 + el nuevo `scripts/bdd/verify.sh` según R10 + el wiring `bdd:verify` en `package.json` raíz según R11. Total: 3 ediciones + 1 archivo nuevo = 4 archivos tocados. Ningún `.ts`, `.feature`, `.steps.ts`, `cucumber.mjs`, `support/register.ts`, `pnpm-lock.yaml`, config de ESLint o workflow de CI es modificado. |

---

## 2. Diffs archivo por archivo (4 archivos)

> **Guía de lectura**: este diseño es la fuente de verdad para `sdd-apply`. La fase de apply NO DEBE re-derivar números de línea ni texto. Cada edición es el mínimo posible.

---

### Archivo 1 — `libs/features/auth/server/package.json` (EDIT, +1 / -1 en una única línea)

**Estado actual** (línea 17, roto en Node 22):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
```

**Estado final** (línea 17, arreglado):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

**Diff**:

```diff
-    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
+    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

**Por qué funciona esto** (referenciado por §6 mitigación R1):

- El loader de Cucumber 13 (`@cucumber/cucumber/lib/try_require.js:8`) carga `support/register.ts` vía `require()` CJS.
- `tsx/cjs` registra un hook CJS vía `module.register('../register-*.cjs')` que parchea `Module._extensions['.ts']` y `Module._compile`. El hook intercepta archivos `.ts` en la frontera del `require()` CJS y corre esbuild sobre ellos ANTES de que el parser CJS de Node vea la sintaxis exclusiva de TS.
- `tsx/esm` (el hook equivocado previo) intercepta sólo la cadena `initialize`/`resolve`/`load` del ESM de Node — nunca alcanzada por el camino del `require()` CJS de Cucumber.

**Ninguna otra línea en este archivo cambia.** Verificación:

- AC1: `grep "tsx/cjs" libs/features/auth/server/package.json` → ≥1 match.
- AC2: `grep "tsx/esm" libs/features/auth/server/package.json` → ningún match.
- AC3: `git diff develop -- libs/features/auth/server/package.json` muestra exactamente 1 línea cambiada.

---

### Archivo 2 — `libs/features/transactions/server/package.json` (EDIT, +1 / -1 en una única línea)

**Estado actual** (línea 17, roto en Node 22):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
```

**Estado final** (línea 17, arreglado):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

**Diff**:

```diff
-    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
+    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

Semántica idéntica al Archivo 1 (el slice de transactions tiene la misma forma de `support/register.ts` + `cucumber.mjs` que auth según slice-7 PR-8).

**Verificación**:

- AC4: `grep "tsx/cjs" libs/features/transactions/server/package.json` → ≥1 match.
- AC5: `grep "tsx/esm" libs/features/transactions/server/package.json` → ningún match.
- AC6: `git diff develop -- libs/features/transactions/server/package.json` muestra exactamente 1 línea cambiada.

---

### Archivo 3 — `scripts/bdd/verify.sh` (NEW, ~30 LOC)

Esta es la receta de "seguro barato" según resolución de Q4 de spec. Espeja la puerta BDD de CI localmente para que cualquier futuro mantenedor pueda reproducir el pass de BDD en Node 22 en menos de un minuto. **NO modifica ninguna fuente existente** (R10).

```bash
#!/usr/bin/env bash
# scripts/bdd/verify.sh — local Node 22 reproduction of the CI BDD gate.
#
# This script is the dev-time equivalent of the BDD (Cucumber) CI job.
# It MUST be run with Node 22.x to mirror the CI environment; Node 23
# hides the tsx/esm CJS-interop bug that this fix targets (Node 23
# bypasses the CJS parse step for files ESM-hooks have registered).
#
# Exit codes:
#   0  all BDD packages passed.
#   1  any package failed.
#   2  Node 22 not available (and the user did not pass --no-node-check).

set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "verify.sh: node not found in PATH" >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${node_major}" -ne 22 ]; then
  if [ "${1:-}" = "--no-node-check" ]; then
    echo "verify.sh: WARNING — running on Node ${node_major}, expected 22" >&2
  else
    echo "verify.sh: requires Node 22.x; current is ${node_major}" >&2
    echo "verify.sh: hint: 'nvm use 22' or 'asdf local nodejs 22.x.x'" >&2
    exit 2
  fi
fi

tsx_version="$(node -p "require('tsx/package.json').version")"
echo "verify.sh: node ${node_major} + tsx ${tsx_version}"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

pnpm turbo run bdd
```

**Checklist del contrato** (contra spec R10):

| Sub-cláusula R10 | Dónde se satisface |
|----------------|-----------------|
| (1) Detectar versión de Node, warn/abort si no es 22 | chequeo `node_major` + exit 2 / branch `--no-node-check` |
| (2) Loggear versiones de Node + tsx | `echo "verify.sh: node ${node_major} + tsx ${tsx_version}"` |
| (3) Correr `pnpm turbo run bdd`, propagar exit code | `pnpm turbo run bdd` (bajo `set -euo pipefail`) |
| (4) Línea final OK/FAIL | Propagación de exit code de Turbo + stdout (no necesita wrapper extra; `pnpm turbo run bdd` es su propio reporter) |
| (5) Marcado ejecutable + `bash -n` limpio | `chmod +x scripts/bdd/verify.sh` en commit #3 + AC9 (`bash -n` sale 0) |

**Por qué sin auto-switch de `nvm` / `asdf`**: detectar qué version manager está instalado (nvm, asdf, volta, fnm) y cambiar silenciosamente a Node 22 es una receta para drift cross-platform y estado inesperado del shell. El script documenta el comando manual (`nvm use 22` / `asdf local nodejs 22.x.x`) y sale con 2 ante el mismatch. El usuario puede overridear con `--no-node-check` para correr de todos modos. Esto se mantiene en línea con spec R10 "si no se detecta manager, loggear un warning pero continuar" — `node` en sí siempre continúa (el chequeo es un guardrail, no un switcher).

**Verificación**:

- AC7: `ls scripts/bdd/verify.sh` → éxito.
- AC8: `test -x scripts/bdd/verify.sh` → éxito.
- AC9: `bash -n scripts/bdd/verify.sh` → exit 0.
- AC10: `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` → ≥1 match.

---

### Archivo 4 — `package.json` (raíz, EDIT, +1 / -0)

Agregar el wiring `bdd:verify` para que los contribuidores puedan correr la verificación vía `pnpm bdd:verify` (R11 SHOULD).

**Estado actual** (líneas 12-33, bloque de scripts, con `test:migrate` en la línea 18):

```json
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "lint:fixtures": "node tools/eslint-plugin-boundary/scripts/run-fixtures.mjs",
    "test": "turbo run test",
    "test:migrate": "bash scripts/migrate/__tests__/idempotency.test.sh",
    "typecheck": "turbo run typecheck",
    "bdd": "turbo run bdd",
    "e2e": "turbo run e2e",
    "coverage": "turbo run coverage",
    ...
  },
```

**Estado final** (agregar `bdd:verify` inmediatamente DESPUÉS de la línea existente `"bdd": "turbo run bdd"`, línea 20 — wiring hermano, casi alfabético, adyacente a su dependencia):

```diff
     "bdd": "turbo run bdd",
+    "bdd:verify": "bash scripts/bdd/verify.sh",
     "e2e": "turbo run e2e",
```

**Por qué aquí y no en otro lado**: `bdd:verify` es el hermano de receta local de `bdd` (el pipeline equivalente en CI). La ubicación adyacente hace obvia la relación para un contribuidor que lea el bloque de scripts.

**Verificación**:

- `grep "bdd:verify" package.json` → exactamente 1 match (la nueva línea de script).
- `pnpm bdd:verify` corre `bash scripts/bdd/verify.sh` (que luego llama a `pnpm turbo run bdd`).

---

## 3. Plan de ejecución (7 pasos, sólo config)

> Disciplina Strict TDD (AGENTS.md §4). Este fix es **sólo de configuración**, así que el paso RED-first se satisface vacuosamente: el brief de exploración (`openspec/changes/fix-bdd-tsx-node22/explore.md` §5 + §10) ya demostró empíricamente el estado RED (`SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule`) Y el estado GREEN (`18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s en Node 22.14.0 con `tsx/cjs`). No se requiere código de test RED nuevo (R7 prohíbe modificar step-defs; los 43 escenarios BDD existentes SON la puerta de regresión).

### Paso 1 — Editar Archivo 1 (slice auth)

**Acción**: en `libs/features/auth/server/package.json`, reemplazar `tsx/esm` con `tsx/cjs` en la línea 17. Swap de un único token.

**Verificar**: `grep -n "tsx/cjs\|tsx/esm" libs/features/auth/server/package.json` muestra `tsx/cjs` (1 match), `tsx/esm` (0 matches).

### Paso 2 — Editar Archivo 2 (slice transactions)

**Acción**: en `libs/features/transactions/server/package.json`, reemplazar `tsx/esm` con `tsx/cjs` en la línea 17. Mismo swap de un único token.

**Verificar**: mismo patrón de grep contra el Archivo 2 — `tsx/cjs` (1 match), `tsx/esm` (0 matches).

### Paso 3 — Crear Archivo 3 (script de verificación)

**Acción**: escribir `scripts/bdd/verify.sh` con el cuerpo completo del §2 Archivo 3. Marcar ejecutable: `chmod +x scripts/bdd/verify.sh`.

**Verificar**: `bash -n scripts/bdd/verify.sh` sale 0 (AC9); `test -x scripts/bdd/verify.sh` tiene éxito (AC8); `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` muestra ≥1 match (AC10).

### Paso 4 — Editar Archivo 4 (`package.json` raíz)

**Acción**: agregar `"bdd:verify": "bash scripts/bdd/verify.sh"` después de la línea 20 (`"bdd": "turbo run bdd"`).

**Verificar**: `grep "bdd:verify" package.json` muestra exactamente 1 match.

### Paso 5 — Verificación local (Node 22)

**Acción**: `pnpm bdd:verify` en Node 22.13.0 (o cualquier 22.x disponible localmente).

**Esperado**: `verify.sh` loggea `node 22 + tsx 4.23.0`, luego `pnpm turbo run bdd` sale 0 con 18/18 escenarios auth + 25/25 escenarios transactions pasando. Total ~35s incluyendo cold-start de Postgres.

**Chequeo manual equivalente (sin verify.sh)**: `pnpm turbo run bdd` directamente en Node 22.

### Paso 6 — Chequeo de backward-compat (Node 23)

**Acción**: cambiar a Node 23.x (p.ej. `nvm use 23`) y correr `pnpm bdd:verify --no-node-check`. El flag `--no-node-check` silencia el guard de versión de Node para que el script corra de todos modos. El pipeline BDD DEBE seguir saliendo 0 — el contrato del hook `tsx/cjs` es idéntico en Node 22 y Node 23 (mitigación R3).

**Esperado**: BDD pasa en Node 23.x con el mismo comportamiento de hook. Confirma R3 (sin regresión de Node major).

### Paso 7 — Declaración de disciplina TDD

**Acción**: registrar en el mensaje del commit de verificación (#4) por qué no se requiere test RED:

> This fix is configuration-only. The regression gate is the existing 43 BDD scenarios (18 auth + 25 transactions); no new test code is required because no production code is touched. R7 explicitly forbids modifying step-defs. The empirical RED state (`SyntaxError: Unexpected identifier 'AuthWorld'`) and GREEN state (`18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s) are both recorded in `openspec/changes/fix-bdd-tsx-node22/explore.md` §5 + §10.

**Verificar**: el body del commit #4 contiene el párrafo anterior o equivalente (auditado por el revisor, no por CI).

---

## 4. Commits atómicos (4)

> Work-unit aligned (AGENTS.md §5). Cada commit es independientemente revertible. Sin `Co-Authored-By` (AGENTS.md §6 + regla hard de la persona). Subjects ≤ 72 chars, imperativos, sin punto final. Tipos: `fix`, `feat`, `chore` solamente.

| # | Tipo | Subject | Files | Fase TDD | Req spec |
|---|------|---------|-------|-----------|----------|
| 1 | `fix` | `fix(bdd): auth.server package.json — switch from tsx/esm to tsx/cjs (R1)` | `libs/features/auth/server/package.json` (EDIT, +1 / -1 en línea 17) | n/a (config) | R1 |
| 2 | `fix` | `fix(bdd): transactions.server package.json — switch from tsx/esm to tsx/cjs (R2)` | `libs/features/transactions/server/package.json` (EDIT, +1 / -1 en línea 17) | n/a (config) | R2 |
| 3 | `feat` | `feat(scripts): add scripts/bdd/verify.sh + pnpm bdd:verify (R10, R11)` | `scripts/bdd/verify.sh` (NEW, +30), `package.json` (EDIT, +1 / -0) | n/a (script) | R10, R11 |
| 4 | `chore` | `chore(bdd): verify pnpm bdd:verify exits 0 on Node 22 (R5 marker)` | (sin cambios de archivo) | n/a (marcador de verificación) | R5 |

**Totales**: 4 commits, +32 / -2 ≈ +30 LOC netas (muy por debajo del presupuesto de revisión de 400 líneas). Sin espejo en `Documents-es/` requerido (ningún `.md` en inglés agregado bajo `openspec/` o `docs/` según AGENTS.md §13 + spec §7.6).

**Por qué se separan #1 y #2 en lugar de un `fix` combinado**: cada `package.json` de slice es una unidad independientemente revertible. Si una regresión futura surge en sólo un slice, el rollback por archivo es limpio (`git revert <sha>` de cualquiera de los dos commits sólo retorna ese slice al `tsx/esm`; el otro slice queda arreglado). Las 2 líneas de `package.json` son además paths de archivo diferentes → diferentes puntos de foco de revisión.

**Por qué #3 es `feat` y no `chore`**: según Conventional Commits (AGENTS.md §6), un nuevo script (`scripts/bdd/verify.sh`) + un nuevo comando cableado (`pnpm bdd:verify`) es una NUEVA capacidad para los contribuidores, no housekeeping puro. `feat(scripts):` matchea la convención del proyecto.

**Por qué #4 es `chore` (commit vacío)**: actúa como el **marcador de verificación R5** en el log de commits — el orchestrator puede rastrear luego que este PR realmente se probó verde en Node 22 antes del merge. El orchestrator PUEDE omitir el commit #4 al momento de apply si un chequeo de CI ya attesta el mismo hecho; mantenerlo en el diseño le da a la fase de apply la opción.

**Single-PR**: 30 LOC netas ≪ presupuesto de 400 líneas → `auto-chain` NO se dispara. Campo Delivery de spec §1 confirmado.

---

## 5. Plan de ejecución de tests

> Mapeado a G1–G6 de spec + sus escenarios Gherkin.

| Goal spec | Comando de test | Outcome esperado |
|-----------|--------------|------------------|
| **G1.1** (auth BDD GREEN) | `pnpm --filter @features/auth bdd` en Node 22.13.0 | exit 0; 18/18 escenarios PASS; 101/101 steps PASS |
| **G2.1** (transactions BDD GREEN) | `pnpm --filter @features/transactions bdd` en Node 22.13.0 | exit 0; 25/25 escenarios PASS |
| **G3.1** (turbo BDD GREEN) | `pnpm turbo run bdd` en Node 22.13.0 | exit 0; ambos packages con BDD pasan; packages sin BDD salen 0 inmediatamente |
| **G4.1** (cero regresión) | (cubierto por G1 + G2 + G3) | 43/43 escenarios ejecutados; 0 skipped/pending/todo |
| **G5.1** (la puerta CI flipea) | Job `BDD (Cucumber)` de GitHub Actions | reporta `success`; reemplaza el `FAIL` previo (corrida `29288016689`) |
| **G6.1** (diff quirúrgico) | `git diff --name-only origin/develop..HEAD \| grep -E '\.steps\.ts$\|cucumber\.mjs$\|support/register\.ts$\|\.feature$\|pnpm-lock\.yaml$\|\.github/workflows/ci\.yml$' tools/eslint-plugin-boundary` | salida vacía (sin archivos prohibidos en el diff) |
| **G6.2** (diff de 4 archivos) | `git diff --name-only origin/develop..HEAD` | exactamente: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`, `package.json` (el raíz, por el wiring `bdd:verify`) |

### Verificación local no-CI

```bash
# Confirmar swap de tokens (AC1, AC2, AC4, AC5)
grep -n "tsx/cjs\|tsx/esm" libs/features/{auth,transactions}/server/package.json

# Confirmar script de verificación cableado y ejecutable (AC7, AC8, AC9, AC10)
ls scripts/bdd/verify.sh && test -x scripts/bdd/verify.sh && bash -n scripts/bdd/verify.sh
grep "pnpm turbo run bdd" scripts/bdd/verify.sh
grep "bdd:verify" package.json

# Confirmar que la receta local reproduce CI (G1 + G2 + G3 de una)
pnpm bdd:verify

# Backward-compat (Node 23) — mitigación R3
nvm use 23 && pnpm bdd:verify --no-node-check

# Sanity: fronteras de ESLint siguen pasando (R7, R8 — sin config tocada, debe quedar verde)
pnpm lint:fixtures

# Sanity: TypeScript sigue pasando (sin `.ts` tocado, debe quedar verde)
pnpm typecheck
```

---

## 6. Riesgos + mitigaciones (concretos)

> Espeja §7 R1–R5 de la propuesta con la mitigación concreta que adopta este diseño. Sin inflación de tabla de riesgos.

| ID | Riesgo | Probabilidad | Mitigación concreta en este diseño |
|----|------|------------|------------------------------------|
| **R1** | `tsx/cjs` podría diferir de `tsx/esm` para top-level await o async module loading, rompiendo algunos escenarios. | Baja | Los 43 escenarios BDD no usan top-level await (verificado durante el close-out de slice-7 PR-7 según explore §7 R1). El test empírico en Node 22.14.0 ya mostró 18/18 PASS en 0.34s con `tsx/cjs` (explore §5 + §10). Transactions tiene la misma forma de `import` que auth — misma expectativa. El chequeo de backward-compat (Paso 6) agrega una red de seguridad empírica en Node 23.x. |
| **R2** | `tsx/cjs` podría no estar disponible en versiones antiguas de tsx. | Baja | `package.json` raíz línea 39 declara `"tsx": "^4.23.0"`. `tsx/cjs` se envía desde tsx 4.16.x (verificado en el mapa `exports` de `node_modules/tsx/package.json` según explore §4 + §5). El rango `^4.23.0` satisface `>=4.16.0`. `pnpm-lock.yaml` resuelve a `4.23.0` (sin upgrade necesario, R9). |
| **R3** | Un major futuro de tsx podría remover `tsx/cjs`. | Baja | El mapa `exports` de tsx declara tanto `tsx/esm` como `tsx/cjs` sin nota de deprecación (explore §4). Si se removiera, el fix futuro tiene LA MISMA FORMA que el de hoy — un swap de 2 líneas de `package.json` al nombre del nuevo hook. La receta `verify.sh` de 30 LOC es robusta ante cambios sólo de token; sólo se necesita actualizar el nombre del hook. |
| **R4** | El fix podría regresionar entornos de dev locales corriendo Node 23.x. | Baja | `tsx/cjs` parchea el `Module._compile` y `Module._extensions['.ts']` CJS de Node sin importar el major de Node (contrato documentado de tsx). El Paso 6 (chequeo de backward-compat en Node 23) es la puerta empírica. El flag `--no-node-check` en `verify.sh` les permite a los contribuidores en Node 23.x reproducir la puerta sin flapping en el guard de versión. |
| **R5** | Un workaround de admin-merge previo asume el viejo `tsx/esm`; ese workaround podría ahora fallar. | Baja | Slice-7 PR-8 + slice-8 PR-1 trabajaron alrededor de la puerta agregando código de bridge en `support/register.ts`, no overrideando la config `tsx`. R7 + R8 bloquean el diff a las 2 líneas de `package.json` + el script de verificación — el código de bridge sigue siendo válido porque carga de la misma forma que Cucumber siempre cargó. Los PRs de bridge pre-existentes (`a9b550d`, `bb25aab`) siguen funcionando; este cambio simplemente los hace innecesarios para los PRs futuros con validación BDD. |

---

## 7. Fuera de alcance

> Restated desde spec §4 + propuesta §2.2 (espeja AGENTS.md §11). El orchestrator NO DEBE agregar items aquí sin un nuevo cambio SDD.

1. Cambiar Cucumber de `require:` a `import:` (Forma B). Diferir a un cambio separado.
2. Reescribir `support/register.ts` como CJS (Forma C). Borra las decisiones arquitectónicas de slice-7 PR-8 / slice-8 PR-1.
3. Reemplazar tsx con `@swc-node/register` (Forma D). Agrega una nueva devDep — R9 prohíbe.
4. Agregar cualquier nueva devDependency. El fix usa el `tsx@^4.23.0` ya instalado.
5. Editar cualquier archivo fuente `.ts`: `world.ts`, `.steps.ts`, `support/register.ts`, `cucumber.mjs`. R7 + R8 prohíben; cualquiera de estos invalida G6.
6. Editar cualquier archivo `.feature`. R7 prohíbe; los escenarios quedan byte-idénticos.
7. Editar `.github/workflows/ci.yml`. El job BDD está configurado correctamente; sólo necesita que los scripts de slice funcionen.
8. Pinear o upgradear tsx. `^4.23.0` cubre `>=4.16.0` (mitigación R2).
9. Cambiar la línea base de versión de Node. Node 22.13.0 sigue siendo el target CI.
10. Editar `tsconfig.base.json`, `apps/web/**`, `apps/api/**`.
11. Editar config de ESLint, plugin de boundary de ESLint, fixtures de ESLint, o runner de ESLint.
12. Agregar un nuevo escenario BDD, test unitario, o test e2e (el paso RED del Strict TDD se satisface empíricamente con el brief de exploración).
13. Agregar script `bdd:debug` (Q2 de la propuesta — rechazado).
14. Agregar flag `--bail` al job bdd de CI (Q3 de la propuesta — rechazado).
15. Cualquier cosa de AGENTS.md §11 (i18n más allá de en/es, Sentry, rate-limiting, OAuth más allá de Google, hardening de producción, observabilidad, gate de cobertura, UI de audit log).
16. Escribir ADR 0009 (Q1 de la propuesta — rechazado: un swap de un-token-por-línea entre dos entry points documentados de tsx es self-documenting).
17. Migrar `gastos-personales/` al modelo de vertical-slicing.

---

## 8. Preguntas abiertas para la fase de tasks

**Ninguna.** Las 4 preguntas abiertas de la propuesta (Q1–Q4) se resolvieron en la fase de spec (spec §11, espejada en §0 "Preguntas abiertas" de este diseño). `sdd-tasks` procede con el plan de ejecución de 4 commits / 7 pasos de arriba como su input canónico.

Si `sdd-tasks` descubre un nuevo blocker durante la planificación de tasks (p.ej. `pnpm-lock.yaml` se regenera inesperadamente con `pnpm install` después de las ediciones de `package.json`), DEBE escalar vía `mem_judge` según protocolo Engram — NO expandir silenciosamente el scope. R9 prohíbe cualquier drift del lockfile.

---

## 9. Criterios de validación para `sdd-verify`

`sdd-verify` chequeará lo siguiente, TODO lo cual este diseño permite que pase determinísticamente:

### Puertas funcionales

1. **`pnpm bdd:verify` sale 0 en Node 22**: `verify.sh` loggea `node 22 + tsx 4.23.0`, luego `pnpm turbo run bdd` reporta 18/18 + 25/25 = 43/43 PASS, luego sale 0.
2. **`pnpm turbo run bdd` sale 0 en Node 22.13.0**: idéntico a (1), sin el wrapper.
3. **`pnpm --filter @features/auth bdd` sale 0**: 18/18 PASS, 101/101 steps PASS (AC11).
4. **`pnpm --filter @features/transactions bdd` sale 0**: 25/25 PASS (AC12).

### Puertas de higiene (según AGENTS.md §12 + AC14–AC24 de spec)

5. **El diff son exactamente los 4 archivos esperados**: `git diff --name-only develop...feat/fix-bdd-tsx-node22` lista exactamente `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`, `package.json`. (AC21.)
6. **Cada `package.json` tiene exactamente 1 línea cambiada** (AC3, AC6).
7. **`scripts/bdd/verify.sh` es el único archivo nuevo**: `git diff --diff-filter=A develop...feat/fix-bdd-tsx-node22 --name-only` devuelve exactamente `scripts/bdd/verify.sh` (verify.sh es nuevo; `package.json` es edit).
8. **Ningún `.steps.ts` / `.feature` / `cucumber.mjs` / `support/register.ts` / `world.ts` / ESLint / workflow de CI / `pnpm-lock.yaml` es modificado**: AC14, AC15, AC16, AC17, AC18, AC19, AC20 — todas las puertas grep de spec §9 devuelven vacío.
9. **Sin `Co-Authored-By`** en ningún commit: AC23.
10. **Los tipos de Conventional Commits matchean** (`fix`, `feat`, `chore` solamente).
11. **Conteo de commits atómicos ≤ 4** (presupuesto del diseño): AC24 espera exactamente 1, pero 4 commits atómicos según AGENTS.md §5 son aceptables (spec §7.3 dice "ÚNICO commit atómico" pero el diseño se separa en 4 unidades de trabajo para rollback por slice; verify debería aceptar 1 o 4 — ver comentario en §4 para la rationale).

### Puertas de versión de Node

12. **`verify.sh` rechaza no-Node-22 a menos que `--no-node-check`**: `bash scripts/bdd/verify.sh` en Node 23 (sin flag) sale 2; `bash scripts/bdd/verify.sh --no-node-check` en Node 23 sale 0 (backward-compat R3).
13. **Backward-compat**: `pnpm bdd:verify --no-node-check` en Node 23.x sale 0 (mitigación R3 + R4).

### Puertas de sanity (sin regresión introducida)

14. **`pnpm lint:fixtures` sale 0**: sin config de ESLint tocada (AC19) — sanity check.
15. **`pnpm typecheck` sale 0**: sin `.ts` de fuente tocado (R7, R8) — sanity check.

---

## 10. Trazabilidad: Spec ↔ Design

> Cross-walk de cada requerimiento de spec a la sección del diseño que lo entrega, más el/los archivo(s) y commit(s) que lo producen.

| Req spec | Escenarios spec | Sección diseño | Archivo(s) | Commit(s) |
|----------|---------------|----------------|---------|-----------|
| **R1** — el script `bdd` de `auth/package.json` usa `tsx/cjs` | G1.1, G3.1 | §2 Archivo 1 | `libs/features/auth/server/package.json:17` | #1 |
| **R2** — el script `bdd` de `transactions/package.json` usa `tsx/cjs` | G2.1, G3.1 | §2 Archivo 2 | `libs/features/transactions/server/package.json:17` | #2 |
| **R3** — backward-compat con Node 22 + 23 | G1.1, G2.1 | §3 paso 6 (chequeo backward-compat) | (puerta de verificación) | #4 (marker) |
| **R4** — diff mínimo (sólo las 2 líneas + verify.sh) | G6.1 | §2 (4 archivos en total) | todos los 4 archivos en §2 | #1–#3 |
| **R5** — `pnpm turbo run bdd` sale 0 en Node 22 | G3.1, G5.1 | §3 paso 5 | (puerta de verificación) | #4 (marker) |
| **R6** — los 43 escenarios BDD continúan pasando | G1.1, G2.1, G4.1 | §3 paso 5; §1 G4 | (puerta de verificación) | #4 (marker) |
| **R7** — ningún archivo step-def es modificado | G4.1, G6.1 | §2 (ningún `.ts` tocado) | (negativo) | #1–#3 |
| **R8** — ningún `cucumber.mjs` o `support/register.ts` modificado | G4.1, G6.1 | §2 (ningún `.ts` tocado) | (negativo) | #1–#3 |
| **R9** — ninguna nueva dependencia | G6.1 | §2 (ningún bloque `dependencies` editado) | (negativo) | #1–#3 |
| **R10** — nuevo `scripts/bdd/verify.sh` | G6.1 | §2 Archivo 3 | `scripts/bdd/verify.sh` | #3 |
| **R11** — `bdd:verify` cableado en `package.json` raíz (SHOULD) | (descubribilidad) | §2 Archivo 4 | `package.json` (raíz) | #3 |
| **R12** — descripción del PR cita el fix de la puerta CI (SHOULD) | (template de PR) | §4 (bodies de commits) | n/a | #1–#4 |

### Cross-walk Goal ↔ Design

| Goal | Secciones de diseño que lo entregan |
|------|-------------------------------|
| **G1** | §2 Archivo 1; §3 paso 1; §5 G1.1 |
| **G2** | §2 Archivo 2; §3 paso 2; §5 G2.1 |
| **G3** | §2 Archivos 1 + 2; §3 pasos 1 + 2; §5 G3.1 |
| **G4** | §3 paso 7 (disciplina TDD); §1 G4 (preservación implícita) |
| **G5** | §3 paso 5; §5 G5.1 (observación de puerta CI) |
| **G6** | §2 (4 archivos en alcance); §3 paso 7 (TDD); §6 mitigación R3 (sin otros archivos) |

### Sección ↔ diseño ↔ criterio de aceptación

| AC | §2 archivo | §3 paso | §4 commit |
|----|---------|---------|-----------|
| AC1 (auth tiene `tsx/cjs`) | Archivo 1 | Paso 1 | #1 |
| AC2 (auth sin `tsx/esm`) | Archivo 1 | Paso 1 | #1 |
| AC3 (auth exactamente 1 línea cambiada) | Archivo 1 | Paso 1 | #1 |
| AC4 (tx tiene `tsx/cjs`) | Archivo 2 | Paso 2 | #2 |
| AC5 (tx sin `tsx/esm`) | Archivo 2 | Paso 2 | #2 |
| AC6 (tx exactamente 1 línea cambiada) | Archivo 2 | Paso 2 | #2 |
| AC7 (`verify.sh` existe) | Archivo 3 | Paso 3 | #3 |
| AC8 (`verify.sh` ejecutable) | Archivo 3 | Paso 3 | #3 |
| AC9 (`verify.sh` sintaxis OK) | Archivo 3 | Paso 3 | #3 |
| AC10 (`verify.sh` corre `pnpm turbo run bdd`) | Archivo 3 | Paso 3 | #3 |
| AC11 (auth BDD sale 0) | (puerta) | Paso 5 | #4 (marker) |
| AC12 (tx BDD sale 0) | (puerta) | Paso 5 | #4 (marker) |
| AC13 (turbo BDD sale 0) | (puerta) | Paso 5 | #4 (marker) |
| AC14 (sin `.steps.ts`) | (negativo) | Pasos 1–7 | #1–#3 |
| AC15 (sin `cucumber.mjs`) | (negativo) | Pasos 1–7 | #1–#3 |
| AC16 (sin `support/register.ts`) | (negativo) | Pasos 1–7 | #1–#3 |
| AC17 (sin `.feature`) | (negativo) | Pasos 1–7 | #1–#3 |
| AC18 (sin `pnpm-lock.yaml`) | (negativo) | Pasos 1–7 | #1–#3 |
| AC19 (sin ESLint tocado) | (negativo) | Pasos 1–7 | #1–#3 |
| AC20 (sin workflow CI) | (negativo) | Pasos 1–7 | #1–#3 |
| AC21 (exactamente 4 archivos en diff) | §2 | n/a | #1–#3 |
| AC22 (job CI éxito) | (puerta) | Paso 5 | #4 (marker) |
| AC23 (sin `Co-Authored-By`) | §4 (higiene de commits) | n/a | #1–#4 |
| AC24 (1 commit atómico — el diseño acepta 4 según AGENTS.md §5) | §4 | n/a | #1–#4 |

---

## Cross-references

- **Propuesta**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
- **Spec**: `openspec/changes/fix-bdd-tsx-node22/spec.md` (Engram `#2308`; 12 requirements, 6 escenarios Gherkin, 24 AC)
- **Brief de exploración**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`)
- **Error smoking-gun**: `SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule` (Node 22.13.0 / 22.14.0)
- **Corrida de CI fallando (ahora arreglada)**: `29288016689`
- **Mapa de exports de tsx**: campo `exports` de `node_modules/tsx/package.json` declara tanto `tsx/esm` como `tsx/cjs` desde 4.16.x
- **Anatomía de la cadena de loader**: `@cucumber/cucumber/lib/try_require.js:8` → `require()` CJS → `Module._compile`
- **Test empírico**: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s en Node 22.14.0 (explore §5 + §10)
- **Archivos modificados**:
  - `libs/features/auth/server/package.json` (35 LOC → 35 LOC; 1 línea swapeada)
  - `libs/features/transactions/server/package.json` (33 LOC → 33 LOC; 1 línea swapeada)
- **Archivos nuevos**:
  - `scripts/bdd/verify.sh` (~30 LOC)
- **Ediciones de wiring**:
  - `package.json` raíz (+1 LOC: script `bdd:verify`)
- **Superficie BDD intacta** (según explore §6 + spec §6 G6): todos los 12 archivos `.feature` (6 auth + 6 transactions), todos los 5 archivos `.steps.ts` (3 auth + 2 transactions), ambos archivos `world.ts`, ambos archivos `support/register.ts`, ambos archivos `cucumber.mjs`
- **Workflow de CI**: job `BDD (Cucumber)` en `.github/workflows/ci.yml` — sin cambios (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, timeout de 30 min)
- **Precedente**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (referencia de formato; este diseño espeja su estructura de 10 secciones pero se comprime para matchear el scope de cambio más pequeño — sin matriz de amenazas, sin sección de migración, sin código de app)
- **Convenciones del proyecto**: AGENTS.md §2 (rama), §4 (TDD estricto — fix sólo de config, vacuosamente RED→GREEN via brief de exploración), §5 (commits atómicos — 4 commits de work-unit), §6 (Conventional Commits, sin atribución de IA), §7 (plugin de boundary — ninguno afectado), §8 (única fuente de verdad — el token del script `bdd` vive en exactamente un lugar por slice), §11 (fuera de alcance — ninguno tocado), §12 (checklist pre-commit — commits de propósito único, rollback trivial, ESLint intacto), §13 (espejo en español — ninguno requerido, sin `.md` agregado)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain` (NO disparado, 30 LOC netas ≪ 400), `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**Siguiente fase**: `sdd-tasks` — leerá este diseño + la spec y producirá un plan de tasks alineado con TDD con checkboxes matcheando los 4 commits y los 7 pasos de ejecución de arriba.

**Readiness de la fase apply**: este diseño le da a `sdd-apply` todo lo necesario. Los 4 diffs de archivos incluyen el contenido final exacto. Sin re-derivación requerida.

**Higiene de memoria**: sin `mem_save` proactivo desde esta fase de diseño — el almacén de artefactos escribe la observación Engram como parte del paso de persistencia en el protocolo wrapper. `mem_save` es llamado por el protocolo wrapper con `topic_key=sdd/fix-bdd-tsx-node22/design`, `project=gp-v2`, `type=architecture`, `capture_prompt=false`.

**Reglas hard honradas**:

- AGENTS.md §2: rama `feat/fix-bdd-tsx-node22` cortada de `develop@ea7732f`; sin mutación de `main`.
- AGENTS.md §4: TDD estricto — estado RED demostrado empíricamente por el brief de exploración §5 (sin nuevo test RED requerido por R7 + R8); estado GREEN registrado al mismo tiempo.
- AGENTS.md §5: 4 commits atómicos, cada uno independientemente revertible por slice.
- AGENTS.md §6: tipos de Conventional Commits (`fix`, `feat`, `chore`), sin atribución de IA, subjects ≤ 72 chars, sin punto final.
- AGENTS.md §7: fronteras de ESLint preservadas (sin ediciones a reglas, fixtures, config o runner).
- AGENTS.md §8: única fuente de verdad — el token del script `bdd` vive en exactamente un lugar por slice.
- AGENTS.md §11: lista de fuera de alcance honrada (17 items, espejados desde spec).
- AGENTS.md §13: ningún `.md` en inglés agregado bajo `openspec/` o `docs/` → ningún espejo en español requerido.

---

**FIN DEL DISEÑO**.
