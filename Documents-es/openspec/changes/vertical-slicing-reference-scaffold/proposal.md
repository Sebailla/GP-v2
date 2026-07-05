# Propuesta — `vertical-slicing-reference-scaffold`

> **Estado**: borrador · fase de propuesta
> **Proyecto**: `gastos-personales-reference`
> **Branch**: `develop` (trabajo) · `main` (inmutable)
> **Convención de cambios**: kebab-case
> **Artifact store**: hybrid (archivos `openspec/` + observaciones Engram)
> **Modo**: interactive
> **Autor**: SDD orchestrator → `sdd-propose` (executor)
> **Fecha**: 2026-07-04

---

## 1. Intención

Este change scaffold el repositorio **`gastos-personales-reference`** de punta a punta para que pueda sostenerse solo como un **vertical-slicing reference / spike** publicable, ejecutable y reproducible, dirigido a un monorepo de Next.js 15 + NestJS 10 + Prisma.

**Pain que resuelve (para el equipo y el ecosistema amplio):**

1. **Decisión arquitectónica sin artefacto ejecutable.** El equipo viene discutiendo "vertical slicing por módulo de funcionalidad" como arquitectura target para migrar `gastos-personales/` desde su layout actual de Clean-Architecture-por-módulo. Sin un repositorio de referencia ejecutable, cada revisión arquitectónica vuelve a litigar las mismas preguntas. Este change produce un ejemplo concreto y ejecutable para que los debates futuros estén anclados en código.
2. **Sin playbook compartido para migraciones.** Cuando arranque la migración real, vamos a necesitar mover un módulo desde el layout actual `src/modules/*/{domain,application,infrastructure}` a un slice autosuficiente `libs/features/<feature>/{client,server,shared}`. Sin un playbook ejecutable, cada migración es a medida. Este change entrega el playbook (`docs/migration-playbook.md` + scripts hermanos `scripts/migrate/*.sh`) para que el primer slice real de migración sea la *segunda* vez que lo hacemos, no la primera.
3. **Arquitectura implícita → boundaries explícitos.** El modelo de vertical slicing se enforcea mediante boundary rules de ESLint flat-config. Sin las reglas, la arquitectura es una sugerencia amable. Con ellas, la arquitectura es enforced por `pnpm turbo run lint`.
4. **Riesgo de lock-in en el repositorio real.** El repo actual `gastos-personales/` es la source of truth del equipo. Experimentar con una arquitectura nueva directamente en él acopla el experimento a datos de producción y crea reverts que afectan la moral. Un *repositorio de referencia aparte* permite que el experimento falle de manera segura.

**Lo que este change NO es.** **No** es una copia 1:1 del repositorio actual `gastos-personales/`. **No** es producción. **No** migra `gastos-personales/`. Los dos repos coexisten; ambos artifact stores son independientes. Ver [Referencias cruzadas](#10-referencias-cruzadas) y `sdd-init/gastos-personales-reference` para el boundary statement.

---

## 2. Alcance

### 2.1 Dentro del alcance

Todo lo que sigue debe estar presente, funcionando y ejecutable en un clean clone una vez que este change quede verificado.

#### 2.1.1 Esqueleto del monorepo

| Item | Ubicación | Notas |
|---|---|---|
| `pnpm-workspace.yaml` | repo root | Declara los workspaces `apps/*` y `libs/*`. |
| `turbo.json` | repo root | Pipelines: `build`, `dev`, `lint`, `test`, `typecheck`, `bdd`. |
| `package.json` (root) | repo root | pnpm 10.x; TS 5 strict; scripts de workspace (`pnpm db:up`, `pnpm db:down`, `pnpm prisma migrate dev`, `pnpm turbo run build lint test typecheck bdd`). |
| `tsconfig.base.json` | repo root | Strict mode; path aliases para imports del workspace. |
| `.editorconfig`, `.gitignore`, `.nvmrc` | repo root | Higiene estándar. |
| `LICENSE` (MIT) | repo root | **Repo publicable.** MIT según Locked Decision #6. |
| `README.md` | repo root | Quickstart (`pnpm install`, `pnpm db:up`, `pnpm prisma migrate dev`, `pnpm dev`). |
| `CONTRIBUTING.md` | repo root | Guía ligera; alineada con el intent publicable. |
| `docker-compose.yml` | repo root | Solo el servicio Postgres. |

#### 2.1.2 Apps

| App | Stack | Responsabilidad |
|---|---|---|
| `apps/web` | Next.js 15 App Router, sin i18n | Pantallas de auth (sign-in, sign-up, forgot/reset password, lista de sesiones), lista de transactions + crear + editar + borrar + categorías, vista admin con RBAC. Server Components por defecto; Server Actions para mutaciones; Route Handlers sólo donde se necesiten. |
| `apps/api` | NestJS 10 con `@nestjs/config`, `@nestjs/jwt`, `class-validator`, Zod validation pipe | Endpoints REST consumidos por `apps/web`; emite eventos a `libs/core/events` para side effects cross-module. |

#### 2.1.3 Libraries

| Library | Layout | Propósito |
|---|---|---|
| `libs/core/database` | Prisma client + schema como single source of truth | Acceso a datos compartido; las migraciones viven acá. |
| `libs/core/events` | Dispatcher de eventos minimalista | Según `architecture-standards`: side effects cross-module sólo vía eventos. |
| `libs/features/auth` | `client/`, `server/`, `shared/`, `docs/*.feature` | NextAuth v5 (Auth.js) + `@auth/prisma-adapter`. Email+password + Google OAuth, ambos providers en paralelo contra `@auth/prisma-adapter`. |
| `libs/features/transactions` | `client/`, `server/`, `shared/`, `docs/*.feature` | Módulo de transactions con multi-currency (tablas Currency + FxRate, conversión FX con warning de staleness >24h), categorías con soft-delete (filtro `deletedAt` en las queries). |
| `libs/shared-utils` | helpers puros | Formateo de fechas, formateo de monedas, aritmética decimal-segura (no `BigInt`). |
| `libs/core/config` | Zod env schema | Valida `process.env` al startup; fail-fast. |

#### 2.1.4 Cross-cutting concerns

- **Validation**: Zod es la single source of truth; los schemas en `libs/features/*/shared/schemas/*.ts` se reutilizan tanto en client (forms) como en server (NestJS validation pipe). Sin validadores duplicados.
- **Auth**: NextAuth v5 con `@auth/prisma-adapter`. Dos providers configurados en paralelo: **email+password (Credentials)** y **Google OAuth**. Ver Locked Decisions #2 y #5.
- **Auth edges dentro del alcance** (Locked Decision #8):
  - login email+password — happy path **e** invalid credentials
  - OAuth Google — happy path con provider stub (NEXTAUTH_URL-switchable)
  - password reset — forgot + reset flow con email mockeado
  - sessions list + revoke
  - RBAC roles (admin / user) con permissions enforced en el **domain** layer, no en la UI
- **Tx rules** (Locked Decision #7):
  - **multi-currency** vía tablas `Currency` y `FxRate`; conversión FX en el momento de la escritura con un **warning de staleness cuando el FX rate tiene más de 24 horas**
  - **soft-delete categorías** con filtro `deletedAt` en *cada* query de categorías (sin opt-out)
- **Tx edges dentro del alcance** (Locked Decision #9):
  - validation: `amount > 0`, currency válida, category existente
  - conversión FX con warning de stale-rate expuesto como domain event
  - **idempotency-key en POST** para prevenir transactions duplicadas en retry
  - **decimal precision** vía Prisma `Decimal` (nunca `BigInt` — `BigInt` truncaría los centavos en silencio)
  - **audit log**: cada fila de Transaction lleva `createdBy` / `updatedBy` con los user IDs
  - soft-delete filter aplicado en todas las queries de categorías
  - **sign-aware totals** (income vs expense) + totales por categoría + alertas por umbral
- **OAuth testing strategy** (Locked Decision #5):
  - provider stub vía NEXTAUTH_URL-switchable config (un fake auth server URL hace que NextAuth crea que está hablando con Google)
  - BDD cubre **email+password end-to-end** + **OAuth Google happy path solamente**
  - OAuth callback contra el Google OAuth real es **integration-only / manual**, no en Gherkin
- **BDD coverage** (Locked Decision #3): **4–6 `.feature` por módulo** (auth + transactions). Step definitions compartidas por feature (p.ej. `libs/features/auth/docs/step-defs/`).
- **Playbook dual format** (Locked Decision #4): cada etapa del playbook se entrega como **un `.md` (prosa para humanos) pareado con un `.sh` hermano (idempotente para AI agents)**.
- **Tests**: Vitest (`pnpm test`) para unit + integration; `@cucumber/cucumber` (`pnpm bdd`) leyendo `libs/features/*/docs/*.feature`. **Strict TDD mode** (`strict_tdd: true` en `openspec/config.yaml`).
- **Lint**: ESLint flat config (`eslint.config.mjs`) con custom boundary rules:
  - sin imports desde `*/server/*` hacia `*/client/*`
  - sin imports cross-module directos (rutear vía eventos o shared ports)
- **Coverage**: 60% en lines / branches / functions / statements (declarado en `openspec/config.yaml`; **no** enforced en sdd-init según el preflight cache; esta propuesta **opt-out del enforcement** para el primer slice — ver §5 Riesgos).
- **Env**: validado con un schema Zod al startup; secrets vía `.env` (gitignored) + `.env.example` (commiteado).

#### 2.1.5 Documentación (mirror English + Spanish)

| Path | Propósito |
|---|---|
| `docs/architecture.md` | Visión general de la arquitectura (English, primary). |
| `Documents-es/docs/architecture.md` | Mirror en español de `architecture.md`. Mismo contenido, sólo delta de locale. |
| `docs/migration-playbook.md` | Playbook human-readable (English). Una sección por etapa del playbook. |
| `Documents-es/docs/migration-playbook.md` | Mirror en español. |
| `scripts/migrate/*.sh` | Scripts idempotentes pareados con cada etapa del playbook. Re-ejecutarlos sobre una branch vacía es un no-op o imprime `already applied`. |
| `docs/decisions/` (opcional) | ADR(s) para la decisión de vertical slicing. |

#### 2.1.6 Acceptance target para el playbook

Según Locked Decision #10, el *criterio de aceptación* para el playbook (no para esta propuesta — el playbook se usará después sobre el repo real) es: **slice piloto donde el módulo transactions de `gastos-personales/` se migra módulo a módulo usando el playbook; "done" = feature parity 1:1 con el slice migrado + la test suite del reference pasando contra el código migrado.** Esta propuesta define la *forma ejecutable* de ese playbook; no lo corre todavía contra `gastos-personales/`.

#### 2.1.7 Lifecycle del repo

Según Locked Decision #11: este repositorio de referencia **permanece vivo hasta que el equipo arranque el primer slice real de migración desde `gastos-personales/` hacia el target vertical-slice**. Después de eso, se archiva. Mientras tanto, se aceptan fixes de seguridad y de typos; no se aceptan adiciones de features.

### 2.2 Fuera del alcance (non-goals explícitos)

Todo lo que sigue queda **deliberadamente excluido** de este change. Futuros changes pueden sumarlos.

1. **i18n** — `apps/web` entrega sólo español + English a nivel de los `docs/` (architecture + playbook). Los strings de UI permanecen en English.
2. **Sentry / error reporting SaaS** — sin APM de terceros.
3. **Rate limiting** en el borde de la API (NestJS guard, NGINX, o CDN).
4. **Múltiples OAuth providers más allá de Google** — sin Facebook / GitHub / Apple.
5. **Production hardening**: sin integración con secrets manager, sin HSTS, sin CSP más allá de los defaults de Next.js, sin config de CDN.
6. **Observability** stack (OpenTelemetry, Prometheus, structured log shipping).
7. **Performance tuning** más allá de lo que `pnpm turbo run build` produce por defecto.
8. **CI workflows más allá de lint + test + typecheck + BDD básico** — sin pipelines de deploy, sin staging, sin automatización de releases. CI workflows para esos pipelines pueden agregarse en un *change posterior* aparte.
9. **Email delivery** — los emails de password-reset están **mockeados** en el reference repo. Una integración SMTP real está fuera del alcance.
10. **Real Google OAuth handshake** — sólo el happy path stub está cubierto en BDD (ver Locked Decision #5). La integración manual contra Google real está documentada en `docs/architecture.md` pero no automatizada.
11. **Enforcement del coverage gate** — el target del 60% está documentado, no enforced como failure de CI (ver §5 Riesgos para el rationale).
12. **Migración de `gastos-personales/`** — eso es un repo aparte con su propio SDD lifecycle.

---

## 3. Áreas afectadas

Los siguientes directorios / archivos / conceptos serán **creados** (el repo está actualmente bare):

```
gastos-personales-reference/                 # repo root
├── .editorconfig                            # NEW
├── .env.example                             # NEW
├── .gitignore                               # NEW
├── .nvmrc                                   # NEW
├── AGENTS.md                                # NEW (convenciones locales del proyecto, derivadas de openspec/config.yaml)
├── CONTRIBUTING.md                          # NEW
├── LICENSE                                  # NEW (MIT, Locked Decision #6)
├── README.md                                # NEW (quickstart)
├── docker-compose.yml                       # NEW (sólo el servicio Postgres)
├── eslint.config.mjs                        # NEW (flat config + boundary rules)
├── package.json                             # NEW (root workspace package)
├── pnpm-workspace.yaml                      # NEW
├── tsconfig.base.json                       # NEW
├── turbo.json                               # NEW (pipelines build/dev/lint/test/typecheck/bdd)
├── apps/
│   ├── api/                                 # NEW — NestJS 10
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── modules/                     # thin wrappers de Nest module sobre libs/features/*/server
│   └── web/                                 # NEW — Next.js 15 App Router
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.mjs
│       └── app/
│           ├── layout.tsx
│           ├── page.tsx                     # landing
│           ├── (auth)/                      # route group: sign-in, sign-up, forgot/reset
│           ├── (app)/                       # route group: transactions, categories, sessions, admin
│           └── api/                         # route handlers cuando los Server Actions no alcanzan
├── libs/
│   ├── core/
│   │   ├── config/                          # NEW — Zod env schema + entry env.ts
│   │   ├── database/                        # NEW — Prisma schema + client + migrations
│   │   │   ├── prisma/schema.prisma         # User, Account, Session, VerificationToken, Currency, FxRate, Category, Transaction, AuditLog
│   │   │   ├── prisma/migrations/
│   │   │   └── src/
│   │   └── events/                          # NEW — dispatcher de eventos minimalista
│   ├── features/
│   │   ├── auth/                            # NEW
│   │   │   ├── package.json
│   │   │   ├── client/                      # React components, hooks, forms
│   │   │   ├── server/                      # NextAuth config + auth service + RBAC
│   │   │   ├── shared/                      # Zod schemas, shared types
│   │   │   └── docs/
│   │   │       ├── *.feature                # 4–6 Gherkin files
│   │   │       └── step-defs/               # step definitions compartidas
│   │   └── transactions/                    # NEW
│   │       ├── package.json
│   │       ├── client/
│   │       ├── server/
│   │       ├── shared/
│   │       └── docs/
│   │           ├── *.feature
│   │           └── step-defs/
│   └── shared-utils/                        # NEW — date-formatting, currency, decimal helpers
├── docs/
│   ├── architecture.md                      # NEW (English)
│   ├── migration-playbook.md                # NEW (English)
│   └── decisions/                           # NEW (ADRs opcionales)
├── Documents-es/
│   └── docs/
│       ├── architecture.md                  # NEW (mirror español)
│       └── migration-playbook.md            # NEW (mirror español)
├── scripts/
│   └── migrate/                             # NEW — *.sh pareados con las etapas del playbook
│       ├── 00-preflight.sh
│       ├── 10-extract-domain.sh
│       ├── 20-create-feature-slice.sh
│       ├── 30-wire-routes.sh
│       ├── 40-port-tests.sh
│       ├── 50-update-docs.sh
│       └── 99-finalize.sh
├── openspec/
│   │   ├── config.yaml                          # EXISTS (declarado por sdd-init)
│   │   └── changes/
│   │       └── vertical-slicing-reference-scaffold/
│   │           └── proposal.md                  # ESTE ARCHIVO
└── .atl/                                    # opcional: cache local del registry (no requerido)
```

### Conceptos que cambian

- **Estructura de módulos**: de "sin código" al layout de vertical slicing descripto arriba.
- **Modelo de datos**: el schema Prisma es *nuevo* (no se migra desde `gastos-personales/`); incluye `User`, `Account`, `Session`, `VerificationToken` (NextAuth), `Currency`, `FxRate`, `Category` (con `deletedAt`), `Transaction` (con `amount Decimal`, `currency`, `idempotencyKey`, `createdBy`, `updatedBy`), `AuditLog`.
- **Tooling**: introducir pnpm workspaces, Turbo, Vitest, Cucumber, ESLint flat config, Zod, Docker compose.
- **Contrato de documentación**: cada doc tiene un primary en English + mirror en español bajo `Documents-es/`.

### Conceptos que NO cambian

- El branch model (`develop` trabajo, `main` inmutable).
- El artifact store (`hybrid`).
- El pipeline de SDD declarado en `openspec/config.yaml`.
- El repositorio existente `gastos-personales/` (repo aparte, lifecycle aparte).

---

## 4. Contexto preexistente del proyecto (de `sdd-init`)

El siguiente contexto queda establecido por `sdd-init/gastos-personales-reference` y es la baseline sobre la que se construye esta propuesta. No relitigar; tratar como dado.

| Campo | Valor | Source |
|---|---|---|
| Project root | `/Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference/` | `sdd-init` |
| Intención | Reference / spike validando el modelo de vertical slicing. NO producción. Coexiste con `gastos-personales/`. | `sdd-init` |
| Branch model | `develop` trabajo · `main` inmutable | `openspec/config.yaml#branch_model` |
| Artifact store | `hybrid` (openspec + Engram) | `openspec/config.yaml#artifact_store` |
| Convención de cambios | kebab-case | `openspec/config.yaml#change_convention` |
| Strict TDD | **enabled** (`strict_tdd: true`) | `openspec/config.yaml` |
| Test runner | `pnpm test` (Vitest) | `openspec/config.yaml` |
| BDD runner | `pnpm bdd` (`@cucumber/cucumber`) | `openspec/config.yaml` |
| Coverage threshold | 60% (lines/branches/functions/statements) — **no enforced** en sdd-init | `openspec/config.yaml` |
| Delivery strategy | `ask-on-risk` | `openspec/config.yaml` |
| Chain strategy | `feature-branch-chain` | `openspec/config.yaml` |
| Review budget | 400 changed lines | `openspec/config.yaml` |
| Execution mode | `interactive` | `openspec/config.yaml` |
| Pipeline | proposal → spec → design → tasks → apply → verify → sync → archive | `openspec/config.yaml` |
| Planned stack | TypeScript 5 strict, pnpm 10.x, Turbo, Next.js 15 App Router (sin i18n), NestJS 10, Prisma + Postgres (Docker), `@auth/prisma-adapter`, Vitest, Cucumber, ESLint flat config + boundary rules, Zod, Docker compose Postgres | `openspec/config.yaml#stack` + `sdd-init` |

**Cross-reference**: `sdd-init/gastos-personales-reference` (observación Engram, id 2130, topic_key `sdd-init/gastos-personales-reference`).

**Preflight cache**: `gastos-personales-reference/decisions/sdd-preflight` (observación Engram, id 2128). Registra las elecciones del usuario (interactive + hybrid + ask-on-risk + feature-branch-chain) y el rationale por haber elegido Opción A (repo de referencia aparte) sobre Opción C (migración completa del repo actual).

---

## 5. Riesgos

Se nombran cinco riesgos. Cada uno viene pareado con una *mitigation*, no una *cura* — las mitigations a nivel propuesta son honestas respecto de lo que se puede conseguir sin haber corrido todavía la apply phase.

### Risk R1 — Riesgo de scope-completeness (refactor grande)

**Descripción**: Este es un **scaffold greenfield** con dos apps, seis libraries, ~9+ archivos `.feature` Gherkin, un playbook ejecutable y docs bilingües. Incluso con vertical slicing, el primer slice tocará la mayor parte del monorepo. Las Locked Decisions #7 + #9 (multi-currency, soft-delete, todos los edges auth/tx en alcance) empujan esto decididamente por encima de las 400 changed lines.

**Mitigation**:
- sdd-tasks debe dividir el trabajo en sub-slices dimensionados bajo el budget de 400 lines (esqueleto → auth → transactions → playbook → docs → pulido).
- sdd-apply debe usar `feature-branch-chain` (declarado en `openspec/config.yaml`): chained PRs se acumulan en una rama tracker antes de mergear a `develop`.
- El `Review Workload Guard` del orchestrator se dispara antes de `sdd-apply`; si un sub-slice supera las 400 changed lines, escalar al usuario según `ask-on-risk`.
- El formato dual del playbook (`*.md` + `*.sh`) significa que una sola etapa del playbook ya es un sub-slice — tenemos una descomposición natural disponible.

### Risk R2 — Trigger del Review Workload Guard (>400 lines / chained requerido)

**Descripción**: Según `delivery_strategy=ask-on-risk` y `review_budget_lines=400`, cualquier PR o diff de más de 400 líneas hace que el orchestrator pause y pregunte al usuario cómo seguir.

**Mitigation**:
- sdd-tasks descompone el trabajo para que cada chained PR sea ≤400 changed lines.
- sdd-apply lleva `delivery_strategy=ask-on-risk` y `chain_strategy=feature-branch-chain` en su prompt (el orchestrator debe reenviar esto).
- Si un chain se pasa del budget, el orchestrator o escala al usuario (default) o acepta un `size:exception` explícito del usuario.

### Risk R3 — Fragilidad del modo Engram / Hybrid

**Descripción**: Las fases downstream (`sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`) deben leer esta propuesta. Con modo `hybrid`, pueden leer el archivo `openspec/changes/.../proposal.md` (siempre disponible, commiteado) **o** la observación Engram en topic_key `sdd/vertical-slicing-reference-scaffold/proposal`. Si Engram queda no disponible a mitad de sesión y una fase lee la fuente equivocada, los artefactos downstream se desincronizan.

**Mitigation**:
- La propuesta se escribe en **ambos** stores (archivo + observación). El archivo es la source of truth ante cualquier conflicto; Engram es la recovery cache.
- Todos los prompts de fase deben incluir `topic_key: sdd/vertical-slicing-reference-scaffold/proposal` Y el path del archivo. El phase executor hace fallback al archivo si Engram devuelve vacío.
- El contrato `skill_resolution` del orchestrator requiere que los sub-agents declaren `paths-injected` para lecturas en openspec; un reporte `none` significa que el cache se perdió y el archivo debe releerse.

### Risk R4 — Crecimiento de scope entre Decisión 7 y Decisión 9

**Descripción**: Las Locked Decisions #7 (multi-currency + soft-delete) y #9 (todos los edges auth/tx en alcance) convierten esto de un "scaffold" en un "feature-complete reference". Una apply phase ingenua podría intentar entregar todo en un solo batch.

**Mitigation**:
- sdd-spec debe enumerar los edges como **acceptance criteria explícitas** para que no puedan silenciosamente caerse.
- sdd-tasks debe producir **una task por edge** (p.ej. "implementar idempotency-key handling", "implementar warning de FX stale"). Eso le da al orchestrator un checklist para monitorear el progreso de apply contra la spec.
- El coverage threshold en 60% (no 80%) es un scope guard deliberado: no estamos persiguiendo 80% en cada library.

### Risk R5 — Drift entre docs English / Spanish

**Descripción**: `docs/architecture.md` y `Documents-es/docs/architecture.md` deben mantenerse en lock-step. Lo mismo para el playbook. El drift hace que el contrato bilingüe sea una mentira.

**Mitigation**:
- Ambos archivos se actualizan **en el mismo commit** (regla de commit atómico para pares de docs).
- sdd-verify chequea la existencia + no-vacío de ambos archivos. Un drift en *contenido* es más difícil de detectar automáticamente; aceptamos ese riesgo y lo documentamos.
- El mirror en español del playbook es más corto donde corresponde (p.ej. los ejemplos en English); la *estructura* (headings de etapa, nombres de comandos) debe permanecer idéntica.

### Riesgos menores adicionales (registrados, no blocking)

- **Coverage no enforced en CI**: 60% es un *target*, no un gate. Aceptamos el riesgo de que el drift baje el coverage real. Trade-off: enforced el gate en este slice forzaría al equipo a escribir test scaffolding más rápido de lo que la arquitectura madura; priorizamos claridad arquitectónica sobre métricas de coverage. Un **change futuro** podrá activar el gate una vez que el slice se estabilice.
- **Stack churn durante apply**: minor versions de pnpm/Turbo/NestJS/Next.js pueden moverse entre proposal y apply. La apply phase puede fijar versiones exactas en `package.json` para mantener el snapshot reproducible.
- **Mala configuración del OAuth provider stub**: un `NEXTAUTH_URL` mal puesto podría rutear requests OAuth real-looking a un host falso. Mitigado documentando el env var de manera clara en `.env.example` y asserteándolo en el Zod env schema.

---

## 6. Rollback

### 6.1 Rollback del change completo

Esto es un **scaffold greenfield**: el repo es nuevo y no contiene datos de producción. El rollback del change completo es **borrar el repo**.

```bash
# desde un directorio padre
rm -rf /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
```

El repo hermano `gastos-personales/` queda intacto. Ambos repos son git trees independientes.

### 6.2 Rollback por feature

Si un solo feature slice está mal (p.ej. `libs/features/auth`), se elimina sólo esa library:

```bash
git rm -rf libs/features/auth
# ajustar eslint.config.mjs para sacar overrides específicos de auth
# ajustar apps/web y apps/api para sacar imports de auth
# ajustar scripts/migrate/* para sacar las etapas de auth
# commitear la remoción en develop
```

Como `apps/web` y `apps/api` importan features vía path aliases (`@features/auth`, `@features/transactions`), quitar una library es un *compile error* en los apps — un modo de falla deseable que fuerza un revert coherente.

### 6.3 Rollback por task

Cada task en `tasks.md` corresponde a un commit chico en `develop`. Para hacer rollback de una sola task:

```bash
git revert <commit-sha-de-esa-task>
```

El modo Strict TDD + commits atómicos por task hacen esto seguro.

### 6.4 Lo que NO vamos a hacer

- **No** vamos a force-push a `develop`.
- **No** vamos a reescribir historia de git en `develop`.
- **No** vamos a hacer reset de `develop` a un commit pre-scaffold (el repo es nuevo — no hay commit pre-scaffold con valor de negocio).

---

## 7. Criterios de éxito

Este change está **done** cuando **todas** las siguientes son verdaderas. Son los gates que correrá `sdd-verify`.

### 7.1 Gates de build + infraestructura

| # | Criterio | Cómo se verifica |
|---|---|---|
| G1 | `pnpm install` sobre un clean clone completa sin errores | `pnpm install` exit code 0 |
| G2 | `pnpm db:up` levanta el container Postgres de Docker | `docker compose ps` muestra el servicio healthy |
| G3 | `pnpm prisma migrate dev` aplica todas las migrations de manera limpia | `prisma/migrations/` poblado, schema matchea DB |
| G4 | `pnpm turbo run build` devuelve 0 en todos los packages | exit code 0; `apps/web/.next` + `apps/api/dist` producidos |
| G5 | `pnpm turbo run lint` devuelve 0 | exit code 0; ESLint flat config enforcea boundary rules |
| G6 | `pnpm turbo run test` devuelve 0 | Vitest exit code 0 |
| G7 | `pnpm turbo run typecheck` devuelve 0 | `tsc --noEmit` exit code 0 sobre el workspace |
| G8 | `pnpm turbo run bdd` devuelve 0 | `@cucumber/cucumber` exit code 0; todos los scenarios pasan |

### 7.2 Gates de BDD coverage

| # | Criterio | Cómo se verifica |
|---|---|---|
| G9 | Al menos **9 archivos `.feature`** existen (4 auth + 4 transactions + al menos 1 spec-level; el +1 es una sobre-asignación razonable si una feature se parte naturalmente). La Locked Decision #3 permite 4–6 por módulo; apuntamos a 4+4 con extensiones opcionales. | `find libs/features -name '*.feature' \| wc -l` ≥ 9 |
| G10 | Al menos **30 scenarios** totales entre los `.feature` | grep-and-count sobre las líneas `Scenario:` |
| G11 | Step definitions están **compartidas por feature** bajo `libs/features/<feature>/docs/step-defs/` | chequeo de path |
| G12 | BDD cubre **email+password end-to-end** (happy + invalid creds) **y** el happy path de OAuth Google stubbed | inspección del contenido del feature |
| G13 | OAuth callback contra Google real **NO** está en Gherkin (manual/integration only) | inspección del contenido del feature; asserción de ausencia |

### 7.3 Gates de arquitectura / boundaries

| # | Criterio | Cómo se verifica |
|---|---|---|
| G14 | ESLint boundary rules están **activas**: ningún import `*/server/*` desde `*/client/*`; ningún import cross-module directo | `./node_modules/.bin/eslint .` reporta 0 errores |
| G15 | Una **violación deliberada** (test fixture) es detectada por ESLint y reportada | sanity check sobre fixture |
| G16 | `libs/core/database` es el **único** lugar donde se instancia el Prisma client | grep `new PrismaClient(` devuelve 1 (dentro de `libs/core/database`) |
| G17 | Los schemas en `libs/features/*/shared/` son **reutilizados** tanto por client (forms) como por server (validation pipe) — sin schemas Zod duplicados | grep sobre el path canónico del schema |

### 7.4 Gates de reglas de dominio (Locked Decisions #7, #8, #9)

| # | Criterio | Cómo se verifica |
|---|---|---|
| G18 | **Multi-currency**: existen las tablas `Currency` y `FxRate`; la conversión FX tiene un warning de staleness a >24h | inspección del schema + unit test sobre el conversion service |
| G19 | **Soft-delete categorías**: cada query de categorías filtra `deletedAt: null` | grep sobre `deletedAt: null` en los repositorios; ausencia = bug |
| G20 | **Email+password + Google OAuth** providers corren en paralelo contra `@auth/prisma-adapter` | `libs/features/auth/server/auth.config.ts` declara ambos providers |
| G21 | **Password reset** (forgot + reset) está implementado con **email mockeado** | BDD lo cubre; el mock está documentado |
| G22 | **Sessions list + revoke** está implementado | BDD lo cubre |
| G23 | **RBAC roles** (admin / user) enforced en el **domain** layer (no sólo en la UI) | el chequeo de permission vive en un domain service, no en un React component |
| G24 | **Tx validation**: `amount > 0`, currency válida, category existente | Zod schema + unit tests |
| G25 | **Idempotency-key en POST** previene duplicados en retry | unit test sobre la action |
| G26 | **Decimal precision**: `Transaction.amount` es Prisma `Decimal`, no `BigInt` | inspección del schema |
| G27 | **Audit log**: `createdBy` / `updatedBy` en cada write de Transaction | schema + service test |
| G28 | **Sign-aware totals** (income vs expense) + totales por categoría + alertas por umbral | unit tests sobre el totals service |

### 7.5 Gates de documentación

| # | Criterio | Cómo se verifica |
|---|---|---|
| G29 | `docs/architecture.md` existe y no está vacío | chequeo de archivo |
| G30 | `Documents-es/docs/architecture.md` existe; **mismo contenido** (sin delta de locale) | el diff debería diferir sólo en strings específicos del idioma |
| G31 | `docs/migration-playbook.md` existe con una sección por etapa del playbook | chequeo de archivo + chequeo del conteo de secciones |
| G32 | `Documents-es/docs/migration-playbook.md` existe | chequeo de archivo |
| G33 | `scripts/migrate/*.sh` existe; **un `.sh` por etapa del playbook** | chequeo de la cantidad de archivos |
| G34 | Cada `*.sh` es **idempotente**: re-ejecutarlo sobre una branch vacía es un no-op o imprime `already applied` | correr cada script dos veces sobre un fresh clone; exit 0 las dos veces |
| G35 | `LICENSE` es **MIT** | contenido del archivo |
| G36 | `CONTRIBUTING.md` y `README.md` existen (repo publicable) | chequeo de archivo |

### 7.6 Gates de branch / higiene

| # | Criterio | Cómo se verifica |
|---|---|---|
| G37 | Todos los commits están en `develop` (sin commits en `main`) | `git log main` no muestra commits nuevos más allá de la baseline de sdd-init |
| G38 | `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` es la **propuesta canónica** | el archivo existe; el contenido de esta propuesta matchea la observación Engram en `sdd/vertical-slicing-reference-scaffold/proposal` |
| G39 | La observación Engram en topic_key `sdd/vertical-slicing-reference-scaffold/proposal` existe y es recuperable | `mem_search` + `mem_get_observation` |

### 7.7 Cobertura de las Locked Decisions (Locked Decisions #1–#11)

Las 11 locked product assumptions están reflejadas en el texto de esta propuesta. El mapeo:

| Locked # | Decisión | Reflejada en |
|---|---|---|
| #1 | Publicable; necesita LICENSE + ADR + diagrama + contributing guide | §2.1.1, §2.1.5, G29–G36 |
| #2 | email+password (Credentials) + Google OAuth, ambos providers contra `@auth/prisma-adapter` | §2.1.4, G20 |
| #3 | 4–6 `.feature` por módulo; step defs compartidas por feature | §2.1.4, G9–G11 |
| #4 | Playbook dual format (`.md` prosa + `.sh` hermano para AI agents) | §2.1.5, G31–G34 |
| #5 | OAuth provider stub vía NEXTAUTH_URL; BDD cubre email+pw + OAuth happy stubbed; OAuth real = integration-only/manual | §2.1.4, G12, G13 |
| #6 | LICENSE = MIT | §2.1.1, G35 |
| #7 | Multi-currency (Currency + FxRate, warning de staleness >24h) + categorías con soft-delete | §2.1.4, G18, G19 |
| #8 | Auth edges dentro del alcance (login +/-, OAuth stub, password reset, sessions, RBAC) | §2.1.4, G20–G23 |
| #9 | Tx edges dentro del alcance (validation, FX warning, idempotency-key, Decimal, audit log, soft-delete filter, sign-aware totals) | §2.1.4, G19, G24–G28 |
| #10 | Aceptación del playbook = feature parity 1:1 sobre un slice piloto de `gastos-personales/` | §2.1.6 (fuera del alcance de esta propuesta; definido para después) |
| #11 | Lifecycle del repo: vivo hasta el primer slice real de migración; acepta sólo fixes de seguridad/typo | §2.1.7 |

---

## 8. Preguntas abiertas

**Ninguna** que bloquee la propuesta. El orchestrator padre corrió tres rondas de preguntas de producto y un pushback de senior architect antes de redactar esta propuesta; las 11 locked decisions de arriba son el input canónico. Decisiones específicas de implementación (p.ej. algoritmo de password hashing, JWT-vs-session para NextAuth, fraseo exacto de los steps de Cucumber) se difieren deliberadamente a la fase **sdd-spec**, que es el nivel de abstracción correcto para ellas.

Dos ítems se flagean acá para que `sdd-spec` los aborde explícitamente, pero son decisiones de *nivel spec*, no *bloqueantes a nivel propuesta*:

1. **Storage strategy para idempotency-key** — ¿mantener una tabla aparte `IdempotencyKey` con TTL, o piggyback sobre `Transaction` con un unique index? Las dos opciones funcionan; la spec phase debería elegir en función del costo de storage vs simplicidad de query.
2. **FX rate source** — para el reference repo, una interfaz inyectada `FxRateProvider` con una implementación in-memory por defecto alcanza. La spec phase debería declarar esto como un port, de modo que un provider real pueda enchufarse después.

---

## 9. Referencias cruzadas

| Referencia | Dónde | Notas |
|---|---|---|
| `sdd-init/gastos-personales-reference` | Observación Engram, id 2130, topic_key `sdd-init/gastos-personales-reference` | Contexto del proyecto, stack planificado, configuración del SDD, branch model, strict_tdd, skills cache. **Autoritativo** para §4 de esta propuesta. |
| `gastos-personales-reference/decisions/sdd-preflight` | Observación Engram, id 2128, topic_key `gastos-personales-reference/decisions/sdd-preflight` | Preflight cache: execution_mode, artifact_store.mode, delivery_strategy, chain_strategy, review_budget. Autoritativo para §1 y §5 de esta propuesta. |
| `openspec/config.yaml` | `openspec/config.yaml` (repo root) | Declara branch_model, strict_tdd, delivery_strategy, chain_strategy, review_budget_lines, execution_mode, planned stack. |
| Locked product assumptions (esta propuesta) | §2.1.4, §2.1.6, §2.1.7, §7.7 | 11 decisiones, acordadas en tres rondas de preguntas de producto. |
| Skills cargados para esta propuesta | `architecture-standards`, `next-best-practices`, `database-strategy`, `testing-standards`, `env-config`, `auth-implementation-patterns` | Cada uno se lee antes de redactar esta propuesta. |
| Fases downstream | sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive | Esta propuesta es el input de sdd-spec. |

---

---

## 10. Próxima fase

`next_recommended`: **`spec`**

`sdd-spec` debería:

- Enumerar los edges de auth y transactions desde §2.1.4 y §7.4 como **acceptance criteria explícitas** (un criterio por edge).
- Resolver las dos decisiones diferidas en §8 (storage de idempotency-key; port para FX rate provider).
- Declarar el data-model schema con más detalle (tipos de columna, índices, constraints).
- Especificar el inventario de archivos Gherkin (cuáles 4+ archivos por módulo, qué scenarios en cada uno).
- Especificar las etapas del migration playbook (cuáles etapas, en qué orden, con qué comandos).

`sdd-design` entonces contesta el *cómo* (estructura del vertical slice, taxonomía de eventos, boundaries de los NestJS modules, route groups de Next.js).

`sdd-tasks` descompone en batches dimensionados a ≤400 changed lines, respetando `delivery_strategy=ask-on-risk` y `chain_strategy=feature-branch-chain`.

---

---

## 11. Addendum UI locked-in (suplemento post-`sdd-propose`)

Por feedback del usuario capturado durante el gate interactivo de `sdd-propose`, el scope de UI fue ampliado más allá del §2.2.1 original (i18n fuera del alcance) y §2.2.5 (sin production hardening). Cuatro decisiones de producto/UI fueron locked-in tras un pushback de senior architect (las cuatro tomadas como opciones recomendadas).

### 11.1 Decisiones de UI locked-in (UI-1 a UI-4)

| # | Decisión | Cómo se verifica |
|---|---|---|
| UI-1 | **shadcn/ui + Tailwind v4** como primitivos de componentes. Los componentes estilo shadcn se copian al repo (no se usa el CLI; archivos `<componente>.tsx` manuales bajo `apps/web/components/ui/`) para que sean customizables. Dependencias: `@radix-ui/react-*` (Radix vanilla por debajo), `class-variance-authority`, `tailwind-merge`. | `apps/web/components.json` presente; al menos Button, Input, Form, Card, Dialog, DropdownMenu, Toast presentes |
| UI-2 | **Design tokens extraídos de `gastos-personales/`** (colors, spacing, typography) y reutilizados vía `apps/web/tailwind.config.ts` o CSS variables en `apps/web/app/globals.css`. La consistencia visual con la app existente es un feature deliberado. | Los archivos de tokens referencian al repo fuente con un breve comment; los colores clave matchean la app existente |
| UI-3 | **English + Spanish** strings de UI vía `next-intl` (matchea el stack i18n ya usado en `gastos-personales/`). `apps/web/messages/en.json` y `apps/web/messages/es.json` existen; locale routing presente (`apps/web/app/[locale]/`). | `pnpm dev` muestra las rutas `/en` y `/es`; al menos un string se renderiza en ambos locales |
| UI-4 | **Pulido production-ready**: WCAG **AA enforced** (4.5:1 contraste de texto, keyboard navigation funcionando, semantic HTML, ARIA sólo cuando el semantic HTML no alcanza). Responsive: breakpoints mobile (≤640px) y desktop (≥1024px) cubiertos; el layout no se rompe entremedio. Cada form tiene estados loading / error / success / empty / validation-error (sin dump de HTML crudo). | El audit automatizado de axe-core pasa para cada screen crítica; el test manual de tab-keyboard pasa; diff visual para al menos un form sobre los 5 estados |

### 11.2 Implicaciones para el texto de la propuesta

- §2.2.1 (Fuera del alcance: i18n) queda **enmendado**: los strings de UI SÍ son bilingües vía `next-intl`.
- §2.2.5 (Fuera del alcance: production hardening incluye el design polish) queda **enmendado**: el design polish SÍ está dentro del alcance y es obligatorio.
- §2.1.4 (Cross-cutting concerns) gana: shadcn/ui instalado; tokens migrados; `next-intl` configurado; lint de axe-core habilitado.
- Se suman los nuevos gates G40–G47 (ver §11.3).
- §7.7 (Cobertura de locked-decisions) gana las filas UI-1..UI-4; §7.5 (Gates de documentación) queda sin cambios (los docs siguen con mirror español/inglés).

### 11.3 Nuevos criterios de éxito (gates UI G40–G47)

| # | Criterio | Cómo se verifica |
|---|---|---|
| G40 | `apps/web/components.json` existe; componentes estilo shadcn presentes en `apps/web/components/ui/{button,input,form,card,dialog,dropdown-menu,toast}.tsx` | chequeo de path de archivos |
| G41 | Design tokens (colors, spacing, typography) referenciados desde `gastos-personales/` y aplicados vía `apps/web/tailwind.config.ts` (o CSS variables en `apps/web/app/globals.css`) | grep + diff visual |
| G42 | `next-intl` configurado en `apps/web`; `apps/web/messages/en.json` y `apps/web/messages/es.json` existen | chequeo de archivos + locale routing funciona |
| G43 | Cada screen en `apps/web/app/(auth)/*` y `apps/web/app/(app)/*` cumple WCAG AA: 4.5:1 contraste de texto; keyboard navigation; semantic HTML; ARIA sólo cuando sea necesario | el audit de `@axe-core/playwright` pasa en cada screen crítica |
| G44 | Cada form tiene los estados loading / error / success / empty / validation-error implementados (sin dump de form HTML crudo) | revisión por componente, por form |
| G45 | Todas las páginas son responsive: breakpoints mobile (≤640px) y desktop (≥1024px) cubiertos; el layout no se rompe entremedio | diff visual responsive |
| G46 | Component tests con Vitest + Testing Library: al menos un test por screen crítica del happy path | `vitest run` reporta component tests pasando por screen crítica |
| G47 | E2E tests con Playwright: al menos un critical flow (login → transactions list → create transaction) pasa | `pnpm turbo run e2e` exit 0; el critical flow test pasa |

### 11.4 Cross-reference

Source-of-truth de la convención: observación Engram id 2133, topic_key `gastos-personales-reference/conventions/ui-complete-not-scaffold`. Contiene las mismas reglas de UI y la trazabilidad del rule.

### 11.5 Implicaciones para las fases downstream de SDD

- **`sdd-spec`**: enumerar las acceptance criteria de UI por screen en las specs de auth y transactions. Tratar la extracción de shadcn/ui como dependencia de cualquier task de UI; tratar la configuración de `next-intl` como pre-requisito de cualquier task que renderice strings user-facing.
- **`sdd-design`**: incluir la descomposición de UI (route groups `(auth)/`, `(app)/`, page components, layouts) y la estrategia de routing i18n (locale-prefix o cookie-based — elegir una y documentar la elección en el design).
- **`sdd-tasks`**: incluir tasks de UI por módulo con cobertura explícita de estados (loading, error, success, empty, validation) y cobertura de tests (component + e2e).
- **`sdd-apply` + `sdd-verify`**: usar G40–G47 como aceptación final además de G1–G39.

---

**Fin de la propuesta.**
