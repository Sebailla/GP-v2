# Propuesta — `slice-8-closing-bdd-and-docs`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-12
> **Proyecto**: `gastos-personales-reference` · **Branch**: `develop` · tracker `feat/slice-8-closing-bdd-and-docs`
> **Almacen de artefactos**: hybrid · **Modo**: interactivo

---

## 1. Por que

El slice 7 cerro en `develop` (`bb25aab`, squash de PR-51) con **25/25 escenarios BDD de transactions pasando** mediante el fix del bridge en `a9b550d`. Ese fix expuso cuatro deudas abiertas:

1. **Auth tiene el mismo bug de bridge que transactions tuvo.** `libs/features/auth/docs/support/register.ts` (80 LOC) todavia usa el wrapper roto de rest-args `(world, ...args) => void | Promise<void>`; el `UserCodeRunner` de cucumber 13 lo marcara de la misma forma y cada escenario de auth hara timeout a 5000ms.
2. **BDD no tiene gate de CI.** `.github/workflows/ci.yml` termina con un placeholder documentado en la linea 188 ("When slice 7 lands the suite, add the BDD and e2e jobs back"). El commit del slice-7 aterrizo; el gate no.
3. **`no-mojibake-in-docs` esta cableada pero inerte.** El archivo de la regla es correcto, pero `@eslint/markdown` no esta en `eslint.config.mjs` y no hay **ninguna fixture `invalid.md`**; el drift de CJK puede aterrizar silenciosamente en `Documents-es/**/*.md`.
4. **Los docs son stubs.** `docs/architecture.md` tiene 77 LOC; `docs/migration-playbook.md` **no existe en disco**. El playbook es la razon por la que este repo existe — entregarlo sin el playbook es entregar un artefacto al 90%.

Este cambio cierra las cuatro deudas. No inicia ningun trabajo de feature nuevo.

---

## 2. Que cambia

Cuatro sub-slices, cada uno un PR encadenado bajo `feat/slice-8-closing-bdd-and-docs`.

### 2.1 Sub-slice 8.1 — fix del auth BDD bridge

- **Archivo**: `libs/features/auth/docs/support/register.ts` (reemplazar solo el wrapper)
- **Test**: nuevo `libs/features/auth/docs/__tests__/register.test.ts` espejando `libs/features/transactions/docs/__tests__/register.test.ts`
- **Patron**: reusar `buildWrapper(numCaptures, stepFn)` de `a9b550d`. Para N >= 1, sintetizar via `new Function()` para que `fn.length === N + 1`; la rama `callbackInterface` de cucumber 13 se dispara exclusivamente.
- **Disciplina**: tocar solo el bridge + agregar el test. NO modificar `cucumber.mjs`, `env-bootstrap.js`, `service-context.ts`, ni archivos `.feature`.
- **Resultado**: `cd libs/features/auth/server && pnpm bdd` → 18/18 PASS, <2s.

### 2.2 Sub-slice 8.2 — BDD como job de CI

- **Archivo**: `.github/workflows/ci.yml` (anexar 5to job)
- **Forma**: `bdd: needs: [static, test] · timeout-minutes: 30` · servicio Postgres 16-alpine (iguala al job `test` existente)
- **Pasos**: checkout → pnpm/action-setup → setup-node → `pnpm install --frozen-lockfile` → `prisma generate` → `prisma migrate deploy` → `pnpm turbo run bdd`
- **Disparador**: `pull_request` a `develop`/`main` + `push` a `develop`/`main` (iguala al set de disparadores existente)
- **Resultado**: futuras regresiones del bridge fallan al momento del PR con el log de cucumber.

### 2.3 Sub-slice 8.3 — cablear `@eslint/markdown` + activar `no-mojibake-in-docs`

- **Cableado del parser**: agregar `@eslint/markdown` a `eslint.config.mjs` como parser para `**/*.md`; agregar el plugin al objeto `plugins: { ... }` existente.
- **Fixture**: crear `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/invalid.md` con un caracter CJK intencional.
- **Runner**: actualizar `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` para incluir `Documents-es/**/*.md` en la lista de objetivos del lint.
- **Pin**: version exacta de `@eslint/markdown` en el `package.json` del workspace (segun slice-1 §5 mitigacion de "Stack churn").
- **Resultado**: `pnpm lint:fixtures` sale con 0 con la regla activa Y `pnpm lint` marca caracteres CJK en cualquier `Documents-es/**/*.md`.

### 2.4 Sub-slice 8.4 — expandir `docs/architecture.md` + escribir `docs/migration-playbook.md` (+ espejos)

- **`docs/architecture.md`**: expandir 77 → ~400-600 LOC. Secciones: `apps/web`, `apps/api`, `libs/core` (database/events/config), `libs/features/<x>/{client,server,shared}`, `libs/shared-utils`, convenciones de `docs/`, estrategia de BDD colocalizado, fronteras ESLint, modelo de ramas.
- **`docs/migration-playbook.md`**: **nuevo**, ~600-1000 LOC. Playbook concreto para migrar un monolito Next.js + NestJS a slices `libs/features/<x>/{client,server,shared}`. Incluye orden de extraccion slice por slice, ≥3 snippets antes/despues por etapa, fronteras ESLint como enforcer, formato dual `.md`+`.sh` del slice-1, cuando introducir `@core/events`.
- **Espejos en espanol**: `Documents-es/docs/architecture.md` + `Documents-es/docs/migration-playbook.md`. Traduccion tecnica, NO localizacion cultural. Terminos estandar de la industria quedan en ingles (`commit`, `merge`, `ADR`, `PR`, `branch`, `slice`).
- **Verificacion**: `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/<file>.md` retorna vacio.
- **Resultado**: ninguno de los dos docs en ingles es un stub; ambos espejos existen sin drift de CJK.

---

## 3. Impacto

**Toca**: `libs/features/auth/docs/support/register.ts` (~30-50 LOC), `libs/features/auth/docs/__tests__/register.test.ts` (NUEVO ~177 LOC), `.github/workflows/ci.yml` (+~30 LOC 5to job), `eslint.config.mjs` (parser + cableado del plugin), `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/invalid.md` (NUEVO 1-3 LOC), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (lista de objetivos), `docs/architecture.md` (77 → ~400-600 LOC), `docs/migration-playbook.md` (NUEVO ~600-1000 LOC), y sus espejos en espanol.

**Tamano vs presupuesto de revision de 400 lineas**: 8.1 ≈ 180-220 (1 PR), 8.2 ≈ 30-40 (1 PR), 8.3 ≈ 40-60 (1 PR), 8.4 ≈ 1500-2000 (**2 PRs encadenados**: PR-A = `architecture.md` + espejo; PR-B = `migration-playbook.md` + espejo). El `Review Workload Guard` del orquestador escala segun `delivery_strategy=ask-on-risk` si cualquier PR de 8.4 excede 400.

**NO cambia**: el layout de vertical-slicing, el modelo de ramas (`develop` de trabajo, `main` inmutable), el almacen de artefactos (`hybrid`), el pipeline SDD, la evidencia del chain del slice-7 (`a9b550d`, `bb25aab`, 25/25 BDD de transactions), ni la lista de fuera de alcance de AGENTS.md §11 (i18n mas alla de en/es, Sentry, rate-limit, OAuth mas alla de Google, hardening de prod, observabilidad, UI de audit log, migracion de `gastos-personales/`, enforzamiento de gate de cobertura en CI).

---

## 4. Fuera de alcance

1. Cualquier cosa en AGENTS.md §11 (i18n mas alla de en/es, Sentry, rate-limit, OAuth mas alla de Google, hardening de prod, observabilidad, UI de audit log, gate de cobertura, migracion de `gastos-personales/`).
2. Agregar escenarios BDD nuevos (este slice solo arregla el bridge).
3. Migrar `gastos-personales/` a vertical slicing — el playbook se entrega aqui; la migracion corre en un cambio aparte.
4. Tocar la evidencia del chain del slice-7 (`a9b550d`, `bb25aab`).
5. Agregar e2e a CI como job nuevo — el placeholder de slice-1 en linea 188 cubre tanto BDD como e2e; este slice agrega **solo** BDD.
6. Reemplazar el patron del bridge de `a9b550d` con cualquier otra cosa — reinventar esta prohibido.
7. Refactorizar `tools/eslint-plugin-boundary` a TypeScript (las reglas son `.cjs`; convertirlas es su propio cambio).
8. Lenguaje de artefactos distinto del ingles.

---

## 5. Criterios de exito

`sdd-verify` correra estas 25 puertas.

**BDD (G1–G5)**: `pnpm turbo run bdd` sale 0 en todos los workspaces; `pnpm bdd` en auth server → 18/18 PASS <2s; BDD de transactions sigue 25/25 (sin regresion); test de register de auth 2/2 PASS; test de register de transactions sigue 2/2 PASS.

**CI (G6–G8)**: `ci.yml` declara el job `bdd` con `needs: [static, test]`; el job corre `pnpm turbo run bdd` contra un servicio Postgres; en un PR a `develop`, el nuevo job aparece en la lista de checks de GitHub (post-merge).

**Lint (G9–G13)**: `pnpm lint:fixtures` sale 0 con `no-mojibake-in-docs` activa; `pnpm lint` marca CJK en cualquier `Documents-es/**/*.md` (round-trip); `eslint.config.mjs` declara `@eslint/markdown` como parser para `**/*.md`; la fixture `invalid.md` existe con ≥1 caracter CJK; la fixture `valid.md` sigue con cero CJK.

**Docs (G14–G18)**: `docs/architecture.md` ≥400 LOC con las secciones de §2.4; `docs/migration-playbook.md` existe ≥600 LOC con ≥3 snippets antes/despues; ambos espejos en espanol existen y reflejan al ingles; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md` retorna vacio.

**Higiene (G19–G25)**: sin commits a `main` (`git log main` sin cambios desde `bb25aab`); cuatro PRs encadenados bajo `feat/slice-8-closing-bdd-and-docs`; cada commit respeta atomic-commits + sin-Co-Authored-By + Conventional-Commits (AGENTS.md §5–§6); cada commit de docs incluye el espejo `Documents-es/` en el mismo commit (AGENTS.md §13); observacion Engram en `topic_key sdd/slice-8-closing-bdd-and-docs/proposal` existe con `type=architecture`, `project=gp-v2`, `scope=project`; `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` coincide con la observacion Engram; `openspec/changes/vertical-slicing-reference-scaffold/` queda intacto.

---

## 6. Riesgos

**R1 — El contrato del world del auth bridge difiere del de transactions (WARNING)**. El wrapper de transactions se aplico contra `setWorldConstructor(TransactionsWorldWrapper)`; el `service-context.ts` del slice auth puede vincular un tipo de world diferente, asi que copiar el bridge a ciegas podria leer el `this.inner` equivocado. **Mitigacion**: 8.1 DEBE leer `service-context.ts` (y `step-defs/world.ts` si existe) antes de aplicar. El test RED afirma el mismo contrato `(world.inner, capture_1, ..., capture_N)`. Si el world wrapper de auth difiere materialmente, escalar segun `ask-on-risk`.

**R2 — La expansion de docs excede el presupuesto de revision de 400 lineas (WARNING)**. §3 estima 8.4 en ~1500-2000 LOC; incluso partido en 2 PRs encadenados, PR-B (`migration-playbook.md` + espejo, ~1000 LOC) se ubica en ~2.5x el presupuesto. Segun `delivery_strategy=ask-on-risk`, el orquestador se detiene antes de aplicar 8.4 y ofrece tres opciones: (a) partir PR-B en 3 PRs (esqueleto, etapas, espejo espanol), (b) aceptar un `size:exception` explicito, (c) diferir el playbook al slice 9 y entregar solo la expansion de `architecture.md` en 8.4.

**R3 — `@eslint/markdown` es `0.x` y puede mover su API de parser (SUGGESTION)**. El parser ha enviado cambios de API de parser incompatibles entre versiones menores en el pasado. **Mitigacion**: pinear la version exacta en el `package.json` del workspace; documentar el pin en el cuerpo del commit de 8.3. Futuros bumps son mecanicos.

---

## 7. Rollback

**Cambio completo**: `git revert` del squash-merge de `feat/slice-8-closing-bdd-and-docs` a `develop`. La evidencia del chain del slice-7 (`a9b550d`, `bb25aab`) y todos los slices previos quedan intactos.

**Por sub-slice**: cada sub-slice es un objetivo de revert auto-contenido. 8.1 → BDD de auth vuelve a timeouts; 8.2 → CI pierde el gate BDD pero `pnpm bdd` local sigue funcionando; 8.3 → `no-mojibake-in-docs` vuelve a inerte; 8.4 → los docs vuelven a stubs (sin impacto en runtime).

**NO se hara**: force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/vertical-slicing-reference-scaffold/`, ni hacer amend de `a9b550d` / `bb25aab`.

---

## 8. Preguntas abiertas para `sdd-spec`

1. **Contrato de `setWorldConstructor` del slice auth** — ¿sigue `service-context.ts` la forma de `TransactionsWorldWrapper`? El sub-slice 8.1 necesita esto confirmado antes de aplicar el bridge; la fase de spec debe declarar el tipo del world de auth explicitamente.
2. **Formato del playbook** — ¿deberia `migration-playbook.md` expandir el contrato de formato dual del slice-1 (un `.sh` por etapa en `scripts/migrate/`), o entregar prosa pura y agregar los scripts en un cambio posterior? La fase de spec elige uno.

---

## 9. Referencias cruzadas

Cierre del slice 7: `bb25aab` en `develop` (squash de PR-51; 25/25 BDD de transactions PASS). Patron de fix del bridge: `a9b550d` (fuente para 8.1). Propuesta previa: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` (umbrella de slice-1 intacto). Spec previa: Engram #2134, `sdd/vertical-slicing-reference-scaffold/spec`. Contexto del proyecto: Engram #2130, `sdd-init/gastos-personales-reference`. Preflight: Engram #2128, `gastos-personales-reference/decisions/sdd-preflight` (interactivo + hybrid + ask-on-risk + presupuesto de 400 lineas). Plugin de boundary: `tools/eslint-plugin-boundary/` (cableado de 8.3 + fixture + runner). Workflow de CI: `.github/workflows/ci.yml` linea 188 placeholder (8.2 anexa el 5to job). AGENTS.md §11 lineas 117-130 (fuera de alcance reflejado en §4). AGENTS.md §13 lineas 145-158 (contrato del espejo en espanol; 8.3 cablea el enforzamiento en tiempo de lint).

---

## 10. Siguiente fase

`next_recommended`: **`spec`**. `sdd-spec` debe bloquear los cuatro sub-slices como cuatro specs (o una spec con cuatro secciones de capacidad, segun la convencion de slice-1); para 8.1, declarar el tipo del world de auth explicitamente (resuelve §8.1); para 8.4, elegir el formato del playbook (resuelve §8.2); para 8.3, declarar el pin exacto de `@eslint/markdown` y el caracter CJK intencional de la fixture; para 8.2, declarar `timeout-minutes` del job BDD, la forma del servicio Postgres, y la relacion `needs`.

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1 (WARNING), R2 (WARNING), R3 (SUGGESTION).
