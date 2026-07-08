# Tasks — `vertical-slicing-reference-scaffold`

> **Estado**: borrador · fase de tasks
> **Proyecto**: `gastos-personales-reference`
> **Branch**: `develop` (trabajo) · `main` (inmutable)
> **Artifact store**: hybrid (archivos `openspec/` + observaciones Engram)
> **Modo**: interactive
> **Autor**: SDD orchestrator → `sdd-tasks` (executor)
> **Fecha**: 2026-07-05
> **Inputs leídos**: `proposal.md` (canónico, §1–§11), `specs/auth/spec.md`, `specs/transactions/spec.md`, `design.md` (§1–§12), `openspec/config.yaml`, observaciones Engram `sdd-init/gastos-personales-reference` (id 2130), `sdd/.../proposal` (id 2131), `sdd/.../spec` (id 2134), `sdd/.../design` (id 2135), convenciones `ui-complete-not-scaffold` (id 2133), `doc-mirror-spanish` (id 2132), `branch-model` (id 2129).

---

## Review Workload Forecast (Pronóstico de carga de revisión)

| Campo | Valor |
|-------|-------|
| Estimated changed lines | ~2200–2800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 8 chained PRs (slices 1–8) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |
| Tracker branch | `feat/vertical-slicing-reference-scaffold` |
| Slice targets | feat/vertical-slicing-reference-scaffold (NOT `develop`) |
| Last merge | feat/... → develop after all 8 slices approved |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

> El parser de gates del orchestrator lee estas cuatro líneas en forma literal. Cualquier drift va a hacer fallar el gate de `sdd-apply` con un hallazgo de tipo `Decision-needed` o `budget-risk`.
>
> **¿Por qué este pronóstico?** Según `openspec/config.yaml#review_budget_lines=400` y `delivery_strategy=ask-on-risk`, este change debe descomponerse en PRs encadenados (cada uno dimensionado por debajo de las 400 líneas modificadas). El par R1+R2 de la propuesta §5 ("Riesgo de completitud de alcance" + "Disparo del guard de carga de revisión") pide explícitamente PRs encadenados bajo el budget. El `next_recommended` del diseño (design §next_recommended) también nombra el patrón encadenado. Partimos en **8 slices** para que cada uno tenga margen: skeleton (~280), core+utils (~250), auth-server (~390), auth-client (~380), tx-server (~390), tx-client (~380), BDD+e2e (~390), docs+polish (~280). La cadena targetea `feat/vertical-slicing-reference-scaffold` hasta que los 8 estén aprobados; después un único merge a `develop` (por `chain_strategy=feature-branch-chain`, NO `develop` hasta estar listo). Ningún slice va a `main`; `main` es inmutable (convención branch-model id 2129).

### Reglas globales para `sdd-apply` (forwardeadas al executor)

- **Strict TDD** — `strict_tdd: true` en `openspec/config.yaml`. Cada tarea de código de producción va precedida por un test que falla (RED) y sigue RED → GREEN → TRIANGULATE → REFACTOR.
- **Atomic commits** — cada tarea aterriza como un commit atómico en su slice branch. `git revert <sha>` lo revierte de forma limpia (según proposal §6.3).
- **Branch discipline** — el trabajo sucede en `feat/vertical-slicing-reference-scaffold` (cortada desde `develop`). `develop` recibe la cadena acumulada SOLO después de que los 8 slices estén revisados y aprobados. `main` queda intocada.
- **Spanish mirror** — todo `.md` producido bajo `openspec/changes/vertical-slicing-reference-scaffold/` y `docs/` tiene un sibling de mismo path bajo `Documents-es/` producido en el mismo commit atómico (convención id 2132).
- **UI complete, not scaffold** — cada form implementa loading / error / success / empty / validation-error; cada screen llega a WCAG AA; rutas con prefijo de locale a través de `next-intl`; tests de componente + tests e2e por superficie crítica (convención id 2133 + design §6.4–§6.7).
- **ESLint boundary rules** — `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-cross-module-import`, `no-client-server-import` deben dispararse sobre los fixtures en `tools/eslint-plugin-boundary/__fixtures__/` (design §3.4).

---

## Mapa de slices

Las 8 slices son la menor unidad de trabajo que un PR encadenado embarca. Cada slice tiene boundaries explícitos de start, finish, verificación y rollback, y entra en una sesión de revisión de PR.

| Slice | Asunto | Líneas modificadas aprox. | Subset de gates target |
|-------|--------|---------------------------|------------------------|
| 1 | Skeleton y bootstrap del monorepo | ~280 | G1, G2, G4, G5, G7, G14, G15, G35, G36 |
| 2 | `libs/core` + `libs/shared-utils` | ~250 | G3, G6, G16 |
| 3 | Auth server (vertical slice 1) | ~390 | G17, G20, G21, G22, G23 |
| 4 | Auth client + i18n + shadcn | ~380 | G17, G40, G41, G42, G43, G44, G45, G46 |
| 5 | Transactions server | ~390 | G18, G19, G24, G25, G26, G27, G28 |
| 6 | Transactions client + RBAC UI | ~380 | G40, G41, G43, G44, G45, G46 |
| 7 | BDD + e2e | ~390 | G8, G9, G10, G11, G12, G13, G47 |
| 8 | Docs + polish + verificación final | ~280 | G29, G30, G31, G32, G33, G34, G37, G38, G39 |

Convención de numeración slice → tarea: `T1.1` es la primera tarea del slice 1, etc. Los slices están ordenados; el slice N depende de que el slice N-1 esté mergeado en la rama trackera.

---

## Slice 1: Skeleton y bootstrap del monorepo

**Goal.** Levantar el repo vacío como un monorepo ejecutable, lint-able y type-checkeable con un app placeholder por runtime. Las boundary rules existen pero aún no se ejercitan porque no hay slice que las pueda violar. **En este slice no embarca código de negocio** — solo archivos de scaffolding sobre los que los slices futuros construyen.

**Start.** Branch `develop` vacía (solo `.git/`).
**Finish.** `pnpm turbo run build lint typecheck` sale 0 con ambas apps scaffolded pero inertes. Servicio Postgres docker-compose-up'd pero todavía no migrado. Licencia y quickstart commiteados.
**Verificación.** `pnpm install && pnpm db:up && docker compose ps` muestra Postgres healthy; `pnpm turbo run build lint typecheck` sale 0 en todos los workspaces.
**Rollback.** Commit del slice = uno o más commits atómicos sobre `feat/vertical-slicing-reference-scaffold`. Para descartar el slice: `git revert <slice-base-sha>..<slice-tip-sha> --no-edit` después de la aprobación del merge.

### Task T1.1 — Inicializar el monorepo (pnpm + Turbo workspaces) (~40 líneas)

- **Description.** Declarar pnpm 10.x como package manager, configurar la declaración del workspace, agregar el `package.json` raíz con los scripts de workspace (`db:up`, `db:down`, `prisma migrate dev`, dev, build, lint, test, typecheck, bdd, e2e), y crear `turbo.json` declarando cada pipeline con `dependsOn`/`outputs` según design §3.2.
- **Discovery / file targets.** Crear `pnpm-workspace.yaml` (`packages: ['apps/*', 'libs/*', 'tools/*']`), `package.json` raíz (declara `packageManager: "pnpm@10.x"` y los scripts del workspace), `turbo.json` (pipelines: `build`, `dev`, `lint`, `test`, `typecheck`, `bdd`, `e2e`), `.editorconfig`, `.gitignore` (excluye `.env*`, `node_modules`, `dist`, `.next`, `.turbo`, `coverage`, `bdd-reports`, `playwright-report`, `test-results`), `.nvmrc` (pin de Node 22 LTS).
- **TDD sequence.** **No es una tarea TDD** — scaffolding puramente de config; no hay comportamiento para driver. La verificación es el pipeline en sí saliendo 0.
- **Verificación.** `pnpm install` sale 0 con el layout de workspace vacío; `pnpm turbo run build lint typecheck` sale 0 incluso con workspaces vacíos (Turbo hace short-circuit de workspaces vacíos).
- **Rollback.** `git revert <T1.1-sha>`.
- **Files touched (rough).** `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `.editorconfig`, `.gitignore`, `.nvmrc` (~40 líneas en total).

### Task T1.2 — `tsconfig.base.json` con path aliases (~50 líneas)

- **Description.** Config base de TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "Bundler"`, `target: "ES2022"`, `module: "ESNext"`) más los path aliases de workspace documentados en design §3.3 (`@core/database`, `@core/events`, `@core/config`, `@features/auth`, `@features/transactions`, `@shared-utils/*`).
- **Discovery / file targets.** Crear `tsconfig.base.json` en la raíz del repo.
- **TDD sequence.** **No es una tarea TDD.** La verificación es `tsc --noEmit` sobre el workspace (todavía vacío).
- **Verificación.** Agregar la base a un workspace; `pnpm turbo run typecheck` sale 0.
- **Rollback.** `git revert <T1.2-sha>`.
- **Files touched (rough).** `tsconfig.base.json` (~50 líneas).

### Task T1.3 — ESLint flat config + plugin de boundary custom (~80 líneas)

- **Description.** Levantar la flat config (`eslint.config.mjs`) y el plugin de boundary custom en `tools/eslint-plugin-boundary/`. Cuatro reglas no negociables: `no-client-server-import` (bloquea imports de `*/server/*` dentro de `*/client/*`), `no-cross-module-import` (bloquea imports directos de `libs/features/<other>` excepto vía `@core/events` o ports compartidos), `no-prisma-outside-core` (bloquea `new PrismaClient(` fuera de `libs/core/database/src/`), `no-schemas-outside-shared` (bloquea schemas Zod fuera de `libs/features/*/shared/schemas/*` y `libs/core/config/env.schema.ts`). Quinta regla opcional: `no-mojibake-in-docs` (bloquea codepoints CJK en `Documents-es/**/*.md`). Cada regla tiene un fixture `valid.ts` y `invalid.ts` bajo `tools/eslint-plugin-boundary/__fixtures__/<rule>/`.
- **Discovery / file targets.** Crear `tools/eslint-plugin-boundary/` con `package.json`, `index.cjs` y archivos por regla (`rules/no-client-server-import.cjs`, etc.); `eslint.config.mjs` extiende el export `recommended` del plugin; agregar fixtures bajo `tools/eslint-plugin-boundary/__fixtures__/{no-client-server-import,no-cross-module-import,no-prisma-outside-core,no-schemas-outside-shared}/{valid,invalid}.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR por cada regla usando su par de fixtures. Orden: `no-client-server-import` primero (la match AST más simple sobre import paths), después `no-prisma-outside-core` (match AST sobre `NewExpression` con callee.name === 'PrismaClient'), después `no-schemas-outside-shared` (match AST sobre `CallExpression` con callee empezando con `z.` fuera de paths permitidos), después `no-cross-module-import` (la más sutil — necesita conocer imports de `libs/features/<x>` vs la lista de excepciones).
- **Verificación.** `pnpm turbo run lint` sale 0 sobre el workspace (todavía no hay código fuente para violar); correr `eslint tools/eslint-plugin-boundary/__fixtures__/<rule>/invalid.ts` reporta la violación esperada por regla (4 + 5 aserciones positivas opcionales). Agregar un script dedicado de test de fixtures: `pnpm turbo run lint:fixtures` corre sobre todos los `invalid.ts` y asserts un conteo de violaciones no vacío por archivo.
- **Rollback.** `git revert <T1.3-sha>`.
- **Files touched (rough).** `eslint.config.mjs`, `tools/eslint-plugin-boundary/**` (~80 líneas).

### Task T1.4 — LICENSE (MIT) + README.md + CONTRIBUTING.md + AGENTS.md (~60 líneas)

- **Description.** Según Locked Decision #6 (`LICENSE = MIT`) y `openspec/config.yaml#docs`. `README.md` documenta la intención publicable y el quickstart: `pnpm install`, `pnpm db:up`, `pnpm prisma migrate dev`, `pnpm dev`. `CONTRIBUTING.md` es una one-pager liviana. `AGENTS.md` es el archivo de convenciones locales del proyecto — mirrorea el subset relevante de `openspec/config.yaml` para cualquier agente que no recorra la carpeta openspec.
- **Discovery / file targets.** Crear `LICENSE` (cuerpo MIT, texto completo), `README.md`, `CONTRIBUTING.md`, `AGENTS.md`. Referenciar las convenciones Engram id 2129 (`branch-model`), 2132 (`doc-mirror-spanish`), 2133 (`ui-complete-not-scaffold`).
- **TDD sequence.** **No es una tarea TDD.**
- **Verificación.** Presencia de archivos + `wc -l LICENSE README.md CONTRIBUTING.md AGENTS.md` reporta no-cero por archivo; `grep -F 'MIT License'` tiene éxito en `LICENSE`.
- **Rollback.** `git revert <T1.4-sha>`.
- **Files touched (rough).** `LICENSE`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md` (~60 líneas).

### Task T1.5 — `docker-compose.yml` para Postgres + scripts de db (~20 líneas)

- **Description.** Compose file de un único servicio con una imagen de Postgres 16, expuesto en el `5432` por defecto, healthcheck y un volumen con nombre. Scripts raíz (en `package.json`) envuelven el ciclo de vida de compose: `db:up`, `db:down`, `db:reset` (`down -v && up -d`), `db:logs`.
- **Discovery / file targets.** Crear `docker-compose.yml`, agregar entradas `scripts` en `package.json` raíz (`db:up`, `db:down`, `db:reset`, `db:logs`). El connection string de la base `DATABASE_URL=postgres://postgres:postgres@localhost:5432/gastos_reference` aparece en `.env.example` (T1.6 / Slice 2 lo referenciará).
- **TDD sequence.** **No es una tarea TDD.** La verificación es el health check del servicio.
- **Verificación.** `pnpm db:up && docker compose ps` reporta el servicio `postgres` healthy; `pnpm db:down && docker compose ps` muestra que el servicio ya no está.
- **Rollback.** `git revert <T1.5-sha>`.
- **Files touched (rough).** `docker-compose.yml`, updates de `package.json` raíz (~20 líneas).

### Task T1.6 — Scaffold de `apps/web` (Next.js 15 mínimo) (~30 líneas)

- **Description.** Bootstrap del workspace de Next.js 15 App Router con el shell `app/[locale]/layout.tsx` — pero solo con placeholders: el layout renderiza `<html lang={locale}>` y `{children}`, sin providers todavía, sin UI primitives todavía (esas embarcan en el Slice 4). `next.config.ts` es mínimo (sin `createNextIntlPlugin` aún — se agrega en el Slice 4). No hay deps en `package.json` más allá de lo que Next 15 requiere (`next`, `react`, `react-dom`, `typescript`).
- **Discovery / file targets.** Crear `apps/web/{package.json,tsconfig.json,next.config.ts,app/[locale]/layout.tsx,app/[locale]/page.tsx}`. El `tsconfig.json` extiende `tsconfig.base.json` y declara los path aliases. **`next.config.ts` y `package.json` reciben las deps completas en el Slice 4** — este slice solo agrega el mínimo para compilar una landing vacía.
- **TDD sequence.** **No es una tarea TDD** acá. Smoke check: `pnpm --filter web build` produce artefactos en `.next/`; `pnpm --filter web dev` arranca sin tirar errores.
- **Verificación.** `pnpm turbo run build` produce `apps/web/.next/`; `pnpm turbo run typecheck` sale 0; `pnpm turbo run lint` sale 0.
- **Rollback.** `git revert <T1.6-sha>`.
- **Files touched (rough).** `apps/web/**` (~30 líneas).

### Task T1.7 — Scaffold de `apps/api` (NestJS 10 mínimo) (~30 líneas)

- **Description.** Bootstrap del workspace NestJS 10 en el puerto 3001 con un único `app.module.ts` que todavía no importa nada (los módulos de feature se cablean en los Slices 3 y 5). `main.ts` llama a `NestFactory.create(AppModule)` y escucha en `process.env.PORT ?? 3001`. Agregar `@nestjs/{config,common,core}` y `reflect-metadata` a `apps/api/package.json`. `nest-cli.json` + `tsconfig.json` según lo que el boot necesita.
- **Discovery / file targets.** Crear `apps/api/{package.json,tsconfig.json,nest-cli.json,src/main.ts,src/app.module.ts}`. El `tsconfig.json` extiende `tsconfig.base.json`.
- **TDD sequence.** **No es una tarea TDD.** Smoke check: `pnpm --filter api build` emite `apps/api/dist/`; `pnpm --filter api start` arranca con `Nest application successfully started` en :3001 y sale 0 ante `SIGTERM`.
- **Verificación.** `pnpm turbo run build` produce `apps/api/dist/`; `pnpm turbo run typecheck` sale 0; `pnpm turbo run lint` sale 0.
- **Rollback.** `git revert <T1.7-sha>`.
- **Files touched (rough).** `apps/api/**` (~30 líneas).

### Task T1.8 — Stub de `docs/architecture.md` + Spanish mirror (~30 líneas)

- **Description.** Stubea `docs/architecture.md` con los seis headings de design §1–§11 (`Overview`, `Repository layout`, `Monorepo tooling`, `Domain design: auth`, `Domain design: transactions`, `Cross-cutting concerns`). Cada sección recibe 2–4 líneas de prosa placeholder; el contenido completo embarca en el Slice 8. Producir el Spanish mirror bajo `Documents-es/docs/architecture.md` en el **mismo commit atómico** (convención id 2132).
- **Discovery / file targets.** Crear `docs/architecture.md` y `Documents-es/docs/architecture.md`.
- **TDD sequence.** **No es una tarea TDD.**
- **Verificación.** Ambos archivos existen y son no vacíos (`wc -l`); `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md` devuelve vacío (chequeo CJK, convención id 2132).
- **Rollback.** `git revert <T1.8-sha>`.
- **Files touched (rough).** `docs/architecture.md`, `Documents-es/docs/architecture.md` (~30 líneas).

**Slice 1 total: ~280 líneas modificadas.** Gate de verificación: `pnpm turbo run build lint typecheck` sale 0; ambas apps arrancan; Postgres está healthy; las boundary rules + fixtures disparan sobre los casos `invalid.ts`.

---

## Slice 2: `libs/core` + `libs/shared-utils`

**Goal.** Levantar la infraestructura compartida de la que depende cada slice de feature: el singleton del Prisma client, el env config con Zod, el dispatcher de eventos en memoria, y los helpers puros. **Sin lógica de negocio de feature.** Todo el scaffolding se verifica mediante builds y tests unitarios sobre los utilities.
**Start.** Slice 1 mergeado en `feat/vertical-slicing-reference-scaffold`.
**Finish.** `pnpm prisma migrate dev` crea las tablas de auth; `pnpm turbo run build lint typecheck test` sale 0; el schema de env se importa en el top del startup de `apps/web` y `apps/api`.
**Verificación.** `pnpm install && pnpm prisma migrate dev && pnpm turbo run build lint typecheck test` sale 0; un smoke check de runtime en el boot de `apps/api` fails-fast si faltan env vars.
**Rollback.** Por commit atómico (`git revert <task-sha>`); la cadena de commits del slice es revertible como grupo porque ningún slice depende de los detalles internos de este slice — solo de su API pública.

### Task T2.1 — `libs/core/database` (singleton de Prisma client + schema inicial) (~80 líneas)

- **Description.** Crear el schema Prisma cubriendo las tablas del slice auth (`User`, `Account`, `Session`, `VerificationToken`, `PasswordResetToken`, enum `Role`). Las tablas de transactions embarcan en el Slice 5. El schema vive en `libs/core/database/prisma/schema.prisma`; el singleton del client vive en `libs/core/database/src/client.ts` y es el **único** lugar donde se permite `new PrismaClient()`. Re-exportar el client tipado desde `libs/core/database/src/index.ts` como `@core/database`.
- **Discovery / file targets.** Crear `libs/core/database/{package.json,tsconfig.json,prisma/schema.prisma,src/client.ts,src/index.ts}`. Las migraciones viven bajo `libs/core/database/prisma/migrations/`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: escribir un test unitario de Vitest (`libs/core/database/src/__tests__/client.test.ts`) que importa `@core/database` dos veces y asserta la misma identidad (singleton). GREEN: implementar el singleton con el patrón de cache en `globalThis`. TRIANGULATE: agregar un test de que `pnpm prisma generate` produce los tipos de `@prisma/client` referenciados por `client.ts`. REFACTOR: asegurar que ningún código de negocio importa `new PrismaClient()` en ningún lado (la regla de ESLint de T1.3 va a capturar una regresión).
- **Verificación.** `pnpm --filter @core/database exec prisma migrate dev --name init` aplica la migración; `pnpm turbo run test --filter @core/database` pasa; `pnpm turbo run lint` reporta cero violaciones sobre el workspace.
- **Rollback.** `git revert <T2.1-sha>` quita la migración + el client; `pnpm prisma migrate reset` si la DB se aplicó localmente antes del revert.
- **Files touched (rough).** `libs/core/database/**` (~80 líneas).

### Task T2.2 — `libs/core/config` (Zod env schema en el startup) (~50 líneas)

- **Description.** Validar `process.env` en el startup con un schema Zod; exportar un objeto `env` tipado. Vars requeridas: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PORT` (default 3001), `WEB_ORIGIN` (origen de CORS), `NODE_ENV`. El schema **fails-fast** en tiempo de import — una var faltante o mal formada tira con un error descriptivo.
- **Discovery / file targets.** Crear `libs/core/config/{env.schema.ts,env.ts,index.ts,__tests__/env.test.ts}`. Agregar `libs/core/config` como dependencia de `apps/api` y `apps/web` para que importen `env` en el top de sus archivos de entrada.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: escribir un test para `envSchema.safeParse({})` retornando `success: false` con los field paths esperados; GREEN: implementar el schema; TRIANGULATE: agregar un test para mutación de `process.env` entre tests (el schema cachea el resultado del parse por defecto — confirmar el comportamiento); REFACTOR: extraer un helper `parseEnv()` para permitir overrides en tiempo de test.
- **Verificación.** `pnpm turbo run test --filter @core/config` pasa; `pnpm --filter api build` rechaza el build cuando falta `DATABASE_URL` (setear `DATABASE_URL=` y confirmar que `tsc --noEmit` falla o el import de runtime tira un `ZodError`).
- **Rollback.** `git revert <T2.2-sha>`.
- **Files touched (rough).** `libs/core/config/**` (~50 líneas).

### Task T2.3 — `libs/core/events` (dispatcher en memoria + event types) (~80 líneas)

- **Description.** Dispatcher pub/sub minimalista con `dispatch(event)` y `subscribe(name, handler)` retornando una función de unsubscribe. `types.ts` declara los **9 eventos de dominio** de design §4.7 + §5.9: `auth.password-reset.requested`, `auth.password-reset.completed`, `auth.session.revoked`, `auth.rbac.denied`, `transactions.created`, `transactions.updated`, `transactions.soft-deleted`, `transactions.fx.stale`, `transactions.threshold.exceeded`. Cada evento tiene un schema Zod de payload. El dispatcher mantiene un ring buffer de 100 entradas por usuario (usado por el dev mailbox en el Slice 4).
- **Discovery / file targets.** Crear `libs/core/events/{package.json,tsconfig.json,src/dispatcher.ts,src/types.ts,src/index.ts,src/__tests__/dispatcher.test.ts,src/__tests__/types.test.ts}`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: escribir un test verificando que `dispatch({name:'x',payload:{}})` llama a un handler suscrito exactamente una vez; GREEN: implementar el dispatcher; TRIANGULATE: múltiples subscribers, unsubscribe, error en un subscriber no rompe a los demás; REFACTOR: separar la validación del nombre de evento del dispatch (un único `parse` en el boundary).
- **Verificación.** `pnpm turbo run test --filter @core/events` pasa (≥6 casos: single subscriber, múltiples subscribers, unsubscribe, aislamiento de error, trim del ring buffer, replay de los últimos N eventos).
- **Rollback.** `git revert <T2.3-sha>`.
- **Files touched (rough).** `libs/core/events/**` (~80 líneas).

### Task T2.4 — `libs/shared-utils/{date-formatting,currency,decimal}` (~60 líneas)

- **Description.** Tres paquetes de helpers puros: `date-formatting` (formateo timezone-safe usando `Intl.DateTimeFormat`, parsing ISO 8601), `currency` (formatea `Decimal` a strings de moneda localizadas), `decimal` (wrappers alrededor de `decimal.js` para math monetaria — según D-TX-6, **nunca `BigInt`**). Cada uno exporta vía barrel `index.ts`. Funciones puras, sin I/O, sin deps de framework.
- **Discovery / file targets.** Crear `libs/shared-utils/{package.json,date-formatting/{tsconfig.json,src/index.ts,src/__tests__/date-formatting.test.ts},currency/{tsconfig.json,src/index.ts,src/__tests__/currency.test.ts},decimal/{tsconfig.json,src/index.ts,src/__tests__/decimal.test.ts}}`. El `tsconfig.base.json` raíz expone los aliases de `@shared-utils/*` (T1.2).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR por paquete. RED: tests por cada función pública (formatear string ISO, formatear en locale especificado, parse + emitir; formatear `Decimal('1234.56')` a `'$1,234.56'`; `add`/`subtract`/`compare` de valores `Decimal` con el comportamiento esperado). GREEN: implementar con `decimal.js` para `decimal`, `Intl` nativo para el resto. TRIANGULATE: edge cases (valores negativos, fallbacks de locale, settings de precisión de `decimal.js`). REFACTOR: extraer un guard compartido `toDecimal(input: string | number | Decimal)`.
- **Verificación.** `pnpm turbo run test --filter @shared-utils/*` pasa para los tres paquetes; `pnpm turbo run lint` reporta cero violaciones; `pnpm turbo run typecheck` sale 0.
- **Rollback.** Por commit atómico (`git revert <T2.4-sha>`); el commit de cada paquete helper es independiente.
- **Files touched (rough).** `libs/shared-utils/**` (~60 líneas).

### Task T2.5 — Gate de validación de first-run (~0 líneas nuevas, ~50 comandos solo de verificación)

- **Description.** Correr el pipeline completo punta a punta sobre un clean clone para probar que el skeleton + las libs core funcionan juntos. Esta tarea es **solo verificación** — no hay código nuevo más allá de la matriz de validación en sí; si un check falla, abrir un fix-task contra la tarea ofensiva del slice.
- **Discovery / file targets.** Sin archivos nuevos; producir `docs/first-run-checklist.md` (≤30 líneas) capturando los comandos para que `sdd-verify` los pueda re-correr. El checklist debe terminar con el criterio de éxito: **"todos exit 0"**.
- **TDD sequence.** **No es una tarea TDD.** Esta tarea es un gate-check.
- **Verificación.** `pnpm install && pnpm prisma migrate dev && pnpm turbo run build lint typecheck test` sale 0; `docker compose ps` muestra Postgres healthy; `pnpm db:down && pnpm db:up` hace round-trip de forma limpia.
- **Rollback.** N/A (verificación solamente).
- **Files touched (rough).** `docs/first-run-checklist.md` (~30 líneas de doc, más los comandos de verificación).

**Slice 2 total: ~250 líneas modificadas.** Gate de verificación: env schema fails-fast en el startup; tests unitarios del dispatcher pasan; helpers puros tienen ≥80% de cobertura por línea; build/lint/typecheck/test todos salen 0.

---

## Slice 3: Auth server (vertical slice 1)

**Goal.** Implementar cada requirement de auth de `specs/auth/spec.md` **solo del lado del server** (sin UI todavía). El slice embarca AuthService, SessionService, RbacService, PasswordResetService, NextAuth v5 config, thin wrapper de NestJS y los cuatro eventos emitidos. BDD y UI embarcan en los Slices 4 y 7.
**Start.** Slice 2 mergeado en la rama trackera.
**Finish.** `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` retornan los status codes correctos en cada escenario codificado; los cuatro eventos de auth se emiten; `RbacService.can(user, action, resource)` rechaza acciones no permitidas.
**Verificación.** `pnpm turbo run lint typecheck test --filter @features/auth --filter api` sale 0; `curl` manual contra `apps/api:3001` matchea las expectativas sobre los seis endpoints.
**Rollback.** Por commit atómico (`git revert <task-sha>`); revertir cualquier tarea individual descarta la superficie del servicio correspondiente.

### Task T3.1 — RED: escribir tests Vitest fallidos para `AuthService.login` (~30 líneas)

- **Description.** Escribir el test que falla PRIMERO para los caminos happy + invalid-credential del login de AuthService (según strict-tdd.md). Los tests importan el service desde `@features/auth/server` y assertean el contrato — `verifyPassword(email, password)` retorna el registro de usuario en match y `null` en mismatch/ausencia.
- **Discovery / file targets.** Crear `libs/features/auth/server/services/__tests__/auth.service.test.ts`. Usar Vitest; mockear `UserRepository` (interface declarada en T3.4). El factor de costo de bcrypt está fijado en 10 (design §4.1).
- **TDD sequence.** **Esta tarea es el paso RED para T3.4.** El test falla porque `AuthService` todavía no existe.
- **Verificación.** `pnpm --filter @features/auth exec vitest run services/__tests__/auth.service.test.ts` sale no-cero (RED).
- **Rollback.** `git revert <T3.1-sha>`.
- **Files touched (rough).** 1 archivo de test (~30 líneas).

### Task T3.2 — `libs/features/auth/shared/schemas` (single source of truth Zod) (~50 líneas)

- **Description.** Crear los cinco schemas Zod declarados en design §4.2 (`login.ts`, `register.ts`, `forgot-password.ts`, `reset-password.ts`, `session-list.ts`). Cada uno exporta `{ schema, type }` inferido del schema. **NO class-validator en ningún lado** (design §6.1).
- **Discovery / file targets.** Crear `libs/features/auth/shared/schemas/{login,register,forgot-password,reset-password,session-list}.ts` y `libs/features/auth/shared/schemas/index.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: un test unitario (`libs/features/auth/shared/schemas/__tests__/schemas.test.ts`) asserta que cada schema rechaza input mal formado (email inválido, password corto, etc.) y acepta input bien formado. GREEN: implementar los schemas. TRIANGULATE: edge cases (nombres Unicode, inputs muy largos en el boundary de validación). REFACTOR: extraer un helper `passwordPolicy()`.
- **Verificación.** `pnpm turbo run test --filter @features/auth` pasa los tests de schemas; `pnpm turbo run lint` reporta cero violaciones y la regla `no-schemas-outside-shared` NO dispara (porque los schemas están adentro de `shared/schemas/`).
- **Rollback.** `git revert <T3.2-sha>`.
- **Files touched (rough).** `libs/features/auth/shared/**` (~50 líneas).

### Task T3.3 — `libs/features/auth/server/auth.config.ts` (NextAuth v5) (~50 líneas)

- **Description.** Config de NextAuth v5: `CredentialsProvider` (delega a `AuthService.verifyPassword`), `GoogleProvider` (usa `clientId`/`clientSecret` del env; happy-stub vía switch de `NEXTAUTH_URL`), `@auth/prisma-adapter` contra `@core/database`, estrategia JWT, callbacks (`jwt` embebe `role` + `userId`; `session` los proyecta). `pages.signIn` es una factory locale-aware resuelta en runtime.
- **Discovery / file targets.** Crear `libs/features/auth/server/auth.config.ts` y `libs/features/auth/server/__tests__/auth.config.test.ts` (asserta que el array de providers contiene exactamente `credentials` + `google`, que el adapter está cableado, y que el callback de JWT popula `token.role` en el primer sign-in).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: tests como los de arriba (fallando). GREEN: implementar la config. TRIANGULATE: assertear la proyección de session (`session({session,token})` retorna `session.user.role === 'admin'` para un token admin). REFACTOR: extraer una factory `buildAuthOptions()` para que los tests puedan variar el env.
- **Verificación.** `pnpm turbo run test --filter @features/auth` pasa; `pnpm turbo run lint` sale 0; la regla `no-prisma-outside-core` NO dispara (el adapter es el boundary, pero `new PrismaClient()` nunca se importa acá).
- **Rollback.** `git revert <T3.3-sha>`.
- **Files touched (rough).** `libs/features/auth/server/auth.config.ts` + test (~50 líneas).

### Task T3.4 — Auth services (AuthService, SessionService, RbacService, PasswordResetService) (~150 líneas)

- **Description.** Implementar los cuatro services según design §4.1. `AuthService`: `verifyPassword`, `register`, `linkGoogleAccount`, `getCurrentUser`. `SessionService`: `listActiveSessions`, `revokeSession`, `purgeExpired`. `RbacService`: tabla de permisos según design §4.1, único entry point `can(user, action, resource)` usado por cada guard. `PasswordResetService`: `requestReset` mina un token + dispatcha `auth.password-reset.requested`; `consumeReset` valida + reemplaza `passwordHash` + marca consumido + dispatcha `auth.password-reset.completed`. Definir las interfaces `UserRepository`, `SessionRepository`, `PasswordResetTokenRepository` en este slice (los adapters embarcan en una tarea siguiente del mismo slice).
- **Discovery / file targets.** Crear `libs/features/auth/server/services/{auth.service.ts,session.service.ts,rbac.service.ts,password-reset.service.ts}`, archivos de interfaces bajo `libs/features/auth/server/domain/interfaces/{user,session,password-reset-token}.repository.ts`, y tests bajo `libs/features/auth/server/services/__tests__/{auth,session,rbac,password-reset}.service.test.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR por service. GREEN embarca las interfaces y clases concretas cableadas a fake repos en memoria (los repos Prisma reales embarcan en una tarea vecina de T3.5 — mantener concerns separadas). TRIANGULATE: escenarios de RBAC (admin puede `transaction:read:any`, user NO puede; cross-user session revoke rechazado para `user`, permitido para `admin`); race de password reset (mismo token dos veces); expiración de session; captura de email mockeado producida.
- **Verificación.** `pnpm turbo run test --filter @features/auth` pasa los cuatro suites de service; se ejercitan al menos 12 escenarios de RBAC; `pnpm turbo run lint` sale 0.
- **Rollback.** `git revert <T3.4-sha>`.
- **Files touched (rough).** `libs/features/auth/server/{services,domain/interfaces}/**` + tests (~150 líneas).

### Task T3.5 — `libs/features/auth/server/events.ts` (cableado de emisión de eventos) (~30 líneas)

- **Description.** Cablear los cuatro eventos de auth (`auth.password-reset.requested`, `auth.password-reset.completed`, `auth.session.revoked`, `auth.rbac.denied`) al dispatcher. El cableado es un archivo de subscripción thin importado en el startup de NestJS. Agregar `PrismaUserRepository`, `PrismaSessionRepository`, `PrismaPasswordResetTokenRepository` para que el módulo de NestJS pueda cablear implementaciones reales en T3.6.
- **Discovery / file targets.** Crear `libs/features/auth/server/events.ts`, `libs/features/auth/server/infrastructure/repositories/{prisma-user,prisma-session,prisma-password-reset-token}.repository.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: un test asserta que `PasswordResetService.requestReset` dispatcha `auth.password-reset.requested` exactamente una vez con el payload esperado. GREEN: implementar la inyección del dispatcher. TRIANGULATE: `consumeReset` dispatcha `auth.password-reset.completed`; `revokeSession` dispatcha `auth.session.revoked`; `RbacService.can` fallido (retornando `false` tras la evaluación) dispatcha `auth.rbac.denied`. REFACTOR: extraer un helper `dispatchAuthEvent(name, payload)`.
- **Verificación.** `pnpm turbo run test --filter @features/auth` pasa los nuevos tests de eventos; `pnpm turbo run lint` sale 0.
- **Rollback.** `git revert <T3.5-sha>`.
- **Files touched (rough).** `libs/features/auth/server/{events.ts,infrastructure/repositories/**}` + tests (~30 líneas).

### Task T3.6 — `apps/api/modules/auth` (thin wrapper NestJS) (~50 líneas)

- **Description.** Según design §2: `apps/api/modules/auth` es un **thin NestJS wrapper** que solo hace DI wiring + binding de rutas — sin código de negocio. Declara las seis rutas (tabla `auth.controller.ts` de T3 design §4.1) usando el helper de decorador `@Body(<zodSchema>)` (design §6.1) para cablear el `ZodValidationPipe`.
- **Discovery / file targets.** Crear `apps/api/modules/auth/{auth.module.ts,auth.controller.ts}` y `apps/api/src/shared/pipes/zod-validation.pipe.ts` + `apps/api/src/shared/decorators/body.decorator.ts`. Agregar guards de NestJS: `apps/api/src/shared/guards/jwt.guard.ts` que valida el JWT de session de NextAuth.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR a nivel de controller. RED: un test e2e de Nest (`apps/api/test/auth.e2e-spec.ts`) llama a `POST /auth/login` con credenciales válidas y asserta 201 + cookie. GREEN: implementar el controller. TRIANGULATE: credenciales inválidas → 401; JWT faltante → 401; JWT expirado → 401; `DELETE /auth/sessions/:id` → 204; `GET /auth/sessions` → 200 con el array. REFACTOR: extraer `AppModule` para componer `AuthModule` + `ThrottlerModule` (diferido).
- **Verificación.** `pnpm turbo run test --filter api` pasa el suite e2e (con Postgres levantado vía docker-compose para los adapters de Prisma); `pnpm turbo run lint typecheck` sale 0.
- **Rollback.** `git revert <T3.6-sha>`.
- **Files touched (rough).** `apps/api/modules/auth/**` + `apps/api/src/shared/**` (~50 líneas).

### Task T3.7 — TRIANGULATE: escenarios de happy-path completo + enforcement de RBAC (~40 líneas)

- **Description.** Agregar los escenarios cross-cutting que no son de un único service: p.ej., "usuario registrado se loguea vía Credentials y luego vía Google — ambos resuelven al mismo `User.id`", "JWT de session expirado retorna 401", "forgot-password para un email desconocido retorna 202 (idempotente, sin leak por enumeración)". Cada escenario ya mapea a un escenario del spec; esta tarea cablea los cuerpos de test que abarcan múltiples services.
- **Discovery / file targets.** Agregar tests a `libs/features/auth/server/__tests__/integration/` (folder nuevo): `multi-provider.test.ts`, `session-expiry.test.ts`, `forgot-password-idempotency.test.ts`.
- **TDD sequence.** Los tres tests se escriben primero (RED para cualquier falla de los GREEN anteriores), después se ejecutan las aserciones. Donde los slices anteriores (T3.3–T3.6) ya implementaron el comportamiento, esta tarea es una red de regresión.
- **Verificación.** `pnpm turbo run test --filter @features/auth` pasa los tres suites de integración; `pnpm turbo run lint typecheck` sale 0.
- **Rollback.** `git revert <T3.7-sha>`.
- **Files touched (rough).** Archivos de test (~40 líneas).

### Task T3.8 — REFACTOR: extraer duplicación + asegurar que las boundaries de ESLint estén clean (~10 líneas + refactor)

- **Description.** Tarea puramente de refactor: escanear el slice en busca de duplicación (p.ej., llamadas a `bcrypt.compare`, patrones de `findByEmail`); extraer helpers; re-correr los chequeos de fixtures de las boundary rules para probar que ninguna regla regresó.
- **Discovery / file targets.** Sin archivos nuevos; los refactors tocan `libs/features/auth/server/services/**/*.ts`.
- **TDD sequence.** **Solo refactor.** El suite de tests debe permanecer verde a lo largo de todos los cambios (según testing-standards: el refactor no es parte del loop RED-GREEN).
- **Verificación.** `pnpm turbo run test --filter @features/auth` se mantiene verde; `pnpm turbo run lint` reporta cero violaciones Y el chequeo de fixtures (`pnpm turbo run lint:fixtures`) sigue pasando para las cuatro boundary rules.
- **Rollback.** `git revert <T3.8-sha>`.
- **Files touched (rough).** ~10 líneas netas nuevas.

### Task T3.9 — Slice-wide `turbo run lint typecheck test` verde (~0 líneas, gate check)

- **Description.** Gate check final para el Slice 3. Sin código nuevo; producir una checklist de una página en `docs/slice-3-checklist.md` para que `sdd-verify` la pueda re-correr. Incluye los cuatro chequeos forzados de violación de ESLint contra los fixtures.
- **Discovery / file targets.** Crear `docs/slice-3-checklist.md`.
- **TDD sequence.** **No es una tarea TDD** — verification gate.
- **Verificación.** `pnpm turbo run lint typecheck test` sale 0 sobre `apps/api` y `libs/features/auth`.
- **Rollback.** N/A.
- **Files touched (rough).** `docs/slice-3-checklist.md` (~30 líneas de doc).

**Slice 3 total: ~390 líneas modificadas.** Gate de verificación: G17 (schemas Zod compartidos reutilizados en server), G20 (Credentials + Google en paralelo contra `@auth/prisma-adapter`), G21 (password reset + email mockeado), G22 (sessions list + revoke), G23 (RBAC en la capa de dominio).

---

## Slice 4: Auth client + i18n + shadcn

**Goal.** Exponer cada slice de server del Slice 3 sobre la web app con rutas prefijadas por locale a través de `next-intl`, primitivas shadcn-style instaladas localmente (sin CLI), design tokens extraídos, y **UI complete-final según convención id 2133** (5 estados de form, WCAG AA, responsive, tests de componente).
**Start.** Slice 3 mergeado.
**Finish.** Cada screen de auth (`sign-in`, `sign-up`, `forgot-password`, `reset-password/[token]`, `dev/mailbox/[userId]`) renderiza en `/en/...` y `/es/...`; cada form implementa los 5 estados; el audit de WCAG AA pasa por screen; los tests de componente de cuatro estados pasan por form.
**Verificación.** `pnpm turbo run lint typecheck test --filter web` sale 0; el audit de `@axe-core/playwright` reporta cero violaciones por screen crítica; el tab-test manual de teclado pasa en cada form.
**Rollback.** Por commit atómico; la cadena de commits del slice es revertible como grupo porque ningún slice depende de nombres internos de clases CSS.

### Task T4.1 — RED: component test para `LoginForm` happy path (~25 líneas)

- **Description.** Escribir el test que falla PRIMERO: un test de Vitest + Testing Library que monta `LoginForm` con el provider de `next-intl` stubbed, asserta que el estado empty es visible en el render inicial, tipea un email válido + password, submitea, y asserta que la transición del estado loading va al destino de redirect del estado success (mockeado).
- **Discovery / file targets.** Archivo de test en `libs/features/auth/client/components/__tests__/login-form.test.tsx`; el archivo de componente `libs/features/auth/client/components/LoginForm.tsx` es solo un stub por ahora.
- **TDD sequence.** RED (el test falla porque el form stub no tiene comportamiento).
- **Verificación.** `pnpm --filter @features/auth exec vitest run client/components/__tests__/login-form.test.tsx` sale no-cero (RED).
- **Rollback.** `git revert <T4.1-sha>`.
- **Files touched (rough).** Test + stub (~25 líneas).

### Task T4.2 — `apps/web/messages/{en,es}.json` (catálogos i18n) (~40 líneas)

- **Description.** Inicializar los catálogos de `next-intl` con las claves del slice auth: `auth.signIn.title`, `auth.signIn.email`, `auth.signIn.password`, `auth.signIn.submit`, `auth.signIn.error.invalidCredentials`, `auth.signUp.*`, `auth.forgotPassword.*`, `auth.resetPassword.*`, `auth.sessions.*`, `auth.devMailbox.*` (slices posteriores agregan las claves de transactions). Cobertura mínima: cada screen tiene al menos un title + un CTA + un string de error en ambos locales.
- **Discovery / file targets.** Crear `apps/web/messages/en.json` y `apps/web/messages/es.json`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: un test de snapshot asserta que ambos catálogos contienen las claves esperadas. GREEN: implementar las claves. TRIANGULATE: assertear que `es.json` no contiene claves solo en inglés (es decir, los catálogos están mantenidos en sync). REFACTOR: split en archivos por namespace si los catálogos crecen.
- **Verificación.** `pnpm turbo run test --filter web` pasa; `pnpm turbo run lint` sale 0.
- **Rollback.** `git revert <T4.2-sha>`.
- **Files touched (rough).** `apps/web/messages/**` (~40 líneas).

### Task T4.3 — `apps/web/middleware.ts` (detección de locale de next-intl) (~25 líneas)

- **Description.** Según design §6.3: `createMiddleware` desde `next-intl/middleware` con `locales: ['en', 'es']`, `defaultLocale: 'en'`, `localePrefix: 'always'`. Las rutas `/sign-in` redirigen a `/en/sign-in`; visitar `/es/sign-in` se mantiene en español.
- **Discovery / file targets.** Crear `apps/web/middleware.ts`. Agregar `next-intl` a `apps/web/package.json` (deps de design §6.5).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: un test de integración asserta que un request a `/sign-in` produce un 307/308 a `/en/sign-in`. GREEN: implementar el middleware. TRIANGULATE: `/es/sign-in` queda sin cambios; paths profundos como `/en/sign-in/foo` redirigen al canónico. REFACTOR: extraer la lista de locales a una constante.
- **Verificación.** `pnpm turbo run test --filter web` pasa los tests de locale; `pnpm --filter web dev` arranca y `curl /sign-in` devuelve el redirect de locale.
- **Rollback.** `git revert <T4.3-sha>`.
- **Files touched (rough).** `apps/web/middleware.ts` + `apps/web/i18n.ts` + test (~25 líneas).

### Task T4.4 — `apps/web/components/ui/{button,input,form,card}.tsx` (~25 líneas)

- **Description.** Primitivas shadcn-style escritas a mano (según UI-1 en proposal §11.1). Cada una es un wrapper thin sobre `@radix-ui/react-*` (slot, label) con `class-variance-authority` para variants y `tailwind-merge` para el paso de merge. **SIN CLI de `shadcn-ui`** — los archivos están commiteados y son editables. Instalar peer deps: `@radix-ui/react-slot`, `@radix-ui/react-label`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`.
- **Discovery / file targets.** Crear `apps/web/components/ui/{button,input,form,card}.tsx`. Actualizar `apps/web/package.json`.
- **TDD sequence.** No es una tarea TDD — pero cada primitiva tiene un test de Vitest + Testing Library de snapshot asserteando que los class names renderizan correctamente (`button.test.tsx`: render `<Button>`, esperar `data-slot="button"`; el ref-merging funciona para `className="bg-red-500"` pisando el variant default, etc.).
- **Verificación.** `pnpm turbo run test --filter web` pasa los tests de primitivas; `pnpm turbo run lint` sale 0; `pnpm --filter web build` tiene éxito (las clases de Tailwind sobreviven al build).
- **Rollback.** `git revert <T4.4-sha>`.
- **Files touched (rough).** `apps/web/components/ui/**` + `apps/web/package.json` (~25 líneas de source — la mayoría de los archivos son patrones shadcn bien establecidos).

### Task T4.5 — `apps/web/lib/utils.ts` (helper cn) (~5 líneas)

- **Description.** `cn(...inputs: ClassValue[]) = twMerge(clsx(inputs))`. Usado por cada primitiva y por cada form.
- **Discovery / file targets.** Crear `apps/web/lib/utils.ts`. Agregar un test unitario tiny que asserta que `cn('p-2','p-4')` resuelve a `'p-4'`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR (según testing-standards: este es un helper puro; un test alcanza).
- **Verificación.** `pnpm turbo run test --filter web` pasa; `pnpm turbo run lint` sale 0.
- **Rollback.** `git revert <T4.5-sha>`.
- **Files touched (rough).** `apps/web/lib/utils.ts` + test (~5 líneas).

### Task T4.6 — `apps/web/components.json` (manifest shadcn mínimo) (~10 líneas)

- **Description.** Según UI-1: un manifest shadcn-style mínimo documentando el set de primitivas para que un operador futuro conozca la configuración. **El CLI NO se usa** — esto es un artefacto de documentación (según design §6.5).
- **Discovery / file targets.** Crear `apps/web/components.json` matcheando design §6.5.
- **TDD sequence.** No es una tarea TDD. La verificación es presencia + validez JSON estructural.
- **Verificación.** `node -e "JSON.parse(require('fs').readFileSync('apps/web/components.json','utf8'))"` sale 0.
- **Rollback.** `git revert <T4.6-sha>`.
- **Files touched (rough).** `apps/web/components.json` (~10 líneas).

### Task T4.7 — Extracción de design tokens (desde `gastos-personales/`) (~25 líneas)

- **Description.** Según UI-2: leer `gastos-personales/tailwind.config.*` y `gastos-personales/app/globals.css` para capturar colors/spacing/typography. Escribir los tokens en `apps/web/app/globals.css` como CSS variables bajo `:root` y `[data-theme="dark"]`. Referenciar la fuente vía un comentario al tope.
- **Discovery / file targets.** Crear `apps/web/app/globals.css`; actualizar `apps/web/tailwind.config.ts` para referenciar las CSS variables. El path del repo fuente se referencia en un comentario, no se importa.
- **TDD sequence.** No es una tarea TDD — el visual diff es la verificación (manual en Slice 8).
- **Verificación.** `apps/web/app/globals.css` contiene `--background`, `--foreground`, `--primary`, etc.; `apps/web/tailwind.config.ts` los referencia vía `hsl(var(--background))`.
- **Rollback.** `git revert <T4.7-sha>`.
- **Files touched (rough).** `apps/web/app/globals.css`, `apps/web/tailwind.config.ts` (~25 líneas netas).

### Task T4.8 — Página de `sign-in` + `LoginForm` (~50 líneas)

- **Description.** Implementar `apps/web/app/[locale]/(auth)/sign-in/page.tsx` y el `LoginForm` **completo** (el stub de T4.1). Implementar los 5 estados (loading, error, success, empty, validation-error) según spec §UI requirement "Complete Form States". Cablear `react-hook-form` + `@hookform/resolvers/zod` contra `loginSchema` desde `@features/auth/shared/schemas/login`.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/sign-in/page.tsx`; `libs/features/auth/client/components/LoginForm.tsx` (reemplazar el stub).
- **TDD sequence.** RED (test de T4.1) → GREEN (implementar el form) → TRIANGULATE (tests de cobertura de estados en T4.14) → REFACTOR (extraer hook de estado del form).
- **Verificación.** `pnpm turbo run test --filter @features/auth --filter web` pasa; manual `pnpm --filter web dev` + test en browser de los 5 estados.
- **Rollback.** `git revert <T4.8-sha>`.
- **Files touched (rough).** Page + form + tests (~50 líneas).

### Task T4.9 — Página de `sign-up` + `SignUpForm` (~30 líneas)

- **Description.** Mismo shape que T4.8: la pantalla de register resuelve `registerSchema` desde `@features/auth/shared/schemas/register`; form de 5 estados.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/sign-up/page.tsx`; `libs/features/auth/client/components/SignUpForm.tsx`; tests bajo `libs/features/auth/client/components/__tests__/sign-up-form.test.tsx`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan.
- **Rollback.** `git revert <T4.9-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T4.10 — Página de `forgot-password` + `ForgotPasswordForm` (~30 líneas)

- **Description.** Resuelve `forgotPasswordSchema`; el estado success muestra la copy genérica "si este email está registrado, vas a recibir instrucciones".
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/forgot-password/page.tsx`; `libs/features/auth/client/components/ForgotPasswordForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan.
- **Rollback.** `git revert <T4.10-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T4.11 — Página de `reset-password/[token]` + `ResetPasswordForm` (~30 líneas)

- **Description.** Lee `[token]` de la ruta (según Next 15 async params). Resuelve `resetPasswordSchema`. El camino de error muestra "token inválido o expirado" ante token desconocido.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/reset-password/[token]/page.tsx`; `libs/features/auth/client/components/ResetPasswordForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan; `pnpm --filter web dev` + visita manual a `/{en|es}/reset-password/<fake-token>` muestra el estado de error.
- **Rollback.** `git revert <T4.11-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T4.12 — Página `dev/mailbox/[userId]` + componente `DevMailbox` (~25 líneas)

- **Description.** SOLO DEV — `NODE_ENV !== 'production'` enforced en el boundary de la ruta y en el componente. Lee el último evento `auth.password-reset.requested` para `userId` desde el ring buffer del dispatcher (T2.3). Expone **solo el token** (nunca passwords ni contenidos de email). Según design §4.5.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx`; `libs/features/auth/client/components/DevMailbox.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: un test asserta que la página devuelve un 404 / no se renderiza en modo producción (mockear `NODE_ENV`).
- **Verificación.** La página está oculta en el build de producción (`pnpm --filter web build`); `pnpm turbo run test` pasa.
- **Rollback.** `git revert <T4.12-sha>`.
- **Files touched (rough).** ~25 líneas.

### Task T4.13 — Audit WCAG AA por screen de auth vía `@axe-core/playwright` (~30 líneas)

- **Description.** Según UI-4 / G43: `@axe-core/playwright` corre contra cada screen crítica de auth (sign-in, sign-up, forgot-password, reset-password) y asserta cero violaciones AA. Los tests viven bajo `apps/web/e2e/auth/axe.spec.ts` por screen.
- **Discovery / file targets.** `apps/web/e2e/auth/axe-*.spec.ts` (5 archivos: sign-in, sign-up, forgot-password, reset-password, dev-mailbox).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: cada spec asserta cero violaciones sobre una screen recién renderizada.
- **Verificación.** `pnpm turbo run e2e --filter web -- --grep "@axe"` sale 0.
- **Rollback.** `git revert <T4.13-sha>`.
- **Files touched (rough).** Specs + config de axe (~30 líneas).

### Task T4.14 — Tests de cobertura de estados por form (loading, error, success, empty, validation-error) (~25 líneas)

- **Description.** Para cada form de auth, escribir un test de cobertura de estados a nivel de componente (5 tests por form × 4 forms = 20 tests; se reduce a ~25 líneas netas nuevas vía un pequeño render-helper). Asserta que cada estado es alcanzable y visualmente distinto.
- **Discovery / file targets.** Los tests viven junto al archivo de test de cada form bajo `libs/features/auth/client/components/__tests__/`.
- **TDD sequence.** Fase TRIANGULATE para las tareas de form (T4.8–T4.12).
- **Verificación.** `pnpm turbo run test --filter @features/auth` corre ≥ 20 tests de cobertura de estados pasando.
- **Rollback.** `git revert <T4.14-sha>`.
- **Files touched (rough).** ~25 líneas.

### Task T4.15 — REFACTOR + lint + typecheck + check de cobertura de estados final (~10 líneas)

- **Description.** Refactorizar cualquier duplicación entre los 4 forms (p.ej., un wrapper `<FormField>` común). Re-correr el chequeo de fixtures de ESLint (`pnpm turbo run lint:fixtures`) para probar que ninguna boundary regresó. Agregar el test de viewport responsive (mobile 360px / desktop 1440px) para al menos un form.
- **Discovery / file targets.** Targets de refactor bajo `libs/features/auth/client/components/` y las pages de las rutas.
- **TDD sequence.** Solo refactor — los tests se mantienen verdes.
- **Verificación.** Todos los comandos salen 0; la screen sign-in renderiza sin overflow a 360px / 1440px de viewport.
- **Rollback.** `git revert <T4.15-sha>`.
- **Files touched (rough).** ~10 líneas.

**Slice 4 total: ~380 líneas modificadas.** Gate de verificación: G17 (schemas Zod compartidos reutilizados en client), G40 (`apps/web/components.json` + primitivas), G41 (design tokens extraídos), G42 (`next-intl` configurado), G43 (audit de axe-core pasa por screen crítica de auth), G44 (5 estados de form por form), G45 (responsive), G46 (tests de componente por screen).

---

## Slice 5: Transactions server

**Goal.** Implementar cada requirement de transactions de `specs/transactions/spec.md` del lado del server. Extender el schema Prisma con las tablas de transaction y `IdempotencyKey`; construir la capa de dominio (entities + ports + services), la capa de infraestructura (adapters Prisma + in-memory FX provider), y los controllers NestJS con el manejo del idempotency-key.
**Start.** Slice 3 mergeado (los services de auth existen así que RbacService está disponible).
**Finish.** Cada endpoint de design §5.3 retorna los status codes correctos; la conversión multi-currency + la advertencia de FX stale funcionan; el idempotency-key previene duplicados; el filtro de soft-delete aplica a toda query de category (no negociable); los cinco eventos de transactions se emiten.
**Verificación.** `pnpm turbo run lint typecheck test --filter @features/transactions --filter api` sale 0.
**Rollback.** Por commit atómico.

### Task T5.1 — Extender el schema Prisma: Currency, FxRate, Category, Transaction, IdempotencyKey, AuditLog (~30 líneas)

- **Description.** Agregar las tablas de transactions según spec §Data Model y design §5.1. Según D-TX-6, `Transaction.amount` es Prisma `Decimal` — **nunca `BigInt`** (esto está enforced por el sistema de tipos y verificado en el review de la migración de T5.2). Agregar índices según spec (sección §Data Model "Indexes").
- **Discovery / file targets.** Actualizar `libs/core/database/prisma/schema.prisma`.
- **TDD sequence.** No es una tarea TDD — la migración del schema es la verificación.
- **Verificación.** `pnpm prisma migrate dev --name transactions_init` aplica limpio; `pnpm prisma format` no reporta diff; el `schema.sql` resultante muestra `Decimal` para las columnas monetarias.
- **Rollback.** `git revert <T5.1-sha>` + borrar el archivo de migración (`libs/core/database/prisma/migrations/<timestamp>_transactions_init/`).
- **Files touched (rough).** Archivo de schema (~30 líneas netas nuevas).

### Task T5.2 — Correr `pnpm prisma migrate dev` (~0 líneas, gate check)

- **Description.** Aplicar la migración de T5.1. Verificar que la migración produce las tablas esperadas (`Currency`, `FxRate`, `Category`, `Transaction`, `IdempotencyKey`, `AuditLog`) con los tipos esperados (según D-TX-6, las columnas monetarias son `DECIMAL`, no `BIGINT`).
- **Discovery / file targets.** Sin archivos nuevos; solo verificación.
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** `psql -U postgres -d gastos_reference -c '\d+ "Transaction"'` muestra `amount DECIMAL`.
- **Rollback.** `pnpm prisma migrate reset` (solo localmente; nunca sobre DBs compartidas).
- **Files touched (rough).** ~0 líneas (commit de migración producido por la tarea anterior).

### Task T5.3 — RED: Vitest test para `TransactionService.create` con conversión FX (~25 líneas)

- **Description.** Escribir el test que falla PRIMERO: un test que mockea los cuatro ports (repos de Transaction/Category/Currency/FxRate), submitea `create({ amount: 1000, currencyCode: 'ARS', reportingCurrencyCode: 'USD', kind: 'expense', categoryId: 'cat_1', occurredAt: now })`, y asserta: `reportingAmount` es igual a `1000 * 1.001 = 1001` (con la tasa sembrada del in-memory FX provider); fila de `audit log` creada con el `actorId` correcto; replay de idempotency-key retorna la misma `Transaction`.
- **Discovery / file targets.** Test en `libs/features/transactions/server/domain/services/__tests__/transaction.service.test.ts`.
- **TDD sequence.** Paso RED para T5.9.
- **Verificación.** El test sale no-cero (RED).
- **Rollback.** `git revert <T5.3-sha>`.
- **Files touched (rough).** ~25 líneas.

### Task T5.4 — `libs/features/transactions/shared/schemas` (Zod) (~50 líneas)

- **Description.** Según spec §Data Model y design §5.5: `create.ts`, `update.ts`, `list.ts` (paginación cursor + filtros), `category-create.ts`, `category-update.ts`. Cada uno es el schema Zod canónico reutilizado por los forms del client Y por el `ZodValidationPipe` de NestJS.
- **Discovery / file targets.** `libs/features/transactions/shared/schemas/{create,update,list,category-create,category-update}.ts` y un barrel.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR (paralelo a T3.2).
- **Verificación.** Tests pasan; `pnpm turbo run lint` reporta cero violaciones y `no-schemas-outside-shared` no dispara.
- **Rollback.** `git revert <T5.4-sha>`.
- **Files touched (rough).** ~50 líneas.

### Task T5.5 — `libs/features/transactions/server/domain/entities` (tipos TypeScript) (~30 líneas)

- **Description.** Interfaces/tipos planos en TS para `Transaction`, `Category`, `Currency`, `FxRate`, `IdempotencyKey` según design §5.1. **Solo de tipo, no clases** — mantiene la capa de dominio serialization-friendly y la superficie de dependencias mínima.
- **Discovery / file targets.** `libs/features/transactions/server/domain/entities/{transaction,category,currency,fx-rate,idempotency-key}.entity.ts`.
- **TDD sequence.** No es una tarea TDD — los tipos son estáticos.
- **Verificación.** `pnpm turbo run typecheck` sale 0 sobre el slice.
- **Rollback.** `git revert <T5.5-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T5.6 — `libs/features/transactions/server/domain/interfaces` (ports) (~40 líneas)

- **Description.** Declarar los seis ports según design §5.1: `TransactionRepository`, `CategoryRepository`, `CurrencyRepository`, `FxRateRepository`, `IdempotencyRepository`, `FxRateProvider`. **Crítico**: el JSDoc de `CategoryRepository` DEBE establecer la invariante no-opt-out de soft-delete (D-TX-5) para que adapters y call-sites no puedan alegar ignorancia.
- **Discovery / file targets.** `libs/features/transactions/server/domain/interfaces/*.repository.ts` + `fx-rate.provider.ts`.
- **TDD sequence.** RED (T5.3) → GREEN (interfaces acá).
- **Verificación.** `pnpm turbo run typecheck` sale 0; la invariante del JSDoc queda commiteada verbatim.
- **Rollback.** `git revert <T5.6-sha>`.
- **Files touched (rough).** ~40 líneas.

### Task T5.7 — `libs/features/transactions/server/infrastructure/repositories` (adapters Prisma) (~80 líneas)

- **Description.** Cinco adapters Prisma implementando los ports. **`CategoryRepository` SIEMPRE agrega `where: { deletedAt: null }` a cada query de lectura** — sin escape hatch. El `findById(id)` del adapter rechaza categorías soft-deleted con `null`; `list(filter)` filtra las filas soft-deleted; el mismo predicado se agrega al `JOIN` para los listados de transactions.
- **Discovery / file targets.** `libs/features/transactions/server/infrastructure/repositories/{transaction,category,currency,fx-rate,idempotency}.repository.ts` + tests bajo `__tests__/`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. Por repo: RED (escribir un test que asserta que el filtro de soft-delete aplica para `CategoryRepository`); GREEN (implementar el adapter Prisma); TRIANGULATE (testear que agregar un flag `bypassFilter` NO existe — garantía de compile-time); REFACTOR (extraer un helper compartido `notDeleted()`).
- **Verificación.** Tests pasan; `pnpm turbo run lint` sale 0; la regla `no-prisma-outside-core` NO dispara (el Prisma client se accede solo vía el singleton `@core/database`).
- **Rollback.** `git revert <T5.7-sha>`.
- **Files touched (rough).** ~80 líneas.

### Task T5.8 — `libs/features/transactions/server/infrastructure/fx/in-memory-fx-rate.provider.ts` (~25 líneas)

- **Description.** Implementación por defecto de `FxRateProvider` según D-TX-2. Sembrada en el startup con `USD→ARS`, `EUR→ARS`, `ARS→USD`, `ARS→EUR`. Provee un helper de test `advanceClock()` para que el boundary de staleness (24h) sea ejercitable en tests unitarios.
- **Discovery / file targets.** `libs/features/transactions/server/infrastructure/fx/in-memory-fx-rate.provider.ts` + tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan; el DI token de NestJS `FX_RATE_PROVIDER` resuelve a esta clase en T5.10.
- **Rollback.** `git revert <T5.8-sha>`.
- **Files touched (rough).** ~25 líneas.

### Task T5.9 — `libs/features/transactions/server/domain/services` (TransactionService, CategoryService, TotalsService, ThresholdService) (~80 líneas)

- **Description.** Implementar los cuatro services según design §5.1. `TransactionService.create` orquesta: validar → lookup de FX (con dispatch de staleness) → persistir → audit log → upsert de idempotency-key. `CategoryService` hace soft-delete. `TotalsService.forUser` + `forCategory` aplican math sign-aware (income +N, expense −N) y agrupación por categoría. `ThresholdService.evaluate` emite `transactions.threshold.exceeded`.
- **Discovery / file targets.** `libs/features/transactions/server/domain/services/{transaction,category,totals,threshold}.service.ts` + tests.
- **TDD sequence.** Paso GREEN para el test RED de T5.3. RED → GREEN → TRIANGULATE → REFACTOR adicional por service.
- **Verificación.** Tests pasan; los eventos (`transactions.created`, `transactions.fx.stale`, `transactions.threshold.exceeded`) se dispatchan en los puntos correctos.
- **Rollback.** `git revert <T5.9-sha>`.
- **Files touched (rough).** ~80 líneas.

### Task T5.10 — DI token de Nest `FX_RATE_PROVIDER` cableado en `apps/api/modules/transactions` (~10 líneas)

- **Description.** Proveer el token `FX_RATE_PROVIDER` desde `apps/api/modules/transactions/transactions.module.ts`; bindearlo a `InMemoryFxRateProvider` para el repo de referencia.
- **Discovery / file targets.** Actualizar `apps/api/modules/transactions/transactions.module.ts`.
- **TDD sequence.** No es una tarea TDD; la verificación es el container de NestJS resolviendo el token.
- **Verificación.** Bootear `apps/api`; los logs muestran `FX_RATE_PROVIDER bound to InMemoryFxRateProvider`.
- **Rollback.** `git revert <T5.10-sha>`.
- **Files touched (rough).** ~10 líneas.

### Task T5.11 — Controllers de `apps/api/modules/transactions` (~50 líneas)

- **Description.** Superficie REST según design §5.3 (POST/GET/PATCH/DELETE `/transactions`, GET/POST/PATCH/DELETE `/categories`). Todos los endpoints aplican `ZodValidationPipe` con los schemas de T5.4. `POST /transactions` requiere el header `Idempotency-Key`.
- **Discovery / file targets.** `apps/api/modules/transactions/{transactions.module.ts,transactions.controller.ts}`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: e2e test para `POST /transactions` con un payload válido. GREEN: implementar el controller. TRIANGULATE: replay de idempotencia, fingerprint mismatch, rechazo de categoría soft-deleted, advertencia de FX stale, emisión de threshold.
- **Verificación.** `pnpm turbo run test --filter api` pasa el suite e2e.
- **Rollback.** `git revert <T5.11-sha>`.
- **Files touched (rough).** ~50 líneas.

### Task T5.12 — TRIANGULATE: suite completa de happy-path + edge cases (~50 líneas)

- **Description.** Escenarios cross-cutting: (a) el replay de idempotencia retorna el mismo payload, (b) fingerprint mismatch retorna 409, (c) key expirada permite un fresh request, (d) FX rate stale emite `transactions.fx.stale` Y persiste la transaction, (e) transaction same-currency skipea FX (D-TX-3), (f) totales sign-aware separan income vs expense, (g) totales por categoría excluyen categorías soft-deleted, (h) threshold exceeded emite `transactions.threshold.exceeded`. Cada uno mapea a un escenario del spec.
- **Discovery / file targets.** `libs/features/transactions/server/__tests__/integration/{idempotency,fx-stale,sign-aware-totals,per-category-totals,threshold}.test.ts`.
- **TDD sequence.** TRIANGULATE para los services (T5.9) y repos (T5.7).
- **Verificación.** Todos pasan.
- **Rollback.** `git revert <T5.12-sha>`.
- **Files touched (rough).** ~50 líneas.

### Task T5.13 — REFACTOR + lint + typecheck + test verde (~10 líneas)

- **Description.** Refactorizar la duplicación, asegurar que las boundaries de ESLint estén clean (que `client/` no importe de `server/`, etc.). Re-correr el chequeo de fixtures.
- **Discovery / file targets.** Targets de refactor a lo largo del slice.
- **TDD sequence.** Solo refactor.
- **Verificación.** Todos los comandos salen 0; los fixtures siguen disparando.
- **Rollback.** `git revert <T5.13-sha>`.
- **Files touched (rough).** ~10 líneas.

**Slice 5 total: ~390 líneas modificadas.** Gate de verificación: G18 (FX + staleness), G19 (filtro de soft-delete en todas las queries de category), G24 (validación), G25 (idempotencia), G26 (Decimal, no BigInt), G27 (audit log), G28 (sign-aware + por categoría + threshold).

---

## Slice 6: Transactions client + RBAC UI

**Goal.** Exponer cada slice de server del Slice 5 sobre la web app con UI completa según convención id 2133. Agregar las primitivas shadcn-style restantes (`dialog`, `dropdown-menu`, `select`, `toast`, `table`).
**Start.** Slice 5 mergeado.
**Finish.** Las rutas `/{locale}/(app)/transactions[/new|/[id]]` y `/{locale}/(app)/categories` renderizan en ambos locales; cada form tiene 5 estados; `TotalsCard` y `ThresholdAlert` exponen el rollup sign-aware + la advertencia de threshold; axe-core pasa; el diff responsive se sostiene.
**Verificación.** `pnpm turbo run lint typecheck test --filter web --filter @features/transactions` sale 0; audit de axe-core limpio.
**Rollback.** Por commit atómico.

### Task T6.1 — RED: component test para `TransactionsList` (~30 líneas)

- **Description.** Test que falla PRIMERO: montar `TransactionsList` con un dataset vacío stubbed; assertear que el estado empty es visible; con un dataset populado assertear que las filas renderizan; con un estado de "eliminado mientras carga", assertear un re-render a empty tras el siguiente poll.
- **Discovery / file targets.** `libs/features/transactions/client/components/__tests__/transactions-list.test.tsx` + un componente stub.
- **TDD sequence.** RED para T6.4.
- **Verificación.** El test sale no-cero (RED).
- **Rollback.** `git revert <T6.1-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T6.2 — `apps/web/app/[locale]/(app)/layout.tsx` (session guard) (~25 líneas)

- **Description.** Server component que lee la session de NextAuth vía el helper `auth()`; redirige a `/{locale}/sign-in` si es null. Envuelve los children en cualquier provider con scope de locale que se necesite.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/layout.tsx`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR (el test asserta que el guard redirige a usuarios no autenticados, permite a usuarios autenticados).
- **Verificación.** Tests pasan; manual `curl` a `/{locale}/transactions` retorna 307 a `/en/sign-in` para un request no autenticado.
- **Rollback.** `git revert <T6.2-sha>`.
- **Files touched (rough).** ~25 líneas.

### Task T6.3 — `/{locale}/(app)/sessions/page.tsx` + componente `SessionList` (~30 líneas)

- **Description.** Según spec §Requirement "Sessions List and Revoke": tabla de sessions con device label + timestamp de last-active; acción de revoke por fila (botón → `DELETE /auth/sessions/:id`); estados success/empty/error.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/sessions/page.tsx`; `libs/features/auth/client/components/SessionList.tsx` (ubicación canónica para el componente del slice auth); tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan; el flujo manual limpia el estado loading y renderiza la lista.
- **Rollback.** `git revert <T6.3-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T6.4 — `/{locale}/(app)/transactions/page.tsx` + `TransactionsList` (~40 líneas)

- **Description.** Según design §5.6: tabla de transactions con filtros (rango de fecha, categoría, moneda), paginación vía cursor, estados empty / error / loading. Cablear a `GET /transactions` (headers de auth). Renderizar `TotalsCard` y `ThresholdAlert` si el endpoint de totales señala un evento de threshold.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/transactions/page.tsx`; `libs/features/transactions/client/components/TransactionsList.tsx` (reemplazar el stub de T6.1); tests.
- **TDD sequence.** Paso GREEN para el RED de T6.1; TRIANGULATE con tests de cobertura de estados.
- **Verificación.** Todos los comandos salen 0; el flujo manual navega list → create → list-update.
- **Rollback.** `git revert <T6.4-sha>`.
- **Files touched (rough).** ~40 líneas.

### Task T6.5 — `/{locale}/(app)/transactions/new/page.tsx` + `CreateTransactionForm` (~40 líneas)

- **Description.** Según spec §Requirement "Transaction Validation" + §UI "Complete Form States": resuelve `createSchema`, autogenera un UUID de `Idempotency-Key` por submit (reusado ante re-submit del mismo form entry), cobertura de 5 estados, submit → `POST /transactions` con header.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/transactions/new/page.tsx`; `libs/features/transactions/client/components/CreateTransactionForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan; el estado success del form muestra el monto convertido + la advertencia de rate stale si aplica.
- **Rollback.** `git revert <T6.5-sha>`.
- **Files touched (rough).** ~40 líneas.

### Task T6.6 — `/{locale}/(app)/transactions/[id]/page.tsx` + `EditTransactionForm` (~30 líneas)

- **Description.** Resuelve `updateSchema`; prefilled; cobertura de 5 estados.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/transactions/[id]/page.tsx`; `libs/features/transactions/client/components/EditTransactionForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan.
- **Rollback.** `git revert <T6.6-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T6.7 — `/{locale}/(app)/categories/page.tsx` + `CategoryManager` (~35 líneas)

- **Description.** List + create + rename + soft-delete para categorías. La acción de soft-delete advierte ("las transactions que referencian esta categoría van a mantener sus datos, pero la categoría va a quedar oculta en los selectores").
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/categories/page.tsx`; `libs/features/transactions/client/components/CategoryManager.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan.
- **Rollback.** `git revert <T6.7-sha>`.
- **Files touched (rough).** ~35 líneas.

### Task T6.8 — `TotalsCard` (~30 líneas)

- **Description.** Según spec: income / expense / net sign-aware + rollups por categoría en la reporting currency. Usa la API de totales. Renderiza en el locale activo (labels vía `next-intl`).
- **Discovery / file targets.** `libs/features/transactions/client/components/TotalsCard.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan; snapshot matchea `+100 / -40 / net +60` para el input sembrado.
- **Rollback.** `git revert <T6.8-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T6.9 — `ThresholdAlert` (~20 líneas)

- **Description.** Se suscribe a `transactions.threshold.exceeded` (el bus de eventos lleva esto en dev; en producción un toast sería el consumer). Renderiza la affordance de threshold exceeded en el locale activo.
- **Discovery / file targets.** `libs/features/transactions/client/components/ThresholdAlert.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Tests pasan.
- **Rollback.** `git revert <T6.9-sha>`.
- **Files touched (rough).** ~20 líneas.

### Task T6.10 — WCAG AA + responsive + cobertura de estados (mirror del patrón del slice 4) (~30 líneas)

- **Description.** Según UI-4 + G43/G44/G45: audit de `@axe-core/playwright` por screen de transactions (list, create, edit, categories); diff responsive a 360px y 1440px; cobertura de 5 estados para `CreateTransactionForm` y `EditTransactionForm`.
- **Discovery / file targets.** `apps/web/e2e/transactions/axe-*.spec.ts`; tests de cobertura de estados bajo los componentes.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Todos los comandos salen 0.
- **Rollback.** `git revert <T6.10-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T6.11 — REFACTOR + lint + typecheck verde (~10 líneas)

- **Description.** Refactorizar la duplicación, asegurar que las boundaries estén clean, los fixtures siguen disparando.
- **Discovery / file targets.** Targets de refactor a lo largo del slice.
- **TDD sequence.** Solo refactor.
- **Verificación.** Todos los comandos salen 0; los fixtures siguen disparando.
- **Rollback.** `git revert <T6.11-sha>`.
- **Files touched (rough).** ~10 líneas.

**Slice 6 total: ~380 líneas modificadas.** Gate de verificación: G40 (primitivas), G41 (tokens), G43 (axe-core por screen de tx), G44 (5 estados de form), G45 (responsive), G46 (tests de componente).

---

## Slice 7: BDD + e2e

**Goal.** Agregar los archivos Gherkin y los tests e2e de Playwright que atan los slices en comportamiento embarcable. **Sin código de negocio nuevo** — este slice es glue.
**Start.** Slices 4 y 6 mergeados (la UI existe para ambos módulos).
**Finish.** 12 archivos `.feature` (6 auth + 6 transactions) con step defs compartidos. Playwright corre los dos flujos críticos para ambos locales. axe-core está integrado y asserta cero violaciones en las screens críticas.
**Verificación.** `pnpm turbo run bdd e2e` sale 0.
**Rollback.** Por commit atómico.

### Task T7.1 — `libs/features/auth/docs/step-defs/` (definiciones de step compartidas) (~30 líneas)

- **Description.** Configurar el directorio de step-defs compartidos con el phrasing canónico para los steps más comunes (`Given a registered user exists with role '<role>'`, `When the user submits the sign-in form at /{locale}/sign-in with email '<email>' and password '<password>'`, `Then a session is created`). Single source of truth para los seis archivos `.feature` en T7.2.
- **Discovery / file targets.** `libs/features/auth/docs/step-defs/{common.steps.ts,realm.steps.ts}`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: un dry-run de Cucumber falla porque no matchean steps; GREEN: implementar el step más común; TRIANGULATE: manejar locale parametrizado, rol, y email. REFACTOR: extraer un helper de test `registerUser({ email, role, password })`.
- **Verificación.** `pnpm turbo run bdd --filter @features/auth` sale 0 (después de que T7.2 agregue los archivos `.feature`); un `--dry-run` reporta cada Scenario como `undefined` hasta que se implemente el step correspondiente.
- **Rollback.** `git revert <T7.1-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T7.2 — `libs/features/auth/docs/*.feature` (6 archivos según Locked Decision #3) (~60 líneas)

- **Description.** Según inventario de features Gherkin del spec auth: `login-email-password.feature`, `oauth-google-stub.feature`, `password-reset.feature`, `sessions-list.feature`, `rbac-admin.feature`, `login-locale-routing.feature`. Cada uno contiene los escenarios del spec en forma verbatim.
- **Discovery / file targets.** Seis archivos bajo `libs/features/auth/docs/`.
- **TDD sequence.** Paso RED para T7.1 (no hay steps matcheando).
- **Verificación.** `pnpm turbo run bdd --filter @features/auth` sale 0; ≥ 14 escenarios pasan (por el ≥30 total de G10, con ≥30 escenarios split entre auth + transactions + al menos un escenario a nivel de spec).
- **Rollback.** `git revert <T7.2-sha>`.
- **Files touched (rough).** ~60 líneas.

### Task T7.3 — `libs/features/transactions/docs/step-defs/` (definiciones de step compartidas) (~40 líneas)

- **Description.** Según spec: step defs compartidos para los 6 archivos `.feature` de transactions. `Given a category <name> with kind <kind> exists`, `Given an FxRate from <from> to <to> at rate <rate> recorded <time> ago`, `When the user submits the create-transaction form at /{locale}/transactions/new with idempotency key <key> and amount <amount>`, etc.
- **Discovery / file targets.** `libs/features/transactions/docs/step-defs/{common,data,actions}.steps.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** Después de T7.4, `pnpm turbo run bdd --filter @features/transactions` sale 0.
- **Rollback.** `git revert <T7.3-sha>`.
- **Files touched (rough).** ~40 líneas.

### Task T7.4 — `libs/features/transactions/docs/*.feature` (6 archivos según Locked Decision #3) (~60 líneas)

- **Description.** Según inventario de features Gherkin del spec transactions: `create-transaction.feature`, `list-transactions.feature`, `multi-currency-conversion.feature`, `idempotency-key.feature`, `soft-delete-categories.feature`, `sign-aware-totals.feature`. Cada uno contiene los escenarios del spec en forma verbatim.
- **Discovery / file targets.** Seis archivos bajo `libs/features/transactions/docs/`.
- **TDD sequence.** Paso RED para T7.3.
- **Verificación.** `pnpm turbo run bdd --filter @features/transactions` sale 0; ≥ 14 escenarios de transactions pasan; **total entre ambos módulos ≥ 30 escenarios** (por G10).
- **Rollback.** `git revert <T7.4-sha>`.
- **Files touched (rough).** ~60 líneas.

### Task T7.5 — `apps/web/playwright.config.ts` (dos proyectos: `en`, `es`) (~20 líneas)

- **Description.** Según design §8.4: dos proyectos de Playwright (`en`, `es`) para que axe-core corra por locale y el reporte quede split. `@axe-core/playwright` se cablea por proyecto.
- **Discovery / file targets.** `apps/web/playwright.config.ts`; agregar `apps/web/e2e/utils/axe.ts` como helper de aserción.
- **TDD sequence.** No es una tarea TDD per se — pero un spec de smoke (`e2e/health.spec.ts`) asserta que `pnpm dev` está arriba.
- **Verificación.** `pnpm turbo run e2e --filter web -- --list` muestra dos proyectos; correr cada proyecto sale 0 en el smoke test.
- **Rollback.** `git revert <T7.5-sha>`.
- **Files touched (rough).** ~20 líneas.

### Task T7.6 — `apps/web/e2e/auth/login-and-landing.spec.ts` (1 flujo crítico × 2 locales) (~30 líneas)

- **Description.** G47 + design §8.4: session limpia → llenar el form de sign-in → submittear → assertear que se llega a la ruta de landing autenticada para ambos locales.
- **Discovery / file targets.** `apps/web/e2e/auth/login-and-landing.spec.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** `pnpm turbo run e2e --filter web -- --grep "login-and-landing"` sale 0.
- **Rollback.** `git revert <T7.6-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T7.7 — `apps/web/e2e/transactions/login-list-create.spec.ts` (~40 líneas)

- **Description.** G47 + design §8.4: sign in → navegar a la lista de transactions → abrir el form de create → llenarlo → submittear → assertear que la nueva fila aparece. Corre bajo ambos proyectos `en` y `es`.
- **Discovery / file targets.** `apps/web/e2e/transactions/login-list-create.spec.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** `pnpm turbo run e2e --filter web -- --grep "login-list-create"` sale 0.
- **Rollback.** `git revert <T7.7-sha>`.
- **Files touched (rough).** ~40 líneas.

### Task T7.8 — `apps/web/e2e/utils/axe.ts` + specs de axe por screen (~30 líneas)

- **Description.** Un helper reusable `expectNoAxeViolations(page)` que corre `@axe-core/playwright` contra la página actual y asserta cero violaciones. Cableado dentro de los `axe-*.spec.ts` de auth (Slice 4) y de transactions (Slice 6) para ejercitarse acá.
- **Discovery / file targets.** `apps/web/e2e/utils/axe.ts`; apoyarse en specs de los slices 4/6.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verificación.** `pnpm turbo run e2e --filter web -- --grep "@axe"` sale 0.
- **Rollback.** `git revert <T7.8-sha>`.
- **Files touched (rough).** ~30 líneas.

### Task T7.9 — Gate final `pnpm turbo run bdd e2e` (~30 líneas)

- **Description.** Tarea de verificación: `pnpm turbo run bdd e2e` sale 0 sobre ambos módulos y ambos locales. Producir `docs/slice-7-checklist.md` para que `sdd-verify` lo pueda re-correr.
- **Discovery / file targets.** `docs/slice-7-checklist.md`.
- **TDD sequence.** No es una tarea TDD — gate check.
- **Verificación.** Todos salen 0; reportes emitidos bajo `bdd-reports/` y `playwright-report/`.
- **Rollback.** N/A.
- **Files touched (rough).** Doc + verificación (~30 líneas).

**Slice 7 total: ~390 líneas modificadas.** Gate de verificación: G8 (`turbo run bdd` sale 0), G9 (≥9 archivos .feature — embarcamos 12), G10 (≥30 escenarios), G11 (step defs compartidos por feature), G12 (email+pw E2E + OAuth happy stubbed cubierto), G13 (real Google OAuth NO en Gherkin), G47 (e2e para login → list → create).

---

## Slice 8: Docs + polish + verificación final

**Goal.** Completar el `docs/architecture.md` y el `docs/migration-playbook.md` (con sus Spanish mirrors); embarcar los 7 archivos idempotentes `scripts/migrate/*.sh`; correr la matriz de validación final; producir la primera entrada de `CHANGELOG.md`.
**Start.** Slice 7 mergeado.
**Finish.** Cada gate G1–G47 satisfecho sobre un clone limpio. Spanish mirrors en su lugar. Las etapas del playbook son individualmente idempotentes.
**Verificación.** `pnpm turbo run build lint typecheck test bdd e2e coverage` todos salen 0; cada `scripts/migrate/*.sh` es idempotente (corrida dos veces sobre un branch limpio = no-op con exit 0 la segunda vez).
**Rollback.** Por commit atómico.

### Task T8.1 — `docs/architecture.md` (Inglés, contenido completo) (~40 líneas)

- **Description.** Reemplazar el stub del Slice 1 con el documento completo: layout del monorepo, boundaries de módulos, taxonomía de eventos (los 9 eventos), boundary rules de ESLint, extracción de design tokens, resumen de cadena sdd-*, nota de slices diferidos.
- **Discovery / file targets.** `docs/architecture.md`.
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** El archivo existe; `wc -l docs/architecture.md` ≥ 200.
- **Rollback.** `git revert <T8.1-sha>`.
- **Files touched (rough).** ~40 líneas netas (reemplaza el stub).

### Task T8.2 — `Documents-es/docs/architecture.md` (Spanish mirror) (~40 líneas)

- **Description.** Según convención id 2132: producir el Spanish mirror en el **mismo commit atómico** que T8.1. Traducir la prosa; mantener términos técnicos, file paths e identifiers en inglés.
- **Discovery / file targets.** `Documents-es/docs/architecture.md`.
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** El archivo existe; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md` devuelve vacío.
- **Rollback.** `git revert <T8.2-sha>`.
- **Files touched (rough).** ~40 líneas netas.

### Task T8.3 — `docs/migration-playbook.md` (Inglés) (~40 líneas)

- **Description.** Una sección por etapa del playbook (00-preflight, 10-extract-domain, 20-create-feature-slice, 30-wire-routes, 40-port-tests, 50-update-docs, 99-finalize). Cada sección: propósito, inputs, comandos (idempotentes), outputs esperados, puntos de decisión.
- **Discovery / file targets.** `docs/migration-playbook.md`.
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** El archivo existe; el conteo de secciones es exactamente 7 (una por etapa).
- **Rollback.** `git revert <T8.3-sha>`.
- **Files touched (rough).** ~40 líneas netas.

### Task T8.4 — `Documents-es/docs/migration-playbook.md` (Spanish mirror) (~40 líneas)

- **Description.** Spanish mirror según convención id 2132, mismo commit atómico que T8.3.
- **Discovery / file targets.** `Documents-es/docs/migration-playbook.md`.
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** El archivo existe; chequeo CJK vacío.
- **Rollback.** `git revert <T8.4-sha>`.
- **Files touched (rough).** ~40 líneas netas.

### Task T8.5 — `scripts/migrate/*.sh` (7 scripts idempotentes según Locked Decision #4) (~70 líneas)

- **Description.** Según etapa de playbook: `00-preflight.sh`, `10-extract-domain.sh`, `20-create-feature-slice.sh`, `30-wire-routes.sh`, `40-port-tests.sh`, `50-update-docs.sh`, `99-finalize.sh`. **Cada uno DEBE ser idempotente**: re-correrlo sobre un branch vacío es un no-op o imprime `already applied` y sale 0.
- **Discovery / file targets.** `scripts/migrate/*.sh`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: un test (bash con `bats` o un tiny shell-test runner) asserta que cada script sale 0 al correrlo dos veces; GREEN: implementar. TRIANGULATE: manejar `pnpm` faltante, `docker` faltante, `.git` faltante. REFACTOR: compartir un `ensure-tools.sh` y un patrón de guards entre los siete.
- **Verificación.** Correr cada script dos veces sobre un clone limpio; ambas corridas salen 0.
- **Rollback.** `git revert <T8.5-sha>`.
- **Files touched (rough).** ~70 líneas (≈10 líneas por script).

### Task T8.6 — Matriz de validación final (`docs/final-validation.md`) (~10 líneas)

- **Description.** `pnpm turbo run build lint typecheck test bdd e2e` sobre un clone limpio — todos salen 0. Documentar la secuencia de comandos en `docs/final-validation.md`.
- **Discovery / file targets.** `docs/final-validation.md`.
- **TDD sequence.** No es una tarea TDD — gate check.
- **Verificación.** La matriz de validación se ejecuta completa con código de salida 0.
- **Rollback.** N/A.
- **Files touched (rough).** ~10 líneas de doc.

### Task T8.7 — Check de coverage gate (~0 líneas, gate check)

- **Description.** Según `openspec/config.yaml#coverage_threshold` (60% lines/branches/functions/statements): `pnpm turbo run coverage` reporta ≥ 60% en las cuatro métricas. **No se enforce como CI gate** (según proposal §5 riesgo menor y el `coverage_gate_enforced: false` explícito); el reporte queda commiteado a los artefactos de test.
- **Discovery / file targets.** N/A.
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** Reporte de coverage en `coverage/` muestra los mínimos de 60% en todas las métricas.
- **Rollback.** N/A.
- **Files touched (rough).** ~0 líneas (verificación solamente).

### Task T8.8 — Tab-test manual WCAG AA + diff responsive por screen crítica (~0 líneas, verificación)

- **Description.** Según UI-4: tab-test manual de teclado confirma que cada elemento interactivo es alcanzable y nombrado en cada screen crítica. El visual diff confirma el renderizado mobile (≤640px) y desktop (≥1024px) sin overflow.
- **Discovery / file targets.** Verificación solamente; documentar el procedimiento en `docs/accessibility-manual-checks.md`.
- **TDD sequence.** No es una tarea TDD — verificación manual.
- **Verificación.** El documento de procedimiento pasa review; axe-core automatizado (Slice 4 / 6 / 7) es el gate primario; esta tarea agrega el registro manual.
- **Rollback.** N/A.
- **Files touched (rough).** ~0 líneas + el doc de procedimiento.

### Task T8.9 — Primera entrada de `CHANGELOG.md` (~5 líneas)

- **Description.** Según la intención publicable (Locked Decision #1): primera entrada `## [Unreleased] — Initial reference scaffold` resumiendo los ocho slices.
- **Discovery / file targets.** `CHANGELOG.md` en la raíz del repo.
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** El archivo existe; la entrada está presente.
- **Rollback.** `git revert <T8.9-sha>`.
- **Files touched (rough).** ~5 líneas.

### Task T8.10 — Tabla de verificación de gates embebida en `tasks.md` (~80 líneas)

- **Description.** Tarea final: re-verificar cada gate G1–G47 contra el plan de slices y embeber la tabla de verificación de gates al pie de `tasks.md` (este archivo). Cada gate linkea a su slice + tarea(s) y al comando de verificación. **El output de esta tarea es la tabla en la sección siguiente.**
- **Discovery / file targets.** `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (este archivo).
- **TDD sequence.** No es una tarea TDD.
- **Verificación.** Los 47 gates mapeados; cada fila tiene una celda "How verified" no vacía con un comando o referencia de fixture.
- **Rollback.** `git revert <T8.10-sha>`.
- **Files touched (rough).** ~80 líneas (la tabla en sí).

**Slice 8 total: ~280 líneas modificadas.** Gate de verificación: G29–G36 (docs), G37–G39 (hygiene), y la corrida de all-gates per §10 abajo.

---

## Merge final a `develop`

Después de que los 8 slices estén revisados y aprobados sobre `feat/vertical-slicing-reference-scaffold`:

1. Abrir UN PR desde `feat/vertical-slicing-reference-scaffold` → `develop` con el título `chore(reference): initial vertical-slicing scaffold (8-slice chain)`.
2. La descripción del PR lista los PRs mergeados (uno por slice) como co-autores de la cadena.
3. `sdd-verify` corre la matriz de verificación (según tarea #T8.6) una última vez sobre la rama integrada.
4. Merge a `develop` con `--no-ff` para preservar el historial de la cadena.
5. **Ningún merge a `main`** — `main` es inmutable (convención branch-model id 2129). La promoción a `main` sucede solo ante pedido explícito del usuario y según el flow de release de AGENTS.md.

---

## Tabla de verificación de gates

Cada gate G1–G47 del `proposal.md` §7 + §11.3, mapeado al slice + tarea(s) que lo satisfacen y al comando de verificación. Esta es la source of truth para la corrida final de `sdd-verify`.

| Gate | Descripción (proposal §7.X / §11.3) | Slice | Tarea(s) | Cómo se verifica |
|------|-------------------------------------|-------|----------|-------------------|
| G1 | `pnpm install` sobre un clone limpio completa sin errores | 1 | T1.1 | `pnpm install` → exit 0 |
| G2 | `pnpm db:up` levanta el contenedor Docker de Postgres | 1 | T1.5 | `docker compose ps` → servicio `postgres` healthy |
| G3 | `pnpm prisma migrate dev` aplica todas las migraciones de forma limpia | 2 | T2.1, T5.2 | `prisma/migrations/` populado; `psql \d+ "Transaction"` muestra `amount DECIMAL` |
| G4 | `pnpm turbo run build` retorna 0 sobre todos los packages | 1, 8 | T1.6, T1.7, T8.6 | `pnpm turbo run build` → exit 0; `apps/web/.next/` y `apps/api/dist/` producidos |
| G5 | `pnpm turbo run lint` retorna 0 | 1 | T1.3, T8.6 | `pnpm turbo run lint` → exit 0; ESLint flat config + boundary plugin activos |
| G6 | `pnpm turbo run test` retorna 0 | 2, 3, 4, 5, 6, 8 | T2.4, T3.*, T4.*, T5.*, T6.*, T8.6 | Vitest exit 0 sobre los workspaces |
| G7 | `pnpm turbo run typecheck` retorna 0 | 1, 8 | T1.2, T8.6 | `tsc --noEmit` → exit 0 sobre el workspace |
| G8 | `pnpm turbo run bdd` retorna 0 | 7, 8 | T7.1, T7.2, T7.3, T7.4, T7.9, T8.6 | `@cucumber/cucumber` → exit 0; ≥ 30 escenarios pasan |
| G9 | Existen ≥ 9 archivos `.feature` (12 en este design) | 7 | T7.2, T7.4 | `find libs/features -name '*.feature' \| wc -l` ≥ 9 (actual: 12) |
| G10 | ≥ 30 escenarios totales en los archivos `.feature` | 7 | T7.2, T7.4 | grep-count `Scenario:` lines ≥ 30 |
| G11 | Step definitions compartidas por feature bajo `libs/features/<feature>/docs/step-defs/` | 7 | T7.1, T7.3 | path check de los directorios `step-defs/`; sin cuerpos de step duplicados entre archivos `.feature` |
| G12 | BDD cubre email+password E2E (happy + invalid creds) Y OAuth Google happy stubbed path | 7 | T7.2 | `libs/features/auth/docs/{login-email-password,oauth-google-stub}.feature` existen y contienen los escenarios requeridos |
| G13 | El callback de OAuth contra Google real NO está en Gherkin (solo manual/integración) | 7 | T7.2 (aserción negativa) | grep `real google\|google oauth callback` sobre `libs/features/**/docs/*.feature` devuelve vacío |
| G14 | ESLint boundary rules activos (sin `*/server/*` desde `*/client/*`; sin imports cross-module) | 1 | T1.3 | `pnpm turbo run lint` → 0 errores; las reglas `no-client-server-import` y `no-cross-module-import` producen violaciones sobre los fixtures |
| G15 | Una violación deliberada (test fixture) es detectada por ESLint | 1 | T1.3 | `pnpm turbo run lint:fixtures` asserta que cada `invalid.ts` dispara su regla |
| G16 | `libs/core/database` es el único lugar donde se instancia `new PrismaClient()` | 2 | T2.1 | `grep -rn 'new PrismaClient(' apps libs apps/api` retorna 0 matches fuera de `libs/core/database/src/`; la regla de ESLint `no-prisma-outside-core` lo enforce |
| G17 | Los schemas Zod compartidos se reutilizan tanto en el client (forms) como en el server (validation pipe); sin validadores duplicados | 3, 4, 5 | T3.2, T3.6, T4.8–T4.12, T5.4, T5.11 | el form de client importa el mismo módulo `@features/<slice>/shared/schemas/*` que el `ZodValidationPipe` de NestJS |
| G18 | Multi-currency: existen las tablas `Currency` y `FxRate`; la conversión de FX tiene una advertencia de staleness a > 24 h | 5 | T5.1, T5.3, T5.8, T5.9, T5.12 | inspección del schema (las tablas existen); test unitario sobre `TransactionService.create` asserta que `transactions.fx.stale` se dispatcha cuando la rate tiene más de 24 h |
| G19 | Soft-delete categories: cada query de category filtra `deletedAt: null` (no opt-out) | 5 | T5.6, T5.7, T5.12 | invariante JSDoc sobre los ports de `CategoryRepository`; tests unitarios assertean que `findById` retorna `null` para categorías soft-deleted; test de integración asserta que las categorías soft-deleted no aparecen en selectores ni en totales por categoría |
| G20 | Los providers de email+password + Google OAuth corren en paralelo contra `@auth/prisma-adapter` | 3 | T3.3 | test unitario sobre `auth.config.ts` asserta que el array de providers contiene exactamente `credentials` + `google` y que el adapter está cableado |
| G21 | Password reset (forgot + reset) implementado con email mockeado | 3, 4 | T3.4, T4.10, T4.11 | BDD cubre el flujo (`libs/features/auth/docs/password-reset.feature`); test unitario sobre `PasswordResetService.requestReset` asserta que se produce la captura de email mockeada |
| G22 | Sessions list + revoke implementado | 3, 4, 6 | T3.4, T4.6, T6.3 | BDD lo cubre; test unitario de `SessionService.revokeSession` asserta que la session ya no puede autenticar |
| G23 | Los roles RBAC (admin / user) se enforce en la **capa de dominio** | 3 | T3.4, T3.7 | el chequeo de permisos vive en `RbacService`, llamado desde los controllers; BDD cubre los escenarios user-denied y admin-allowed |
| G24 | Tx validation: `amount > 0`, currency válida, category existe | 5 | T5.4, T5.9, T5.12 | el schema Zod rechaza `amount <= 0`; los tests de repository assertean que el lookup de category aplica el filtro de soft-delete |
| G25 | Idempotency-key en POST previene duplicados ante retry | 5 | T5.4, T5.9, T5.11, T5.12 | tests unitarios sobre `IdempotencyService.lookup` cubren: hit + fingerprint match → response cacheada; hit + mismatch → 409; miss → inserción fresh; expirada → fresh request |
| G26 | Decimal precision: `Transaction.amount` es Prisma `Decimal`, no `BigInt` | 5 | T5.1, T5.5 | inspección del schema (la columna es `DECIMAL`, no `BIGINT`); test asserta que `12.34` round-trips como `12.34` exacto |
| G27 | Audit log: `createdBy` / `updatedBy` en cada escritura de Transaction | 5 | T5.1, T5.9, T5.12 | inspección del schema (columnas presentes); test unitario sobre `TransactionService.create` asserta que la fila de `AuditLog` lleva `actorId = userId` |
| G28 | Sign-aware totals (income vs expense) + per-category totals + threshold alerts | 5, 6 | T5.9, T5.12, T6.8, T6.9 | tests unitarios sobre `TotalsService.forUser` separan income/expense correctamente; `perCategory` excluye categorías soft-deleted; `ThresholdService.evaluate` emite `transactions.threshold.exceeded` |
| G29 | `docs/architecture.md` existe y no está vacío | 1, 8 | T1.8, T8.1 | `wc -l docs/architecture.md` ≥ 200 |
| G30 | `Documents-es/docs/architecture.md` existe; mismo contenido (sin el delta de locale) | 1, 8 | T1.8, T8.2 | diff entre los dos archivos difiere solo en strings específicas de locale; chequeo CJK vacío |
| G31 | `docs/migration-playbook.md` existe con una sección por etapa del playbook | 8 | T8.3 | conteo de secciones = 7 (una por etapa) |
| G32 | `Documents-es/docs/migration-playbook.md` existe | 8 | T8.4 | chequeo de archivo + chequeo CJK vacío |
| G33 | `scripts/migrate/*.sh` existe; un `.sh` por etapa del playbook | 8 | T8.5 | `ls scripts/migrate/*.sh \| wc -l` = 7 |
| G34 | Cada `*.sh` es idempotente: re-correrlo sobre un branch vacío es un no-op o imprime `already applied` | 8 | T8.5 | correr cada script dos veces sobre un clone limpio; exit 0 ambas veces |
| G35 | `LICENSE` es MIT | 1 | T1.4 | `head -1 LICENSE` reporta MIT; `grep 'MIT License'` matchea |
| G36 | `CONTRIBUTING.md` y `README.md` existen | 1 | T1.4 | chequeo de archivo |
| G37 | Todos los commits están en `develop` (sin commits a `main`) | 1–8 | chain strategy + merge final en T8 | `git log main` no muestra nuevos commits más allá del baseline de sdd-init |
| G38 | `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` es el proposal canónico | cross-cutting | chain strategy | el archivo existe; matchea la observación Engram en topic_key `sdd/vertical-slicing-reference-scaffold/proposal` |
| G39 | La observación Engram en topic_key `sdd/vertical-slicing-reference-scaffold/proposal` existe y es recuperable | cross-cutting | chain strategy | `mem_search` + `mem_get_observation` retorna el proposal |
| G40 | `apps/web/components.json` existe; componentes shadcn-style presentes en `apps/web/components/ui/{button,input,form,card,dialog,dropdown-menu,toast}.tsx` | 4, 6 | T4.4, T4.6 | path check sobre las ocho primitivas |
| G41 | Design tokens (colors, spacing, typography) extraídos de `gastos-personales/` y aplicados vía `apps/web/tailwind.config.ts` (o CSS variables en `apps/web/app/globals.css`) | 4, 6 | T4.7 | grep + visual diff; `apps/web/app/globals.css` contiene las variables `--background`, `--foreground`, `--primary` esperadas; `apps/web/tailwind.config.ts` las referencia |
| G42 | `next-intl` configurado; existen `apps/web/messages/{en,es}.json` | 4 | T4.2, T4.3 | chequeo de archivo; `pnpm --filter web dev` muestra las rutas `/en` y `/es`; al menos un string se renderiza en ambos locales |
| G43 | Cada screen en `apps/web/app/(auth)/*` y `apps/web/app/(app)/*` es WCAG AA compliant | 4, 6, 7 | T4.13, T6.10, T7.8 | el audit de `@axe-core/playwright` pasa por screen crítica; el tab-test manual de teclado pasa |
| G44 | Cada form tiene los estados loading / error / success / empty / validation-error implementados | 4, 6 | T4.14, T6.10 | review de componente por form; tests de cobertura de estados pasan |
| G45 | Todas las pages son responsive: mobile (≤640px) y desktop (≥1024px) breakpoints cubiertos; el layout no se rompe entre medio | 4, 6 | T4.13, T6.10 | diff visual responsive; sin overflow horizontal a 360px y 1440px |
| G46 | Tests de componente con Vitest + Testing Library: al menos un test por screen crítica para el happy path | 4, 6 | T4.1, T4.8–T4.12, T6.1, T6.4–T6.9 | la corrida de vitest reporta tests de componente pasando por screen crítica |
| G47 | Tests e2e con Playwright: al menos un flujo crítico (login → transactions list → create transaction) pasa | 7 | T7.6, T7.7, T7.9 | `pnpm turbo run e2e` sale 0; ambos proyectos (`en`, `es`) pasan |

### Completitud de cobertura de gates

- **G1–G8 (build + infraestructura)**: 8/8 cubiertos.
- **G9–G13 (cobertura BDD)**: 5/5 cubiertos.
- **G14–G17 (arquitectura / boundaries)**: 4/4 cubiertos.
- **G18–G28 (reglas de dominio)**: 11/11 cubiertos.
- **G29–G36 (documentación)**: 8/8 cubiertos.
- **G37–G39 (hygiene)**: 3/3 cubiertos.
- **G40–G47 (gates UI, §11.3)**: 8/8 cubiertos.

Total: 47/47 gates mapeados a un slice + tarea concreto y a un comando verificable. Ninguno es aspiracional; cada gate atañe a un test o a un chequeo de archivo/path que `sdd-verify` puede re-correr desde un clone limpio.

---

## Slice 4 — migración de cookies (final — post-integración con NextAuth)

**Resumen del objetivo.** PR #21 (slice 4 — integración con NextAuth) incorporó el mint del JWE de NextAuth v5 del lado de la API: el `AuthService` de la API ahora genera un session token JWE real de NextAuth mediante `next-auth/jwt#encode`. Sin embargo, la cookie del cliente web todavía utilizaba el nombre bespoke `auth-session` del slice 4 batch 2. Mantener el nombre de la cookie desincronizado de la integración de NextAuth de la API habría anulado el propósito de la integración canónica — un futuro helper `auth()` drop-in lee el nombre canónico `authjs.session-token`. Este batch migra el nombre de la cookie + canonicaliza el string de atributos para que la cookie sea forward-compatible con una integración `auth()` real.

**Rama.** `feat/vertical-slicing-s4-cookie-migration` (cortada desde `develop @ c2bbe2c`, post-merge PR #21 slice 4 integración con NextAuth).

**TDD estricto.** ACTIVO. Test runner = `pnpm turbo run test`. Según el brief, esta es una sub-tarea REFACTOR + tests: el renombrado de la constante es mecánico y el nuevo test de atributo es la única adición de tests.

**Estrategia.**

- **Nombre de la cookie.** `auth-session` → `authjs.session-token` (canónico de NextAuth v5). La constante `AUTH_SESSION_COOKIE` en `apps/web/lib/auth.ts` es la única fuente de verdad; todas las lecturas (`getSession()`) y escrituras (`setSessionCookie()` / `clearSessionCookie()`) fluyen a través de la constante.
- **Atributos de la cookie (canónicos de NextAuth v5).** `path=/`, `max-age=24*60*60` (24h, derivado de la nueva constante `SESSION_TTL_SECONDS` que coincide con el `SESSION_TTL_MS` de la API), `SameSite=lax` (minúsculas según el estándar HTTP), `HttpOnly` (hint canónico; los navegadores lo ignoran cuando se setea vía `document.cookie`, pero la directiva es forward-compatible con un header `Set-Cookie` real del lado del servidor).
- **`Secure` se OMITE INTENCIONALMENTE.** El `pnpm dev` del repo de referencia corre sobre `http://localhost:3000` y el navegador rechaza cookies `Secure` en orígenes no-HTTPS. `Secure` pertenece a un header `Set-Cookie` del lado del servidor gateado por `process.env.NODE_ENV === 'production'` (llega en el slice 6+ hardening de deploy cuando la cookie se setea del lado del servidor vía el callback `signIn(...)` de NextAuth).
- **Lectura del lado del servidor.** `getSession()` no cambia de forma — lee `cookies().get(AUTH_SESSION_COOKIE)?.value` y el renombrado fluye a través de la constante. Los atributos de la cookie (httpOnly, secure, sameSite, path) no los parsea `cookies()` de Next.js — son propiedades del objeto `RequestCookie` para inspección, pero el contrato canónico es el par nombre + valor.

**Fuera de alcance (diferido).**

- Cambiar `getSession()` al helper `auth()` de NextAuth — la heurística `useImportType` del auto-formatter rompió repetidamente el import canónico de NextAuth durante el worker run que incorporó PR #21. El patrón manual de lectura `cookies().get(...)` es la elección pragmática para este batch; la migración a `auth()` es una preocupación separada que requiere reemplazar el `setSessionCookie()` del form por una llamada real a `signIn(...)` (slice 6+ hardening de deploy).
- Header `Set-Cookie` del lado del servidor con flag `Secure` — slice 6+ hardening de deploy.
- Tests e2e (Playwright) para la persistencia de la cookie en un contexto de navegador real — slice 4 follow-up. Los tests unitarios cubren la superficie; los e2e añadirían la verificación de persistencia de la cookie en contexto de navegador.
- Handshake OAuth real de Google — slice 4+ si/cuando se añada.

### Sub-task brief-cookie-name-migration [x]

**Migrar el nombre de la cookie + canonicalizar el string de atributos.** Cambios de superficie:

- `apps/web/lib/auth.ts`:
  - `AUTH_SESSION_COOKIE = "auth-session"` → `AUTH_SESSION_COOKIE = "authjs.session-token"` (canónico de NextAuth v5).
  - Nueva constante `SESSION_TTL_SECONDS = 24 * 60 * 60` (coincide con `SESSION_TTL_MS = 24h` de la API). Exportada para los tests.
  - String de atributos de `setSessionCookie()`: `path=/`, `max-age=${SESSION_TTL_SECONDS}` (explícito), `SameSite=lax` (minúsculas, antes era `SameSite=Lax`), `HttpOnly` (nuevo).
  - `clearSessionCookie()` refleja el `SameSite=lax` en minúsculas.
  - JSDoc actualizado para documentar el contrato canónico de NextAuth v5 y la justificación de omitir `Secure`.
- `apps/web/components/auth/LoginForm.tsx` + `SignUpForm.tsx`: sin cambios de código — llaman a `setSessionCookie()` que ahora escribe el nombre + atributos canónicos.
- `apps/web/app/[locale]/page.tsx` + `apps/web/app/[locale]/(auth)/sign-in/page.tsx`: comentarios JSDoc actualizados para referenciar el nombre canónico de la cookie (sin cambios de código; `getSession()` lee la constante).

Tests:

- `apps/web/__tests__/lib-auth.test.ts`: 11 → 13 tests. +2 nuevas aserciones:
  - `AUTH_SESSION_COOKIE === 'authjs.session-token'` (bloquea el nombre canónico como parte del contrato).
  - `SESSION_TTL_SECONDS === 24*60*60` (bloquea la derivación del max-age).
- `apps/web/__tests__/components/auth/LoginForm.test.tsx` + `SignUpForm.test.tsx` + `state-coverage.test.tsx`: líneas de cleanup + mock de cookie actualizadas a `authjs.session-token`. La aserción de set de cookie en el success-path ahora también pinnea `HttpOnly` en el string de atributos (un match de regex añadido por archivo).
- `apps/web/__tests__/app/{landing,sign-in,sign-up,forgot-password,reset-password}.test.tsx`: mocks del cookie store actualizados al nuevo nombre canónico. Descripciones de tests actualizadas.

### Sub-task brief-server-cookie-read [x]

**El `getSession()` del lado del servidor lee el nombre canónico de la cookie de NextAuth.** El cuerpo de la función no cambia — lee `cookies().get(AUTH_SESSION_COOKIE)?.value` y el renombrado fluye a través de la constante automáticamente. **Sin cambios de código** más allá de la actualización de la constante en la sub-tarea 1.

La función `getSession()` retorna `null` cuando:

- La cookie está ausente.
- El valor de la cookie es JSON malformado (`JSON.parse` lanza).
- El valor de la cookie es JSON válido pero falta el campo `user` o `token`.
- El valor de la cookie es JSON válido pero `user` no tiene `id` / `email` / `role`.

Es el mismo comportamiento que en slice 4 batch 2 — no se necesita lógica de decode nueva.

### Sub-task brief-markers-apply-progress [x]

**Commit final — `chore(slice-4-cookie-migration): tasks.md sub-task [x] markers + apply-progress section (slice 4 cerrado de verdad)`.**

- `tasks.md`: añade esta sección + las 3 filas de sub-task de arriba con marcadores `[x]`.
- `apply-progress.md`: append de la sección de migración de cookie del slice 4.
- `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/tasks.md` + `apply-progress.md`: mirror en español producido en el mismo commit atómico según AGENTS.md §13 (convención doc-mirror-spanish id 2132). Superficies técnicas preservadas verbatim; prosa traducida a español neutral/profesional.

### Evidencia TDD (por sub-tarea)

| Sub-task | RED | GREEN | Refactor |
|----------|-----|-------|----------|
| brief-cookie-name-migration | N/A — renombrado mecánico + 2 nuevas aserciones de atributo. Los 11 tests existentes en `lib-auth.test.ts` fallarían en la aserción `cookieStr.startsWith(\`${AUTH_SESSION_COOKIE}=\`)` si `AUTH_SESSION_COOKIE` se cambiase sin actualizar el mock del test — pero el mock usa la constante así que el renombrado fluye. Los 8 tests de páginas / forms que tenían hardcoded `"auth-session"` en el cookie store SÍ fallaron tras el renombrado + fueron actualizados en el mismo commit (test+code atómico). | 13/13 lib-auth tests PASS (eran 11; +2 nuevas aserciones de atributo); 106/106 apps/web tests PASS (eran 104; +2 lib-auth + ningún test nuevo de página/form); 112/112 @features/auth; 37/37 @core/events; 20/20 @core/config; 21/21 apps/api; 9/9 turbo tasks; 10/10 lint; 9/9 typecheck; 11/11 boundary fixtures. | Ninguno — la superficie es pequeña + autocontenida. |
| brief-server-cookie-read | N/A — cuerpo de la función sin cambios; solo la constante propaga el renombrado. | Todos los tests pasan sin modificación (los tests existentes asseren sobre el shape decodificado, no sobre el nombre de la cookie directamente). | Ninguno. |
| brief-markers-apply-progress | N/A — solo documentación. | N/A. | N/A. |

### Quality gates — todos verdes

| Gate | Comando | Resultado |
|------|---------|-----------|
| Workspace install | `pnpm install` | exit 0 |
| Tests (auth) | `pnpm --filter @features/auth exec vitest run` | 112/112 PASS |
| Tests (events) | `pnpm --filter @core/events exec vitest run` | 37/37 PASS |
| Tests (config) | `pnpm --filter @core/config exec vitest run` | 20/20 PASS |
| Tests (api) | `cd apps/api && pnpm exec vitest run` | 21/21 PASS |
| Tests (web) | `cd apps/web && pnpm exec vitest run` | 106/106 PASS (eran 104; +2 nuevas aserciones de atributo) |
| Tests (turbo) | `pnpm turbo run test --filter=@features/auth --filter=@core/* --filter=@shared-utils/* --filter=api --filter=web` | 9/9 tasks PASS |
| Lint (full) | `pnpm turbo run lint` | 10/10 tasks PASS |
| Lint (fixtures) | `pnpm run lint:fixtures` | 11/11 fixtures PASS, 18 violaciones a través de los fixtures inválidos |
| Typecheck (full) | `pnpm turbo run typecheck` | 9/9 tasks PASS |

### Desviaciones críticas del brief (3)

1. **`HttpOnly` seteado vía `document.cookie` es un no-op del lado del navegador.** Los navegadores reales ignoran silenciosamente la directiva `HttpOnly` cuando se setea vía `document.cookie` desde JavaScript — el atributo solo toma efecto cuando lo emite un header `Set-Cookie` del servidor. El brief pide añadir `HttpOnly` al string de la cookie; la directiva se incluye para que el STRING de la cookie coincida con el contrato canónico de NextAuth v5 (la aserción del test también lo pinnea). La protección real (HttpOnly previniendo acceso JS) requiere la integración real del `Set-Cookie` del lado del servidor en el slice 6+ hardening de deploy.
2. **`Secure` se OMITE.** El toggle del brief "secure: process.env.NODE_ENV === 'production'" aplica conceptualmente a un header `Set-Cookie` del lado del servidor. La escritura `document.cookie` del lado del cliente no puede usar `Secure` en dev (localhost es HTTP, el navegador rechaza cookies Secure en orígenes no-HTTPS). La migración deja Secure para la integración del `Set-Cookie` del lado del servidor en slice 6+.
3. **`SESSION_TTL_SECONDS` es una constante local en `apps/web/lib/auth.ts`, no un export compartido de `libs/shared-utils`.** La API expone su `SESSION_TTL_MS` pero el cliente web no importa actualmente desde `@shared-utils/*` para configuración de auth. Promover la constante a un export compartido es un refactor del slice 6+ (requeriría un nuevo paquete `libs/shared-utils/session-ttl` o una adición al set existente `date-formatting` / `currency` / `decimal`).

### Workload / PR boundary

- Forecast (brief): ~50 líneas de fuente + ~80 líneas de tests = ~130 líneas.
- Actual: 12 archivos cambiados en el commit de refactor, +171 / -106 = 277 inserciones netas a través de fuente + tests + JSDoc. 1 commit atómico (`9834f51 refactor(web): migrate to canonical NextAuth v5 cookie name + attributes`).
- 400-line budget risk: **Bajo** — bien dentro del presupuesto por PR.
- Target del PR: `feat/vertical-slicing-s4-cookie-migration` → `develop` una vez que `sdd-verify` apruebe. NO pusheado al remoto, NO mergeado aún.
- Este es el **sub-batch final del slice 4**. Estado del slice 4: **15/15 + 5/5 follow-ups + 4/4 batch 2 + 3/3 cookie migration = 27/27 CERRADO**. La migración de cookie es la pieza final de la cadena de follow-ups T3.3 que empezó en el slice 3 batch 7 (integración con NextAuth).

### Operaciones prohibidas respetadas

- ❌ find / ls -R / tree — NO USADO.
- ❌ Modificar la API (slice 3 cerrado) — NO TOCADO.
- ❌ Modificar el hook `useAuthApiPost` del form o el endpoint de sesión de la API — NO TOCADO.
- ❌ Cambiar `getSession()` al helper `auth()` de NextAuth (el auto-formatter rompe el import canónico; la lectura manual `cookies().get(...)` es la elección pragmática) — NO TOCADO.
- ❌ Modificar los tests e2e existentes de Playwright — NO TOCADO (no hay tests e2e para la persistencia de la cookie; los tests unitarios cubren la superficie).
- ❌ "Co-Authored-By" o atribución de IA — NO INCLUIDO en ningún commit.

### Cross-references

- Tasks (markers): esta sección + 3 filas de sub-task con marcadores `[x]`.
- Apply progress: `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` (sección de migración de cookie del slice 4 appendeada).
- Mirror en español: `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/tasks.md` + `apply-progress.md` (español neutral/profesional, superficies técnicas preservadas verbatim según AGENTS.md §13 / convención id 2132).
- Spec: `openspec/changes/.../specs/auth/spec.md` §Sign-in (AC-1..AC-4 — el shape del sessionToken en la respuesta).
- Design: `openspec/changes/.../design.md` §4.1 (dominio auth — `AuthService.login` retorna `{ id, email, role, sessionToken }`).
- Engram: `sdd/vertical-slicing-reference-scaffold/apply-progress-notes-slice4-cookie-migration` (guardado vía `mem_save` antes del retorno).
- Hash del commit atómico: `9834f51` (refactor + tests + nuevos tests de atributo en un commit atómico según la regla del brief "tests+code en el MISMO commit para una tarea de comportamiento").
- Hash del commit de markers: TBD (este commit).
- Commit base: `c2bbe2c` (post-merge PR #21 slice 4 integración con NextAuth).
- Working tree: limpio tras este commit.
- Estado de push: no pusheado.
- Estado de merge: no mergeado.

---

## Slice 5 PR #1 — Foundations (capa de tipos)

**Recap (español).** Este es el primer PR de la estrategia chained-3-PR para el slice 5 (trackeada en `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` Slice 5 mapping + design §5.1 / §5.5). Alcance: solo la capa de tipos — extensión de esquema Prisma (T5.1), schemas Zod canónicos (T5.4), entidades de dominio (T5.5), puertos de dominio (T5.6). Sin comportamiento, sin adaptadores Prisma (PR #2), sin controllers NestJS (PR #3).

**Rama.** `feat/vertical-slicing-s5-transactions-server` (cortada de `develop @ 4d5c282`, post-merge del release v1.0.0).

**Strict TDD.** ACTIVO. Test runner = `pnpm test`. RED → GREEN honrados al momento de escribir según la tarea (T5.4 schemas tienen specs Vitest co-localizados escritos primero). T5.1 + T5.5 + T5.6 no son tareas behavior-first según el contrato strict-TDD de `openspec/config.yaml`; los tests contractuales para los puertos aterrizan en PR #2 (lado del adaptador, verificación D-TX-5).

### Sub-tarea T5.1 [x]

Extensión del esquema Prisma. `libs/core/database/prisma/schema.prisma` gana: enums `CategoryKind` / `TransactionKind`, modelos `Currency` / `FxRate` / `Category` / `Transaction` / `IdempotencyKey` / `AuditLog`, más back-relations en `User` + `FxRate`. **D-TX-6**: las columnas monetarias son `Decimal`, NUNCA `BigInt`. El esquema parsea (`prisma format` exits 0). El apply de la migración está gateado para PR #2 (T5.2). Commit: `478fd7c`.

### Sub-tarea T5.4 [x]

Schemas Zod canónicos. `libs/features/transactions/shared/schemas/{create,update,list,category-create,category-update,index}.ts` + 5 specs Vitest co-localizadas bajo `shared/schemas/__tests__/`. 27 aserciones a través de 5 archivos, todas GREEN. El scaffold del slice (`server/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`) co-committed. Commit: `a4f531e`.

### Sub-tarea T5.5 [x]

Entidades de dominio. `libs/features/transactions/server/src/domain/entities/{transaction,category,currency,fx-rate,idempotency-key}.entity.ts` + barrel índice. 5 interfaces TS + 2 uniones discriminadoras + 2 proyecciones de insert. `Decimal` es el re-export de `@shared-utils/decimal` desde `decimal.js` (D-TX-6); la frontera del adaptador convierte el `Decimal` runtime de Prisma a este shape en PR #2. Commit: `1802dd5`.

### Sub-tarea T5.6 [x]

Puertos de dominio. `libs/features/transactions/server/src/domain/interfaces/{transaction,category,currency,fx-rate,idempotency}.repository.ts` + `fx-rate.provider.ts` + barrel índice. 6 interfaces de puertos + 9 shapes de input/filter. **El JSDoc de `CategoryRepository` carga la invariante D-TX-5 verbatim**: cada path de lectura DEBE filtrar `deletedAt IS NULL`, sin flag `includeDeleted`, sin parámetro `bypassFilter`. El guard compile-time aterriza en PR #2 (T5.7) donde los tests del adaptador Prisma aseguran que ninguna query de lectura llega al adaptador sin ese where-clause. Commit: `1802dd5`.

### Quality gates (por slice 5 PR #1)

| Gate | Resultado |
|------|-----------|
| `DATABASE_URL=postgresql://... pnpm --filter @core/database exec prisma format` | exit 0 |
| `pnpm --filter @features/transactions exec tsc --noEmit` | exit 0 |
| `pnpm --filter @features/transactions exec vitest run` | 27/27 PASS (5 archivos) |
| `pnpm lint:fixtures` | 11/11 fixtures PASS, 18 violaciones en fixtures inválidos preservadas |

### Fuera de alcance para PR #1 (diferido)

- **T5.2** Apply de migración (`pnpm prisma migrate dev --name transactions_init`) — PR #2.
- **T5.3** Test RED para `TransactionService.create` — PR #3 (depende de los adaptadores de PR #2).
- **T5.7** Adaptadores Prisma (5 repos) + verificación D-TX-5 — PR #2.
- **T5.8** `InMemoryFxRateProvider` + helper de test `advanceClock()` — PR #2.
- **T5.9** Cuatro servicios (TransactionService / CategoryService / TotalsService / ThresholdService) — PR #3.
- **T5.10** Wiring del token DI `FX_RATE_PROVIDER` en `apps/api/modules/transactions/` — PR #2 (o PR #3 si se pre-bound ahí).
- **T5.11** Controller NestJS — PR #3.
- **T5.12** Suite de triangulación (8 escenarios cross-cutting) — PR #3.
- **T5.13** Refactor + lint + typecheck + test green — PR #3.

### Desviaciones críticas del brief

1. **`AuditLogRepository` port NO introducido en T5.6.** Design §5.1 lista seis puertos, ninguno para auditoría. Los servicios en PR #3 necesitarán un path de escritura de auditoría; ya sea vía un NUEVO puerto introducido en PR #3 mismo, o vía Prisma directo en el servicio (que violaría `no-prisma-outside-core`). Decisión diferida a PR #3 — surgirá como brief al aterrizar los servicios.
2. **La estructura del scaffold del slice sigue al slice de auth, no al patrón de paquete per-slice del usuario.** Inicialmente se creó un paquete separado `@features/transactions-shared`, luego se revirtió al modelo de auth "shared/ existe, sin package.json; el barrel del server re-exporta" para cohesión del slice. Los schemas compartidos son alcanzables como `@features/transactions/shared/schemas/...` vía path-mapped catchall.

### Landmark de chore (pre-PR #1)

- `98c651e chore(repo): remove spurious merge markers from package.json files` — 9 archivos `package.json` (apps + libs) tenían marcadores de merge sin resolver `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` en la línea de version (ambos lados decían `1.0.0`). Limpieza mecánica: se mantuvo una línea de versión, se quitaron los marcadores. JSON ahora válido. Bloqueó `pnpm install` de completarse limpiamente antes de este PR.

### Cross-references

- **Hashes de commits atómicos (PR #1):** `478fd7c` (T5.1), `a4f531e` (T5.4 + scaffold), `1802dd5` (T5.5 + T5.6), más el chore `98c651e`. Commit de workflow (este): `TBD`.
- **Spec:** `openspec/changes/.../specs/transactions/spec.md` (sección Data Model, decisiones D-TX-1..D-TX-7).
- **Design:** `openspec/changes/.../design.md` §5.1 (entidades + puertos), §5.5 (Zod schemas).
- **Apply progress:** `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` (sección slice 5 PR #1 appendeada).
- **Mirror en español:** `Documents-es/openspec/changes/.../tasks.md` + `apply-progress.md` (español neutral/profesional según AGENTS.md §13).
- **Rama:** `feat/vertical-slicing-s5-transactions-server`.
- **Commit base:** `4d5c282` (post-merge del release v1.0.0 de vuelta en develop).
- **Pusheado:** no.
- **Mergeado:** no.
- **Working tree:** limpio tras este commit.
- **PR boundary:** este es el PR #1 de 3 (`T5.1+T5.4+T5.5+T5.6`, ~type layer + 523 LOC + 593 LOC entre schemas + entities/ports = ~1.1K inserciones netas incluyendo tests/config). PR #2 aterriza `T5.2+T5.7+T5.8+T5.10` (adaptadores + FX + DI wiring). PR #3 aterriza `T5.3+T5.9+T5.11+T5.12+T5.13` (servicios + controller + triangulate + refactor).
- **Siguiente recomendado:** slice 5 PR #2 — apply de migración Prisma + 5 adaptadores prisma + `InMemoryFxRateProvider` + token DI `FX_RATE_PROVIDER` (T5.2, T5.7, T5.8, T5.10).
