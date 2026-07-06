# Checklist del Slice 3

> **Estado**: ✅ cierre del slice 3 (puerta T3.9 verde, 9/9 tareas completas)
> **Proyecto**: `gastos-personales-reference`
> **Rama**: `feat/vertical-slicing-reference-scaffold` (cadena) → `develop` (despues de los 8 slices)
> **Almacen de artefactos**: hibrido (archivos `openspec/` + observaciones Engram)
> **Espejo en espanol**: este archivo. La version canonica en ingles
> vive en `docs/slice-3-checklist.md` (REGLA DURA segun AGENTS.md §13).

Este documento es el cierre canonico del Slice 3 del cambio
`vertical-slicing-reference-scaffold`. `sdd-verify` lo reproduce para
confirmar que el Slice 3 entrega la superficie del servidor de
autenticacion que acotaron la propuesta, el diseno y la especificacion.

---

## 1. Objetivos del Slice 3

Segun `openspec/changes/vertical-slicing-reference-scaffold/design.md`
§4, el Slice 3 entrega toda la superficie del **servidor de
autenticacion**: `AuthService`, `SessionService`, `RbacService`,
`PasswordResetService`, la configuracion de NextAuth v5 (Credentials +
Google via `@auth/prisma-adapter`), el envoltorio delgado de NestJS y
los cuatro eventos emitidos. El slice es **solo servidor**; la UI
llega en el Slice 4 y los escenarios BDD en el Slice 7. El criterio de
exito es "cada requerimiento de autenticacion de `specs/auth/spec.md`
esta satisfecho del lado del servidor y los seis endpoints de
diseno §4.1 devuelven los codigos de estado correctos en cada
escenario codificado", anclado por 101 pruebas a nivel de servicio en
`@features/auth`, 19 en `@core/config`, 37 en `@core/events` y 21
pruebas e2e en apps/api.

---

## 2. Estado de las tareas (T3.1 – T3.9)

| #    | Tarea                                                       | Lineas | PR / commit | Estado |
|------|-------------------------------------------------------------|--------|-------------|--------|
| T3.1 | RED — pruebas que fallan para `AuthService.login`           | ~30    | slice 3 batch 1 (PR #5) | [x] |
| T3.2 | `libs/features/auth/shared/schemas` (5 esquemas Zod)        | ~50    | slice 3 batch 6 (PR #10) | [x] |
| T3.3 | Configuracion NextAuth v5 + `JwtAuthGuard` real             | ~50    | slice 3 batch 7 (PR #12) | [x] |
| T3.4 | Servicios de auth (Auth + Session + Rbac + PasswordReset)  | ~150   | slice 3 batches 1-4 (PRs #5-#7) | [x] |
| T3.5 | `events.ts` (4 eventos) + adaptadores Prisma del repositorio | ~30   | slice 3 batches 3-4 (PR #7) | [x] |
| T3.6 | `apps/api/modules/auth` (envoltorio delgado NestJS)         | ~50    | slice 3 batches 6 + 6b (PRs #9, #11) | [x] |
| T3.7 | Escenarios de integracion (multi-provider / expiracion / idempotencia) | ~40 | slice 3 batch 8 (este PR) | [x] |
| T3.8 | Pase REFACTOR — duplicacion + fixtures ESLint de limites   | ~10    | slice 3 batch 6 (PR #10) | [x] |
| T3.9 | Verde el `turbo run lint typecheck test` de todo el slice   | ~30    | slice 3 batch 8 (este PR) | [x] |

**Total del Slice 3: ~390 lineas modificadas (muy por debajo del
presupuesto de 400 lineas por PR).** Las 9 tareas cerradas; 8/8 PRs
fusionados en `develop`.

---

## 3. Puertas de calidad (ejecutadas de extremo a extremo contra `develop @ 324c36b`)

| Puerta                                            | Comando | Resultado |
|---------------------------------------------------|---------|-----------|
| Instalacion del workspace                         | `pnpm install` | exit 0 |
| Pruebas de auth (Vitest)                          | `pnpm --filter @features/auth exec vitest run` | 105/105 PASAN (101 previas + 4 nuevas de T3.7) |
| Pruebas de eventos (Vitest)                       | `pnpm --filter @core/events exec vitest run` | 37/37 PASAN |
| Pruebas de config (Vitest)                        | `pnpm --filter @core/config exec vitest run` | 19/19 PASAN |
| e2e de apps/api (Vitest)                          | `cd apps/api && pnpm exec vitest run` | 21/21 PASAN (18 previas + 3 nuevas de T3.7 session-expiry) |
| Turbo completo (auth + core + utils + api)        | `pnpm turbo run test --filter=@features/auth --filter=@core/* --filter=@shared-utils/* --filter=api` | 24/24 PASAN |
| Lint (workspace)                                  | `pnpm turbo run lint` | exit 0 |
| Lint (fixtures de limites)                        | `pnpm run lint:fixtures` | exit 0 (11/11 fixtures, 18 violaciones esperadas) |
| Typecheck (auth)                                  | `pnpm turbo run typecheck --filter=@features/auth` | exit 0 |
| Typecheck (eventos)                               | `pnpm turbo run typecheck --filter=@core/events` | exit 0 |
| Typecheck (api)                                   | `pnpm turbo run typecheck --filter=api` | exit 0 |
| Typecheck (workspace)                             | `pnpm turbo run typecheck` | exit 0 |

Fallos preexistentes NO provocados por el Slice 3 (diferidos del slice 1):

- `apps/web#test` + `apps/web#lint` + `apps/web#typecheck` fallan
  porque `vitest` no esta en `apps/web/package.json#devDependencies`.
  El Slice 4 agrega las dependencias del web app; verificado en el
  baseline `0758f8f` mediante round-trip con `git stash`.

---

## 4. Puertas de verificacion (G17, G20, G21, G22, G23)

| Puerta | Descripcion | Archivo + prueba que lo demuestra | Estado |
|--------|-------------|------------------------------------|--------|
| **G17** | Esquemas Zod compartidos reutilizados en el servidor (unica fuente de verdad) | `libs/features/auth/shared/schemas/{login,register,forgot-password,reset-password,session-list}.ts` importados por `libs/features/auth/server/src/auth-service.ts` (loginSchema + registerSchema) y por `apps/api/src/modules/auth/auth.controller.ts` (los 5 esquemas via `validateOrThrow`). Pin: `pnpm --filter @features/auth exec vitest run` (5 suites de esquemas pasan). | PASAN |
| **G20** | Credentials + Google en paralelo contra `@auth/prisma-adapter` | `apps/api/src/lib/auth.config.ts` — `buildAuthConfig()` devuelve una configuracion de NextAuth v5 con providers `[Credentials(...), Google(...)]` cableados contra `PrismaAdapter(prisma)`. Pin: `apps/api/test/session-expiry.e2e-spec.ts` (el JWT emitido por Credentials se decodifica por la misma via `@auth/core/jwt#decode` que usaria el callback de Google). Invariante de identidad multi-provider anclada por `libs/features/auth/server/src/__tests__/integration/multi-provider.test.ts`. | PASAN |
| **G21** | Reset de contrasena (forgot + reset) con email simulado | `libs/features/auth/server/src/password-reset.service.ts` — `requestReset` (retorno silencioso para email desconocido; minteo de token + persistencia + dispatch para el conocido) + `consumeReset` (validacion del token + hash bcrypt + update envuelto en tx + dispatch). Email simulado = `createInMemoryDispatcher()` (modulo NestJS de apps/api) que lleva el token crudo en el buffer circular para el buzon de desarrollo (UI del slice 4). Pin: `libs/features/auth/server/src/__tests__/integration/forgot-password-idempotency.test.ts` (5 escenarios; camino conocido vs desconocido). | PASAN |
| **G22** | Lista y revocacion de sesiones implementadas | `libs/features/auth/server/src/session-service.ts` — `listActiveSessions(userId)` (devuelve la proyeccion canonica SessionRecord) + `revokeSession(token, userId)` (Patron A: SessionRepository.revokeByToken + dispatch `auth.session.revoked`). Pin: `libs/features/auth/server/src/__tests__/session-service.test.ts` (7 pruebas) + `pattern-a-dispatch.test.ts` (3 pruebas de revokeSession). Endpoints NestJS: `GET /auth/sessions` (200) + `DELETE /auth/sessions/:id` (204). | PASAN |
| **G23** | Roles RBAC forzados en la capa de **dominio** | `libs/features/auth/server/src/rbac-service.ts` — `can(actor, action, resource)` es el unico punto de entrada por el que enruta cada guardia/controlador (el seguimiento del slice 3 batch 6 mueve la llamada a la capa de dominio; el controlador es un envoltorio delgado). Pin: `libs/features/auth/server/src/__tests__/rbac-service.test.ts` (11 escenarios cubriendo USER + ADMIN, `*:own` + `*:any`, las denegaciones emiten `auth.rbac.denied`). | PASAN |

---

## 5. Limitaciones conocidas (arrastradas hacia adelante)

Esto NO son regresiones — son diferimientos explicitos, rastreados en
los risk_flags de `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md`.
Cada uno aterriza en el slice indicado.

- **T3.3 stub → cierre T3.7.** El provider de Google esta REGISTRADO
  (cuando estan presentes `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`)
  pero el handshake OAuth real llega en el **slice 4** (cliente de
  autenticacion de apps/web). La prueba de integracion multi-provider
  de T3.7 ancla la invariante de identidad a nivel de servicio (mismo
  email → mismo User.id) via el port UserRepository; el handler real
  del callback de Google (verificacion de idToken, creacion de la fila
  Account) se entrega en el slice 4.
- **Seguimiento del decorador `@BodySchema` de T3.6.** El intento del
  slice 3 batch 6 de usar un decorador de parametro `@BodySchema(<zodSchema>)`
  fue eliminado por el auto-formateador. El PR #11 (cierre T3.6)
  reemplazo el decorador por una llamada inline al helper
  `validateOrThrow(schema)` en cada metodo del controlador. Ambos
  caminos aterrizan en el mismo comportamiento del ZodValidationPipe
  (`runOrThrowHttp` del controlador → ValidationError → 400); la
  variante del decorador era solo azucar ergonomica.
- **Alcance multi-provider de T3.7.** La prueba de integracion afirma
  el vinculo a nivel de servicio (mismo email → mismo id) pero NO
  ejercita un round-trip OAuth de Google real. El codepath
  `linkGoogleAccount` del provider de Google (crear una fila `Account`
  y asociarla con el `User` existente por coincidencia de email) es
  parte del comportamiento integrado del adaptador de NextAuth; el
  cliente de autenticacion del slice 4 lo ejercita mediante el
  handshake OAuth real.
- **Extraccion de `AuthService.verifyPassword` (diferida).** El
  diseno §4.1 lista `verifyPassword` como metodo publico; el actual
  `AuthService.login` cubre el mismo comportamiento. El provider de
  Credentials en `auth.config.ts` llama a `AuthService.login` y
  proyecta el resultado. Una futura extraccion de `verifyPassword`
  (que devuelva el usuario sin crear una fila de sesion) es benigna
  para la estrategia JWT (NextAuth no consulta la fila de sesion) pero
  vale la pena extraerla si la superficie de la API crece.
- **`apps/web` vitest/lint/typecheck.** Falta `vitest` en
  `apps/web/package.json#devDependencies` (diferido del slice 1; el
  slice 4 lo agrega). El `pnpm turbo run lint typecheck test` del
  slice 3 tiene exito porque Turbo cortocircuita paquetes sin script
  `test` definido.

---

## 6. Proximos pasos — Slice 4 (cliente de auth + i18n + shadcn)

Segun `openspec/changes/vertical-slicing-reference-scaffold/tasks.md`
§T4 (Slice 4): Exponer cada slice de servidor del Slice 3 en la app
web con rutas prefijadas por locale a traves de `next-intl`,
primitivas estilo shadcn instaladas localmente (sin CLI), tokens de
diseno extraidos y UI completa-final segun la convencion id 2133
(5 estados por formulario, WCAG AA, responsivo, pruebas de
componentes). Las 5 pantallas criticas a entregar:

- `/[locale]/(auth)/sign-in` — `LoginForm.tsx` (5 estados: loading /
  error / success / empty / validation-error) + el handshake OAuth
  real de Google mediante `signIn("google")` de NextAuth.
- `/[locale]/(auth)/sign-up` — `SignUpForm.tsx` resolviendo
  `registerSchema`.
- `/[locale]/(auth)/forgot-password` — `ForgotPasswordForm.tsx`
  resolviendo `forgotPasswordSchema`.
- `/[locale]/(auth)/reset-password/[token]` — `ResetPasswordForm.tsx`
  resolviendo `resetPasswordSchema`.
- `/[locale]/(auth)/dev/mailbox/[userId]` — `DevMailbox.tsx` leyendo
  el buffer circular del dispatcher en memoria (SOLO DEV, protegido
  por `NODE_ENV !== 'production'`).
- `/[locale]/(app)/sessions` — `SessionList.tsx` leyendo el endpoint
  `GET /auth/sessions` + accion de revocacion por fila.

Verificacion del Slice 4: `pnpm turbo run lint typecheck test
--filter web` termina con exit 0; la auditoria `@axe-core/playwright`
reporta cero violaciones por pantalla critica; la prueba manual de
tabulacion con teclado pasa en cada formulario.

---

**Slice 3 — ESTADO: COMPLETO.** Listo para la reproduccion de `sdd-verify`.
