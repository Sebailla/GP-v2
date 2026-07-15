# Tareas — `fix-vitest-4-deprecation` — `gastos-personales-reference`

**Proyecto**: `gastos-personales-reference`
**Rama**: `develop` (working) · `main` (inmutable)
**Rama tracker**: `feat/fix-vitest-4-deprecation` (off develop)
**Almacén de artefactos**: hybrid (archivos openspec + Engram)
**Modo**: auto (el gatekeeper valida entre fases)
**Fecha**: 2026-07-14
**Autor**: orquestador SDD → `sdd-tasks` (ejecutor)
**Estado**: planificación completa; el usuario pausará antes de sdd-apply
**Cantidad de PRs**: 1 (~5 LOC netas; muy por debajo del presupuesto de revisión de 400 líneas)

> Migración de forma de config de test de un solo archivo (`apps/web/vitest.config.ts`). Vitest 4 eliminó `poolOptions`; el reemplazo oficial para el workaround `singleFork: true` del slice-7 PR-7 es el triple de nivel superior `pool: "forks"` + `maxWorkers: 1` + `isolate: false`. El paso RED de strict TDD se satisface vacuamente según AGENTS.md §4 (los archivos puramente de configuración no requieren tests pero DEBEN mantener el pipeline verde): RED es el warning `DEPRECATED test.poolOptions was removed in Vitest 4...` actual en stderr; GREEN es el stderr limpio post-edición + línea base 145/145 + 22/22 + 43/43 + 25/25 preservada. Vitest pineado en `4.1.9` (R11); config de fuente única (R7) — solo `apps/web/vitest.config.ts` usa el patrón deprecado (verificado por grep en todo el repo).

---

## Convenciones usadas en este archivo

- **Commits de work-unit**: cada commit DEBE ser independientemente revertible. Los tests aterrizan en el mismo commit que el comportamiento que verifican. Los specs de la carpeta de cambio (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) son artefactos de coordinación, no docs orientadas al usuario — no se requiere espejo en español (instrucción del orquestador + precedentes de `fix-bdd-tsx-node22` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-web-vitest-crash`).
- **Sin trailers "Co-Authored-By"** (AGENTS.md §6 + regla dura de la persona).
- **Conventional Commits**: `type(scope): subject` — imperativo, ≤72 caracteres, sin punto final.
- **RED antes de GREEN** (AGENTS.md §4): satisfecho vacuamente según la excepción para archivos puramente de configuración. El estado RED está documentado empíricamente en `openspec/changes/fix-coverage-minor-subfailures/explore.md` (Engram `#2394`) y en la observación de confianza actual Engram `#2380`.
- **`MUST / SHALL / MUST NOT`** son RFC 2119; cualquier cosa más débil (should, may) no es vinculante.
- Las 2 tareas abajo mapean **1:1** a los 2 commits atómicos en `design.md` §4. **Sin tercer commit. Sin fusionar los dos.**

---

## §1. Grafo de dependencias

```
T1 (migración de apps/web/vitest.config.ts) — independiente
    │
    ▼
T2 (marker de verificación chore) — depende de T1
```

**Invariante de orden de ejecución**: `T1 → T2`. La verificación de T2 DEBE observar el estado acumulado tras T1; captura los gates binarios R8 + R9 + R10 + R13 y el chequeo de semántica single-fork del slice-7 PR-7.

---

## §2. Tablas por tarea (2 tareas)

### T1 — migrar `apps/web/vitest.config.ts` a la forma de nivel superior de Vitest 4

| Campo | Valor |
|-------|-------|
| Commit | `fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)` |
| Archivos | `apps/web/vitest.config.ts` (EDIT, L40-63, neto +2 / −12 / +14 raw) |
| Depende de | — (independiente; primera tarea en la rama) |
| LOC | +2 neto (+14 / −12 raw) |
| TDD | n/a según AGENTS.md §4 (config pura). RED = stderr actual de `pnpm --filter web test`: `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.` GREEN = stderr limpio post-edición + línea base 145/145 + 25/25 + 22/22 + 43/43 preservada. |
| Edit | **(A)** Eliminar el bloque `@ts-expect-error` de 3 líneas en L55-58 (no queda error de tipo upstream). **(B)** Eliminar el bloque `poolOptions: { forks: { singleFork: true } }` de 5 líneas en L59-63. **(C)** Agregar `maxWorkers: 1` + `isolate: false` inmediatamente después del `pool: "forks"` existente en L54. **(D)** Refrescar el párrafo JSDoc en L40-53 para (i) citar el commit `36386e1` del slice-7 PR-7, (ii) incluir la advertencia `NO elimine maxWorkers: 1 ni establezca isolate: true sin releer el slice 7`, (iii) enlazar a la guía de migración de Vitest 4 (`https://vitest.dev/guide/migration#pool-rework`). El resto del archivo (plugins, `include`, `environment`, `globals`, `clearMocks`, `setupFiles`, `testTimeout`, `hookTimeout`, las 9 entradas de `resolve.alias`) NO SE TOCA. Spec R1-R6 + R12 + R13 enforced. |
| Verify | **(G1)** `grep -nE '^\s+pool:\s+"forks"' apps/web/vitest.config.ts` devuelve 1 hit (AC1, R1). **(G2)** `grep -nE '^\s+maxWorkers:\s+1\b' apps/web/vitest.config.ts` devuelve 1 hit (AC2, R2). **(G3)** `grep -nE '^\s+isolate:\s+false\b' apps/web/vitest.config.ts` devuelve 1 hit (AC3, R3). **(G4)** `grep -c 'poolOptions' apps/web/vitest.config.ts` devuelve 0 (AC4, R4). **(G5)** `grep -c '@ts-expect-error' apps/web/vitest.config.ts` devuelve 0 (AC5, R5). **(G6)** `grep -nE 'slice 7 PR-7\|vitest\.dev/guide/migration' apps/web/vitest.config.ts` devuelve ≥2 hits (AC6, R6). **(G7)** `pnpm --filter web test` sale con 0 con `Tests 145 passed (145)` (AC7, R9). **(G8)** `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` sale con 1 (salida vacía) (AC8, R8). **(G9)** `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0 con 25 PASAN / 0 FALLAN (AC9, R9 + R13). **(G10)** `pnpm turbo run lint typecheck` sale con 0 (R10). **(G11)** `git diff --name-only origin/develop..HEAD \| grep -E 'vitest\.config.*$'` devuelve exactamente 1 línea: `apps/web/vitest.config.ts` (R7, AC10). **(G12)** `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` está vacío (R11, AC11). |

---

### T2 — marker de verificación (vitest verde + sin deprecación + semántica del slice 7 preservada)

| Campo | Valor |
|-------|-------|
| Commit | `chore(test): verify pnpm --filter web test exits 0 + 145/145 + 22/22 + 43/43 + 25/25 (R6 marker)` |
| Archivos | (sin cambios de archivo — marker de verificación vacío) |
| Depende de | T1 |
| LOC | 0 / 0 |
| TDD | n/a (gate marker). Captura la aceptación binaria R8 + R9 + R10 + R13 en el cuerpo del commit para que un revisor pueda verificar cada gate independientemente del cambio que causa GREEN en T1. El cuerpo DEBE citar los IDs de requerimientos del spec (`R8`, `R9`, `R10`, `R13`) y los pasos 3-7 del §3 del diseño. El orquestador PUEDE elidir este commit en apply si la misma verificación corre en CI y reporta los mismos hechos; el diseño lo mantiene como opción según AGENTS.md §5 (higiene de commits atómicos — las observaciones de verificación viven en el commit que las observó, no en el commit que las causó). |
| Verify | **(VM1)** `pnpm --filter api test` sale con 0 con 22 PASAN (R9, AC12). **(VM2)** `pnpm turbo run bdd` sale con 0 con 43 escenarios (R9, AC13). **(VM3)** `pnpm --filter web test` sale con 0 con `Tests 145 passed (145)` (re-confirma G7 de T1 desde un shell limpio). **(VM4)** `pnpm --filter web test 2>&1 \| grep -i "deprecated.*poolOptions"` devuelve vacío (re-confirma G8 de T1). **(VM5)** `git log feat/fix-vitest-4-deprecation --pretty=format:"%B" \| grep -i "co-authored-by"` devuelve vacío (AC17). **(VM6)** `git log feat/fix-vitest-4-deprecation --pretty=format:"%s"` muestra exactamente 2 commits, cada asunto matchea `^(fix\|chore)(\(.+\))?: .+` y es ≤72 caracteres (AC18). **(VM7)** `git log --oneline \| grep 36386e1` devuelve 1 hit (commit del workaround del slice-7 PR-7 preservado, NO amendeado ni rebasado) (AC16). |

---

## §3. Plan de PR (PR único)

**Título del PR**: `fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)`

**Rama**: `feat/fix-vitest-4-deprecation` (cortada de `develop` en HEAD `b0f5d24`)

**Rama base**: `develop` (NO `main` — AGENTS.md §2)

**Estrategia de merge**: squash-merge al final del PR. La historia de 2 commits vive en la descripción del PR; el squash colapsa a un único cambio revertible sobre `develop`. Según `design.md` §9 AC20: `git log origin/develop..HEAD --merges` ≤1.

**Checklist pre-PR**:

- [ ] Los 2 commits aterrizan en orden sobre `feat/fix-vitest-4-deprecation` (T1 → T2).
- [ ] Cada mensaje de commit es `type(scope): <subject>`, imperativo presente, asunto ≤72 caracteres, sin punto final (AC18).
- [ ] Sin trailers `Co-Authored-By` en ningún commit (AC17).
- [ ] Ningún commit amendea ni rebasa el commit `36386e1` del slice-7 PR-7 (AC16).
- [ ] Ningún commit toca ningún otro archivo `vitest.config.*` (solo `apps/web/vitest.config.ts` — R7, AC10).
- [ ] `pnpm --filter web test` sale con 0 con `Tests 145 passed (145)` (R9, AC7).
- [ ] `pnpm --filter web test 2>&1 | grep -F 'DEPRECATED test.poolOptions'` sale con 1 (salida vacía — R8, AC8).
- [ ] `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0 con 25 PASAN / 0 FALLAN (repro del slice-7 PR-7 preservado — R13, AC9).
- [ ] `pnpm --filter api test` sale con 0 con 22/22 PASAN (R9, AC12).
- [ ] `pnpm turbo run bdd` sale con 0 con 43/43 escenarios (R9, AC13).
- [ ] `pnpm turbo run lint typecheck` sale con 0 (R10, AC14).
- [ ] `pnpm lint:fixtures` sale con 0 (plugin de boundary sigue silencioso sobre el contenido del nuevo archivo — AC15).
- [ ] `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json | grep -E '"vitest"\s*:'` devuelve vacío (vitest se mantiene en 4.1.9 — R11, AC11).
- [ ] `git diff --stat develop..feat/fix-vitest-4-deprecation` reporta ~+16 / −12 ~ +5 LOC netas (muy por debajo del presupuesto de revisión de 400 líneas).
- [ ] La descripción del PR cita la URL de la guía de migración de Vitest 4 `https://vitest.dev/guide/migration#pool-rework` (R12).
- [ ] El job de GitHub Actions `BDD (Cucumber)` reporta `pass` tras el squash.

---

## §4. Estrategia de entrega

- **Estrategia de entrega** (desde `openspec/config.yaml`): `auto-chain` — auto-secciona en >400 LOC.
- **Estrategia efectiva de este cambio**: **PR único**. ~5 LOC netas se ubica en ~1% del presupuesto de 400 líneas; no se dispara el trigger de auto-chain.
- **No se recomiendan PRs encadenados**.
- **Rama**: `feat/fix-vitest-4-deprecation` cortada desde `develop` en HEAD `b0f5d24` tras la señal de "go" del usuario.
- **Revisor**: mantenedor (Sebastián Illa).
- **Perfil de riesgo**: 5 riesgos catalogados en `proposal.md` §7 + `design.md` §6 (R1-R5); todos tienen mitigaciones concretas ya diseñadas en las 2 tareas (vitest pineado en 4.1.9 vía `pnpm-workspace.yaml`; guía de migración upstream como fuente autoritativa para el mapeo `pool/maxWorkers/isolate`; harness de state-coverage de 25 tests como superficie de regresión; evidencia de grep en todo el repo de que ningún otro `vitest.config.*` usa `poolOptions`).

---

## §5. Orden de apply

1. **Crear rama** `feat/fix-vitest-4-deprecation` desde `develop@b0f5d24`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-vitest-4-deprecation
   ```
2. **Aplicar los 2 commits** en orden de dependencia según §2 arriba (T1 → T2). Cada commit aterriza ATÓMICAMENTE — nunca se divide, nunca se squash a mitad de camino.
3. **Ejecutar verificación local** con los 12 gates de T1 (G1-G12) y los 7 gates de T2 (VM1-VM7):
   ```bash
   pnpm install                                    # asegurar que vitest 4.1.9 está resuelto (determinístico vía pnpm-workspace.yaml)
   pnpm --filter web test                          # DEBE salir con 0; "Tests 145 passed (145)"
   pnpm --filter web test 2>&1 | grep -F 'DEPRECATED test.poolOptions'   # DEBE salir con 1 (salida vacía)
   pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx   # DEBE salir con 0; 25 PASAN
   pnpm --filter api test                          # DEBE salir con 0; 22 PASAN
   pnpm turbo run bdd                              # DEBE salir con 0; 43 escenarios
   pnpm turbo run lint typecheck                   # DEBE salir con 0
   pnpm lint:fixtures                              # DEBE salir con 0
   ```
4. **Gates de higiene pre-commit** (según AGENTS.md §12):
   ```bash
   grep -nE 'pool:"forks"|maxWorkers: 1|isolate: false' apps/web/vitest.config.ts   # 3 hits esperados
   grep -c 'poolOptions' apps/web/vitest.config.ts                                  # 0 esperado
   grep -c '@ts-expect-error' apps/web/vitest.config.ts                             # 0 esperado
   git diff --name-only origin/develop..HEAD | grep -E 'vitest\.config.*$'           # 1 línea: apps/web/vitest.config.ts
   git log --oneline | grep 36386e1                                                 # 1 hit (slice-7 PR-7 preservado)
   ```
5. **Push de la rama**:
   ```bash
   git push -u origin feat/fix-vitest-4-deprecation
   ```
6. **Abrir el PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-vitest-4-deprecation \
     --title "fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   El cuerpo del PR DEBE liderar con la declaración de una línea del spec §2: `apps/web/vitest.config.ts` migra `poolOptions.forks.singleFork: true` al nivel superior `pool: "forks"` + `maxWorkers: 1` + `isolate: false` según la guía de migración de Vitest 4 (`https://vitest.dev/guide/migration#pool-rework`), preservando la semántica single-fork del slice-7 PR-7 (R12 + R13).
7. **Esperar al CI**. El job `BDD (Cucumber)` DEBE reportar `pass`. El gate de `turbo` (build + lint + typecheck + test) DEBE reportar exit 0.
8. **Revisión + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-vitest-4-deprecation   # tras aprobación del mantenedor
   ```
9. **`sdd-verify` corre sobre `develop` post-merge** para confirmar que el gate de vitest permanece verde: 145/145 web + 25/25 state-coverage + 22/22 api + 43/43 BDD + `pnpm turbo run lint typecheck` sale con 0, Y el marcador `DEPRECATED test.poolOptions` desaparece del stderr.
10. **`sdd-archive` mueve** `openspec/changes/fix-vitest-4-deprecation/{proposal,spec,design,tasks}.md` a `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/` según el protocolo de archivo del orquestador.

---

## §6. Preguntas abiertas del diseño resueltas

(Las 4 diferidas desde la propuesta §8 fueron resueltas en `spec.md` §11.)

- **Q1 (justificación JSDoc)**: SÍ — párrafo refrescado en L40-58 del config final, citando el commit `36386e1` del slice-7 PR-7 + la URL de la guía de migración de Vitest 4 + una advertencia de `NO elimine maxWorkers: 1`. R6 lo enforce.
- **Q2 (migración por simetría de los otros 9 configs)**: NO — solo `apps/web/vitest.config.ts` usa el patrón `poolOptions` deprecado (verificado por grep en todo el repo). Los otros 9 configs (`apps/api`, `libs/shared-utils/*`, `libs/core/*`, `libs/features/*/vitest.config.*`) están fuera de alcance. R7 lo enforce.
- **Q3 (test unitario de config de vitest)**: NO — la excepción AGENTS.md §4 cubre este cambio puramente de config; la verificación es que la suite de tests existente permanezca verde + que desaparezca el warning de deprecación. R8 + R9 + R13 son las superficies de verificación.
- **Q4 (ADR)**: NO — cambio de config de 1 archivo enlazando a la guía oficial de migración (según R12) es la superficie de documentación. El párrafo JSDoc en L40-58 acarrea la justificación + la URL upstream.

**No quedan preguntas abiertas en la fase de tasks.** `sdd-apply` procede directamente con las 2 tareas arriba.

---

## §7. Fuera de alcance (cambio completo)

(Orquestador-enforced; espejo de `spec.md` §10 + `proposal.md` §2.2 + AGENTS.md §11.)

1. Sin bump de versión de vitest (se mantiene pineado en `4.1.9`).
2. Sin migración de los otros 9 archivos `vitest.config.*` (ninguno usa `poolOptions`).
3. Sin ediciones en archivos de test/componentes/BDD/ESLint/CI/Turbo/workspace.
4. Sin ediciones al historial del slice-7 PR-7 — el commit `36386e1` permanece inmutable.
5. Sin tests nuevos (la excepción AGENTS.md §4 cubre este cambio puramente de config).
6. Sin nueva regla ESLint en `tools/eslint-plugin-boundary/` (el cambio es una edición de config de runtime de vitest, no un guardia de frontera de código).
7. Sin ADR bajo `docs/architecture/decisions/` (cambio de config de 1 archivo con enlace a la guía oficial de migración es la superficie de documentación).
8. Sin enforcement de gate de cobertura en CI (AGENTS.md §11).
9. Sin migración de `gastos-personales/` al modelo de vertical slicing (AGENTS.md §11).
10. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log (AGENTS.md §11).
11. Sin tocar `apps/web/__tests__/setup.ts` (el mock elevado del PR #66 se mantiene como la única fuente de verdad para `next/navigation`).
12. Sin tocar archivos fuente de `apps/web/components/`, `apps/web/lib/`, `apps/web/app/`, `apps/api/`, `libs/features/*/`, `libs/core/*/`.
13. Sin tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash,fix-state-coverage-drift,fix-bdd-tsx-node22,fix-ci-env-propagation,fix-orphan-shared-directories-mirror}/`.
14. Sin espejo en español de ningún archivo bajo `openspec/changes/fix-vitest-4-deprecation/` (los specs de la carpeta de cambio son artefactos de coordinación, no docs orientadas al usuario; según instrucción del orquestador + precedentes de `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-bdd-tsx-node22`).
15. Sin cambios en `tsconfig.base.json` (`isolatedModules: true` no está relacionado).
16. Sin cambios en la config de `@vitest/coverage-v8` (gate de cobertura permanece deshabilitado según AGENTS.md §11).
17. Sin cambios en `pnpm-workspace.yaml` (pin de vitest `4.1.9` permanece).
18. Sin cambios en `.github/workflows/ci.yml` (el job de BDD ejecuta el mismo `pnpm turbo run bdd`; la salida ahora incluye un stderr de web limpio en lugar del warning de deprecación).

---

## §8. Riesgos

(Espejo de `proposal.md` §7 + `design.md` §6 R1-R5 con mitigaciones concretas a nivel de tarea.)

- **R1 (marcador de deprecación diferente entre versiones patch de vitest)** — Baja. Mitigado por la verificación G12 de T1 (`git diff ... -- package.json ... | grep '"vitest"'` está vacío — vitest se mantiene pineado en 4.1.9 vía `pnpm-workspace.yaml`; instalación determinística; la subcadena exacta `DEPRECATED test.poolOptions` es el marcador estable para vitest 4.1.x).
- **R2 (`maxWorkers: 1` + `isolate: false` difiere semánticamente de `singleFork: true`, re-introduce el OOM del slice 7)** — Baja. La guía de migración de Vitest 4 (`https://vitest.dev/guide/migration#pool-rework`) es explícita en que `singleFork` se reemplaza por `maxWorkers: 1, isolate: false`. La verificación G9 de T1 (`pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0; 25 PASAN / 0 FALLAN) es el gate de superficie de regresión. Si el OOM regresa, aparece allí primero.
- **R3 (eliminar `@ts-expect-error` expone un error de tipo en otro lugar)** — Baja. Las claves restantes `pool`, `maxWorkers` e `isolate` son todas miembros del tipo `InlineConfig` upstream en vitest 4.1.9. El `@ts-expect-error` solo suprimía la clave `poolOptions` eliminada (ausente del `InlineConfig` de vitest 4). La verificación G10 de T1 (`pnpm turbo run typecheck` sale con 0) captura cualquier desajuste de tipo residual.
- **R4 (otros archivos `vitest.config.*` usan `poolOptions` y fueron pasados por alto)** — Ninguna. El grep en todo el repo confirma que solo `apps/web/vitest.config.ts:54-63` coincide con `poolOptions`. Los otros 9 configs no usan el patrón deprecado. La verificación G11 de T1 (`git diff --name-only ... | grep -E 'vitest\.config.*$'` devuelve exactamente 1 línea) captura cualquier expansión de alcance accidental.
- **R5 (wording de deprecación difiere entre la versión pineada y la instalada de vitest)** — Baja. vitest pineado vía `pnpm-workspace.yaml`; instalación determinística; la subcadena del marcador es el contrato estable de vitest 4.1.x.

---

## §9. Pronóstico de carga de revisión

| Campo | Valor |
|-------|-------|
| **Líneas cambiadas estimadas** | ~5 LOC netas (+14 / −12 raw + 1 LOC de framing para el hunk de migración, según `design.md` §2 Archivo 1 footer) |
| **Riesgo de presupuesto de 400 líneas** | Bajo (5 ≪ 400; ~1% del presupuesto usado) |
| **PRs encadenados recomendados** | No |
| **Estrategia de entrega** | `auto-chain` (default del proyecto); trigger de auto-chain NO disparado (5 < 400) |
| **Estrategia efectiva** | single-pr |
| **Justificación del PR único** | 5 LOC netas muy por debajo de 400; un PR mantiene coherente la historia del fix del loader (forma de config → marker de verificación) |
| **Decisión necesaria antes de apply** | No (sin trigger de `ask-on-risk`; los 5 riesgos tienen mitigaciones concretas ya diseñadas en las 2 tareas) |
| **Estrategia de cadena** | n/a (camino de PR único) |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: No
Estrategia de cadena: n/a
Riesgo de presupuesto de 400 líneas: Bajo

---

## §10. Estado

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, design §4 fuente) · `risks`: R1-R5 (mitigaciones concretas incorporadas en las 2 tareas arriba)

`next_recommended`: **`apply`** — el orquestador crea `feat/fix-vitest-4-deprecation` desde `develop@b0f5d24` y aplica las 2 tareas en §2 secuencialmente.

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-vitest-4-deprecation/proposal.md` (Engram `#2396`, 96 LOC)
- **Spec**: `openspec/changes/fix-vitest-4-deprecation/spec.md` (Engram `#2397`, 150 LOC; 7 objetivos, 13 requerimientos, 7 escenarios, 20 criterios de aceptación)
- **Diseño**: `openspec/changes/fix-vitest-4-deprecation/design.md` (Engram `#2398`, 456 LOC, 13 secciones; 1 diff de archivo, 2 commits atómicos, 10 pasos de ejecución)
- **Brief de exploración**: `openspec/changes/fix-coverage-minor-subfailures/explore.md` (Engram `#2394`; refutó hipótesis del orquestador + identificó Forma A)
- **Marcador de deprecación smoking-gun**: `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.`
- **Guía de migración de Vitest 4 (fuente autoritativa)**: `https://vitest.dev/guide/migration#pool-rework`
- **Único archivo afectado**: `apps/web/vitest.config.ts` (120 líneas; `pool: "forks"` en L54, bloque `poolOptions` en L59-63, `@ts-expect-error` en L55-58)
- **Superficie de regresión (repro del slice-7 PR-7)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (25/25 PASAN pre- y post-fix)
- **Commit predecesor del slice-7 PR-7**: `36386e1` — introdujo el workaround `pool: "forks"` + `poolOptions.forks.singleFork: true` para la inestabilidad del pool de workers de happy-dom 20.10 + vitest 4.1. **PRESERVADO sin cambios por este PR.**
- **Cableado de config de vitest**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`) — cablea el mock global del PR #66
- **Superficie BDD no tocada**: los 12 archivos `.feature` (6 auth + 6 transactions), los 5 archivos `.steps.ts` (3 auth + 2 transactions), los 2 archivos `world.ts`, los 2 archivos `support/register.ts`, los 2 archivos `cucumber.mjs`
- **Workflow de CI**: job `BDD (Cucumber)` en `.github/workflows/ci.yml` — sin cambios (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, timeout de 30 min); la salida ahora incluye un stderr de web limpio en lugar del warning de deprecación
- **Referencia de formato**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/tasks.md` (precedente más cercano — también un fix solo de config con excepción TDD; espejó la estructura de 10 secciones, comprimida para el alcance de cambio menor — 2 tareas vs 4, sin matriz de amenazas, sin espejo en español, sin ADR separado, sin `scripts/bdd/verify.sh`)
- **Convenciones del proyecto**: AGENTS.md §2 (modelo de ramas — `main` inmutable, cortar desde `develop`), §4 (strict TDD — excepción para config pura, satisfecha vacuamente), §5 (commits atómicos — 2 commits de work-unit), §6 (Conventional Commits — tipos `fix`, `chore`; sin atribución de IA), §7 (plugin de boundary — ninguno afectado), §8 (fuente única de verdad — claves de config de runtime de vitest canónicas en el sitio `InlineConfig` upstream), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (fuera-de-alcance — ninguno tocado), §12 (checklist pre-commit), §13 (espejo en español — N/A para diseño de carpeta de cambio según instrucción del orquestador + precedentes de `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-bdd-tsx-node22`)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**FIN DE LAS TAREAS**.
