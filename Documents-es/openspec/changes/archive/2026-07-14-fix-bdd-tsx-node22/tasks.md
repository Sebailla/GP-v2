# Tasks — `fix-bdd-tsx-node22` — `gastos-personales-reference`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (inmutable)
**Tracker branch**: `feat/fix-bdd-tsx-node22` (off develop)
**Almacén de artefactos**: hybrid (archivos openspec + Engram)
**Modo**: auto (gatekeeper valida entre fases)
**Fecha**: 2026-07-14
**Author**: SDD orchestrator → `sdd-tasks` (executor)
**Estado**: Planning complete; el usuario pausará antes de sdd-apply
**Conteo de PRs**: 1 (2 LOC netas de fuente + ~30 LOC de script de verificación; muy por debajo del presupuesto de revisión de 400 líneas)

> Swap de un-token-por-línea (`tsx/esm` → `tsx/cjs`) en dos archivos `package.json` de slice, más un script de verificación de 30 líneas. La evidencia empírica RED→GREEN está registrada en `openspec/changes/fix-bdd-tsx-node22/explore.md` §5 + §10 (18/18 escenarios de auth pasando en 0.34s en Node 22.14.0 con el hook CJS). El paso RED del Strict TDD se satisface vacuosamente: no se toca código de producción, así que el runner BDD es la propia puerta de regresión (R7 + R8).

---

## Convenciones usadas en este archivo

- **Commits work-unit**: cada commit DEBE ser independientemente revertible. Fix sólo de config; los tests aterrizan en el mismo commit que el comportamiento que verifican (aquí: el runner BDD).
- **Sin trailers "Co-Authored-By"** (AGENTS.md §6 + regla hard de la persona).
- **Conventional Commits**: `type(scope): subject` — imperativo, ≤72 chars, sin punto final.
- **RED antes de GREEN**: satisfecho vacuosamente — el modo de fallo (`SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule`) está documentado empíricamente en `explore.md` §5; no se requiere código de test fallante nuevo.
- **Sin espejo en español requerido**: no se agregan archivos `.md` en inglés bajo `openspec/` o `docs/` (AGENTS.md §13; design §7.6).
- **MUST / SHALL / MUST NOT** son RFC 2119; cualquier cosa más débil (should, may) es no vinculante.
- Las 4 tasks de abajo mapean **1:1** a los 4 commits atómicos en `design.md` §4. **Sin 5to commit. Sin merging.**

---

## §1. Grafo de dependencias

```
T1 (auth package.json — tsx/esm → tsx/cjs)        independiente
T2 (transactions package.json — tsx/esm → tsx/cjs) independiente
                    │
                    ▼
T3 (verify.sh + bdd:verify wiring) — depende de T1+T2 (para que el script los verifique)
                    │
                    ▼
T4 (chore verify — turbo bdd 43/43 en Node 22) — depende de T1+T2+T3
```

**Invariante de orden de ejecución**: `T1 ║ T2` (paralelizables — archivos diferentes, sin estado compartido) → `T3` → `T4`. El orchestrator secuencia como `T1 → T2 → T3 → T4` porque la verificación de T4 debe observar el estado acumulativo después de T1+T2+T3.

---

## §2. Tablas por task (4 tasks)

### T1 — fix del hook del script BDD del slice auth

| Campo | Valor |
|-------|-------|
| Commit | `fix(bdd): auth.server package.json — switch from tsx/esm to tsx/cjs (R1)` |
| Files | `libs/features/auth/server/package.json` (EDIT, +1 / -1 en línea 17) |
| Depends on | — (independiente de T2; path de archivo diferente) |
| LOC | +1 / -1 |
| TDD | n/a (sólo config). Estado RED documentado en `explore.md` §5 (`SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule` en Node 22.13.0/22.14.0 con `tsx/esm`). Estado GREEN observado empíricamente con `tsx/cjs` (18/18 escenarios, 101/101 steps en 0.34s). |
| Verify | `pnpm --filter @features/auth bdd` DEBE salir 0 en Node 22.x; stdout DEBE reportar `18 scenarios (18 passed)` y `101 steps (101 passed)`. Grep pre-flight: `grep -n "tsx/cjs\|tsx/esm" libs/features/auth/server/package.json` → `tsx/cjs` (1 match), `tsx/esm` (0 matches). |

---

### T2 — fix del hook del script BDD del slice transactions

| Campo | Valor |
|-------|-------|
| Commit | `fix(bdd): transactions.server package.json — switch from tsx/esm to tsx/cjs (R2)` |
| Files | `libs/features/transactions/server/package.json` (EDIT, +1 / -1 en línea 17) |
| Depends on | — (independiente de T1; path de archivo diferente) |
| LOC | +1 / -1 |
| TDD | n/a (sólo config). Misma rationale de estado RED que T1; el slice de transactions tiene la misma forma de `support/register.ts` + `cucumber.mjs` que auth (slice-7 PR-8). |
| Verify | `pnpm --filter @features/transactions bdd` DEBE salir 0 en Node 22.x; stdout DEBE reportar `25 scenarios (25 passed)` y conteos de steps ≥137. Grep pre-flight: `grep -n "tsx/cjs\|tsx/esm" libs/features/transactions/server/package.json` → `tsx/cjs` (1 match), `tsx/esm` (0 matches). |

---

### T3 — script de verificación BDD local de Node 22 + wiring en raíz

| Campo | Valor |
|-------|-------|
| Commit | `feat(scripts): add scripts/bdd/verify.sh + pnpm bdd:verify (R10, R11)` |
| Files | `scripts/bdd/verify.sh` (NEW, ~30 LOC, `chmod +x`), `package.json` (EDIT, +1 LOC en línea 21: `"bdd:verify": "bash scripts/bdd/verify.sh"`) |
| Depends on | T1 + T2 (el script es la receta local para lo que T1+T2 hicieron pasar) |
| LOC | +31 / 0 |
| TDD | n/a (sólo script). La verificación es el script en sí + el pipeline BDD. `set -euo pipefail` + `bash -n` syntax gate + bit ejecutable son los chequeos binarios. El escape hatch `--no-node-check` les permite a los contribuidores en Node 23 reproducir la puerta (mitigación R3 + R4). |
| Verify | `bash -n scripts/bdd/verify.sh` DEBE salir 0 (AC9). `test -x scripts/bdd/verify.sh` DEBE tener éxito (AC8). `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` DEBE mostrar ≥1 match (AC10). `grep "bdd:verify" package.json` DEBE mostrar exactamente 1 match. `ls scripts/bdd/verify.sh` DEBE tener éxito (AC7). |

---

### T4 — marcador de verificación (turbo bdd green en Node 22)

| Campo | Valor |
|-------|-------|
| Commit | `chore(bdd): verify pnpm bdd:verify exits 0 on Node 22 (R5 marker)` |
| Files | (sin cambios de archivo — commit marcador de verificación vacío) |
| Depends on | T3 (debe observar el estado acumulativo después de T1+T2+T3) |
| LOC | 0 / 0 |
| TDD | n/a (marcador de puerta). Registra la aceptación binaria R5: `pnpm turbo run bdd` sale 0 en Node 22.13.0 con 43/43 escenarios. El body DEBE citar explore brief §5+§10 como evidencia empírica RED→GREEN (según spec §7.2 + design §3 paso 7). El orchestrator PUEDE omitir este commit al momento de apply si un chequeo de CI ya attesta el mismo hecho; el diseño lo mantiene como opción. |
| Verify | `pnpm bdd:verify` DEBE salir 0 en Node 22.13.0; stdout DEBE reportar 18/18 auth + 25/25 transactions = 43/43 escenarios. `git log feat/fix-bdd-tsx-node22 --pretty=format:"%B" \| grep -i "co-authored-by"` DEBE devolver vacío (AC23). `bash scripts/bdd/verify.sh --no-node-check` en Node 23.x DEBE salir 0 (backward-compat R3). |

---

## §3. Plan de PR (PR único)

**PR title**: `fix(bdd): swap tsx/esm to tsx/cjs hook in slice scripts (Node 22 BDD gate)`

**Branch**: `feat/fix-bdd-tsx-node22` (cortada de `develop` en HEAD `ea7732f`)

**Base branch**: `develop` (NO `main` — AGENTS.md §2)

**Estrategia de merge**: squash-merge al final del PR. La historia de 4 commits vive en la descripción del PR; el squash colapsa a un único cambio revertible en `develop`.

**Checklist pre-PR**:

- [ ] Los 4 commits aterrizan en orden en `feat/fix-bdd-tsx-node22` (T1 → T2 → T3 → T4).
- [ ] Cada mensaje de commit es `type(scope): <subject>`, imperativo presente, subject ≤72 chars, sin punto final.
- [ ] Sin trailers `Co-Authored-By` en ningún commit (AC23).
- [ ] `pnpm turbo run bdd` sale 0 en Node 22.x (correr localmente antes de pushear).
- [ ] `pnpm bdd:verify` sale 0 en Node 22.x.
- [ ] 43/43 escenarios BDD pasan (18 auth + 25 transactions).
- [ ] `bash scripts/bdd/verify.sh --no-node-check` en Node 23.x también sale 0 (backward-compat R3).
- [ ] El diff NO incluye ningún archivo `.steps.ts`, `cucumber.mjs` o `support/register.ts` (puerta de grep según AC14-AC20 de spec).
- [ ] `git diff develop..feat/fix-bdd-tsx-node22 --name-only` lista exactamente 4 archivos: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`, `package.json`.
- [ ] `git diff develop --stat` reporta ≈ +32 / -2 ≈ +30 LOC netas (muy por debajo del presupuesto de revisión de 400 líneas).

---

## §4. Estrategia de delivery

- **Estrategia de delivery** (de `openspec/config.yaml`): `auto-chain` — auto-secciona en >400 LOC.
- **Estrategia efectiva de este cambio**: **PR único**. ~32 LOC netas se ubica en ~8% del presupuesto de 400 líneas; no se dispara ningún trigger de auto-chain.
- **Sin PRs encadenados recomendados**.
- **Branch**: `feat/fix-bdd-tsx-node22` cortada de `develop` después de la señal "go" del usuario.
- **Revisor**: mantenedor (Sebastián Illa).
- **Perfil de riesgo**: 5 riesgos catalogados en `proposal.md` §7 + `design.md` §6 (R1-R5); todos tienen mitigaciones concretas ya ingenierizadas dentro de las 4 tasks (evidencia empírica RED→GREEN en `explore.md` §5+§10; `tsx@^4.23.0` cubre `>=4.16.0` para el hook `tsx/cjs`; backward-compat Node 23 vía `--no-node-check`).

---

## §5. Orden de apply

1. **Crear rama** `feat/fix-bdd-tsx-node22` off `develop@ea7732f`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-bdd-tsx-node22
   ```
2. **Aplicar los 4 commits** en orden de dependencia según §2 arriba (T1 → T2 → T3 → T4). Cada commit aterriza ATÓMICAMENTE — nunca se parte, nunca se squash en línea.
3. **Correr verificación local** en Node 22.13.0:
   ```bash
   pnpm bdd:verify                 # DEBE salir 0; loggea "node 22 + tsx 4.23.0"; corre turbo bdd
   pnpm turbo run bdd              # DEBE salir 0; 43/43 escenarios
   ```
4. **Correr chequeo de backward-compat** en Node 23.x (opcional pero recomendado según design §3 paso 6):
   ```bash
   nvm use 23
   pnpm bdd:verify --no-node-check # DEBE salir 0 en Node 23 también
   nvm use 22                      # restaurar
   ```
5. **Puertas de higiene pre-commit** (según AGENTS.md §12):
   ```bash
   pnpm lint:fixtures              # DEBE salir 0; sin cambios ESLint
   pnpm typecheck                  # DEBE salir 0; sin cambios .ts
   bash -n scripts/bdd/verify.sh   # DEBE salir 0; sintaxis del script
   ```
6. **Push de la rama**:
   ```bash
   git push -u origin feat/fix-bdd-tsx-node22
   ```
7. **Abrir el PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-bdd-tsx-node22 \
     --title "fix(bdd): swap tsx/esm to tsx/cjs hook in slice scripts (Node 22 BDD gate)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   El body del PR DEBE encabezar con la declaración de una línea de spec R12: esto restaura la puerta BDD de CI previamente rota en `develop@ea7732f` (corrida fallando `29288016689` → verde en `feat/fix-bdd-tsx-node22`), citando el brief de exploración como evidencia empírica de causa raíz.
8. **Esperar CI**. El job `BDD (Cucumber)` DEBE ir de `FAIL` (según corrida `29288016689`) a `PASS`.
9. **Revisar + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-bdd-tsx-node22   # después de la aprobación del mantenedor
   ```
10. **`sdd-verify` corre en `develop` post-merge** para confirmar que la puerta queda verde (43/43 escenarios, `pnpm bdd:verify` sale 0).
11. **`sdd-archive` mueve** `openspec/changes/fix-bdd-tsx-node22/{explore,proposal,spec,design,tasks}.md` a `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/` según el protocolo de archivo del orchestrator.

---

## §6. Preguntas abiertas de diseño resueltas

(Las 4 diferidas desde propuesta §10 se resolvieron en `spec.md` §11.)

- **Q1 (ADR 0009 para elección de hook de loader)**: **SIN ADR.** El cambio es un swap de un-token-por-línea entre dos entry points oficiales de tsx documentados en <https://tsx.is/getting-started>; un ADR para un tweak de config de este tamaño es sobrecarga burocrática. La propuesta + spec + design + descripción del PR ya proveen suficiente contexto. (`fix-api-nestjs-di` escribió ADR 0008 porque ese cambio introdujo una nueva regla de ESLint + convención `_ServiceAnchor` — un escenario diferente.)
- **Q2 (script `bdd:debug` con `--inspect`)**: **NO.** Scope creep; el script `bdd` existente es suficiente una vez que funcione en Node 22.
- **Q3 (flag `--bail` en CI)**: **NO.** Fuera de alcance; el job BDD corre todos los slices y reporta un único exit code; el fix es independiente de la semántica de fast-fail de CI.
- **Q4 (script de verificación para reproducción local)**: **SÍ** — `scripts/bdd/verify.sh` según R10, cableado como `pnpm bdd:verify` según R11. ~30 LOC de seguro barato; le da a futuros mantenedores un one-liner para reproducir la puerta BDD.

**No quedan preguntas abiertas en la fase de tasks.** `sdd-apply` procede directamente con las 4 tasks de arriba.

---

## §7. Fuera de alcance (cambio completo)

(Aplicado por el orchestrator; espeja `spec.md` §4 + `proposal.md` §2.2 + AGENTS.md §11.)

1. Sin nuevas features.
2. Sin pin o upgrade de versión de tsx; `^4.23.0` es suficiente.
3. Sin cambio de versión de Node en CI; Node 22.13.0 sigue siendo el target CI.
4. Sin cambios en ningún archivo de BDD step-def (`libs/features/*/docs/step-defs/*.steps.ts`).
5. Sin cambios en archivos `cucumber.mjs` (ambos slices).
6. Sin cambios en archivos `support/register.ts` (ambos slices).
7. Sin cambios en ningún archivo `.feature`.
8. Sin nuevas devDependencies; sin regeneración de `pnpm-lock.yaml` (R9).
9. Sin cambios en `.github/workflows/ci.yml` (la superficie R12 queda inmutable).
10. Sin cambios en `apps/web/**`, `apps/api/**`, `tsconfig.base.json`.
11. Sin cambios en config de ESLint, plugin de boundary de ESLint, fixtures de ESLint, o runner de ESLint.
12. Sin nuevo escenario BDD, test unitario, o test e2e (R7 prohíbe; la evidencia empírica basta).
13. Sin script `bdd:debug` (Q2 rechazado).
14. Sin flag `--bail` en CI (Q3 rechazado).
15. Sin ADR 0009 (Q1 rechazado; tweak de config self-documenting).
16. Nada de AGENTS.md §11 (i18n más allá de en/es, Sentry, rate-limiting, OAuth más allá de Google, hardening de producción, observabilidad, gate de cobertura, UI de audit log).
17. Sin migración de `gastos-personales/` al modelo de vertical-slicing.

---

## §8. Riesgos

(Espeja `proposal.md` §7 + `design.md` §6 R1-R5 con mitigaciones concretas a nivel de task.)

- **R1 (`tsx/cjs` podría diferir de `tsx/esm` para top-level await / async module loading)** — Baja. Mitigado por verificación de T1+T2+T4 (18/18 auth + 25/25 transactions escenarios pasan con `tsx/cjs`); los escenarios BDD no usan top-level await (verificado en slice-7 PR-7 según explore §7 R1). Test empírico en Node 22.14.0 ya mostró 18/18 PASS en 0.34s.
- **R2 (`tsx/cjs` podría no estar disponible en versiones antiguas de tsx)** — Baja. `tsx/cjs` se envía desde tsx 4.16.x (mapa `exports` de `node_modules/tsx/package.json`; explore §4); `package.json` raíz declara `"tsx": "^4.23.0"` que resuelve a `4.23.0` y satisface `>=4.16.0`.
- **R3 (un major futuro de tsx podría remover `tsx/cjs`)** — Baja. El mapa `exports` de tsx declara ambos hooks sin nota de deprecación; si se removiera, el fix futuro tiene la misma forma (swap de 2 líneas de `package.json` al nombre del nuevo hook). La receta `verify.sh` de 30 LOC es robusta ante cambios sólo de token.
- **R4 (el fix podría regresionar dev local en Node 23.x)** — Baja. `tsx/cjs` parchea el `Module._compile` y `Module._extensions['.ts']` CJS de Node sin importar el major de Node. La verificación de backward-compat de T4 (Node 23 + `--no-node-check`) es la puerta empírica.
- **R5 (un workaround de admin-merge previo asume el viejo `tsx/esm`)** — Baja. Slice-7 PR-8 + slice-8 PR-1 trabajaron alrededor de la puerta agregando código de bridge en `support/register.ts`, no overrideando la config `tsx`. R7 + R8 bloquean el diff a las 2 líneas de `package.json` + el script de verificación — el código de bridge sigue siendo válido porque carga de la misma forma que Cucumber siempre cargó. Los PRs de bridge pre-existentes (`a9b550d`, `bb25aab`) siguen funcionando.

---

## §9. Pronóstico de carga de revisión

| Campo | Valor |
|-------|-------|
| **Líneas estimadas cambiadas** | 32 LOC netas (+32 / -2 según footer de design §4: 2 swaps netos de fuente + 30 script de verificación + 1 línea de wiring en raíz - 1 seed) |
| **Riesgo de presupuesto de 400 líneas** | Bajo (32 ≪ 400; 8% del presupuesto usado) |
| **PRs encadenados recomendados** | No |
| **Estrategia de delivery** | `auto-chain` (default del proyecto); trigger de auto-chain NO disparado (32 < 400) |
| **Estrategia efectiva** | single-pr |
| **Rationale de PR único** | 32 LOC netas muy por debajo de 400; un PR mantiene la historia del hook de loader coherente (swap 1 → swap 2 → receta de verificación → marcador de verificación) |
| **Decisión necesaria antes de apply** | No (sin trigger `ask-on-risk`; los 5 riesgos tienen mitigaciones concretas ya ingenierizadas dentro de las 4 tasks) |
| **Estrategia de chain** | n/a (camino de PR único) |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: No
Estrategia de chain: n/a
Riesgo de presupuesto de 400 líneas: Bajo

---

## §10. Estado

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, design §4 de fuente) · `risks`: R1-R5 (mitigaciones concretas horneadas en las 4 tasks de arriba)

`next_recommended`: **`apply`** — el orchestrator crea `feat/fix-bdd-tsx-node22` off `develop@ea7732f` y aplica las 4 tasks en §2 secuencialmente.

---

## Cross-references

- **Propuesta**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
- **Spec**: `openspec/changes/fix-bdd-tsx-node22/spec.md` (Engram `#2308`; 6 goals, 12 requirements, 6 escenarios, 24 AC)
- **Design**: `openspec/changes/fix-bdd-tsx-node22/design.md` (Engram `#2309`; 4 diffs de archivos, 4 commits atómicos, 7 pasos de ejecución)
- **Brief de exploración**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`; evidencia empírica RED→GREEN en §5 + §10)
- **Error smoking-gun**: `SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule` (Node 22.13.0 / 22.14.0)
- **Corrida de CI fallando (ahora arreglada)**: `29288016689`
- **Mapa de exports de tsx**: campo `exports` de `node_modules/tsx/package.json` declara tanto `tsx/esm` como `tsx/cjs` desde 4.16.x
- **Anatomía de la cadena de loader**: `@cucumber/cucumber/lib/try_require.js:8` → `require()` CJS → `Module._compile`
- **Test empírico**: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s en Node 22.14.0 (explore §5 + §10)
- **Archivos modificados**:
  - `libs/features/auth/server/package.json` (35 LOC → 35 LOC; 1 línea swapeada)
  - `libs/features/transactions/server/package.json` (33 LOC → 33 LOC; 1 línea swapeada)
- **Archivos nuevos**:
  - `scripts/bdd/verify.sh` (~30 LOC, ejecutable)
- **Ediciones de wiring**:
  - `package.json` raíz (+1 LOC: script `bdd:verify` en línea 21)
- **Superficie BDD intacta** (según explore §6 + spec §6 G6): todos los 12 archivos `.feature` (6 auth + 6 transactions), todos los 5 archivos `.steps.ts` (3 auth + 2 transactions), ambos archivos `world.ts`, ambos archivos `support/register.ts`, ambos archivos `cucumber.mjs`
- **Workflow de CI**: job `BDD (Cucumber)` en `.github/workflows/ci.yml` — sin cambios (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, timeout de 30 min)
- **Referencia de formato**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (espejó la estructura de 10 secciones; comprimido para el scope de cambio más pequeño — 4 tasks vs 8, sin matriz de amenazas, sin espejo en español, sin ADR separada)
- **Convenciones del proyecto**: AGENTS.md §2 (rama), §4 (TDD estricto — sólo config, satisfecho vacuosamente), §5 (commits atómicos — 4 commits work-unit), §6 (Conventional Commits — tipos `fix`, `feat`, `chore`), §7 (plugin de boundary — ninguno afectado), §8 (única fuente de verdad — el token del script `bdd` vive en exactamente un lugar por slice), §11 (fuera de alcance — ninguno tocado), §12 (checklist pre-commit), §13 (espejo en español — ninguno requerido, sin `.md` agregado)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**FIN DE TASKS**.
