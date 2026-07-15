# Tareas — `fix-web-vitest-crash` — `gastos-personales-reference`

> **Estado**: borrador · fase de tareas · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `d9fdfec`) · tracker `feat/fix-web-vitest-crash` (off develop)
> **Modo**: `auto` · **Almacén de artefactos**: hybrid · **Entrega**: `auto-chain` (>400 LOC) — **N/A este cambio** (28 LOC netas)
> **TDD estricto**: ACTIVO (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Entradas de aprobación**: `proposal.md` (Engram `#2362`), `spec.md` (Engram `#2363`, G1–G6, R1–R10, 6 escenarios, 20 ACs), `design.md` (Engram `#2364`, 1 edición de archivo, 2 commits atómicos, 6 pasos)
> **PR único**: 1 archivo editado (`apps/web/__tests__/setup.ts`, +28 / 0), 2 commits atómicos
> **Autor**: Orquestador SDD → `sdd-tasks` (ejecutor)
> **Próxima fase**: el usuario pausa antes de `sdd-apply` (según protocolo del orquestador — chequeo intermedio sobre fix pequeño-pero-impactante de 28 LOC)

---

## Convenciones usadas en este archivo

- **Commits de unidad-de-trabajo**: cada commit DEBE ser independientemente revertible. El cambio aterriza como una edición única de infra de tests; el comportamiento de producción de cualquier componente queda sin cambios.
- **Sin trailers "Co-Authored-By"** (AGENTS.md §6 / regla del proyecto).
- **Conventional Commits**: `type(scope): subject` — imperativo, ≤72 chars, sin punto final.
- **RED antes de GREEN**: el RED es el `pnpm --filter web test` exit-1 EXISTENTE (25/145 fallando tras 255s de OOM). No se necesita archivo de tests nuevo; `state-coverage.test.tsx` ES la superficie de regresión según AGENTS.md §4 ("un test fallando que reproduzca la falla debe existir ANTES del cambio de producción" — el archivo existente ya existe, el cambio lo hace pasar).
- **`MUST / SHALL / MUST NOT`** son RFC 2119; cualquier cosa más débil (should, may) no es vinculante.
- Las 2 tareas abajo mapean 1:1 a los 2 commits atómicos en `design.md` §4. **Sin 3er commit. Sin merging mid-stream.**

---

## §1. Grafo de dependencias

```
T1 (hoist de infra de tests: vi.mock("next/navigation", …) + JSDoc en setup.ts)
    │
    ▼
T2 (marcador de verificación chore — pipeline turbo completo, sin cambios de archivo)
```

**Invariante de orden de ejecución**: `T1 → T2`. T1 es la única edición de archivo (el cambio que causa el GREEN); T2 es el gate de verificación que prueba que la observación GREEN es real y que la solución alternativa `pool: "forks"` del PR-7 del slice-7 coexiste limpiamente.

---

## §2. Tablas por tarea (2 tareas)

### T1 — Elevar `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts`

| Campo | Valor |
|-------|-------|
| Commit | `test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (closes apps/web vitest OOM)` |
| Archivos | `apps/web/__tests__/setup.ts` (EDITAR, +28 / 0) |
| Depende de | — (RED ya observado: `pnpm --filter web test` sale con 1 con 25/145 fallando, heap de V8 ~4 GB, `Worker exited unexpectedly`, 255s de wall time) |
| LOC | +28 / 0 |
| TDD | RED → GREEN. El RED es el exit-1 existente de `state-coverage.test.tsx` (no se necesita archivo de tests nuevo según excepción de AGENTS.md §4). Este commit aterriza el GREEN. Editar `apps/web/__tests__/setup.ts` para (a) añadir `import { vi } from "vitest";` después del `import "@testing-library/jest-dom/vitest";` existente en L1; (b) extender el bloque JSDoc existente (L3-21) con un párrafo explicando el invariante de `next/navigation`, la cascada de OOM, la coexistencia con la solución alternativa del PR-7 del slice-7, y el rol de única-fuente-de-verdad del archivo según spec R9; (c) añadir un bloque de comentario `// Factory form is REQUIRED …` arriba de la nueva llamada `vi.mock` explicando la forma factory, la rationale de la forma completa del router, y la rationale de `URLSearchParams` / `useParams` según design §2 Archivo 1; (d) añadir `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }))` al final del archivo. La forma factory es REQUERIDA (Vitest eleva `vi.mock` por encima de todos los imports; los stubs `vi.fn()` son recreados por test bajo `clearMocks: true` en `apps/web/vitest.config.ts:38`). `useSearchParams` retorna `new URLSearchParams()` (clase de la spec WHATWG implementada con fidelidad completa en happy-dom 20.10). `useParams` retorna `{}` para que un componente futuro que lo destructura no crashee con `undefined`. |
| Verificar | `pnpm --filter web test` DEBE salir con 0 con `Tests 145 passed (145)` y el wall time DEBE ser <30s (desde 255s). stderr NO DEBE contener `Worker exited unexpectedly` o `FATAL ERROR: Ineffective mark-compacts near heap limit`. `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` DEBE salir con 0 con 25/25 PASS (sin nueva decoración `.skip`/`.todo` según AC11). AC1 (`grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` retorna ≥1 hit), AC2 (la factory retorna la forma completa del router), AC3 (la factory retorna stubs de `usePathname`/`useSearchParams`/`useParams`), AC4 (la prosa JSDoc explica happy-dom + cascada de OOM) todos se mantienen. |

---

### T2 — Marcador de verificación chore (pipeline turbo completo, sin cambios de archivo)

| Campo | Valor |
|-------|-------|
| Commit | `chore(web): verify pnpm --filter web test exits 0 with 145/145 (R4 marker)` |
| Archivos | (sin cambios de archivo — sólo gate de verificación; el orquestador PUEDE omitir este commit si la verificación corre sobre el árbol del commit previo en su lugar) |
| Depende de | T1 |
| LOC | 0 / 0 |
| TDD | Gate REFACTOR. Re-ejecutar el pipeline turbo completo para confirmar (a) el suite de tests unitarios de apps/web se queda GREEN, (b) el gate BDD no se regresa (estaba 43/43 en `develop@d9fdfec` según Engram `#2278`), (c) los fixtures de frontera ESLint aún pasan (sin nueva regla necesaria; el mock es de infra de tests, no un guardia de frontera de código según propuesta §4.3), (d) TypeScript aún compila limpiamente. Este commit existe para darle al cierre del slice-8 un rastro en papel que distinga la observación GREEN (este commit) del cambio que causa el GREEN (T1). Separa el PORQUÉ del QUÉ en el log de commits. |
| Verificar | `pnpm turbo run test bdd lint typecheck` DEBE salir con 0 en las 4 tareas turbo. `pnpm --filter web test` DEBE mostrar `Tests 145 passed (145)`. `pnpm turbo run bdd` DEBE mostrar 43/43 PASS. `pnpm lint:fixtures` DEBE salir con 0 (las 5 reglas activas de frontera — `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs` — se quedan green; no se añade ninguna regla nueva según spec §7.1). `git log feat/fix-web-vitest-crash --pretty=format:"%B" \| grep -i "co-authored-by"` DEBE retornar vacío (AC16). La solución alternativa del PR-7 del slice-7 en `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) DEBE permanecer sin cambios (AC6, AC15). |

---

## §3. Plan de PR (PR único)

**Título del PR**: `test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (closes apps/web vitest OOM)`

**Rama**: `feat/fix-web-vitest-crash` (cortada de `develop` en HEAD `d9fdfec`)

**Rama base**: `develop` (NO `main` — AGENTS.md §2; AC18)

**Estrategia de merge**: squash-merge al final del PR (estándar para fixes de PR único; preserva la historia de 2 commits en la descripción del PR mientras colapsa a un único cambio revertible en `develop`). El cuerpo del PR DEBE incluir una sección "Context" según spec R10 que nombre a apps/web vitest como el ÚLTIMO gate fallando del verify del slice-8 tras una racha de bypass BDD de 4 PRs (para que los revisores no re-caminen la pista falsa del split `auth-server` del PR-2 del slice-8).

**Checklist pre-PR**:

- [ ] Los 2 commits aterrizan en orden en `feat/fix-web-vitest-crash` (T1 → T2).
- [ ] Cada mensaje de commit es `type(scope): <subject>`, imperativo presente, asunto ≤72 chars, sin punto final.
- [ ] Sin trailers `Co-Authored-By` en ningún commit (AC16).
- [ ] `pnpm --filter web test` sale con 0 con `Tests 145 passed (145)` (AC7).
- [ ] `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR"` sale con 1 — sin firma de OOM en stderr (AC8).
- [ ] `time pnpm --filter web test` reporta `real` < 30s (AC9, desde 255s).
- [ ] `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` sale con 0 con 25/25 PASS (AC10).
- [ ] `pnpm turbo run bdd` sale con 0 con 43/43 (AC12, sin regresión de BDD).
- [ ] `pnpm lint:fixtures` sale con 0 (AC5/AC6 — el plugin de frontera aún pasa).
- [ ] `git diff --name-only develop..feat/fix-web-vitest-crash -- 'apps/web/'` retorna exactamente `apps/web/__tests__/setup.ts` (AC14 — sólo setup.ts se edita bajo apps/web).
- [ ] `git diff --stat develop..feat/fix-web-vitest-crash -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` está vacío (AC13 — ningún archivo fuente tocado).
- [ ] `grep "pool" apps/web/vitest.config.ts` aún muestra `pool: "forks"` y `singleFork: true` (AC6 — solución alternativa del slice-7 preservada).
- [ ] `git log --oneline feat/fix-web-vitest-crash | grep 36386e1` retorna 1 hit (AC15 — commit del PR-7 del slice-7 preservado).
- [ ] El diff NO incluye ningún archivo fuente de componente bajo `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, o `libs/**`.
- [ ] La configuración `pool: 'forks'` del PR-7 del slice-7 se preserva (AC6, AC8).
- [ ] El job de GitHub Actions apps/web tests CI reporta `pass` (este job está fallando actualmente en develop; primera vez que será verde desde el slice-7).

---

## §4. Estrategia de entrega

- **Estrategia de entrega** (desde `openspec/config.yaml`): `auto-chain` (auto-sliza en >400 LOC).
- **Estrategia efectiva de este cambio**: PR único. 28 LOC netas se mantienen bien por debajo del presupuesto de 400 líneas; no se dispara ningún trigger de auto-chain.
- **No se recomiendan PRs encadenados** para `fix-web-vitest-crash`.
- **Rama**: `feat/fix-web-vitest-crash` cortada de `develop@d9fdfec` tras la señal "go" del usuario.
- **Revisor**: mantenedor (Sebastián Illa). Ejecutar `gentle-ai review start` tras los 2 commits aterrizando en la rama.
- **Perfil de riesgo**: 5 riesgos catalogados en `proposal.md` §7 + `design.md` §6 (R1–R5); todos tienen mitigaciones concretas ya diseñadas.

---

## §5. Orden de apply

1. **Crear rama** `feat/fix-web-vitest-crash` off `develop@d9fdfec`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-web-vitest-crash
   ```
2. **Aplicar los 2 commits** en orden TDD estricto según §2 arriba (T1 → T2). Cada commit aterriza ATÓMICAMENTE — nunca dividir, nunca squash mid-stream.
3. **Ejecutar la verificación turbo completa**:
   ```bash
   pnpm install
   pnpm turbo run test bdd lint typecheck   # DEBE salir con 0
   pnpm --filter web test                   # DEBE salir con 0; 145/145 PASS; wall <30s
   pnpm turbo run bdd                       # DEBE salir con 0; 43/43 PASS
   pnpm lint:fixtures                       # DEBE salir con 0
   ```
4. **Push de la rama**:
   ```bash
   git push -u origin feat/fix-web-vitest-crash
   ```
5. **Abrir el PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-web-vitest-crash \
     --title "test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (closes apps/web vitest OOM)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   El cuerpo del PR DEBE incluir una sección "Context" (según spec R10) que nombre a apps/web vitest como el ÚLTIMO gate fallando del verify del slice-8 tras una racha de bypass BDD de 4 PRs.
6. **Esperar CI** (turbo + lint:fixtures + fixtures del plugin de frontera + job apps/web tests de GitHub Actions). El job apps/web tests DEBE reportar `pass` — esta es la señal primaria (primera vez que será verde desde el slice-7).
7. **Revisión + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-web-vitest-crash   # tras aprobación del mantenedor
   ```
8. **`sdd-verify` corre en `develop` post-merge** para confirmar que el Gate 3 del slice-8 se cierra (el flip 145/145 + la solución alternativa del slice-7 preservada + el gate BDD aún verde + el diff de 1 archivo según AC14).
9. **`sdd-archive` mueve** `openspec/changes/fix-web-vitest-crash/{explore,proposal,spec,design,tasks}.md` a `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/` según el protocolo de archive del orquestador.

---

## §6. Preguntas abiertas de diseño resueltas

- **Q1 (área de superficie del mock — JSDoc vs nueva ADR)**: **Bloque de comentario JSDoc en `setup.ts` (SIN nueva ADR)**. Resuelta en `spec.md` §11.
- **Q2 (comportamiento completo del router vs stub mínimo de `useRouter()`)**: **Stub mínimo — `useRouter()` sólo** (la factory retorna los 4 hooks pero `useRouter` es el único con múltiples métodos). Resuelta en `spec.md` §11.
- **Q3 (¿mockear `next/link` / `next/router` / `next/headers`?)**: **NO. App Router sólo.** Resuelta en `spec.md` §11.

**No quedan preguntas abiertas en la fase de tareas.** `sdd-apply` procede directamente con las 2 tareas arriba.

---

## §7. Fuera de alcance (cambio completo)

(Enforzado por el orquestador; espeja `spec.md` §4 + `proposal.md` §2.2 + AGENTS.md §11.)

1. Sin upgrade de versión de vitest (4.1.9 → v5 o cualquier otra versión mayor).
2. Sin eliminación de la solución alternativa `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` del PR-7 del slice-7 en `apps/web/vitest.config.ts:54-63` (commit `36386e1`) — PRESERVADA, no eliminada. Mitiga un modo de fallo diferente (carrera de actualización de estado driven por `useEffect` de React 18 en el patrón mount-then-load-then-setState de `EditTransactionForm`).
3. Sin cambios a los 3 componentes de formulario (`apps/web/components/transactions/TransactionsList.tsx`, `CreateTransactionForm.tsx`, `EditTransactionForm.tsx`) o cualquier otro código fuente en `apps/web/components/`, `apps/web/lib/`, o `apps/web/app/`.
4. Los 2 sub-fallos menores en los escenarios SessionList de `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (`findByText(/500/i)` matchea `'500 '` con un espacio al final porque el `Response` mockeado no tiene `statusText`) — ticket separado. Independientes de la cascada de OOM.
5. El warning de deprecación `test.poolOptions` de vitest-4 ("`test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options") — ticket separado. Se volverá un error duro en vitest 5.
6. Los directorios shared huérfanos (`libs/features/*/shared/` con imports vacíos) — ticket separado, deuda de herencia del slice-7.
7. Refactorizar `TransactionsList` / `CreateTransactionForm` / `EditTransactionForm` para no llamar `useRouter()` — el código de producción permanece tal cual.
8. Eliminar el bloque `vi.mock("next/navigation", …)` por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49` — el mock global lo hace redundante, pero la eliminación es una limpieza de seguimiento.
9. Mockear `next/link` (componente JSX, no un hook), `next/router` (equivalente del router de páginas, no usado), o `next/headers` (API server-only, no usada por los 3 componentes afectados) — apps/web es App Router exclusivamente.
10. Nueva ADR bajo `docs/architecture/decisions/` — el párrafo JSDoc en `setup.ts` es la documentación según resolución de Q1 de la spec.
11. Nueva regla ESLint en `tools/eslint-plugin-boundary/` — el mock es una convención de infra de tests, no un guardia de frontera de código (propuesta §4.3 confirma).
12. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/` — el fix es sólo de apps/web.
13. Cualquier archivo de tests nuevo (sin `.test.ts` / `.test.tsx` nuevo) — el `state-coverage.test.tsx` existente es la superficie de regresión.
14. Enforzamiento del gate de cobertura en CI (AGENTS.md §11).
15. Migración de `gastos-personales/` al modelo de vertical-slicing (AGENTS.md §11; el playbook se entrega por separado en slice-8 8.4).
16. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción (gestor de secretos, HSTS, CSP más allá de los defaults de Next, config de CDN), observabilidad (OpenTelemetry, Prometheus, envío de logs), UI de audit log (AGENTS.md §11).
17. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` o enmendar cualquier commit de la cadena del slice-7 (`36386e1`, `2e05fc5`).
18. Un espejo en español de cualquier archivo bajo `openspec/changes/fix-web-vitest-crash/` (ningún `.md` fuente de verdad se entrega en este cambio; design/spec/proposal de carpeta de cambio son artefactos de coordinación entre fases SDD, no documentos de cara al usuario, según el precedente de `fix-api-nestjs-di`).

---

## §8. Riesgos

(Espeja `proposal.md` §7 + `design.md` §6 R1–R5 con mitigaciones concretas a nivel de tarea.)

- **R1 (cambiar `setup.ts` rompe un test no relacionado que confiaba en la AUSENCIA de un mock de router)** — Bajo. Mitigado por la verificación de T1 (suite completo de 145 tests sale con 0; si algún test no relacionado falla, el modo de fallo apunta a un test que importa `next/navigation` directamente — ninguno lo hace actualmente). Los 17 archivos actualmente pasando (120 tests) continuarán pasando porque el mock es un no-op para tests que no renderizan componentes de Next.js. `clearMocks: true` en `apps/web/vitest.config.ts:38` resetea los stubs `vi.fn()` por test.
- **R2 (hoisting de Vitest conflictúa con el `vi.mock("next/navigation", …)` por archivo en `auth/state-coverage.test.tsx:47-49`)** — Bajo. Mitigado por la semántica de orden de import de Vitest (`vi.mock` por archivo re-vincula la factory para el alcance de ese archivo). Los tests de auth continúan pasando con el mock por archivo en su lugar — verificado por la línea base existente de 120 tests. El mock por archivo se vuelve redundante tras este PR pero se deja intacto para la limpieza de seguimiento (fuera de alcance según spec §10).
- **R3 (warning de deprecación `test.poolOptions` de vitest-4 aún presente, puede volverse un error duro en vitest 5)** — Bajo. Fuera de alcance según spec §10; ticket separado. La solución alternativa del PR-7 del slice-7 permanece; la deprecación no bloquea este fix.
- **R4 (la forma factory de `useSearchParams()` retorna `new URLSearchParams()` — algún componente podría destructurar métodos no presentes en el polyfill de happy-dom)** — Bajo. `URLSearchParams` es una clase de la spec WHATWG implementada en happy-dom con fidelidad completa. Los 3 componentes afectados (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) llaman sólo `useSearchParams().get("…")`; `URLSearchParams.get` está presente en happy-dom 20.10. Verificado por código del componente (sin uso de `.entries()`, `.forEach()`, o `.keys()` sobre `useSearchParams()`).
- **R5 (PR confundido con la pista falsa del split `auth-server` del PR-2 del slice-8)** — Bajo. Mitigado por spec R10 (la descripción del PR DEBE incluir una sección "Context" nombrando explícitamente a apps/web vitest como el ÚLTIMO gate fallando del verify del slice-8 tras una racha de bypass BDD de 4 PRs) + AC18 (la base del PR es `develop`, no `main`, que es la misma base que el PR-2 del slice-8 usó — pero el diff de archivos es completamente diferente: este PR toca `apps/web/__tests__/setup.ts`; el PR-2 del slice-8 tocó `apps/web/lib/auth-client.ts` y `apps/web/lib/auth-server.ts`).

---

## §9. Pronóstico de carga de revisión

| Campo | Valor |
|-------|-------|
| **Líneas cambiadas estimadas** | 28 LOC netas (`+28 / 0` según footer de `design.md` §2 Archivo 1) |
| **Riesgo de presupuesto de 400 líneas** | Bajo (28 << 400; 7% del presupuesto usado) |
| **PRs encadenados recomendados** | No |
| **Estrategia de entrega** | `auto-chain` (default del proyecto); trigger de auto-chain NO disparado (28 < 400) |
| **Estrategia efectiva** | single-pr |
| **Rationale de PR único** | 28 LOC netas bien por debajo de 400; un PR mantiene la historia coherente (RED → GREEN vía hoist de setup.ts → verificación chore) |
| **Decisión necesaria antes de apply** | No (sin trigger de `ask-on-risk`; los 5 riesgos tienen mitigaciones concretas ya diseñadas en las 2 tareas) |
| **Estrategia de cadena** | n/a (camino single-PR) |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: No
Estrategia de cadena: n/a
Riesgo de presupuesto de 400 líneas: Bajo

---

## §10. Estado

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1–R5 (mitigaciones concretas horneadas en las 2 tareas arriba)

`next_recommended`: **`apply`** — el orquestador crea `feat/fix-web-vitest-crash` off `develop@d9fdfec` y aplica las 2 tareas en §2 secuencialmente.

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
- **Spec**: `openspec/changes/fix-web-vitest-crash/spec.md` (Engram `#2363`; 6 objetivos, 10 requerimientos, 6 escenarios, 20 criterios de aceptación)
- **Diseño**: `openspec/changes/fix-web-vitest-crash/design.md` (Engram `#2364`; 1 edición de archivo, 2 commits atómicos, 6 pasos de ejecución)
- **Brief de exploración**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
- **Evidencia de causa raíz**: `invariant expected app router to be mounted` en `next@16.2.10/navigation.ts:179`; heap de V8 ~4 GB; `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed` tras 255s de wall time
- **Patrón pre-existente (fuente para el hoist global)**: `vi.mock("next/navigation", …)` por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49`
- **Cableado de config de Vitest**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`)
- **Solución alternativa del slice-7 (predecesora, PRESERVADA)**: commit `36386e1`, `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **PR-2 del slice-8 (NO implicado, pista falsa)**: commit `2e05fc5` (split auth-client.ts / auth-server.ts) — `import type` borrado en tiempo de compilación, transparente a los workers de vitest (brief de exploración §6)
- **Componentes afectados**: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (dentro de `RowEditMenu`)
- **Superficie de regresión**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios a través de 5 bloques describe)
- **Reporte verify del slice-8**: Engram `#2278` (confirmó gate BDD GREEN; OOM es Gate 3 / sólo tests unitarios)
- **Precedente de formato**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (8 tareas, 10 secciones; espejado por estructura, adaptado al alcance de 2 tareas)
- **Convenciones del proyecto**: AGENTS.md §1 (stack), §2 (modelo de ramas — `main` inmutable, cortar de `develop`), §4 (TDD estricto — RED es el exit-1 existente, sin archivo de tests nuevo), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — sin nueva regla de frontera), §8 (única fuente de verdad — mock en exactamente un lugar tras este PR), §9 (UI completa no scaffold — N/A, sólo tests), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (lista de fuera de alcance), §13 (espejo en español — N/A para tasks de carpeta de cambio según instrucción del orquestador + precedente de `fix-api-nestjs-di`)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
