# Lista de Verificación del Primer Arranque

> Valida un clone limpio de `gastos-personales-reference` de extremo a extremo.
> Repite las mismas verificaciones que ejecuta `sdd-verify`. **Criterio de éxito: todos exit 0.**

## 1. Prerrequisitos

- Node ≥ 22.13.0 (ver `.nvmrc`)
- pnpm ≥ 11 (se instala automáticamente vía el campo `packageManager` y corepack)
- Daemon de Docker en ejecución (contenedor de Postgres)

## 2. Instalación

```bash
corepack enable
pnpm install
```

## 3. Base de datos (Postgres vía Docker Compose)

```bash
pnpm db:up
docker compose ps   # esperar que el servicio `postgres` esté healthy
```

## 4. Migraciones de Prisma (diferidas del sandbox; correr en la máquina local)

```bash
pnpm prisma:generate
pnpm prisma:migrate:dev --name init
```

## 5. Verificaciones de calidad

```bash
pnpm turbo run build lint typecheck
pnpm turbo run test
node tools/eslint-plugin-boundary/scripts/run-fixtures.mjs
```

## 6. Smoke test de las aplicaciones

```bash
pnpm --filter web build    # build de producción de Next.js
pnpm --filter api build    # build de producción de Nest
```

## 7. Criterio de éxito

**Todos exit 0.** Si alguna verificación falla, abrir una tarea de fix contra la tarea del slice ofensor en `openspec/changes/archive/2026-07-05-vertical-slicing-reference-scaffold/tasks.md`.
