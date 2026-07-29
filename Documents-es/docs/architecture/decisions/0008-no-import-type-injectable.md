# ADR 0008 — Prohibir `import { type X }` para clases inyectables de NestJS en archivos con `@Controller`

- **Estado**: Aceptada
- **Fecha**: 2026-07-13
- **Decisores**: Sebastián Illa (mantenedor único) + sub-agente `sdd-verify`
- **Contexto**: Slice `fix-api-nestjs-di` de `gastos-personales-reference`

## Contexto y planteamiento del problema

El PR-2 del slice 7 (commit `3db761f`, "remove unused imports + auto-formatter anchor")
reescribió `import { AuthService, … }` a `import { type AuthService, … }` Y eliminó el ancla
de runtime `private static readonly _ServiceAnchor = [AuthService, …]` en
`apps/api/src/modules/auth/auth.controller.ts`. Bajo `isolatedModules: true`
(`tsconfig.base.json` línea 10) la forma `import type` se borra completamente en tiempo
de compilación, por lo que el DI reflexivo de NestJS ve `undefined` para el parámetro del
constructor en el índice `[0]` y lanza `Nest can't resolve dependencies of the AuthController
(?, Object, Object, Object)` — el propio mensaje de error de NestJS dice literalmente "This
commonly occurs when using 'import type' instead of 'import' for injectable classes". La
verificación del slice-8 (`develop@ea7732f`) registró este caso bajo el seguimiento F1 del
ADR 0007 como Gate 3 / deuda preexistente del slice-7.

El mismo patrón `import { type X }` estaba latente en
`apps/api/src/modules/transactions/transactions.controller.ts` (líneas 23, 25, 27) para
`CategoryService`, `ThresholdService`, `TransactionService`. Ningún test e2e ejercía
`TransactionsModule`, por lo que esta clase de bug se había estado enviando silenciosamente
desde el slice 5.

## Decisión

Adoptamos la siguiente regla para TODOS los controllers de NestJS en este monorepo:

> Las clases de servicio que se referencian desde un archivo decorado con
> `@Controller()` DEBEN importarse usando un import de valor (NO `import { type X }`).
> El controller DEBE además declarar un campo `private static readonly _ServiceAnchor`
> que referencie todos esos servicios como ancla de runtime para defenderse contra
> regresiones futuras de `import type`.

Esta regla se enforce mediante tres guardias independientes:

1. La nueva regla ESLint `@gpr/boundary/no-import-type-injectable` (añadida por este
   cambio) en `tools/eslint-plugin-boundary/rules/`.
2. La convención del campo estático `_ServiceAnchor` (estilística pero enforced por
   review).
3. CI: `pnpm lint:fixtures` ejercita los fixtures de la regla; `pnpm turbo run lint`
   aplica la regla globalmente vía `boundary.configs.recommended`.

## Anti-ejemplo (NO hacer esto)

```typescript
// auth.controller.ts — ROTO; fallará al bootstrap de NestJS con
//   "Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)".
import { type AuthService, type SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}
  // Sin ancla de runtime `_ServiceAnchor` — los dos imports `type` se borran
  // en tiempo de compilación y los parámetros del constructor resuelven a
  // `undefined` en runtime.
}
```

## Patrón correcto

```typescript
// auth.controller.ts — CORREGIDO; el DI reflexivo de NestJS resuelve los
//   parámetros del constructor en runtime.
import { AuthService, SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  /**
   * Ancla de runtime — ÚLTIMO campo, defensiva contra regresiones futuras
   * de `import type`. Enforced por `@gpr/boundary/no-import-type-injectable`.
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    AuthService,
    SessionService,
  ] as const;
}
```

## Consecuencias

**Positivas**:

- Los 21 tests e2e de auth que actualmente fallan pasan (`auth.e2e-spec.ts` 14 +
  `jwt-auth-guard.e2e-spec.ts` 4 + `session-expiry.e2e-spec.ts` 3).
- El bug latente de DI en transactions queda cerrado (verificado por el nuevo
  `transactions.e2e-spec.ts`).
- La regla ESLint bloquea regresiones futuras automáticamente en CI.

**Negativas**:

- Todo controller de NestJS en el codebase debe seguir la regla. El fix NO audita
  retroactivamente controllers más allá de `AuthController` y `TransactionsController`;
  la regla ESLint surfaceará cualquier otra violación en la próxima ejecución de
  `pnpm lint:fixtures`. Según spec §4 non-goal #15, ningún otro controller recibe un
  `_ServiceAnchor` en este slice — la regla los cubre solo en lint time.
- El predicado de la regla es conservador (resolución solo a nivel de archivo local);
  ver cuerpo del ADR.

## Referencias

- Propuesta: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- Spec: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`; R1-R12)
- Diseño: `openspec/changes/fix-api-nestjs-di/design.md` §2 File 4 (cuerpo de la regla)
- Tareas: `openspec/changes/fix-api-nestjs-di/tasks.md`
- Fuente de la regresión: commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
- Smoking gun: error de NestJS — "This commonly occurs when using 'import type' instead of 'import' for injectable classes"
- `tsconfig.base.json` línea 10: `"isolatedModules": true` — el predicado en tiempo de compilación que borra `import type`
- Seguimiento F1 del ADR 0007 (`docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`)