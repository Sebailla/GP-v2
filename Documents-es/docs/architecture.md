# Arquitectura

> **Estado**: borrador (slice 1). El contenido completo llega en el
> slice 8 (`openspec/changes/vertical-slicing-reference-scaffold/tasks.md`
> §T8.1 + §T8.2).
> **Proyecto**: `gastos-personales-reference`.
> **Espejo en espanol**: este archivo. La version canonica en
> ingles vive en `docs/architecture.md` (REGLA DURA segun AGENTS.md §13).

Este documento describe la arquitectura del monorepo
`gastos-personales-reference`. El stub de slice 1 enumera las seis
secciones que el documento completo cubrira; cada seccion recibe
2 a 4 lineas de texto provisional para que las personas revisoras
puedan confirmar que la estructura ya existe.

## 1. Vision general

El repositorio es un scaffold ejecutable y publicable que valida
el modelo de monorepo con division vertical descrito en la
propuesta (`openspec/changes/vertical-slicing-reference-scaffold/proposal.md`).
**No** es una copia 1:1 del proyecto existente `gastos-personales/`;
existe para validar el modelo antes de cualquier migracion a
produccion.

## 2. Disposicion del repositorio

Dos aplicaciones ejecutables (`apps/web` con Next.js 15, `apps/api`
con NestJS 10), tres raices de bibliotecas compartidas (`libs/core`,
`libs/features`, `libs/shared-utils`), el plugin de ESLint para
limites arquitectonicos (`tools/`) y los artefactos de planificacion
bajo `openspec/`. El arbol completo esta en
`openspec/changes/vertical-slicing-reference-scaffold/design.md`
seccion 2; el slice 8 amplia esta seccion con prosa por directorio.

## 3. Herramientas del monorepo

pnpm 10.15.0 con `pnpm-workspace.yaml`, Turbo 2.3.3 con los ocho
pipelines declarados en `turbo.json` (`build`, `dev`, `lint`,
`lint:fixtures`, `test`, `typecheck`, `bdd`, `e2e`, `coverage`,
`clean`). TypeScript 5.6.3 estricto en todos los workspaces; la
configuracion base en `tsconfig.base.json` declara los once aliases
de rutas que consumen los paquetes aguas abajo.

## 4. Diseno del dominio: auth

Vive bajo `libs/features/auth/{client,server,shared,docs}`. El
slice de servidor entrega AuthService, SessionService, RbacService,
PasswordResetService, la configuracion de NextAuth v5 (Credentials

+ Google via `@auth/prisma-adapter`) y los cuatro eventos emitidos.
El slice compartido entrega cinco esquemas Zod reutilizados por los
formularios del cliente y el ZodValidationPipe de NestJS. Diseno
completo en `openspec/changes/vertical-slicing-reference-scaffold/design.md`
seccion 4.

## 5. Diseno del dominio: transactions

Vive bajo `libs/features/transactions/{client,server,shared,docs}`.
El slice de servidor entrega TransactionService, CategoryService,
TotalsService, ThresholdService; seis adaptadores de repositorio
Prisma; el InMemoryFxRateProvider; y cinco eventos emitidos. El
slice compartido entrega cinco esquemas Zod. El filtro de soft-delete
en cada consulta de categoria es un invariante no negociable (D-TX-5).
Diseno completo en `openspec/changes/vertical-slicing-reference-scaffold/design.md`
seccion 5.

## 6. Aspectos transversales

Invariantes de fuente unica impuestos por ESLint: `new PrismaClient()`
solo se permite en `libs/core/database/src/`; los esquemas Zod viven
solo en `libs/features/<x>/shared/schemas/` y `libs/core/config/env.schema.ts`;
los efectos secundarios entre modulos pasan por `@core/events`. El
plugin de limites personalizado (`tools/eslint-plugin-boundary/`)
expone cinco reglas con verificacion de sanidad basada en fixtures
mediante `pnpm lint:fixtures`. El prefijo de locale usa `next-intl`
(slice 4); los tokens de diseno se extraen del repositorio existente
`gastos-personales/` (slice 4).

---

_La prosa completa de cada seccion llega en el slice 8. Consulta
`openspec/changes/vertical-slicing-reference-scaffold/tasks.md` §T8.1
(ingles) y §T8.2 (espejo en espanol)._
