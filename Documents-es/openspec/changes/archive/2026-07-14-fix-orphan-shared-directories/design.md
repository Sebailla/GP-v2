# Diseño Técnico — `fix-orphan-shared-directories`

> **Proyecto**: `gastos-personales-reference` (`gp-v2`) · **Fecha**: 2026-07-14
> **Modo**: auto · **Almacén**: hybrid · **Strict TDD**: ACTIVO · **Entrega**: PR único

## 1. Mapeo objetivos ↔ enfoque técnico

| Objetivo | Enfoque técnico |
|---|---|
| G1 | Crear manifiestos para `auth/shared` y `transactions/shared`. |
| G2 | Verificar que `libs/*/*/*` ya cubra ambos paquetes; no editar el archivo del workspace salvo que se demuestre lo contrario. |
| G3 | Eliminar `paths.zod` y sus comentarios explicativos de los tsconfig de ambas apps. |
| G4 | Correr `pnpm install` para que existan los links de `zod` locales del paquete; preservar todos los paths de importadores. |
| G5 | Correr `pnpm turbo run test bdd lint typecheck build`. |
| G6 | Confirmar API 22/22, web 145/145, y BDD 43/43. |
| G7 | Correr el gate completo más `pnpm lint:fixtures`. |

## 2. Diff archivo por archivo

### Archivo 1 — `libs/features/auth/shared/package.json` (NUEVO)

```json
{
  "name": "@features/auth/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "4.4.3"
  }
}
```

### Archivo 2 — `libs/features/auth/shared/README.md` (NUEVO)

```markdown
# Auth shared package

This workspace package owns the auth slice's shared Zod contracts.
Its manifest makes runtime dependency ownership explicit for pnpm.
Both client and server consumers continue using the canonical schemas.
Keep schema literals under `shared/schemas` and export them through `src/index.ts`.
```

### Archivo 3 — `libs/features/auth/shared/src/index.ts` (NUEVO)

```typescript
// @features/auth/shared — barrel re-export for the shared schema package.
// See ADR 0011 (shared-as-workspace-packages).
export * from "./schemas/forgot-password";
export * from "./schemas/login";
export * from "./schemas/register";
export * from "./schemas/reset-password";
export * from "./schemas/session-list";
```

### Archivos 4–6 — equivalentes de transactions (NUEVOS)

`libs/features/transactions/shared/package.json` usa la forma del Archivo 1 con name `@features/transactions/shared`. Su README refleja el Archivo 2 para los contratos de transactions/categories. Su barrel es:

```typescript
// @features/transactions/shared — barrel re-export for shared schemas.
// See ADR 0011 (shared-as-workspace-packages).
export * from "./schemas/category-create";
export * from "./schemas/category-update";
export * from "./schemas/create";
export * from "./schemas/list";
export * from "./schemas/update";
```

### Archivo 7 — `apps/api/tsconfig.json` (EDITAR)

```diff
-      // zod path mapping closes the orphan-schema resolution gap:
-      // `libs/features/{auth,transactions}/shared/` has no package.json, so
-      // Node10 ancestor-walk cannot reach zod. This mapping intercepts ALL
-      // files compiled by apps/api's tsc (including the orphan schemas).
-      "zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
```

Quitar la coma precedente de `@shared-utils/*` según sea necesario para mantener JSON válido.

### Archivo 8 — `apps/web/tsconfig.json` (EDITAR)

Quitar el bloque completo de comentarios en las líneas 23–32 y:

```diff
-      "zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
```

Quitar la coma precedente del alias de transactions según sea necesario.

### Archivos 9–10 — ADR 0011 (NUEVO, EN + ES)

Crear `docs/architecture/decisions/0011-shared-as-workspace-packages.md` usando el formato Status/Date/Deciders/Context, Decision, Consequences, References del ADR 0008. Registrar la Forma A, el `zod` local del paquete, los imports preservados, la ausencia de tsconfigs por paquete, y el rechazo de workarounds de filesystem/consolidación de server. Crear la traducción técnica literal al español en `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md`; escanearla por caracteres CJK.

## 3. Plan de ejecución

1. Crear el manifiesto de auth.
2. Crear el README de auth.
3. Crear el barrel de auth.
4. Crear los tres equivalentes de transactions.
5. Verificar que el glob `libs/*/*/*` de `pnpm-workspace.yaml` cubra ambos paquetes.
6. Quitar el workaround de API.
7. Quitar el workaround de web.
8. Correr `pnpm install` para materializar los links del workspace.
9. Crear el ADR 0011 y su espejo en español.
10. Correr `pnpm turbo run test bdd lint typecheck build` y `pnpm lint:fixtures`.
11. Commitear el trabajo atómicamente.

Strict TDD usa la falla de resolución TS2307 existente como RED; GREEN es el install/typecheck/build focalizado, TRIANGULATE cubre los 11 importadores y los conteos baseline, REFACTOR es el gate completo.

## 4. Commits atómicos

1. `feat(workspace): add shared feature packages` — manifiestos, READMEs, barrels (R1–R4, R11).
2. `fix(tsconfig): remove zod resolution workarounds` — ambos tsconfig (R5–R7).
3. `docs(adr): record shared workspace package boundary` — ADR EN + ES (R10).

## 5. Plan de ejecución de tests

| Escenario | Comando | Esperado |
|---|---|---|
| G1.1 | `test -f libs/features/auth/shared/package.json && test -f libs/features/transactions/shared/package.json` | exit 0 |
| G2.1 | `pnpm install` | ambos paquetes reconocidos |
| G3.1 | `grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json` | vacío |
| G4.1 | `pnpm turbo run build` | sin TS2307 |
| G5.1 | `pnpm turbo run test bdd lint typecheck build` | exit 0 |
| G6.1 | `pnpm --filter api test`; `pnpm --filter web test`; `pnpm turbo run bdd` | 22/22; 145/145; 43/43 |
| G7.1 | G5.1 + `pnpm lint:fixtures` | exit 0 |

## 6. Riesgos + mitigaciones

| Riesgo | Mitigación a nivel de archivo |
|---|---|
| R1 mismatch de entrypoint | Ambos manifiestos apuntan al `./src/index.ts` requerido; los barrels exportan cada esquema existente. |
| R2 pnpm resuelve `zod` incorrectamente | Declarar `zod@4.4.3` exacto bajo `dependencies`; install antes de typecheck/build. |
| R3 workspace no encuentra paquetes | Verificar el `libs/*/*/*` existente; editar solo si falla el reconocimiento. |
| R4 drift de tsconfig | La Q2 resuelta prohíbe nuevos tsconfigs por paquete. |
| R5 regresión de fixtures de frontera | Correr `pnpm lint:fixtures`; no se planean ediciones de reglas o fixtures. |
| R6 aparece un issue de resolución latente | El build focalizado identifica al importador; preservar los paths de importadores y separar defectos no relacionados. |

## 7. Fuera de alcance

Sin ediciones sobre esquemas, reescrituras de importadores, tsconfigs por paquete, cambios en paquetes `server`, upgrades de dependencias, consolidación de paquetes, cambios en reglas de frontera/Vitest, expansión de i18n, observabilidad, hardening de producción, enforcement del gate de cobertura, UI de audit log, expansión de OAuth, rate limiting, ni migración del repositorio original.

## 8. Preguntas abiertas para la fase de tasks

Ninguna. Q1–Q5 están resueltas en el spec.

## 9. Criterios de validación para `sdd-verify`

Verificar que ambos manifiestos y barrels tengan la forma especificada; que ambos workarounds de tsconfig estén ausentes; que el comando Turbo completo y las fixtures de frontera salgan con 0; que API 22/22, web 145/145, y BDD 43/43 se mantengan sin cambios; que el ADR 0011 exista en inglés y español sin caracteres CJK; y que no se haya introducido ningún import client/server o cross-slice.

## 10. Trazabilidad

| Requerimiento | Sección de diseño |
|---|---|
| R1, R2 | §2 Archivos 1, 4 |
| R3 | §2 Archivos 3, 6 |
| R4 | §3 paso 5 |
| R5, R6 | §2 Archivos 7, 8 |
| R7 | §3 paso 8 |
| R8, R9 | §3 paso 10 |
| R10 | §2 Archivos 9, 10 |
| R11 | §2 Archivos 2, 5 |

**Threat matrix**: N/A — sin cambios de routing, implementación de subprocess, automatización de VCS, clasificación de ejecutables, ni frontera de integración de procesos. Los comandos `pnpm` son operaciones de verificación/instalación, no una nueva interfaz shell de runtime.
