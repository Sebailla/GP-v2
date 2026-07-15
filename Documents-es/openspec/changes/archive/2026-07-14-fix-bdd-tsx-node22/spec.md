# Delta Spec — `fix-bdd-tsx-node22`

> **Change**: `fix-bdd-tsx-node22` · **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-bdd-tsx-node22`
> **Modo**: auto · **Almacén de artefactos**: hybrid · **Delivery**: single PR (NOT auto-chain)
> **Fecha**: 2026-07-13
> **Forma del fix**: **A** — swap de un-token-por-línea en 2 archivos `package.json` de slice
> **PR único**: 3 archivos, ~85 LOC netas (muy por debajo del presupuesto de revisión de 400 líneas)
> **Propuesta**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
> **Brief de exploración**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`)

---

## 1. Header

| Campo | Valor |
|-------|-------|
| Project | `gastos-personales-reference` |
| Project key | `gp-v2` |
| Branch | `feat/fix-bdd-tsx-node22` (cortada de `develop@ea7732f`) |
| Date | 2026-07-13 |
| Author | SDD orchestrator → `sdd-spec` (executor · model `MiniMax-M3`) |
| Status | draft · spec phase |
| Source | Propuesta Engram `#2307`; Exploración Engram `#2306`; corrida de CI fallando `29288016689` |
| Fix shape | A (según propuesta §0) |
| Artifact store | hybrid (Engram + OpenSpec) |
| Delivery strategy | single PR — `auto-chain` NO disparado (82 LOC < presupuesto de revisión de 400 líneas) |
| Strict TDD | active (AGENTS.md §4) — fix sólo de config; sin test RED requerido (no se toca código de producción) |

---

## 2. Intención

La puerta BDD de CI en `develop` está rota en Node 22. La corrida `29288016689` de CI falla todo PR con validación BDD con `SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule` (Node `22.14.0`, stack idéntica en `22.13.0`). La causa raíz está verificada empíricamente, no hipotetizada: la configuración `require:` de Cucumber 13 invoca el `require()` **CJS** de Node para cargar `support/register.ts` (`@cucumber/cucumber/lib/try_require.js:8`), mientras que los scripts `bdd` de los slices registran el hook de loader **ESM** (`--import tsx/esm`). Los hooks ESM NO interceptan el `require()` CJS. Node 22 entonces parsea el archivo `.ts` como CJS, encuentra la sintaxis `import type` (sólo de TypeScript), y lanza. La hipótesis original (incorrecta) que atribuía el bug a tsx 4.23.0 está empíricamente falsificada: tsx 4.22.5, 4.23.0 y 4.23.1 fallan idénticamente. El fix es un swap de un token por línea: `--import tsx/esm` → `--import tsx/cjs` (el hook de registro CJS oficial de tsx, presente desde tsx 4.16.x). Verificado empíricamente: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` en Node `22.14.0` devuelve `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s. Esta spec bloquea el fix en 6 goals testeables: suite BDD del slice auth GREEN, suite BDD del slice transactions GREEN, pipeline turbo BDD completo GREEN, cero regresión en el conteo de escenarios, flip de la puerta CI FAIL→PASS, y el diff toca sólo las 2 líneas intentadas + 1 nuevo script de verificación.

---

## 3. Goals

### G1 — Suite BDD del slice auth está GREEN en Node 22.x

`pnpm --filter @features/auth bdd` DEBE salir 0 en Node 22.13.0 (versión CI). Los 18 escenarios de auth a lo largo de los 6 archivos feature (`login-email-password`, `login-locale-routing`, `oauth-google-stub`, `password-reset`, `rbac-admin`, `sessions-list`) DEBEN pasar; los 101 steps de auth DEBEN pasar. El runtime DEBE ser comparable a la línea base empírica (~0.34s para los escenarios en sí, antes del startup de Postgres).

### G2 — Suite BDD del slice transactions está GREEN en Node 22.x

`pnpm --filter @features/transactions bdd` DEBE salir 0 en Node 22.13.0. Los 25 escenarios de transactions a lo largo de los 6 archivos feature (`create-transaction`, `idempotency-key`, `list-transactions`, `multi-currency-conversion`, `sign-aware-totals`, `soft-delete-categories`) DEBEN pasar.

### G3 — Pipeline turbo BDD completo está GREEN

`pnpm turbo run bdd` DEBE salir 0 a lo largo del workspace. Los 2 packages con BDD (`@features/auth`, `@features/transactions`) DEBEN salir 0; los 11 packages sin un script `bdd` (`@core/config`, `@core/database`, `@core/events`, `@shared-utils/*`, `@gpr/eslint-plugin-boundary`, `apps/api`, `apps/web`) DEBEN salir inmediatamente y no contribuir fallos.

### G4 — Cero regresión en escenarios

El conteo total de escenarios BDD DEBE permanecer 43/43 (18 auth + 25 transactions). Ningún escenario DEBE ser skipeado, marcado `pending`, marcado `todo`, borrado, o cortocircuitado de otra manera por el fix. Ninguna definición de step DEBE modificarse.

### G5 — La puerta CI flipea FAIL → PASS

El job `BDD (Cucumber)` de GitHub Actions en Node 22.13.0 DEBE reportar `success` en `feat/fix-bdd-tsx-node22`, reemplazando el estado `FAIL` previo observado en la corrida `29288016689` de CI. El log del job DEBE mostrar 43/43 escenarios pasando.

### G6 — Diff quirúrgico (sólo config + verificación)

`git diff develop...feat/fix-bdd-tsx-node22 --name-only` DEBE tocar exactamente 3 archivos: los dos archivos `package.json` de slice (cada uno con 1 línea cambiada) y el nuevo `scripts/bdd/verify.sh`. Ningún archivo fuente `.ts`, ningún archivo `.feature`, ningún archivo `.steps.ts`, ningún archivo `cucumber.mjs`, ningún archivo `support/register.ts`, ningún `pnpm-lock.yaml`, ningún `.github/workflows/ci.yml`, ninguna config de ESLint, ningún archivo `tools/eslint-plugin-boundary/**` DEBE ser modificado.

---

## 4. Non-Goals

Lo siguiente está explícitamente **fuera de alcance** para este cambio (espejado desde propuesta §2.2 + AGENTS.md §11):

1. Cambiar el mecanismo de loader de Cucumber de `require:` a `import:` (Forma B de la propuesta). Puede retomarse en un cambio dedicado.
2. Reescribir `support/register.ts` como CJS (Forma C) — borraría la decisión arquitectónica de slice-7 PR-8 / slice-8 PR-1.
3. Reemplazar tsx con otro registro como `@swc-node/register` (Forma D) — introduce una nueva devDependency.
4. Agregar una nueva devDependency de cualquier tipo.
5. Editar cualquier archivo fuente `.ts`: `world.ts`, `.steps.ts`, `support/register.ts`, `cucumber.mjs` (cualquiera de estos invalida el goal de diff quirúrgico G6).
6. Editar archivos `.feature` (los escenarios Gherkin quedan byte-idénticos; el fix sólo cambia qué hook de loader de Node transforma TypeScript en el momento de `require()`).
7. Editar `.github/workflows/ci.yml` (la config del job BDD es correcta: Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, timeout de 30 min — sólo necesita que los scripts de slice funcionen).
8. Pinear o upgredear tsx (`^4.23.0` ya cubre el hook `tsx/cjs` presente desde tsx 4.16.x).
9. Cambiar la línea base de versión de Node (Node 22.13.0 sigue siendo el target de CI).
10. Editar `tsconfig.base.json`, `apps/web/**`, `apps/api/**`.
11. Editar config de ESLint, plugin de boundary de ESLint, fixtures de ESLint, o runner de ESLint.
12. Agregar un nuevo escenario BDD, test unitario, o test e2e.
13. Agregar script `bdd:debug` (Q2 de la propuesta — rechazado).
14. Agregar `--bail` al job bdd de CI (Q3 de la propuesta — rechazado).
15. Nada de AGENTS.md §11 (i18n más allá de en/es, Sentry, rate-limiting, OAuth más allá de Google, hardening de producción, observabilidad, gate de cobertura, UI de audit log).
16. Migrar `gastos-personales/` al modelo de vertical-slicing.

---

## 5. Requerimientos funcionales

> Keywords según RFC 2119. MUST = requerimiento absoluto. SHOULD = recomendado pero no bloqueante. MAY = opcional.

### R1 — El script `bdd` de `libs/features/auth/server/package.json` usa `--import tsx/cjs`

El script `bdd` en `libs/features/auth/server/package.json:17` DEBE contener el string literal `NODE_OPTIONS='--import tsx/cjs'` en lugar de `NODE_OPTIONS='--import tsx/esm'`. Ningún otro carácter en esa línea PUEDE cambiar; ninguna otra línea en ese archivo PUEDE cambiar.

### R2 — El script `bdd` de `libs/features/transactions/server/package.json` usa `--import tsx/cjs`

El script `bdd` en `libs/features/transactions/server/package.json:17` DEBE contener el string literal `NODE_OPTIONS='--import tsx/cjs'` en lugar de `NODE_OPTIONS='--import tsx/esm'`. Ningún otro carácter en esa línea PUEDE cambiar; ninguna otra línea en ese archivo PUEDE cambiar.

### R3 — Backward-compatible con Node 22.x y Node 23.x

El fix DEBE permanecer funcional en Node 22.13.0 (target CI) y Node 23.x (dev local default). El fix NO DEBE introducir una diferencia de comportamiento entre major de Node. Verificado por el test empírico (`NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` en Node 22.14.0 → 18/18 PASS en 0.34s) y el contrato del hook `tsx/cjs` documentado en <https://tsx.is/getting-started> (el hook parchea el `Module._compile` y `Module._extensions['.ts']` de Node CJS sin importar el major de Node).

### R4 — Diff mínimo

El diff contra `develop` DEBE limitarse a: (a) las dos líneas de `package.json` según R1 y R2; (b) el nuevo archivo `scripts/bdd/verify.sh` según R10. Ningún otro archivo DEBE ser modificado, renombrado, borrado o creado.

### R5 — `pnpm turbo run bdd` sale 0 en Node 22.x

`pnpm turbo run bdd` DEBE salir 0 en Node 22.13.0 (versión CI). Todos los packages con BDD DEBEN reportar exit 0. Los packages sin BDD DEBEN salir 0 inmediatamente sin contribuir fallos.

### R6 — Los 43 escenarios BDD continúan pasando

Los 18 escenarios de auth y los 25 escenarios de transactions (43 totales) DEBEN todos pasar después del fix. Cero escenarios DEBEN ser skipeados, marcados pending, marcados todo, borrados o cortocircuitados de otra manera. El conteo de escenarios DEBE ser exactamente 43 antes y después.

### R7 — Ningún archivo de step-def es modificado

Ningún archivo que matchee `libs/features/*/docs/step-defs/*.steps.ts` PUEDE ser modificado. Los 5 archivos de step-def (`common.steps.ts`, `realm.steps.ts` en auth; `actions.steps.ts`, `common.steps.ts`, `data.steps.ts` en transactions) DEBEN permanecer byte-idénticos.

### R8 — Ningún `cucumber.mjs` o `support/register.ts` es modificado

Ninguno de los 2 archivos `cucumber.mjs` (`libs/features/auth/docs/cucumber.mjs`, `libs/features/transactions/docs/cucumber.mjs`) PUEDE ser modificado. Ninguno de los 2 archivos `support/register.ts` (uno por slice) PUEDE ser modificado.

### R9 — Ninguna dependencia nueva es agregada

El cambio NO DEBE agregar, remover o upgradear ningún package en ningún archivo `package.json`. `pnpm-lock.yaml` NO DEBE cambiar. El fix se apoya en el ya declarado `tsx@^4.23.0` (que resuelve al `4.23.0` instalado, satisfaciendo el requerimiento `>=4.16.0` para el hook `tsx/cjs`).

### R10 — Nuevo script `scripts/bdd/verify.sh`

DEBE agregarse un nuevo shell script en `scripts/bdd/verify.sh`. El script DEBE:
1. Detectar y cambiar a Node 22.x si hay un version manager (`nvm`, `asdf`, `volta` o `fnm`) disponible; si no se detecta manager, loggear un warning pero continuar.
2. Loggear la versión de Node (`node --version`) y la versión resuelta de tsx (`pnpm ls tsx 2>/dev/null | head` o equivalente).
3. Correr `pnpm turbo run bdd` y propagar su exit code.
4. Loggear una línea final con el resultado (`OK` en éxito, `FAIL` en fallo) y el conteo total de escenarios cuando esté disponible.
5. Estar marcado como ejecutable (`chmod +x`) y pasar validación de sintaxis `bash -n`.

### R11 — Script `pnpm bdd:verify` cableado en `package.json` raíz (recomendado)

El `package.json` raíz DEBERÍA agregar un script `"bdd:verify": "bash scripts/bdd/verify.sh"` para que los contribuidores puedan correr la verificación vía `pnpm bdd:verify`. El cableado es opcional pero recomendado por descubribilidad.

### R12 — La descripción del PR explícitamente resalta el fix de la puerta CI

La descripción del PR DEBERÍA encabezar con una declaración de una línea diciendo que esto restaura la puerta BDD de CI previamente rota en `develop@ea7732f` (corrida fallando `29288016689` → verde en `feat/fix-bdd-tsx-node22`). La descripción DEBERÍA citar el brief de exploración como evidencia de la investigación empírica de causa raíz.

---

## 6. Escenarios

> Formato Gherkin Given/When/Then. Cada escenario DEBE ser ejecutable como test automatizado o comando shell.
>
> 6 escenarios totales, uno por goal.

### Escenario G1 (BDD de auth slice GREEN)

#### Scenario: Suite BDD de auth pasa en Node 22.x con el nuevo hook CJS

- GIVEN `libs/features/auth/server/package.json` tiene el script `bdd` que contiene `NODE_OPTIONS='--import tsx/cjs'`
- WHEN `pnpm --filter @features/auth bdd` se corre en Node 22.13.0
- THEN 18 de 18 escenarios DEBEN pasar
- AND todos los 101 steps DEBEN pasar
- AND el exit code DEBE ser 0

### Escenario G2 (BDD de transactions slice GREEN)

#### Scenario: Suite BDD de transactions pasa en Node 22.x con el nuevo hook CJS

- GIVEN `libs/features/transactions/server/package.json` tiene el script `bdd` que contiene `NODE_OPTIONS='--import tsx/cjs'`
- WHEN `pnpm --filter @features/transactions bdd` se corre en Node 22.13.0
- THEN 25 de 25 escenarios DEBEN pasar
- AND el exit code DEBE ser 0

### Escenario G3 (pipeline turbo BDD GREEN)

#### Scenario: Pipeline turbo BDD completo pasa

- GIVEN los scripts `bdd` en ambos archivos `package.json` de slice usan `--import tsx/cjs`
- WHEN `pnpm turbo run bdd` se corre en Node 22.13.0
- THEN todos los packages con BDD (`@features/auth`, `@features/transactions`) DEBEN salir 0
- AND el conteo total de escenarios DEBE ser 43 (18 auth + 25 transactions)
- AND los packages sin un script `bdd` DEBEN salir 0 inmediatamente sin contribuir fallos

### Escenario G4 (cero regresión de escenarios)

#### Scenario: Conteo e identidad de escenarios BDD se preservan

- GIVEN los archivos `.feature` y step-def de slice son byte-idénticos a `develop`
- WHEN `pnpm turbo run bdd` corre en Node 22.13.0
- THEN el runner DEBE reportar exactamente 43 escenarios ejecutados (18 auth + 25 transactions)
- AND 0 escenarios DEBEN ser skipeados, pending, todo, o cortocircuitados de otra manera
- AND el conteo de fallos DEBE ser 0

### Escenario G5 (la puerta CI flipea)

#### Scenario: La puerta BDD de CI pasa de fail a pass

- GIVEN el PR se abre con el fix de 2 líneas + el nuevo `scripts/bdd/verify.sh`
- WHEN GitHub Actions corre el job `BDD (Cucumber)` en Node 22.13.0
- THEN el job DEBE reportar `success`
- AND el log BDD DEBE mostrar 43/43 escenarios pasando
- AND el job NO DEBE reportar la falla previa `SyntaxError: Unexpected identifier 'AuthWorld'`

### Escenario G6 (diff quirúrgico)

#### Scenario: El fix toca sólo configuración y el nuevo script de verificación

- GIVEN el diff entre `feat/fix-bdd-tsx-node22` y `develop`
- WHEN la lista de archivos se filtra por `\.steps\.ts$|cucumber\.mjs$|support/register\.ts$|\.feature$|world\.ts$|eslint-plugin-boundary|ci\.yml|tsconfig|pnpm-lock\.yaml`
- THEN la lista filtrada DEBE estar vacía
- AND los archivos restantes DEBEN ser exactamente: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`
- AND `scripts/bdd/verify.sh` DEBE ser el único archivo nuevo
- AND cada `package.json` DEBE contener exactamente 1 línea cambiada

---

## 7. Constraint Surface

### 7.1 Fronteras arquitectónicas (AGENTS.md §7 — enforced by ESLint)

- **`no-prisma-outside-core`**: Sin afectar. Sin cambios en fuentes `.ts`.
- **`no-schemas-outside-shared`**: Sin afectar. Sin cambios en schemas Zod.
- **`no-client-server-import`**: Sin afectar. Sin cambios en código de cliente.
- **`no-cross-module-import`**: Sin afectar. Sin imports cross-feature cambiados.
- **`no-mojibake-in-docs`** (opcional, slice-8 8.3): Sin afectar. Sin archivos `.md` agregados.

### 7.2 Strict TDD (AGENTS.md §4)

Este cambio es **sólo de configuración**. No hay código de producción a probar, así que el paso RED-first se satisface vacuosamente (la reproducción empírica en explore §5 ya demostró el estado RED — `SyntaxError: Unexpected identifier 'AuthWorld'` — y el estado GREEN — 18/18 PASS). El test empírico ES la evidencia RED→GREEN: el cambio de producción es un token, la verificación es el runner BDD mismo. No se requieren test unitario, test de integración o fixture adicional.

### 7.3 Commits atómicos (AGENTS.md §5) y Conventional Commits (AGENTS.md §6)

- Las 2 líneas de `package.json` + el nuevo `scripts/bdd/verify.sh` DEBEN aterrizar como UN SOLO commit atómico (el cambio es una unidad de trabajo: "hacer que BDD pase en Node 22").
- Tipo del commit message: `fix(bdd)`. Subject ≤72 chars, imperativo, sin punto final. El body explica POR QUÉ (la puerta CI está rota en Node 22 porque el `require()` CJS de cucumber bypasea el hook ESM de tsx; cambiar a `tsx/cjs` matchea el camino del loader).
- Sin línea `Co-Authored-By`. Sin atribución de IA. (Según AGENTS.md §6 y la regla hard de la persona.)

### 7.4 Modelo de ramas (AGENTS.md §2)

- Rama de trabajo: `feat/fix-bdd-tsx-node22` cortada de `develop` (NO de `main`).
- `main` es inmutable; sin force-push, sin delete, sin amend de commits históricos.
- `git revert <merge-sha>` revierte limpiamente el PR entero.

### 7.5 Única fuente de verdad (AGENTS.md §8)

- Sin duplicación. El token del script `bdd` vive en exactamente un lugar por slice (`package.json:17`); ningún segundo archivo de config lo override.
- El nuevo `scripts/bdd/verify.sh` es la única fuente de verdad para la receta "correr BDD en Node 22 localmente".

### 7.6 Espejo en español (AGENTS.md §13)

- Este archivo spec (`openspec/changes/fix-bdd-tsx-node22/spec.md`) está intencionalmente NO espejado al momento de creación de la spec (mismo precedente que `fix-api-nestjs-di`).
- El nuevo `scripts/bdd/verify.sh` es un shell script, no un archivo Markdown — no requiere espejo.
- Ningún archivo `.md` en inglés se agrega bajo `openspec/` o `docs/` por este cambio.

### 7.7 Restricciones del workflow de CI

- El job BDD usa Node 22.13.0 + pnpm 11.10.0 + Postgres 16-alpine. Timeout 30 min. El fix DEBE funcionar bajo estas condiciones exactas.
- El fix NO DEBE alterar `.github/workflows/ci.yml`.

---

## 8. Plan de testing

| Goal | Comando de test | Outcome esperado |
|------|--------------|------------------|
| G1 (auth BDD GREEN) | `pnpm --filter @features/auth bdd` en Node 22.13.0 | exit 0; 18/18 escenarios PASS; 101/101 steps PASS |
| G2 (transactions BDD GREEN) | `pnpm --filter @features/transactions bdd` en Node 22.13.0 | exit 0; 25/25 escenarios PASS |
| G3 (turbo BDD GREEN) | `pnpm turbo run bdd` en Node 22.13.0 | exit 0; ambos packages BDD pasan |
| G4 (cero regresión) | mismo que G1 + G2 combinados | 43/43 escenarios ejecutados; 0 skipped/pending/todo |
| G5 (la puerta CI flipea) | Job `BDD (Cucumber)` de GitHub Actions | job reporta `success` |
| G6 (diff quirúrgico) | `git diff --name-only develop...feat/fix-bdd-tsx-node22` | exactamente los 3 archivos listados en §6 G6 |

### Pasos de verificación manuales / no-CI

- `grep -n "tsx/esm\|tsx/cjs" libs/features/auth/server/package.json libs/features/transactions/server/package.json` — debe mostrar `tsx/cjs` sólo, ningún `tsx/esm`.
- `bash -n scripts/bdd/verify.sh` — debe salir 0 (chequeo de sintaxis).
- `bash scripts/bdd/verify.sh` — en una máquina con `nvm` o `asdf`, cambia a Node 22 y corre `pnpm turbo run bdd` end-to-end.
- `pnpm lint:fixtures` — debe seguir saliendo 0 (sin cambios ESLint; sanity check).
- `pnpm typecheck` — debe seguir saliendo 0 (sin cambios `.ts`; sanity check).

---

## 9. Criterios de aceptación

> Condiciones binarias pass/fail para `sdd-verify`. Cada criterio DEBE ser testeable desde un `git checkout feat/fix-bdd-tsx-node22 && pnpm install` limpio.

| # | Criterio | Condición de pass |
|---|-----------|-------------------|
| AC1 | El script `bdd` de auth usa `tsx/cjs` | `grep "tsx/cjs" libs/features/auth/server/package.json` devuelve ≥1 match |
| AC2 | El script `bdd` de auth ya no usa `tsx/esm` | `grep "tsx/esm" libs/features/auth/server/package.json` no devuelve matches |
| AC3 | El `package.json` de auth tiene exactamente 1 línea cambiada | `git diff develop -- libs/features/auth/server/package.json` muestra exactamente 1 línea cambiada |
| AC4 | El script `bdd` de transactions usa `tsx/cjs` | `grep "tsx/cjs" libs/features/transactions/server/package.json` devuelve ≥1 match |
| AC5 | El script `bdd` de transactions ya no usa `tsx/esm` | `grep "tsx/esm" libs/features/transactions/server/package.json` no devuelve matches |
| AC6 | El `package.json` de transactions tiene exactamente 1 línea cambiada | `git diff develop -- libs/features/transactions/server/package.json` muestra exactamente 1 línea cambiada |
| AC7 | `scripts/bdd/verify.sh` existe | `ls scripts/bdd/verify.sh` tiene éxito |
| AC8 | `scripts/bdd/verify.sh` es ejecutable | `test -x scripts/bdd/verify.sh` tiene éxito |
| AC9 | `scripts/bdd/verify.sh` pasa el chequeo de sintaxis | `bash -n scripts/bdd/verify.sh` sale 0 |
| AC10 | `scripts/bdd/verify.sh` corre `pnpm turbo run bdd` | `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` devuelve ≥1 match |
| AC11 | BDD de auth sale 0 | `pnpm --filter @features/auth bdd` en Node 22.13.0 sale 0; 18/18 PASS |
| AC12 | BDD de transactions sale 0 | `pnpm --filter @features/transactions bdd` en Node 22.13.0 sale 0; 25/25 PASS |
| AC13 | Turbo BDD sale 0 | `pnpm turbo run bdd` en Node 22.13.0 sale 0 |
| AC14 | Ningún step-def modificado | `git diff develop --name-only -- '*.steps.ts'` devuelve vacío |
| AC15 | Ningún `cucumber.mjs` modificado | `git diff develop --name-only -- 'cucumber.mjs'` devuelve vacío |
| AC16 | Ningún `support/register.ts` modificado | `git diff develop --name-only -- 'support/register.ts'` devuelve vacío |
| AC17 | Ningún archivo `.feature` modificado | `git diff develop --name-only -- '*.feature'` devuelve vacío |
| AC18 | Ningún `pnpm-lock.yaml` modificado | `git diff develop --name-only -- pnpm-lock.yaml` devuelve vacío |
| AC19 | Ninguna config de ESLint o plugin de boundary modificado | `git diff develop --name-only -- 'eslint.config*' 'tools/eslint-plugin-boundary/**'` devuelve vacío |
| AC20 | Ningún workflow de CI modificado | `git diff develop --name-only -- '.github/workflows/ci.yml'` devuelve vacío |
| AC21 | El diff son exactamente los 3 archivos esperados | `git diff develop --name-only` lista exactamente: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh` |
| AC22 | El job de CI reporta éxito | El job `BDD (Cucumber)` de GitHub Actions en el PR reporta `success` |
| AC23 | Sin `Co-Authored-By` en el commit | `git log feat/fix-bdd-tsx-node22 --pretty=format:"%B" \| grep -i "co-authored-by"` devuelve vacío |
| AC24 | Un solo commit atómico | `git log --oneline develop..feat/fix-bdd-tsx-node22` muestra exactamente 1 commit |

---

## 10. Fuera de alcance

(Espejado desde propuesta §2.2 + AGENTS.md §11; los non-goals arriba son operativos, esta sección es el chequeo formal de revisión.)

1. Cualquier cosa en AGENTS.md §11.
2. Cambiar Cucumber de `require:` a `import:` (Forma B).
3. Reescribir `support/register.ts` como CJS (Forma C).
4. Reemplazar tsx con `@swc-node/register` (Forma D).
5. Agregar cualquier nueva devDependency.
6. Editar cualquier archivo fuente `.ts` (world.ts, .steps.ts, support/register.ts).
7. Editar cualquier archivo `.feature` o `cucumber.mjs`.
8. Editar `.github/workflows/ci.yml`.
9. Pinear o upgradear tsx.
10. Cambiar la línea base de versión de Node.
11. Editar `tsconfig.base.json`, `apps/web/**`, `apps/api/**`.
12. Editar config de ESLint o plugin de boundary.
13. Agregar un nuevo escenario BDD, test unitario, o test e2e.
14. Agregar script `bdd:debug` (Q2 rechazado).
15. Agregar flag `--bail` al job bdd de CI (Q3 rechazado).
16. Escribir ADR 0009 (Q1 rechazado — tweak de config de este tamaño no amerita un ADR; mismo precedente que `fix-api-nestjs-di` para Q1 sólo aplica cuando el cambio introduce una nueva decisión; este cambio se documenta a sí mismo en línea).
17. Migrar `gastos-personales/` al modelo de vertical-slicing.

---

## 11. Preguntas abiertas — RESUELTAS

La propuesta difirió 4 preguntas a la fase de spec. Están ahora resueltas:

### Q1 — ADR 0009 para la elección de hook de loader

**Resuelta**: **SIN ADR.**

Rationale: el cambio es un swap de un-token-por-línea entre dos entry points oficiales de tsx (`tsx/esm` ↔ `tsx/cjs`) documentados en <https://tsx.is/getting-started>. Un ADR para un tweak de configuración de este tamaño es sobrecarga burocrática. La propuesta en sí, esta spec y la descripción del PR juntas proveen suficiente contexto para futuros mantenedores. El precedente de fix-api-nestjs-di (donde el ADR 0008 SÍ se escribió) aplica a una situación diferente: ese cambio introdujo una nueva regla de ESLint y una nueva convención (`_ServiceAnchor`) que realmente necesitaban documentarse. Este cambio restaura comportamiento esperado vía un hook oficial ya documentado.

### Q2 — Script `bdd:debug` con `--inspect`

**Resuelta**: **SIN script `bdd:debug`.**

Rationale: scope creep. El script `bdd` existente es suficiente para debugging local una vez que funcione en Node 22. Un script de debug separado con `--inspect` puede agregarse en un cambio futuro si los contribuidores lo necesitan.

### Q3 — Flag `--bail` en CI para fail-fast en el primer fallo de slice

**Resuelta**: **SIN flag `--bail`.**

Rationale: fuera de alcance. El job BDD ya corre todos los slices y reporta un único exit code; la semántica de fail-fast es una preocupación separada de tuning de CI. El fix es independiente de cómo la CI reporta los fallos.

### Q4 — Nuevo script de verificación para reproducción local de BDD-en-Node-22

**Resuelta**: **SÍ** — agregar `scripts/bdd/verify.sh` (R10), opcionalmente cableado como `pnpm bdd:verify` (R11).

Rationale: seguro barato contra regresión futura. El bug fue difícil de diagnosticar porque no había una receta documentada de "cómo reproducir en Node 22". Un shell script de 30 líneas que (a) cambie a Node 22 si hay un version manager disponible, (b) loggee las versiones de Node + tsx, (c) corra `pnpm turbo run bdd`, y (d) propague el exit code es el artefacto mínimo útil. Corre en <60 segundos localmente y le da a futuros mantenedores un one-liner para verificar la puerta BDD. LOC totales agregadas: ~30 (muy por debajo del presupuesto de 400 líneas).

---

## 12. Trazabilidad

Goal → Requirement → Scenario → Test command:

| Goal | Requirements | Scenarios | Comando de test |
|------|-------------|-----------|--------------|
| G1 | R1, R3, R6 | G1.1 (auth BDD GREEN) | `pnpm --filter @features/auth bdd` |
| G2 | R2, R3, R6 | G2.1 (transactions BDD GREEN) | `pnpm --filter @features/transactions bdd` |
| G3 | R1, R2, R5 | G3.1 (full turbo BDD) | `pnpm turbo run bdd` |
| G4 | R6, R7, R8 | G4.1 (cero regresión) | cubierto por G1 + G2 + G3 |
| G5 | R5, R12 | G5.1 (la puerta CI flipea) | Job `BDD (Cucumber)` de GitHub Actions |
| G6 | R4, R7, R8, R9, R10 | G6.1 (diff quirúrgico) | `git diff --name-only develop...feat/fix-bdd-tsx-node22` |

### Matriz criterio de aceptación ↔ requerimiento

| Requerimiento | Criterios de aceptación |
|-------------|--------------------|
| R1 | AC1, AC2, AC3 |
| R2 | AC4, AC5, AC6 |
| R3 | AC11, AC12 (pasa en Node 22; el mismo contrato del hook `tsx/cjs` aplica a Node 23.x) |
| R4 | AC3, AC6, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21 |
| R5 | AC13 |
| R6 | AC11, AC12, AC13 |
| R7 | AC14 |
| R8 | AC15, AC16 |
| R9 | AC18, AC19 (sin cambio en `pnpm-lock.yaml`; sin cambio en deps de ESLint) |
| R10 | AC7, AC8, AC9, AC10 |
| R11 | (recomendado, no gateado) — chequeo manual de `package.json` |
| R12 | (convención de descripción de PR; no directamente gateado por AC) |

### Mitigación riesgo ↔ requerimiento

| Riesgo (propuesta §7) | Mitigado por |
|--------------------|--------------|
| R1 (`tsx/cjs` difiere de `tsx/esm` para top-level await / async module loading) | R3 + escenario G1 — el test empírico en Node 22.14.0 ya mostró 18/18 PASS; los escenarios BDD no usan top-level await (verificado en explore §7 R1). |
| R2 (`tsx/cjs` puede no estar disponible en versiones antiguas de tsx) | R9 — `tsx/cjs` se envía desde tsx 4.16.x; el rango `^4.23.0` satisface `>=4.16.0`. |
| R3 (un major futuro de tsx remueve `tsx/cjs`) | R9 — el mapa de exports ha declarado ambos hooks sin nota de deprecación; si se removiera, el fix espejearía el actual (misma forma, diferente token). |
| R4 (regresiona entornos dev locales en Node 23.x) | R3 — `tsx/cjs` hookea la cadena de loader CJS sin importar el major de Node. |
| R5 (un workaround de admin-merge previo asume el viejo `tsx/esm`) | R7 + R8 — ningún step-def o `register.ts` se toca; los workarounds previos siguen siendo válidos (sólo agregaron código de bridge, no overrides de config `tsx`). |

---

## Cross-references

- **Propuesta**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
- **Brief de exploración**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`)
- **Error smoking-gun**: `SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule` (Node 22.13.0 / 22.14.0)
- **Corrida de CI fallando (ahora arreglada)**: `29288016689` (citada en explore §10)
- **Mapa de exports de tsx**: campo `exports` de `node_modules/tsx/package.json` declara tanto `tsx/esm` como `tsx/cjs` desde 4.16.x (explore §4, §5)
- **Anatomía de la cadena de loader**: explore §3 (`@cucumber/cucumber/lib/try_require.js:8` → `require()` CJS → `Module._compile`)
- **Test empírico**: explore §5 y §10 — `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s en Node 22.14.0
- **Archivos `package.json` de slice afectados**:
  - `libs/features/auth/server/package.json:17`
  - `libs/features/transactions/server/package.json:17`
- **Superficie BDD intacta** (según explore §6): todos los 9 archivos `.feature`, todos los 5 archivos `.steps.ts`, ambos archivos `world.ts`, ambos archivos `support/register.ts`, ambos archivos `cucumber.mjs`
- **Workflow de CI**: job `BDD (Cucumber)` en `.github/workflows/ci.yml` usa Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine
- **Precedente**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/spec.md` (referencia de formato; esta spec espeja su estructura de 12 secciones)
- **Convenciones del proyecto**: AGENTS.md §2 (rama), §4 (TDD estricto — fix sólo de config, vacuosamente RED→GREEN via runner BDD), §5 (commits atómicos — commit único de work-unit), §6 (Conventional Commits — `fix(bdd): …`), §7 (plugin de boundary — sin ediciones de regla), §11 (fuera de alcance — ninguno tocado), §12 (checklist pre-commit — propósito único, rollback trivial, ESLint intacto), §13 (espejo en español — ninguno requerido, sin `.md` agregado)

---

**Siguiente fase**: `design` (sdd-design producirá los diff hunks exactos para las dos líneas de `package.json`, el cuerpo completo de `scripts/bdd/verify.sh`, y los comandos de verificación — traduciendo este QUÉ en CÓMO).
