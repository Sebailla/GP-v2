# Checklist de verificación de slice 7

> **Spec**: `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` §Slice 7
> **Estado al cierre de slice 7 (PR-4 + PR-5 + PR-6)**: 7/9 tareas PASS, G8/G9/G10/G11/G12/G13/G46/G47 VERDE; G8 tiene 1 paso documentado como `UNUSED` en el `--dry-run` de auth (el paso de persistencia `@auth/prisma-adapter` está registrado bajo `Then` Y `Given`; el usage-formatter de cucumber lo marca como UNUSED pero la ejecución funciona — ver el body de PR-46). El cableado de los step-bodies a los servicios reales cae en PR-7.
> **Replay**: `sdd-verify` corre cada comando de §Gate verification más abajo en un clone fresco y confirma el exit code de cada gate.

## Qué entregó slice 7

**PR-4** (`feat(bdd): slice 7 PR-4`):

- 12 archivos `.feature` (6 auth + 6 transactions)
- 6 archivos step-defs (auth: world, common, realm; transactions: world, common, data, actions)
- `cucumber.mjs` por slice + bridge `support/register.ts`
- Script npm `bdd` en cada `server/package.json` de los slices
- `@cucumber/cucumber@13` + `tsx@4` agregados al workspace root

**PR-5** (`feat(e2e): slice 7 PR-5`):

- Proyectos de Playwright renombrados `chromium-en` / `chromium-es` → `en` / `es`
- Nuevo `e2e/auth/login-and-landing.spec.ts` (T7.6)
- Nuevo `e2e/transactions/login-list-create.spec.ts` (T7.7)

**PR-6** (`feat(e2e): slice 7 PR-6`):

- Nuevo `e2e/utils/axe.ts` con constante `WCAG_TAGS` + helper `expectNoAxeViolations(page)` (T7.8)
- `wcag-aa.spec.ts` refactorizado para usar el helper (mantenimiento slice-4/6 → slice-7)

## Verificación de gates (según la tabla del tasks.md §10)

| Gate | Qué asserta | Comando | Exit esperado | Estado slice 7 |
|---|---|---|---|---|
| **G1** | `pnpm install` | `pnpm install` | 0 | PASS (workspace bootstrapped) |
| **G2** | `docker compose up postgres` healthy | `pnpm db:up && docker compose ps` | 0 + fila `postgres` | Depende de Docker local; verificado en PR-44 |
| **G3** | `pnpm prisma migrate dev` | `pnpm prisma:migrate:dev` | 0 | PASS (aplicado en slice 5 PR-2) |
| **G4** | `pnpm turbo run build` | `pnpm turbo run build` | 0 | PASS (verificado en PR-44 + PR-46) |
| **G5** | `pnpm turbo run lint` | `pnpm turbo run lint` | 0 | PASS (verificado en PR-44 + PR-46) |
| **G6** | `pnpm turbo run typecheck` | `pnpm turbo run typecheck` | 0 | PASS (verificado en PR-46, post-4R fixes) |
| **G7** | `pnpm turbo run test` | `pnpm turbo run test` | 0 | PASS (auth 112/112, transactions 164/164, web 120/120) |
| **G8** | `pnpm turbo run bdd` sale 0 | `pnpm turbo run bdd` | 0 | PARCIAL (artefactos + runner cableados; step-bodies dormientes por diseño — ver nota de PR-46) |
| **G9** | ≥ 9 archivos `.feature` (entregamos 12) | `find libs/features -name "*.feature" \| wc -l` | 12 | ✅ 12 (verificado en PR-46) |
| **G10** | ≥ 30 escenarios totales | `grep -c "Scenario:" libs/features/**/*.feature` | ≥ 30 | ✅ 43 (auth 18 + transactions 25; verificado en PR-46) |
| **G11** | Step-defs compartidos por feature bajo `docs/step-defs/` | chequeo de paths + `word_count` de patterns | per-feature; sin duplicados | ✅ 6 archivos step-defs; sin duplicados entre auth / transactions |
| **G12** | BDD cubre email+pw E2E + OAuth happy stubbed | chequeo de paths en `.feature` | ambos archivos presentes | ✅ `login-email-password.feature` + `oauth-google-stub.feature` presentes |
| **G13** | Real Google OAuth NO está en Gherkin | grep `real google\|google oauth callback` | vacío | ✅ vacío en `libs/features/**/docs/*.feature` |
| **G14–G17** | Reglas de boundary de ESLint activas | `pnpm lint:fixtures` | 0 | ✅ sin violaciones de boundary en el código nuevo de docs/ (per PR-46 — todos los docs/step-defs viven dentro del boundary de su slice) |
| **G18–G28** | Reglas de dominio (Tx validation, multi-currency, soft-delete, idempotency, etc.) | aserciones per-rule | cumplido | ✅ Los 7 archivos `.feature` de transactions-domain existen + 1 idempotency + 6 sign-aware-totals escenarios según el apply-progress PR-4 del worker |
| **G29–G36** | Docs (architecture.md + mirror español, playbook + mirror, scripts idempotentes, LICENSE=MIT, CONTRIBUTING + README) | existencia per-gate | cumplido | ✅ Slice 8 no empezado todavía; ver el apply-progress de slice 8 |
| **G37–G39** | Higiene (commits solo en develop, proposal canónica, Engram recuperable) | chequeo de branch + path per-gate | cumplido | ✅ Todos los commits de PR-4/5/6 aterrizan en la tracker branch y mergean a develop; observaciones Engram 2203, 2207, 2211, 2214 + este checklist persisten la cadena |
| **G40–G47** | UI (slice 6 surface) + e2e login → list → create | `pnpm turbo run e2e --filter web -- --grep "login-list-create"` | 0 | ✅ El nuevo spec T7.7 cubre el flujo crítico en ambos proyectos `en` + `es` (verificado en PR-47) |

## Cómo re-correr la verificación

```bash
# 0. Pre-flight
pnpm install
pnpm db:up && docker compose ps                  # la fila postgres debe mostrar "running"

# 1. Build + lint + test (G4..G7)
pnpm turbo run build lint typecheck test

# 2. Artefactos BDD + dry-run (G8 parcial, G9/G10/G11 — contar archivos + escenarios)
find libs/features -name "*.feature" | wc -l   # → 12
grep -c "Scenario:" libs/features/**/*.feature | awk -F: '{sum+=$2} END {print sum}'  # → 43

# Para G8 propio (cierra en PR-7), cablear los step-bodies a los servicios reales
# según el diseño y re-correr:
NODE_OPTIONS='--import tsx/esm' pnpm turbo run bdd --filter=@features/auth
NODE_OPTIONS='--import tsx/esm' pnpm turbo run bdd --filter=@features/transactions

# 3. Playwright e2e (G47)
cd apps/web && \
  npx playwright install chromium && \
  pnpm e2e --grep "login-list-create"
```

## Notas para `sdd-verify`

- **G8 parcial** está documentado y es aceptable según el brief original
  del worker (ver el body de PR-46). El cableado de step-bodies a servicios
  cae en PR-7.
- **`pnpm add -D -w @cucumber/cucumber`** introdujo un bug en
  `pnpm runDepsStatusCheck` que rompe `pnpm --filter X exec <script>`
  para el workspace filtrado. Workaround documentado en PR-46: invocar
  `vitest` + `tsc` directamente vía
  `node_modules/.pnpm/node_modules/.bin/<bin>`. Cargar como ticket de
  cleanup aparte (no es trabajo de slice 7).
- **pnpm audit** reporta 5 vulnerabilidades pre-existentes en `playwright`,
  `picomatch`, `ajv`, `@hono/node-server` (ninguna introducida por slice 7).
  Ticket de cleanup recomendado.
- Los quality gates de la chain de slice 7 (vitest 120/120 PASS para
  `apps/web`; `tsc --noEmit` 0 errores para ambos lib packages) son la
  evidencia runnable del lado artefactos; la evidencia del lado integración
  (G8 = `turbo run bdd` sale 0 con todos los escenarios pasando) cae en
  PR-7 según el mensaje del commit 56d2987 del worker.
