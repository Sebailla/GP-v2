# Tareas — `slice-8-closing-bdd-and-docs`

> **Estado**: borrador · fase de tareas · **Fecha**: 2026-07-12
> **Proyecto**: `gastos-personales-reference` · **Branch**: `develop` (`bb25aab`) · tracker `feat/v1.1.2-slice-8-closing-bdd-and-docs`
> **Modo**: interactivo · **Almacen de artefactos**: hybrid · **Delivery**: `ask-on-risk` · **Chain**: `feature-branch-chain` · **Presupuesto de revision**: 400 lineas / PR
> **TDD estricto**: activo (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Entradas de aprobacion**: `proposal.md` (Engram #2226), `spec.md` (Engram #2228), `design.md` (Engram #2229)
> **Cierre del slice-7**: `bb25aab` · **Patron de fix del bridge**: `a9b550d`
> **Split de 8.4 (5-PR por decision bloqueada por el usuario)**: A1, A2, B1, B2, C; las cinco flags en `yes`

---

## Convenciones usadas en este archivo

- **Commits de unidad-de-trabajo**: cada commit MUST ser independientemente revertible. Los tests aterrizan en el mismo commit que el comportamiento que verifican. Los docs aterrizan en el mismo commit que su espejo `Documents-es/` (AGENTS.md §13).
- **Sin trailers "Co-Authored-By"** (AGENTS.md §6 / regla del proyecto).
- **Conventional Commits**: `type(scope): subject` — imperativo, ≤72 chars, sin punto final.
- **RED antes de GREEN**: cualquier commit que agregue codigo de produccion MUST ser precedido (o emparejado en el mismo commit) por un test que falle. Para prosa de docs de 8.4 no existe test RED en Vitest; la verificacion es via `wc -l`, `grep`, y la regla `no-mojibake-in-docs` (declarada en design §8 / spec §8.4 "Estrategia de tests").
- **MUST / SHALL / MUST NOT** son RFC 2119; cualquier cosa mas debil (deberia, puede) no es vinculante.
- **Patron de rama `feat/v1.1.2-…`** refleja el tracker del slice-7; bump de minor version porque esto es un slice de feature, no un patch.

---

## PR #1 — Sub-slice 8.1 — Fix del auth BDD bridge

- **Titulo del PR**: `feat(auth): slice 8 PR-1 — auth BDD bridge GREEN (refleja el fix de transactions)`
- **Nombre de rama**: `feat/v1.1.2-slice-8-auth-bridge`
- **Branch base**: `develop` (el **primer** PR hijo apunta al tracker; el tracker apunta a `develop`)
- **Branch tracker (creada primero)**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (creada off `develop` antes de cualquier rama hija)
- **Sub-slice**: 8.1
- **LOC estimado**: ~180 (150 en el porte + 177 del nuevo test menos el espacio ahorrado en register.ts + 1 linea de config de vitest)
- **Trigger de ask-on-risk**: **No** (Riesgo bajo, ~180 LOC, dentro del presupuesto)
- **Commits atomicos del sub-slice** (RED-first segun TDD estricto):

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `test(auth): add RED register.test.ts reflejando el test del bridge de transactions` | El contrato del bridge no tiene test hoy; copia la forma del test de transactions verbatim (3 afirmaciones: aridad del wrapper + world desde `.inner`, regex de grupo de captura, `setWorldConstructor` invocado al cargar). El commit aterriza RED (2 FAIL) — prueba que el bug es real antes de tocar codigo de produccion. |
| 2 | `feat(auth): vitest include docs/__tests__ para habilitar el descubrimiento del test del bridge` | `libs/features/auth/server/vitest.config.ts` NO incluye `../docs/__tests__/**/*.test.ts` — sin este bump de 1 linea el test del commit #1 no es descubierto por `pnpm --filter @features/auth test`. El fix es mecanico y MUST precede o acompanar al commit GREEN. |
| 3 | `feat(auth): portar transactions buildWrapper al bridge de auth en register.ts` | Commit GREEN. Portar `buildWrapper`, `countStringPlaceholders`, `buildPattern` (lineas 72-118 / 143-165 de register.ts de transactions) verbatim. Sustituir los cuatro strings + el import `TxWorld → AuthWorld`. Introducir `setWorldConstructor(AuthWorldWrapper)` reflejando las lineas 125-129. El test del commit #1 ahora PASA; el BDD del bridge corre sin timeouts. |

- **Archivos tocados** (con delta de LOC):
  - `libs/features/auth/docs/support/register.ts` — REESCRITURA: 80 → ~180 LOC (+100)
  - `libs/features/auth/docs/__tests__/register.test.ts` — NUEVO: ~177 LOC
  - `libs/features/auth/server/vitest.config.ts` — +1 LOC (tercer include)
  - Total: +278 LOC
- **Comandos de verificacion** (el orquestador corre TODOS estos; el PR esta green solo cuando todos salen 0):
  ```bash
  # Prueba RED: revertir commit #3 localmente — `pnpm --filter @features/auth test` MUST reportar 2 FAIL.
  # Prueba GREEN (este estado del PR):
  pnpm --filter @features/auth test           # 2/2 PASS en register.test.ts
  pnpm --filter @features/auth bdd           # 18/18 PASS, <2s
  pnpm --filter @features/transactions bdd   # 25/25 PASS (sin regresion)
  git diff --stat bb25aab..HEAD -- libs/features/transactions/   # vacio
  ```
- **Fuera de alcance para este PR** (apply MUST NOT tocarlos):
  - `libs/features/auth/docs/cucumber.mjs`
  - `libs/features/auth/docs/support/env-bootstrap.js`
  - `libs/features/auth/docs/support/service-context.ts`
  - Cualquier `libs/features/auth/docs/*.feature`
  - Cualquier `libs/features/auth/docs/step-defs/*.steps.ts`
  - `libs/features/transactions/docs/support/register.ts` (fuente canonica)
  - `.github/workflows/ci.yml`, `eslint.config.mjs`, nada en `docs/` o `Documents-es/`

---

## PR #2 — Sub-slice 8.2 — BDD como gate de CI

- **Titulo del PR**: `ci(workflows): slice 8 PR-2 — gate BDD (Cucumber) con servicio Postgres`
- **Nombre de rama**: `feat/v1.1.2-slice-8-ci-bdd-gate`
- **Branch base**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; el PR #1 debe mergear primero)
- **Sub-slice**: 8.2
- **LOC estimado**: ~30 (el bloque del 5to job reemplaza el comentario placeholder de lineas 187-196)
- **Trigger de ask-on-risk**: **No** (Riesgo bajo, ~30 LOC)
- **Commits atomicos del sub-slice**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `ci(workflows): reemplazar placeholder BDD/e2e con job BDD (Cucumber)` | Anexa el bloque `bdd:` de design §3.1 verbatim (services: postgres:16-alpine + healthcheck, bloque env reflejando el job `test`, prisma generate/deploy, `pnpm turbo run bdd`). Remueve el bloque de comentario placeholder de lineas 187-196. Preserva el set de disparadores; `needs: [static, test]`; `timeout-minutes: 30`. Sin job e2e (diferido). Un solo commit porque la forma YAML es inseparable de su ubicacion + remocion del placeholder. |

- **Archivos tocados** (con delta de LOC):
  - `.github/workflows/ci.yml` — anexa 5to job (+30 LOC, -10 comentario placeholder = +20 neto)
  - Total: +20 LOC
- **Comandos de verificacion**:
  ```bash
  # Forma YAML (local):
  node -e "const yaml=require('yaml');const fs=require('fs');const j=yaml.parse(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log(Object.keys(j.jobs||{}));"
  # Esperado exactamente: [ 'static', 'build', 'test', 'e2e', 'bdd' ] (e2e es el placeholder diferido; bdd es el nuevo — verificar orden + presencia)
  grep -q "bdd:" .github/workflows/ci.yml && grep -q "needs: \[static, test\]" .github/workflows/ci.yml && grep -q "postgres:16-alpine" .github/workflows/ci.yml && grep -q "pnpm turbo run bdd" .github/workflows/ci.yml && echo OK
  # Set de disparadores sin cambios:
  grep -A4 "^on:" .github/workflows/ci.yml
  # Lint:
  pnpm lint:fixtures
  # Sin regresiones en otros jobs:
  pnpm turbo run static test build
  # Accion requerida (post-merge): abrir un PR de prueba; confirmar que aparece el check `BDD (Cucumber)`; revertir el bridge de auth; confirmar que el check FALLA; revertir el revert.
  ```
- **Fuera de alcance para este PR**:
  - Agregar el job de Playwright e2e (la mitad diferida del placeholder)
  - Agregar `actions/upload-artifact` (GitHub retiene logs de step 90 dias)
  - Extraccion de anchors YAML (rechazado en design §3.2)
  - Cambiar el set de disparadores `on:`
  - Cualquier cambio de codigo fuera de `.github/workflows/ci.yml`

---

## PR #3 — Sub-slice 8.3 — Cableado del lint de Markdown

- **Titulo del PR**: `chore(lint): slice 8 PR-3 — cablear @eslint/markdown y activar no-mojibake-in-docs en tiempo de lint`
- **Nombre de rama**: `feat/v1.1.2-slice-8-markdown-lint`
- **Branch base**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; puede correr **en paralelo con PR #4-#8** despues de que PR #1+PR #2 mergeen — cero deps con el sub-slice de docs)
- **Sub-slice**: 8.3
- **LOC estimado**: ~50 (1 import + 1 bloque de parser + 1 bloque de regla + 6 LOC de fixture + rama multi-invalid del runner + escaneo del arbol de produccion ~10 LOC)
- **Trigger de ask-on-risk**: **No** (Riesgo bajo, ~50 LOC, bien dentro del presupuesto)
- **Commits atomicos del sub-slice**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `test(lint): agregar fixture RED de triangulacion para no-mojibake-in-docs (secondCjkLine)` | RED segun TDD estricto. Agregar `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` con un unico codepoint CJK en **linea 5** (NO linea 1), forzando a la regla a escanear el documento completo, no la primera linea. La nueva fixture es rechazada por la rama "ambiguous invalid" del runner (lineas 137-145 de `run-fixtures.mjs`) → RED: `pnpm lint:fixtures` sale con codigo no cero. |
| 2 | `chore(deps): pinear @eslint/markdown@8.0.3 (exacto, sin caret)` | Pin exacto a `8.0.3` en `devDependencies` del `package.json` raiz. El pin es obligatorio segun slice-1 §5 mitigacion de Stack-churn + spec §8.3 lineas 329-336 (el parser ha enviado cambios incompatibles de API de parser historicamente). Documentar el procedimiento de bump en el cuerpo del commit. |
| 3 | `feat(lint): cablear parser @eslint/markdown y bloque de regla para Documents-es/**/*.md` | Dos inserciones en `eslint.config.mjs` segun design §4.2: (a) bloque de parser para `**/*.md` con `markdownParser`; (b) bloque de aplicacion de regla para `Documents-es/**/*.md` que reusa el import `boundary` existente (linea 13) y aplica `no-mojibake-in-docs` con severidad `error`. La fixture del commit #1 ahora es alcanzable por ESLint; `pnpm lint` sale con codigo no cero en `Documents-es/docs/architecture.md` si se agrega un caracter CJK (round-trip). |
| 4 | `feat(lint-runner): soportar fixtures multi-invalid solo para no-mojibake-in-docs` | GREEN-1/2. Segun design §4.4 Opcion A: agregar boolean `allowMultipleInvalids: true` a la entrada del array `RULES` para `no-mojibake-in-docs`; guardar el throw "ambiguous invalid" existente (lineas 137-145) para que multi-invalid se permita solo cuando la flag esta activa. Las otras 4 reglas `.ts` retienen su invariante de exactamente-uno. |
| 5 | `feat(lint-runner): escanear Documents-es/**/*.md de produccion por CJK` | GREEN-2/2. Segun design §4.5: despues del loop de fixtures por regla, globear `Documents-es/**/*.md`, correr `findCjkInText` sobre cada uno, salir 1 con la ruta del archivo ofensor en cualquier hit. Excluye `__fixtures__/` via el ignore existente de `eslint.config.mjs` linea 30. |

- **Archivos tocados** (con delta de LOC):
  - `package.json` (raiz) — +1 entrada devDep (`@eslint/markdown: 8.0.3`)
  - `eslint.config.mjs` — +1 import, +2 bloques de config (~12 LOC)
  - `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` — rama multi-invalid + escaneo del arbol de produccion (~25 LOC)
  - `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` — NUEVO (~6 LOC)
  - Total: ~44 LOC
- **Comandos de verificacion**:
  ```bash
  # Pin:
  node -e "const p=require('./package.json');console.log(p.devDependencies['@eslint/markdown'])" # "8.0.3" exacto, sin caret
  # Fixture (commits 1, 4):
  pnpm lint:fixtures
  # Esperadas 5 entradas PASS: invalid.md, secondCjkLine.invalid.md, valid.md, mas las 4 reglas .ts.
  # Round-trip negativo (commit 3):
  cp Documents-es/docs/architecture.md /tmp/x.md
  printf '\xe6\xbc\xa2' >> /tmp/x.md
  # Re-correr escaneo de produccion; esperar FAIL con archivo ofensor + offset.
  mv /tmp/x.md Documents-es/docs/architecture.md
  pnpm lint:fixtures   # demostracion RED: debe fallar.
  # Revertir la mutacion:
  git checkout Documents-es/docs/architecture.md
  pnpm lint:fixtures   # de vuelta a GREEN
  # Las otras 4 reglas sin afectarse:
  grep -c '"invalid"' tools/eslint-plugin-boundary/__fixtures__/{no-prisma-outside-core,no-schemas-outside-shared,no-client-server-import,no-cross-module-import}/invalid.{ts,md} 2>&1 | grep -v ':1$' || echo "OTHER-RULES-INVARIANT-INTACT"
  ```
- **Fuera de alcance para este PR**:
  - Refactorizar `tools/eslint-plugin-boundary` a TypeScript (fuera de alcance item 7)
  - Agregar mas reglas mas alla de `no-mojibake-in-docs`
  - Tocar deps de `package.json` distintos de `@eslint/markdown`
  - Tocar contenido de `docs/` o `Documents-es/` (este PR NO agrega nuevos espejos; solo valida los existentes)

---

## PR #4 — Sub-slice 8.4 PR-A1 — Prosa de arquitectura §1-§6 (solo ingles)

- **Titulo del PR**: `docs(architecture): slice 8 PR-4 — prosa de arquitectura secciones 1-6 (EN)`
- **Nombre de rama**: `feat/v1.1.2-slice-8-docs-arch-a1`
- **Branch base**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; paralelizable con PR #3 + PR #5-#8 despues de que PR #1+PR #2 mergeen)
- **Sub-slice**: 8.4 PR-A1
- **LOC estimado**: ~350 (secciones 1-6 EN; sin espejo en este PR)
- **Trigger de ask-on-risk**: **No** (Bajo/Med; ≤350 LOC es el umbral del usuario para auto-proceder; el `ask-on-risk` es para PR-A2 en adelante)
- **Commits atomicos del sub-slice**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(architecture): reescribir stub secciones 1-3 (overview, layout del repo, tooling del monorepo)` | Primera mitad de PR-A1. Secciones 1-3 segun la tabla de design §5.1: `# Architecture` + Overview + non-goals (~40 LOC), `## Repository layout` (~100 LOC), `## Monorepo tooling` (~60 LOC). Total ~200 LOC. Sin espejo en espanol todavia (commit aparte en PR-A2). |
| 2 | `docs(architecture): agregar secciones 4-6 (auth, transactions, libs/core)` | Segunda mitad de PR-A1. Seccion 4 (`## Domain design — auth`), Seccion 5 (`## Domain design — transactions`), Seccion 6 (`## libs/core (database, events, config)`). ~150 LOC. Cada seccion abre con un enunciado de invariante imperativo, termina con anchor `{ #section-N }`. PR-A1 total ~350 LOC. |

- **Archivos tocados** (con delta de LOC):
  - `docs/architecture.md` — REESCRITURA: 77 → ~350 LOC (+273 LOC)
  - Total: +273 LOC
- **Comandos de verificacion**:
  ```bash
  wc -l docs/architecture.md                                # esperar ~350 (bajo 400, ≥300)
  grep -cE '^## ' docs/architecture.md                       # esperar 6 encabezados de seccion (1-6)
  grep -qE '^# Architecture' docs/architecture.md && echo "title-ok"
  for n in 1 2 3 4 5 6; do
    grep -qE "^## .*\\(section-$n\\)|{ #section-$n }" docs/architecture.md || echo "MISSING-anchor-$n"
  done
  # Presupuestos de seccion (de spec §8.4 tabla 462):
  pnpm lint:fixtures                                        # docs intactos → sigue green
  git diff --stat bb25aab..HEAD -- docs/ Documents-es/ | tail -1   # solo arquitectura EN
  ```
- **Fuera de alcance para este PR**:
  - Secciones 7-12 (PR-A2)
  - Cualquier archivo en `Documents-es/` (espejo en PR-A2 segun AGENTS.md §13)
  - `docs/migration-playbook.md` y `scripts/migrate/*.sh`
  - Cambios de codigo/test fuera de `docs/architecture.md`

---

## PR #5 — Sub-slice 8.4 PR-A2 — Prosa de arquitectura §7-§12 (ingles) + espejo completo en espanol

- **Titulo del PR**: `docs(architecture): slice 8 PR-5 — arquitectura §7-12 EN + espejo ES completo`
- **Nombre de rama**: `feat/v1.1.2-slice-8-docs-arch-a2`
- **Branch base**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker)
- **Sub-slice**: 8.4 PR-A2
- **LOC estimado**: ~550 (secciones 7-12 EN ~200 LOC + espejo completo ~350 LOC = ~550)
- **Trigger de ask-on-risk**: **Si** (Alto; 550 LOC > presupuesto de 400; el orquestador MUST detenerse antes de apply y preguntar al usuario segun `delivery_strategy=ask-on-risk` — confirmar el split O aceptar un `size:exception`)
- **Commits atomicos del sub-slice**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(architecture): agregar secciones 7-12 (utils, slicing, BDD, ESLint, branches, glossary)` | Secciones 7-12 segun design §5.1: `## libs/shared-utils` (~25 LOC), `## Slicing contract` (~60 LOC), `## BDD colocated strategy` (~40 LOC), `## ESLint boundaries` (~60 LOC), `## Branch model + SDD workflow` (~40 LOC), `## Glossary + cross-references` (~25 LOC). Total ~250 LOC. Combinado con los ~350 LOC de PR-A1, `docs/architecture.md` queda en ~600 LOC (tope duro segun spec). |
| 2 | `docs(architecture): espejar al espanol (Documents-es/docs/architecture.md)` | Regla dura AGENTS.md §13: cada doc EN se entrega con su espejo ES en el mismo commit atomico. Traduccion tecnica segun design §5.4. Las secciones 7-12 se traducen frescas; las secciones 1-6 reflejan la wording de PR-A1. Terminos estandar de la industria quedan en ingles (`commit`, `merge`, `branch`, `ADR`, `PR`, `slice`, `feature`, `workspace`, etc.). Los paths de archivo y contenidos de code-block quedan verbatim. |

- **Archivos tocados** (con delta de LOC):
  - `docs/architecture.md` — anexa secciones 7-12 (+250 LOC; total ahora ~600 LOC, en el tope duro)
  - `Documents-es/docs/architecture.md` — NUEVO (espejo) ~600 LOC
  - Total: ~850 LOC (el delta LOC del PR es lo que dispara ask-on-risk; ~600 LOC combinados de expansion EN encima de los ~350 LOC ya mergeados de PR-A1)
- **Comandos de verificacion**:
  ```bash
  # EN:
  wc -l docs/architecture.md                                       # 550-600 (tope segun spec §8.4)
  grep -cE '^## ' docs/architecture.md                             # 12 encabezados de seccion
  # Espejo ES + limpio de CJK (AGENTS.md §13 + design §5.4):
  ls Documents-es/docs/architecture.md && wc -l Documents-es/docs/architecture.md   # existe, ~600
  grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md   # MUST salir 1 (sin match)
  echo "mojibake-check: $?"                                        # 1
  # La regla ESLint se dispara:
  pnpm lint && echo "ESLINT-OK"                                    # sale 0 con la regla activa
  # Distribucion de LOC de los espejos:
  diff <(awk '/^## /{print}' docs/architecture.md) <(awk '/^## /{print}' Documents-es/docs/architecture.md) | head -5
  # Esperado: 0 lineas de diff (conjunto de encabezados identico)
  ```
- **Fuera de alcance para este PR**:
  - `docs/migration-playbook.md` (PR-B1 lo comienza)
  - `scripts/migrate/*.sh` (PR-C)
  - Modificar la prosa EN; este PR es solo-append (secciones 1-6 ya mergeadas en PR-A1)
  - Cualquier archivo no-doc/no-Markdown-es

---

## PR #6 — Sub-slice 8.4 PR-B1 — Playbook de migracion §1-§7 (solo ingles)

- **Titulo del PR**: `docs(playbook): slice 8 PR-6 — playbook de migracion secciones 1-7 (EN)`
- **Nombre de rama**: `feat/v1.1.2-slice-8-docs-playbook-b1`
- **Branch base**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; paralelizable con PR #3 / PR #7 / PR #8)
- **Sub-slice**: 8.4 PR-B1
- **LOC estimado**: ~550 (secciones 1-7 EN, incluyendo los 21 pares de bloques fenceados que exige spec §8.4 escenario 575-577 para etapas 00-50)
- **Trigger de ask-on-risk**: **Si** (Alto; 550 LOC > presupuesto de 400; el orquestador MUST detenerse segun `ask-on-risk`)
- **Commits atomicos del sub-slice**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(playbook): agregar secciones 1-3 (proposito + etapas 00, 10) con ≥3 snippets antes/despues cada una` | Seccion 1 (`# Migration playbook` + Proposito/audiencia) ~40 LOC. Seccion 2 (`## Stage 00 — preflight`) ~80 LOC con 3 pares de snippets antes/despues (72 LOC de bloques fenceados). Seccion 3 (`## Stage 10 — extract domain`) ~120 LOC con 3 pares de snippets. Total ~240 LOC. |
| 2 | `docs(playbook): agregar secciones 4-5 (etapas 20, 30) con ≥3 snippets antes/despues cada una` | Seccion 4 (`## Stage 20 — create feature slice`) ~120 LOC. Seccion 5 (`## Stage 30 — wire routes`) ~100 LOC. Cada una con 3 pares de snippets antes/despues (≥42 bloques fenceados acumulados). Total ~220 LOC. |
| 3 | `docs(playbook): agregar secciones 6-7 (etapas 40, 50) con ≥3 snippets antes/despues cada una` | Seccion 6 (`## Stage 40 — port tests (Vitest + BDD)`) ~100 LOC. Seccion 7 (`## Stage 50 — update docs`) ~80 LOC. 3 pares de snippets cada una. Total ~180 LOC. |

- **Archivos tocados** (con delta de LOC):
  - `docs/migration-playbook.md` — NUEVO ~640 LOC (3 commits aterrizan ~640 LOC; el presupuesto ~550 de PR-B1 es la porcion EN excluyendo las secciones finales 8-11)
  - Total: +640 LOC (excede el ~550 estimado de la fila PR-#6 porque la tabla de design en linea 513 presupuesta solo secciones 1-7; PR #6 aterrizara ligeramente sobre el estimado de design si las secciones se superponen. El umbral ask-on-risk del orquestador es estricto en 400 LOC; este PR esta bien arriba y dispara ask-on-risk.)
- **Comandos de verificacion**:
  ```bash
  wc -l docs/migration-playbook.md                                  # esperar ~640 (PR-B1 se detiene antes de secciones 8-11)
  grep -cE '^## ' docs/migration-playbook.md                        # 7 encabezados de seccion (1-7)
  # Spec §8.4 escenario 575: ≥42 bloques fenceados (= 3 snippets × 2 fences × 7 etapas)
  grep -cE '^\s*```' docs/migration-playbook.md                     # esperar ≥42
  # Cada etapa tiene 3 pares antes/despues:
  for s in 00 10 20 30 40 50; do
    n=$(awk "/^## Stage $s/,/^## Stage /" docs/migration-playbook.md | grep -cE '^\s*```')
    [ "$n" -ge 6 ] || echo "MISSING-snippets-stage-$s (got $n fences; need >= 6 = 3 pairs)"
  done
  pnpm lint:fixtures                                                 # ESLint limpio (sin cambio EN a Documents-es)
  git diff --stat bb25aab..HEAD -- Documents-es/ | tail -1          # Documents-es sin cambios en PR-B1
  ```
- **Fuera de alcance para este PR**:
  - Secciones 8-11 del playbook (PR-B2)
  - Espejo en espanol de cualquier seccion (PR-B2)
  - `scripts/migrate/*.sh` (PR-C; la prosa los referencia solo por nombre — ver spec §8.4 linea 564)
  - Cualquier codigo/test/archivo fuera de `docs/migration-playbook.md`

---

## PR #7 — Sub-slice 8.4 PR-B2 — Playbook de migracion §8-§11 (ingles) + espejo completo en espanol

- **Titulo del PR**: `docs(playbook): slice 8 PR-7 — playbook §8-11 EN + espejo ES completo`
- **Nombre de rama**: `feat/v1.1.2-slice-8-docs-playbook-b2`
- **Branch base**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; paralelizable con PR #3 / PR #8)
- **Sub-slice**: 8.4 PR-B2
- **LOC estimado**: ~700 (secciones 8-11 EN ~330 LOC + espejo EN→ES completo ~620 LOC = ~950 LOC)
- **Trigger de ask-on-risk**: **Si** (Alto; 950 LOC netas; el orquestador MUST detenerse segun `ask-on-risk` — el usuario confirma el split O acepta `size:exception`)
- **Commits atomicos del sub-slice**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(playbook): agregar secciones 8-9 (etapa 99 finalize, loop de enforcement ESLint)` | Seccion 8 (`## Stage 99 — finalize`) ~75 LOC. Seccion 9 (`## ESLint boundaries as the enforcement loop`) ~40 LOC. Total ~115 LOC. |
| 2 | `docs(playbook): agregar secciones 10-11 (cuando @core/events, glossary) + cross-refs` | Seccion 10 (`## When to introduce @core/events`) ~40 LOC. Seccion 11 (`## Cross-references + glossary`) ~25 LOC. Cierra el playbook en ~750-820 LOC totales (EN). |
| 3 | `docs(playbook): espejar al espanol (Documents-es/docs/migration-playbook.md)` | AGENTS.md §13: el espejo ES se entrega en el mismo commit-o-cadena-de-commits atomicos que el EN que refleja. Traduccion tecnica al espanol completa de todo el `docs/migration-playbook.md` (secciones 1-11). Terminos estandar de la industria segun la lista de design §5.4. Los code blocks fenceados quedan verbatim (nunca se traducen). |

- **Archivos tocados** (con delta de LOC):
  - `docs/migration-playbook.md` — anexa secciones 8-11 (+ ~180 LOC)
  - `Documents-es/docs/migration-playbook.md` — NUEVO ~750 LOC
  - Total: ~930 LOC
- **Comandos de verificacion**:
  ```bash
  # EN total:
  wc -l docs/migration-playbook.md                                   # 750-820 (tope 1000)
  grep -cE '^## ' docs/migration-playbook.md                         # 11 (secciones 1-11)
  # Conteo final de bloques fenceados:
  grep -cE '^\s*```' docs/migration-playbook.md                      # ≥ 42 (3 × 2 × 7 etapas minimo segun spec §8.4)
  # Espejo ES:
  wc -l Documents-es/docs/migration-playbook.md                      # 700-900
  diff <(grep -E '^## ' docs/migration-playbook.md) <(grep -E '^## ' Documents-es/docs/migration-playbook.md) | head -5
  echo "heading-parity: $?"                                           # esperar 0
  # Limpio de CJK:
  grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/migration-playbook.md ; echo "mojibake-exit: $?"  # 1 = sin match
  # ESLint se dispara (commit 3 de PR #3 + el espejo de este PR pasan):
  pnpm lint && echo "ESLINT-OK"
  # Seccion §10 menciona @core/events:
  grep -E '^## When to introduce @core/events' docs/migration-playbook.md && echo "events-section-ok"
  ```
- **Fuera de alcance para este PR**:
  - `scripts/migrate/*.sh` (PR-C)
  - Modificar las secciones 1-7 EN (ya mergeadas via PR-B1)
  - Cambios de codigo/test/Markdown-es fuera de los dos archivos nombrados
  - Migrar `gastos-personales/` (fuera de alcance item 3)

---

## PR #8 — Sub-slice 8.4 PR-C — Siete scripts idempotentes de migracion + test de idempotencia

- **Titulo del PR**: `feat(migrate): slice 8 PR-8 — siete scripts idempotentes de etapa + test de idempotencia shell`
- **Nombre de rama**: `feat/v1.1.2-slice-8-migrate-scripts`
- **Branch base**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; paralelizable con PR #6 / PR #7 / PR #3)
- **Sub-slice**: 8.4 PR-C
- **LOC estimado**: ~150 (7 × ~10 LOC de shells + ~50 LOC de test bash de idempotencia + helper `ensure-tools.sh` compartido)
- **Trigger de ask-on-risk**: **No** (Riesgo bajo; LOC netas bien dentro del presupuesto)
- **Commits atomicos del sub-slice**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `feat(scripts): crear scripts/migrate/ con ensure-tools.sh y 00-preflight.sh` | Scaffold RED + primer GREEN. Crear el directorio `scripts/` + `scripts/migrate/ensure-tools.sh` (helper compartido que verifica presencia de `pnpm`/`docker`/`git`/Node 22). `00-preflight.sh` corre `ensure-tools.sh` + `git status --porcelain` (se requiere vacio), imprime `preflight: OK` en exito, `preflight: already applied` en re-run. Idempotencia: re-correr en una rama limpia es no-op. |
| 2 | `feat(scripts): agregar 10-extract-domain.sh y 20-create-feature-slice.sh` | Etapas 10 y 20. Ambos siguen el header comun (`set -euo pipefail` + comentario de header de Decision Bloqueada #4 de slice-1) y el contrato de idempotencia de design §5.3. `10-extract-domain.sh <feature>` protege sobre target no vacio (sale 0 + `already applied`). `20-create-feature-slice.sh <feature>` protege sobre el dir de slice existente. |
| 3 | `feat(scripts): agregar 30-wire-routes.sh y 40-port-tests.sh` | Etapas 30 y 40. `30-wire-routes.sh <feature>` es en si mismo idempotente para el append de paths en `tsconfig.base.json` (salta si `@features/<feature>` ya esta en el archivo). `40-port-tests.sh <feature>` cuenta los tests antes/despues; la segunda corrida imprime `already applied` si el conteo no cambia. |
| 4 | `feat(scripts): agregar 50-update-docs.sh y 99-finalize.sh` | Etapas 50 y 99. `50-update-docs.sh <feature>` verifica el anchor `{ #<feature> }` tanto en `docs/architecture.md` como en su espejo ES antes de salir (idempotencia). `99-finalize.sh <feature>` corre `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @features/<feature> bdd`; usa un archivo marker `.migration-<feature>-done` para la idempotencia. |
| 5 | `test(scripts): agregar idempotency.test.sh — cada script corre dos veces, sale 0 en ambas corridas` | RED luego GREEN. Para cada uno de los 7 scripts: lanzar el script en un worktree git temp desde una rama limpia, correrlo dos veces, afirmar salida 0 en ambas. Afirmar que la segunda invocacion imprime `already applied` (o equivalente a stage-NN). Usar un loop bash minimo (sin dependencia de `bats` segun design §5.3 / recomendacion de pregunta abierta §12.2). |

- **Archivos tocados** (con delta de LOC):
  - `scripts/migrate/ensure-tools.sh` — NUEVO ~15 LOC
  - `scripts/migrate/00-preflight.sh` — NUEVO ~20 LOC
  - `scripts/migrate/10-extract-domain.sh` — NUEVO ~15 LOC
  - `scripts/migrate/20-create-feature-slice.sh` — NUEVO ~15 LOC
  - `scripts/migrate/30-wire-routes.sh` — NUEVO ~15 LOC
  - `scripts/migrate/40-port-tests.sh` — NUEVO ~15 LOC
  - `scripts/migrate/50-update-docs.sh` — NUEVO ~15 LOC
  - `scripts/migrate/99-finalize.sh` — NUEVO ~25 LOC
  - `scripts/migrate/__tests__/idempotency.test.sh` — NUEVO ~50 LOC
  - Total: ~185 LOC
- **Comandos de verificacion**:
  ```bash
  # Shellcheck (politica del proyecto + design §5.3):
  shellcheck scripts/migrate/*.sh scripts/migrate/__tests__/idempotency.test.sh && echo "shellcheck-ok"
  # Test de idempotencia corre dos veces por script:
  bash scripts/migrate/__tests__/idempotency.test.sh   # sale 0; reporta 7 PASS
  # Round-trip una migracion falsa:
  bash scripts/migrate/00-preflight.sh                 # "preflight: OK"
  bash scripts/migrate/00-preflight.sh                 # "preflight: already applied" (o equivalente no-op)
  # Header comun enforzado en los 7:
  for f in scripts/migrate/*.sh; do
    head -5 "$f" | grep -q '^set -euo pipefail$' || echo "MISSING-strict-mode: $f"
  done
  # El marker de idempotencia de cada script existe:
  grep -E 'already applied|already finalized' scripts/migrate/*.sh | wc -l   # esperar ≥ 7 (uno por script)
  # Sin regresion en docs (la fixture de la regla de lint sigue pasando):
  pnpm lint:fixtures
  ```
- **Fuera de alcance para este PR**:
  - `bats` como framework de test (rechazado por design; se usa loop bash)
  - Migrar realmente `gastos-personales/` (fuera de alcance item 3)
  - Agregar slices nuevos — los scripts reciben `<feature>` como argumento posicional
  - Nada bajo `docs/` o `Documents-es/`
  - Cambiar YAML, config de ESLint, o cualquier codigo fuera de `scripts/migrate/`

---

## Grafo de dependencias (despues de que el usuario partio 8.4 en 5 PRs)

```
                bb25aab (develop)
                       │
                       ▼
       [tracker] feat/v1.1.2-slice-8-closing-bdd-and-docs
                       │
        ┌──────────────┼───────────────────────────────┐
        │              │                               │
        ▼              ▼                               ▼
    PR #1            PR #2                         (remaining)
   8.1 auth          8.2 BDD                       PRs open
   bridge            CI gate                       against tracker
   (merge first)     (depends on                   in parallel
        │            PR #1 having
        │            merged — the
        │            `needs: [static,
        │            test]` job runs
        │            only if PR #1
        │            fix is on develop)
        ▼
  After both #1, #2 merge into develop,
  the tracker rebases/fast-forwards:
                  PR #3              PR #4           PR #5         PR #6          PR #7         PR #8
                  8.3 markdown       8.4 arch        8.4 arch      8.4 play-      8.4 play-     8.4 migrate
                  lint               §1-6 EN         §7-12 EN+ES   book §1-7 EN   book §8-11+ES scripts
                  (no deps)          (no deps)       (after #4)    (no deps)      (after #6)    (no deps)
                  └──────┬───────────┴──────┬────────┴──────┬──────┴──────┬───────┘
                         │                  │               │             │
                         └────── parallel against tracker after PR #1 + PR #2 merge ──────┘
                                                  │
                                                  ▼
                                       tracker stays open/draft
                                       until all 8 PRs merged
                                                  │
                                                  ▼
                                   squash-merge tracker → develop
```

- **Ordenamiento duro**: PR #1 MUST aterrizar antes de PR #2 (el job CI de BDD se trabaria en timeouts con el bridge de auth roto).
- **Paralelizables**: PR #3, PR #4, PR #6, PR #8 — cero dependencias mutuas; abrir contra el tracker.
- **Ordenamiento blando**:
  - PR #5 depende de PR #4 (PR #5 anexa a `docs/architecture.md`; PR #4 lo creo). Si se secuencializa el orquestador MUST serializar.
  - PR #7 depende de PR #6 (PR #7 cierra el playbook). Si se secuencializa el orquestador MUST serializar.
- **Los cinco PRs de 8.4 pueden correr independientemente** si el orquestador esta dispuesto a sobrescribir el mismo archivo en paralelo (INSEGURO — tocan la misma fuente EN); la cadena de dependencias documenta el orden seguro.

## Branch target del PR chain

`feat/v1.1.2-slice-8-closing-bdd-and-docs` (refleja la convencion de tracker de slice-7; bump de minor version desde `v1.0.x` porque este es un slice de feature, no un patch).

- Creada off `develop` como primera accion de la fase de apply.
- Permanece **draft / no-merge** hasta que los 8 PRs hijos aterricen (segun el contrato `feature-branch-chain` de la skill `chained-pr`).
- **PR #1 apunta al tracker** (el tracker se crea justo antes de que PR #1 abra; PR #1 re-apunta al tracker para el segundo push, o PR #1 apunta al tracker recien-creado desde el inicio — la skill `chained-pr` instruye "el PR hijo #1 apunta al branch tracker"). Decision: **PR #1 apunta al tracker**, no a `develop`. Los hijos subsequentes tambien apuntan al tracker; el tracker rebasea sobre `develop` despues de cada merge.
- Squash-merge final del tracker a `develop` cierra el slice 8; `develop` avanza desde `bb25aab`.

## Estrategia de apply

El orquestador aplica **un PR a la vez** porque cada uno abre un PR de GitHub y espera el merge. Orden:

```
1. Crear tracker: feat/v1.1.2-slice-8-closing-bdd-and-docs off develop
2. Abrir PR #1 (8.1) apuntando al tracker → esperar merge
3. Abrir PR #2 (8.2) apuntando al tracker → esperar merge
4. Rebase del tracker sobre develop (ya adelante gracias a #1, #2)
5. Abrir PRs #3, #4, #6, #8 en paralelo contra el tracker → esperar merges (independientes)
6. Abrir PR #5 (8.4 PR-A2) apuntando al tracker → ask-on-risk → esperar merge
7. Abrir PR #7 (8.4 PR-B2) apuntando al tracker → ask-on-risk → esperar merge
8. Squash-merge del tracker → develop
9. Verificar en develop:
   pnpm turbo run static build lint typecheck test bdd
   pnpm lint:fixtures
   grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md  # esperar exit 1
```

Ramas `feat/*` concretas:

```bash
# 1. tracker
git checkout -b feat/v1.1.2-slice-8-closing-bdd-and-docs develop
git push -u origin feat/v1.1.2-slice-8-closing-bdd-and-docs

# 2. PR #1 hijo off tracker
git checkout -b feat/v1.1.2-slice-8-auth-bridge feat/v1.1.2-slice-8-closing-bdd-and-docs
# ... commits 1-3 ...
git push -u origin feat/v1.1.2-slice-8-auth-bridge
gh pr create --base feat/v1.1.2-slice-8-closing-bdd-and-docs --title "feat(auth): slice 8 PR-1 — auth BDD bridge GREEN" --body-file .github/PULL_REQUEST_TEMPLATE.md

# 3. PR #2 hijo off tracker (despues del merge de #1)
git checkout -b feat/v1.1.2-slice-8-ci-bdd-gate feat/v1.1.2-slice-8-closing-bdd-and-docs
# ...

# 4. PRs paralelos #3, #4, #6, #8
# ... todos branched off el tracker, todos abiertos al mismo tiempo ...

# 5-6. PR #5 y PR #7 cada uno bloquea en ask-on-risk; el orquestador MUST pausar antes de apply

# 7. squash-merge del tracker
gh pr merge --squash <tracker-PR-number>  # despues de que los 8 hijos mergeen
```

## Pronostico de carga de revision

| PR  | Sub-slice                | Rama                                                 | LOC est. | presupuesto (400) | ask-on-risk |
| --- | ------------------------ | ---------------------------------------------------- | -------: | :---------------: | :---------: |
| 1   | 8.1 fix auth BDD bridge  | `feat/v1.1.2-slice-8-auth-bridge`                    |    ~180  |       OK          |     No      |
| 2   | 8.2 CI BDD gate          | `feat/v1.1.2-slice-8-ci-bdd-gate`                    |     ~20  |       OK          |     No      |
| 3   | 8.3 wire markdown lint   | `feat/v1.1.2-slice-8-markdown-lint`                  |     ~50  |       OK          |     No      |
| 4   | 8.4 PR-A1 (arch §1-6 EN) | `feat/v1.1.2-slice-8-docs-arch-a1`                   |    ~273  |       OK          |     No      |
| 5   | 8.4 PR-A2 (arch §7-12 + ES) | `feat/v1.1.2-slice-8-docs-arch-a2`                |    ~850  |      OVER         |   **YES**   |
| 6   | 8.4 PR-B1 (playbook §1-7 EN) | `feat/v1.1.2-slice-8-docs-playbook-b1`            |    ~640  |      OVER         |   **YES**   |
| 7   | 8.4 PR-B2 (playbook §8-11 + ES) | `feat/v1.1.2-slice-8-docs-playbook-b2`          |    ~930  |      OVER         |   **YES**   |
| 8   | 8.4 PR-C (7 sh + test)   | `feat/v1.1.2-slice-8-migrate-scripts`                |    ~185  |       OK          |     No      |
|     | **TOTAL**                |                                                      |  **~3128** |                 |             |

**Opcion de re-split que el orquestador MUST presentar al momento del apply si se dispara ask-on-risk** (segun tabla 698-707 de design §5.5 / spec §8.4 review-workload):

| Alternativa | Contenido del sub-slice | LOC est. |
| --- | --- | --- |
| alt-8.4 #6s | Partir PR #6 en PR-#6a (playbook §1-4 EN) + PR-#6b (playbook §5-7 EN) | ~320 + ~320 |
| alt-8.4 #7s | Partir PR #7 en PR-#7a (playbook §8-11 EN) + PR-#7b (espejo ES completo) | ~180 + ~620 |
| alt-8.4 #5s | Partir PR #5 en PR-#5a (arch §7-12 EN) + PR-#5b (espejo ES completo) | ~250 + ~600 |
| `size:exception` | Aceptar PRs #5/#6/#7 en sus tamanos naturales | +0 |

El orquestador MUST presentar al usuario las tres opciones (mas split, `size:exception`, o diferir docs de 8.4 al slice 9) segun `delivery_strategy=ask-on-risk`.

## Fuera de alcance (slice completo)

(Reflejo de propuesta §4 + spec §"Fuera de alcance"; el orquestador MUST enforzar.)

1. Cualquier cosa en AGENTS.md §11 — i18n mas alla de en/es, Sentry, rate-limit, OAuth mas alla de Google, hardening de prod, observabilidad, UI de audit log, enforzamiento de gate de cobertura en CI, migracion de `gastos-personales/`.
2. Agregar escenarios BDD nuevos (slice 8 solo arregla el bridge).
3. Migrar `gastos-personales/` a vertical slicing.
4. Tocar la evidencia del chain del slice-7 (`a9b550d`, `bb25aab`).
5. Agregar el job de Playwright e2e a CI (diferido; la clave placeholder `e2e:` en `ci.yml` despues de este slice queda sin cambios en nombre; este slice solo agrega `bdd:`).
6. Reemplazar el patron del bridge de `a9b550d` con cualquier otra cosa.
7. Refactorizar `tools/eslint-plugin-boundary` a TypeScript.
8. Lenguaje de artefactos distinto del ingles (los strings de UI, comentarios, identificadores quedan en ingles; el espanol vive solo en el espejo).
9. Agregar un gate de cobertura a CI.
10. Construir la automatizacion del espejo OneNote.
11. Tocar `openspec/changes/vertical-slicing-reference-scaffold/` (la umbrella de slice-1 es inmutable).
12. Renombrar convenciones: pin exacto `@eslint/markdown@8.0.3` (sin otros bumps).
13. PR-C NO es un commit `feat:` para la base de codigo de produccion — agrega solo `scripts/migrate/` y su test (sin cambios en `src/`).

## Referencias cruzadas

- **Propuesta**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226)
- **Spec**: `openspec/changes/slice-8-closing-bdd-and-docs/spec.md` (Engram #2228)
- **Diseno**: `openspec/changes/slice-8-closing-bdd-and-docs/design.md` (Engram #2229)
- **Cierre del slice-7**: `bb25aab` en `develop` (squash de PR-51; 25/25 BDD de transactions PASS)
- **Patron de fix del bridge**: commit `a9b550d` (`libs/features/transactions/docs/support/register.ts` lineas 72-118 / 125-129 / 143-165)
- **Template de test de transactions**: `libs/features/transactions/docs/__tests__/register.test.ts` (177 LOC)
- **Decision Bloqueada #4 de slice-1** (formato dual del playbook): `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` linea 93
- **Tarea T8.5 de slice-1** (contrato de 7 scripts): `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` linea 876
- **AGENTS.md §4 (TDD estricto)**, **§5 (commits atomicos)**, **§6 (conventional commits)**, **§7 (fronteras)**, **§8 (SSoT)**, **§11 (fuera de alcance)**, **§13 (regla dura del espejo en espanol)**
- **openspec/config.yaml**: `strict_tdd: true`, `delivery_strategy: ask-on-risk`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

## Estado

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (work-unit-commits, branch-pr, chained-pr, tdd) · `risks`: R1 (INFO — la divergencia de world-contract de auth se resolvio en spec §"Preguntas abiertas resueltas" + design §2.6), R2 (WARNING — PRs #5/#6/#7 exceden 400; ask-on-risk se dispara segun design §10), R3 (SUGGESTION — `@eslint/markdown@8.0.3` pin exacto; procedimiento de bump en el cuerpo del commit de PR #3), R4 (WARNING — el bump del include en `vitest.config.ts` esta en alcance para PR #1 segun design §2.5), R5 (SUGGESTION — la rama multi-invalid del runner es booleano por-regla segun design §4.4; las otras 4 reglas retienen la disciplina de invalid-uno).

`next_recommended`: **`apply`** — el orquestador crea el tracker, luego aplica los PRs en el orden de arriba (PR #1 primero; PR #3+#4+#6+#8 en paralelo despues de los merges de PR #1+PR #2; PR #5/PR #7 cada uno gateado por ask-on-risk).
