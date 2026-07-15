# Exploración: `fix-api-nestjs-di`

> **Fase**: exploración · pre-propuesta
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `ea7732f`)
> **Autor**: Orquestador SDD → `sdd-explore` (ejecutor · modelo `MiniMax-M3`)
> **Fecha**: 2026-07-13
> **Investigación de solo lectura**. Sin código ni config mutados.
> **Entradas**: observación Engram `#2278` (reporte de verificación del slice 8), los 3 archivos e2e fallando, reglas de frontera AGENTS.md §7–§8, commit `3db761f` del PR-2 del slice-7.

---

## §1. Resumen ejecutivo

**Causa raíz** — en una oración: `apps/api/src/modules/auth/auth.controller.ts` (y `transactions.controller.ts`) importan los 4 servicios de dominio con la **sintaxis `import { type Foo }`**, que TypeScript + el cargador de módulos de runtime borran completamente; por lo tanto el DI reflexivo de NestJS ve `undefined` para el parámetro del constructor en el índice `[0]` y no puede resolver ninguno de los 4 servicios (`AuthService`, `SessionService`, `PasswordResetService`, `RbacService`).

**Por qué sobrevivió al slice 7**: una iteración previa (commit `3db761f` — "remove unused imports + auto-formatter anchor") eliminó el **único ancla de runtime** que mantenía esos símbolos vivos (`private static readonly _ServiceAnchor = [AuthService, …]`) **al mismo tiempo** que convirtió el `import { Foo }` a `import { type Foo }`. El autor mantuvo el comentario de documentación que promete el ancla pero eliminó la implementación. Resultado: cada test que pasa por `Test.createTestingModule({ imports: [AuthModule] }).compile()` explota en tiempo de resolución del módulo.

**Blast radius**: 4 servicios en 1 controller (auth) + 3 servicios en 1 controller (transactions) = **8 puntos de quiebre de DI ocultos**, de los cuales solo los 4 del lado auth se ejercitan actualmente por tests. El controller de transactions tiene exactamente el mismo patrón `import { type Foo }` (líneas 22, 25, 27) pero no entrega ningún test e2e de NestJS, por lo que el bug es latente allí.

**Candidatos de forma del fix**: 3 — el más barato es de una línea (quitar la palabra clave `type` en los 4 imports), pero un ancla ESM a nivel de clase o una regla ESLint para prohibir `import type` para constructores `@Injectable`/`@Controller` es la respuesta durable.

---

## §2. Las 4 dependencias no mapeadas exactas

`AuthController` (apps/api/src/modules/auth/auth.controller.ts líneas 121–127):

```ts
@Controller("/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,          // index [0] — undefined en runtime → "?"
    private readonly sessionService: SessionService,    // index [1] — undefined → "Object"
    private readonly passwordResetService: PasswordResetService,  // index [2] — igual
    private readonly rbacService: RbacService,          // index [3] — igual
  ) {}
}
```

| Índice | Parámetro del constructor | Tipo declarado | Dónde se `provide` | Mecanismo del provider |
|------:|---------------------------|-----------------|----------------------|------------------------|
| `[0]` | `authService`     | `AuthService`         | `auth.module.ts` L48-50 | `useFactory: () => new AuthService()` |
| `[1]` | `sessionService`  | `SessionService`      | `auth.module.ts` L52-60 | `useFactory` con 4 deps (prisma + 2 repos + dispatcher) |
| `[2]` | `passwordResetService` | `PasswordResetService` | `auth.module.ts` L62-71 | `useFactory` con 5 deps (2 repos + dispatcher + prisma + sink) |
| `[3]` | `rbacService`     | `RbacService`         | `auth.module.ts` L73-75 | `useFactory: () => new RbacService(dispatcher.dispatch)` |

Los cuatro providers están registrados correctamente bajo la **identidad de clase** (token = la clase misma). Los cuatro factories retornan una instancia viva. Los cuatro servicios son **clases planas de TypeScript** — ninguno lleva `@Injectable()`:

```
$ grep -n "@Injectable\|@nestjs/common" libs/features/auth/server/src/auth-service.ts \
                                               libs/features/auth/server/src/session-service.ts \
                                               libs/features/auth/server/src/password-reset.service.ts \
                                               libs/features/auth/server/src/rbac-service.ts
(sin salida)
```

Ese detalle **no** es el bug. Los providers `useFactory` no necesitan `@Injectable()` en el tipo producido — NestJS usa el valor de retorno del factory como la instancia resuelta. El bug está aguas arriba: los **tipos de los parámetros del constructor del controller** se borraron en tiempo de compilación, así que reflect-metadata no tiene referencia de clase para buscar en el registro de providers.

---

## §3. Cableado de AuthModule (estado actual)

`apps/api/src/modules/auth/auth.module.ts`:

```ts
@Module({
  controllers: [AuthController],
  providers: [
    { provide: AuthService,           useFactory: () => new AuthService() },
    { provide: SessionService,        useFactory: () => new SessionService(
        defaultPrisma,
        new PrismaSessionRepository(defaultPrisma),
        new PrismaUserRepository(defaultPrisma),
        dispatcher.dispatch,
    ) },
    { provide: PasswordResetService,  useFactory: () => new PasswordResetService(
        new PrismaUserRepository(defaultPrisma),
        new PrismaPasswordResetTokenRepository(defaultPrisma),
        dispatcher.dispatch, defaultPrisma, defaultAuditSink,
    ) },
    { provide: RbacService,           useFactory: () => new RbacService(dispatcher.dispatch) },
    { provide: AuthCronService,       useFactory: () => new AuthCronService(
        new PrismaPasswordResetTokenRepository(defaultPrisma),
    ) },
    JwtAuthGuard,                  // class provider — JwtAuthGuard SÍ es @Injectable (jwt.guard.ts L62)
  ],
  exports: [AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard],
})
```

| Token | Mecanismo | ¿La clase es `@Injectable()`? | ¿Resuelto por NestJS? |
|-------|-----------|-------------------------------|----------------------|
| `AuthService`           | useFactory (sin deps)         | **No** | Sí (el factory produce) |
| `SessionService`        | useFactory (4 deps, sin `inject[]`) | **No** | Sí (el factory produce) |
| `PasswordResetService`  | useFactory (5 deps, sin `inject[]`) | **No** | Sí (el factory produce) |
| `RbacService`           | useFactory (1 dep)            | **No** | Sí (el factory produce) |
| `AuthCronService`       | useFactory (1 dep)            | **Sí** (auth-cron.service.ts L21) | Sí (el factory produce — nota: la clase SÍ es @Injectable, pero el factory lo bypasa) |
| `JwtAuthGuard`          | class provider shorthand       | **Sí** | Sí (NestJS construye) |

**Sin mismatches entre los providers de AuthModule y los tipos del constructor del controller.** El cableado es sólido. El bug es que el constructor del controller nunca ve los tokens resueltos porque las referencias de tipo se borraron.

Nota: `transactions.module.ts` usa un patrón `useFactory + inject[]` más rico (L113-157) — también válido, también funciona en runtime — probando que el `useFactory` sin `inject[]` del slice auth no es el problema.

---

## §4. Los 4 servicios sospechosos

| Clase | Archivo | `@Injectable()` | Deps de constructor (¿todos requeridos-u-opcionales?) | Forma de cableado de DI |
|-------|---------|-----------------|------------------------------------------------|-----------------------------|
| `AuthService`         | `libs/features/auth/server/src/auth-service.ts` L102 | **No** | `prisma?: PrismaClient, userRepo?: UserRepository` (ambos opcionales, default a singleton + PrismaUserRepository) | Sin DI — clase TypeScript pura |
| `SessionService`      | `libs/features/auth/server/src/session-service.ts` L69 | **No** | `prisma?, sessionRepo?, userRepo?, dispatcher?` (el último es REQUERIDO; guarda F8 en L87 lanza `TypeError`) | Sin DI |
| `PasswordResetService`| `libs/features/auth/server/src/password-reset.service.ts` L148 | **No** | `userRepo, tokenRepo, dispatcher, prisma?, auditSink?` (dispatcher REQUERIDO; guarda F8 en L169) | Sin DI |
| `RbacService`         | `libs/features/auth/server/src/rbac-service.ts` L113 | **No** | `dispatcher` (REQUERIDO; guarda F8 en L119) | Sin DI |

Los cuatro están **importados en `AuthModule.providers` y llamados desde `AuthController`**, así que no están huérfanos. Todos viven en `libs/features/auth/server/src/` — la ubicación correcta según AGENTS.md §7 / design §2 ("sin cross-module import"). Ninguno usa `@nestjs/common`. Son servicios de dominio en el sentido Hexagonal (ports + adapters, libres de framework por diseño).

**Por qué no hay `@Injectable()`**: por intención. Están construidos por `useFactory` con argumentos explícitos, no por NestJS. Añadir `@Injectable()` forzaría a cada servicio a importar de `@nestjs/common`, lo que violaría design §2 ("el código de dominio es libre de framework"). **El fix no debe requerir `@Injectable()` en estas clases.**

---

## §5. Infraestructura de tests

Los 3 archivos fallando comparten el mismo patrón de bootstrap:

```ts
vi.mock("@core/database", () => ({ prisma: { ... } }));   // L35-52 / L57-76 / L61-80
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(), hash: vi.fn() } }));  // L54-59 / L78-83 / L82-87
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/modules/auth/auth.module.js";

beforeEach(async () => {
  vi.resetAllMocks();
  moduleRef = await Test.createTestingModule({
    imports: [AuthModule],   // ← el punto de explosión
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});
```

| Archivo de test | Tests | Bootstrap | ¿`overrideProvider`? |
|-----------------|------:|-----------|---------------------|
| `auth.e2e-spec.ts`           | 14 | `Test.createTestingModule({ imports: [AuthModule] }).compile()` | **Ninguno** |
| `jwt-auth-guard.e2e-spec.ts` |  4 | Igual al anterior | **Ninguno** |
| `session-expiry.e2e-spec.ts` |  3 | Igual al anterior (+ helper `mintJwt`) | **Ninguno** |

El bootstrap es un **test de integración de módulo completo** — sin shims `.overrideProvider()`. Eso significa que la superficie del test ES el cableado de producción, por eso se observa el fallo.

`apps/api/test/setup-env.ts` (cargado por `vitest.config.ts` vía `setupFiles`) provee las env vars que `@core/config` requiere para que la cadena de imports `AuthModule → @features/auth → @core/database → @core/config` no se caiga antes de llegar al DI.

---

## §6. Blast radius

### §6.1 Paths de código de producción que dependen de estos servicios

| Caller | Servicio | ¿Mismo bug? |
|--------|----------|--------------|
| `apps/api/src/lib/auth.config.ts` L66-71 | `AuthService` (`new AuthService()`) | **No** — `new` explícito, sin DI de NestJS |
| `apps/api/src/modules/auth/auth.controller.ts` | los 4 | **SÍ — bug actual** |
| `libs/features/auth/docs/support/service-context.ts` | `AuthService` | Usa `new` (confirmado vía blast radius de codegraph) — no es consumidor de DI de NestJS |

### §6.2 Otros controllers de NestJS en `apps/api/`

| Controller | Módulo | ¿Misma clase del bug? |
|------------|--------|-----------------------|
| `apps/api/src/modules/transactions/transactions.controller.ts` | `TransactionsModule` | **SÍ — latente**. L22 (`type CategoryService`), L25 (`type ThresholdService`), L27 (`type TransactionService`) usan `import { type Foo }` para parámetros de constructor. Actualmente latente porque no hay `apps/api/test/transactions.e2e-spec.ts` (confirmado — solo existen `auth.*`, `jwt-auth-guard.*`, `session-expiry.*` en `apps/api/test/`). |
| `apps/api/src/modules/auth/auth.controller.ts` | `AuthModule` | **SÍ — bug actual** |

### §6.3 Otros tests que ejercitan AuthController indirectamente

- `libs/features/auth/server/src/__tests__/auth-service.*.test.ts` — tests unitarios sobre los servicios puros (sin NestJS) — pasan.
- `libs/features/auth/server/src/__tests__/session-service.test.ts` — igual — pasan.
- `libs/features/auth/server/src/__tests__/rbac-service.test.ts` — igual — pasan.
- `libs/features/auth/server/src/__tests__/pattern-a-dispatch.test.ts` — igual — pasan.
- `libs/features/auth/server/src/__tests__/integration/multi-provider.test.ts` — igual — pasan.
- Los 3 archivos e2e listados arriba — **FALLAN** con `?, Object, Object, Object`.

### §6.4 Superficies de side-effect que se romperán si el fix de auth altera la superficie pública de `AuthModule`

- `apps/api/src/app.module.ts` importa `AuthModule` (blast radius de codegraph). Los `exports: [AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard]` del módulo son la superficie pública de DI. Si un fix cambia cualquier export (rename, drop), este consumidor se rompe.
- `apps/api/src/modules/transactions/transactions.controller.ts` importa `JwtAuthGuard` (L48) — ortogonal a los servicios auth pero co-localizado. Debe seguir funcionando.

---

## §7. Restricciones de las convenciones del proyecto

- **AGENTS.md §7 (fronteras arquitectónicas)** — `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` DEBEN quedarse en `libs/features/auth/server/src/`. El fix no puede reubicarlos.
- **AGENTS.md §7 ESLint `no-prisma-outside-core`** — ninguno de los 4 servicios construye `new PrismaClient()`. Toman `PrismaClient?` como argumento opcional de constructor y caen a `defaultPrisma`. El fix no puede introducir `new PrismaClient()` en ningún lugar fuera de `libs/core/database/src/`.
- **AGENTS.md §4 (TDD estricto)** — cualquier fix DEBE aterrizar test-first. Específicamente: un nuevo test fallando que reproduzca el fallo de DI, observado en RED, antes del cambio de producción.
- **AGENTS.md §8 (única fuente de verdad)** — los 4 servicios son las implementaciones canónicas; NO duplicarlos bajo `apps/api/src/modules/auth/` para "darle a NestJS una clase". Enrutar el DI a través del `AuthModule` existente.
- **AGENTS.md §6 (sin Co-Authored-By / sin atribución de IA)** — aplica a cualquier commit producido por el fix.
- **Design §2 / `tsconfig.base.json`** — `verbatimModuleSyntax: false` PERO `isolatedModules: true`. Bajo `isolatedModules`, `import { type X }` se borra en tiempo de compilación **sin importar `verbatimModuleSyntax`**. Esta es la mecánica real del bug.
- **Regla del espejo en español** — `openspec/changes/fix-api-nestjs-di/explore.md` (este archivo) no necesita un espejo `Documents-es/` hasta que sea referenciado por un `proposal.md`/`spec.md`/`design.md`/`tasks.md`. Ninguno de esos existe aún; la regla del espejo se dispara en el **commit atómico** que añade los archivos `.md` bajo `openspec/`. El commit de proposal/spec/design/tasks del fix debe espejarlos.
- **`AuthModule` "AUTO-FORMATTER NOTE" (auth.controller.ts L112-118)** — el comentario existente promete un ancla estática a nivel de clase para derrotar la heurística del auto-formatter. Si el fix adopta el enfoque del ancla, el campo debe existir realmente en código.

---

## §8. Intentos previos / dead ends

### §8.1 Qué pasó en el PR-2 del slice 7 (commit `3db761f`)

`git show 3db761f -- apps/api/src/modules/auth/auth.controller.ts` revela la secuencia **delete-the-safety-net**:

```diff
-import {
-  AuthService,
-  PasswordResetService,
-  RbacService,
-  SessionService,
+import {
+  type AuthService,
+  type PasswordResetService,
+  type RbacService,
+  type SessionService,
   AuthError,
   ValidationError,
   type CurrentUser,
@@ …
-import {
-  type ForgotPasswordInput,
-  type LoginInput,
-  type RegisterInput,
-  type ResetPasswordInput,
-} from "@features/auth";

 @Controller("/auth")
 export class AuthController {
-  /**
-   * Static runtime anchors. These force the services to be imported
-   as runtime values (the linter's `useImportType` rule preserves
-   imports when the symbol is used as a value). The anchors are
-   never accessed at runtime — they're a marker for the linter.
-   */
-  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
-    AuthService,
-    PasswordResetService,
-    RbacService,
-    SessionService,
-  ];
-
   constructor( … )
```

El commit:

1. Cambió `import { Foo }` → `import { type Foo }` (4 servicios).
2. **Eliminó el ancla estática** (el único consumidor de runtime de esos símbolos).
3. Actualizó el comentario circundante para leer "a class-level static field … it exists purely to keep the runtime import" — pero el campo ya no existe.

Resultado: los símbolos se volvieron `undefined` en runtime, así que el DI reflexivo de NestJS ve `AuthController(?, Object, Object, Object)`. El primer test en `auth.e2e-spec.ts` en llamar a `Test.createTestingModule({ imports: [AuthModule] }).compile()` falla antes de que se ejercite cualquier ruta.

El autor casi seguramente quiso eliminar imports sin usar (`ForgotPasswordInput`, `LoginInput`, `RegisterInput`, `ResetPasswordInput`) — el diff `-import { type ForgotPasswordInput, … }` lo deja claro. Pero la limpieza conflagra los imports **removibles** solo de tipo (que se tiparon correctamente como `type`) con los imports de valor **requeridos en runtime** (que se reescribieron incorrectamente a `type Foo`).

### §8.2 Dead ends / cosas que NO intentar

- **Añadir `@Injectable()` a los 4 servicios** — no ayudaría: los tipos del constructor del controller siguen borrados, y la violación de frontera (import de NestJS en código de dominio) es el trade incorrecto.
- **Cambiar `useFactory` a `useClass`** — no ayudaría: misma causa raíz. NestJS todavía lee `reflect-metadata` del constructor del controller, que está vacío.
- **Añadir `overrideProvider(AuthService).useFactory(...)` en cada test** — NO ayudaría. El error ocurre durante la resolución del controller, antes de que cualquier override de provider pueda interceptar. El controller es irresoluble.
- **Deshabilitar `isolatedModules` en `tsconfig.base.json`** — no ayudaría. `isolatedModules` es correcto para el sistema de módulos del proyecto; el bug está en la elección del import, no en la config.
- **Establecer `verbatimModuleSyntax: true`** — no ayudaría; el bug está aguas arriba de esa perilla.

---

## §9. Candidatos de forma del fix (para que `sdd-propose` decida — NO comprometido)

### Forma A — mínima: quitar `type` en los 4 imports (cambio de 1 línea)

En `apps/api/src/modules/auth/auth.controller.ts` L15-27, cambiar:

```ts
import {
  type AuthService,             // ← quitar `type`
  type PasswordResetService,    // ← quitar `type`
  type RbacService,             // ← quitar `type`
  type SessionService,          // ← quitar `type`
  AuthError,
  ValidationError,
  type CurrentUser,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@features/auth";
```

a `import { AuthService, PasswordResetService, RbacService, SessionService, … }`.

- **Pros**: diff más pequeño; no toca ningún otro archivo; 1 commit; fix puro, sin refactor.
- **Contras**: no aborda el bug **latente** de transactions.controller.ts; el linter puede re-introducir la palabra clave `type` si alguien ejecuta biome.
- **Esfuerzo**: ~5 min.
- **Impacto en tests**: los mismos 21 tests pasan; no se necesitan nuevos tests (los tests existentes son el suite de regresión).

### Forma B — durable: mantener el ancla estática (según el comentario original) + quitar `type`

Restaura el campo que el commit `3db761f` eliminó; combinar con la Forma A para que si el ancla O el import sin-`type` se revierten en el futuro, el DI aún funcione.

- **Pros**: cinturón y tirantes; sobrevive a un reformat de biome; coincide con el comentario en el árbol.
- **Contras**: todavía no captura `transactions.controller.ts` (necesita el mismo tratamiento en 3 lugares).
- **Esfuerzo**: ~10 min.
- **Impacto en tests**: los mismos 21 pasan.

### Forma C — comprehensiva: Formas A+B en auth + espejo a transactions + regla ESLint

Aplicar la Forma A a `auth.controller.ts` Y `transactions.controller.ts` (4 imports allí también: `CategoryService`, `ThresholdService`, `TransactionService`, más `type CreateCategoryInput` etc. — solo los 3 tipos de servicio importan). Añadir una regla ESLint `@typescript-eslint/no-import-type-on-injectable` (o regla custom del plugin de boundary) que marque `import { type X }` siempre que `X` se use como parámetro de constructor de una clase decorada con `@Controller` / `@Injectable`.

- **Pros**: cierra el bug latente de transactions en el mismo cambio; la regla ESLint previene la regresión; encaja con el patrón `tools/eslint-plugin-boundary/rules/` del slice-1 del proyecto.
- **Contras**: diff más grande; la nueva regla ESLint requiere su propio par de fixtures (`__fixtures__/<rule>/{valid,invalid}.ts`); la regla necesita TDD (RED-luego-GREEN según AGENTS.md §4).
- **Esfuerzo**: 1–2 horas (regla + fixture + activación en `eslint.config.mjs` + `pnpm lint:fixtures` sale 0).
- **Impacto en tests**: los mismos 21 pasan + nuevo RED/GREEN para la regla ESLint + fixtures.

### Recomendación (esta exploración no se compromete, solo informa)

La Forma C es la decisión correcta SI el orquestador trata `transactions.controller.ts` como en alcance. El cambio es "arreglar la falla de 21 tests existente" pero el mismo error de una línea existe en `transactions.controller.ts` — cada slice añadido desde el slice 5 ha estado a una futura regresión de un quiebre de DI oculto. La regla ESLint es la enforcement durable.

Si el orquestador quiere el cambio más pequeño posible que cierre la puerta fallando, la Forma A es suficiente para que el reporte de verificación cambie a verde, con la Forma C rastreada como seguimiento.

---

## §10. Contrato de verificación

Después de que el fix aterrice:

1. **`pnpm --filter api test`** sale 0; los 21 tests actualmente fallando pasan.
2. **El constructor de `AuthController` resuelve con 4 referencias de clase reales** — observable vía `Test.createTestingModule({ imports: [AuthModule] }).compile()` teniendo éxito.
3. **Las 4 clases de servicio siguen siendo construibles** (sin `@Injectable()` añadido — frontera preservada).
4. **Los exports públicos de `AuthModule` no cambian**: `AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard`.
5. **Sin nuevas violaciones de frontera ESLint**: `pnpm turbo run lint` sale 0; `pnpm lint:fixtures` sale 0.
6. **Sin nuevo `new PrismaClient()` fuera de `libs/core/database/src/`** — la regla existente ya enforce esto; solo confirmar.
7. **(Si Forma C)** El bootstrap e2e de transactions (cuando aterrice) también resuelve los 3 servicios; la nueva regla ESLint dispara RED en una fixture inválida sintética, GREEN en la válida.
8. **Trail de TDD estricto**: un test fallando que reproduce el error de DI se observa ANTES del cambio de producción. La reproducción más simple es `expect(() => Test.createTestingModule({ imports: [AuthModule] }).compile()).resolves.toBeDefined()` — actualmente rechaza. Observar ese cambio de RED → GREEN.
9. **Espejo en español**: cualquier `.md` nuevo bajo `openspec/changes/fix-api-nestjs-di/` (proposal/spec/design/tasks) obtiene un espejo `Documents-es/` en el mismo commit atómico; `grep -P '[\x{4e00}-\x{9fff}]'` retorna 0 codepoints CJK en el espejo.

---

## §11. Archivos leídos (para trazabilidad)

Código leído vía `codegraph_explore` + herramientas Read dirigidas. La herramienta codegraph MCP fue el mecanismo de lectura primario (según AGENTS.md / protocolo CodeGraph). Todas las fuentes son verbatim.

- `apps/api/src/modules/auth/auth.controller.ts` (L1–219)
- `apps/api/src/modules/auth/auth.module.ts` (L1–91)
- `apps/api/src/modules/auth/auth-cron.service.ts` (L1–37)
- `apps/api/src/modules/transactions/transactions.controller.ts` (L1–489)
- `apps/api/src/modules/transactions/transactions.module.ts` (L1–202)
- `apps/api/src/lib/auth.config.ts` (L1–100, parcial)
- `apps/api/src/shared/guards/jwt.guard.ts` (L1–155, parcial)
- `libs/features/auth/server/src/auth-service.ts` (L82–134)
- `libs/features/auth/server/src/session-service.ts` (L60–227)
- `libs/features/auth/server/src/password-reset.service.ts` (L118–203)
- `libs/features/auth/server/src/rbac-service.ts` (L1–186)
- `libs/features/auth/server/src/infrastructure/repositories/prisma-user.repository.ts`
- `libs/features/auth/server/src/infrastructure/repositories/prisma-session.repository.ts`
- `libs/features/auth/server/src/infrastructure/repositories/prisma-password-reset-token.repository.ts`
- `libs/features/auth/server/src/index.ts` (L23–44)
- `libs/features/auth/server/src/domain/interfaces/session.repository.ts`
- `libs/features/auth/shared/schemas/session-list.ts`
- `apps/api/test/auth.e2e-spec.ts` (L1–304)
- `apps/api/test/jwt-auth-guard.e2e-spec.ts` (L1–233)
- `apps/api/test/session-expiry.e2e-spec.ts` (L1–260)
- `apps/api/vitest.config.ts`
- `apps/api/tsconfig.json`, `tsconfig.base.json`
- Observación Engram `#2278` (reporte de verificación del slice 8)
- `git show 3db761f -- apps/api/src/modules/auth/auth.controller.ts`

## §12. Preguntas abiertas para `sdd-propose`

1. **En alcance o no**: ¿`transactions.controller.ts` pertenece a este cambio? Bug latente, misma forma.
2. **Selección de forma**: A (mínima), B (ancla + drop), o C (A+B+regla ESLint + transactions)?
3. **Modelo de rama**: según AGENTS.md §2 la rama de trabajo es `feat/fix-api-nestjs-di` cortada desde `develop` (no desde `main`); confirmar.
4. **Reconocimiento de pre-existencia**: ¿debería la proposal.md citar explícitamente Engram `#2278` ("herencia preexistente del slice-7, no regresión del slice-8") como el rastro de descubrimiento?
5. **Semilla RED de TDD estricto**: ¿acordar que el test RED es `expect(Test.createTestingModule({ imports: [AuthModule] }).compile()).resolves.toBeDefined()`?

---

**Fin del brief.**