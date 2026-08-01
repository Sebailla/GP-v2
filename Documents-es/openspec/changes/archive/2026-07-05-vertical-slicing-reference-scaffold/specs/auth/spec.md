# Auth Specification

> **Domain**: auth
> **Change**: `vertical-slicing-reference-scaffold`
> **Project**: `gastos-personales-reference`
> **Stack reference**: NextAuth v5 (Auth.js) with `@auth/prisma-adapter`, Next.js 15 App Router, NestJS 10
> **Cross-references**: `proposal.md` §2.1.4 (auth edges), §7.4 (G18, G20–G23), §11 (UI-1..UI-4, G40–G47)

## Purpose

Definir el comportamiento que el slice de auth MUST satisfacer en el repositorio de referencia. El slice conecta NextAuth v5 con `@auth/prisma-adapter`, soporta email+password (Credentials) y Google OAuth en paralelo, expone password reset (con email mockeado), list+revoke de sesiones activas, y roles RBAC enforced en el domain layer (no sólo en la UI). Las superficies de UI para cada pantalla son alcanzables a través de rutas con prefijo de locale de `next-intl` (`/en/...`, `/es/...`), usan primitives de componentes estilo shadcn, son WCAG AA compliant, y se entregan con estados de form completos (loading, error, success, empty, validation-error). Cada pantalla crítica tiene al menos un component test y un e2e test.

Este spec aborda las Locked Decisions #2 (alcance de providers), #5 (estrategia de testing de OAuth) y #8 (auth edges en alcance), más el addendum de UI (#11, decisiones UI-1..UI-4).

## Requirements

### Requirement: Email and Password Login (Happy Path)

El system MUST autenticar a un user contra `libs/core/database` cuando el email provisto existe y el password coincide con la credencial almacenada. La autenticación exitosa MUST producir una sesión activa para el user, y la UI MUST redirigir al user a la ruta de landing autenticada para el locale activo.

#### Scenario: Successful sign-in with valid credentials

- GIVEN un user registrado con un email verificado y una credencial password almacenada
- AND el user está en la pantalla de sign-in en `/{locale}/sign-in` para el locale `en` o `es`
- WHEN el user envía el form de sign-in con el email y password coincidentes
- THEN una nueva sesión es creada vía `@auth/prisma-adapter`
- AND el user es redirigido a la ruta de landing autenticada para el locale activo
- AND el estado success del form de sign-in es renderizado (sin vuelco de HTML crudo)

### Requirement: Email and Password Login (Invalid Credentials)

El system MUST rechazar el sign-in cuando el email es desconocido OR el password no coincide. El error MUST surfacearse en el estado error del form de manera que no devele si el email existe.

#### Scenario: Unknown email

- GIVEN que no existe una cuenta para el email provisto
- WHEN el user envía el form de sign-in con ese email
- THEN ninguna sesión es creada
- AND el form renderiza el estado error con un mensaje genérico de "invalid credentials"
- AND el campo email permanece poblado para su corrección

#### Scenario: Known email, wrong password

- GIVEN un user registrado con un email verificado
- WHEN el user envía el form de sign-in con el email correcto pero un password incorrecto
- THEN ninguna sesión es creada
- AND el form renderiza el estado error con el mismo mensaje genérico de "invalid credentials" usado para el caso de email desconocido
- AND el campo password es vaciado

### Requirement: Google OAuth Login (Stubbed Happy Path)

El system MUST soportar un provider Google OAuth configurado en paralelo con el provider Credentials. La cobertura del primer slice MUST ser el happy-path stub: cuando el auth server URL apunta al stub local, un callback simulado exitoso MUST mintear una sesión para una cuenta existente o recién creada. El handshake OAuth real contra Google queda fuera del alcance BDD (sólo manual/integration).

#### Scenario: Stubbed Google OAuth completes sign-in

- GIVEN el stub auth server es alcanzable vía el switch `NEXTAUTH_URL` configurado
- AND el user está en la pantalla de sign-in en `/{locale}/sign-in`
- WHEN el user elige el provider Google y el stub devuelve un callback exitoso con un email verificado
- THEN una sesión es creada para ese email (creando la cuenta si no existe) vía `@auth/prisma-adapter`
- AND el user es redirigido a la ruta de landing autenticada para el locale activo

### Requirement: Password Reset (Forgot + Reset, Email Mocked)

El system MUST exponer una acción forgot-password que, dado un email conocido, genere un reset token de un solo uso con expiración, y una acción reset-password que acepte el token más un nuevo password que cumpla la policy y reemplace la credencial almacenada. El delivery del email está mockeado en este repo: el system persiste el token y expone un affordance inspeccionable sólo en development; no se entrega una integración SMTP real.

#### Scenario: Requesting a reset for a known email

- GIVEN un user registrado con un email verificado
- WHEN el user envía el form forgot-password en `/{locale}/forgot-password`
- THEN un reset token de un solo uso es generado y persistido con expiración
- AND se produce un mock email capture (inspeccionable en development)
- AND el form renderiza el estado success ("if this email is registered, you will receive instructions")

#### Scenario: Resetting a password with a valid token

- GIVEN un reset token válido, no expirado, emitido para un email conocido
- WHEN el user envía el form reset-password en `/{locale}/reset-password` con un nuevo password que cumple la policy
- THEN la credencial almacenada es reemplazada por el hash del nuevo password
- AND el token es marcado como consumido (no puede reusarse)
- AND el user es redirigido a la pantalla de sign-in con el estado success del flow de reset renderizado

#### Scenario: Resetting with an expired or invalid token

- GIVEN un reset token expirado o desconocido
- WHEN el user envía el form reset-password
- THEN ninguna credencial es cambiada
- AND el form renderiza el estado error con un mensaje genérico de "invalid or expired token"

### Requirement: Sessions List and Revoke

El system MUST permitir a un user autenticado listar cada sesión activa para su cuenta y revocar cualquier sesión (incluyendo sus propias sesiones en otros devices). Revocar una sesión MUST prevenir requests autenticadas adicionales usando ese session identifier.

#### Scenario: Listing active sessions

- GIVEN un user con dos o más sesiones activas en devices distintos
- WHEN el user abre la pantalla de sesiones en `/{locale}/sessions`
- THEN todas las sesiones son listadas con un device label discernible por el user y el last-active timestamp
- AND el form/pantalla se renderiza en su estado success (resultado no vacío)

#### Scenario: Revoking a single session

- GIVEN un user con dos sesiones activas
- WHEN el user revoca una de ellas desde la pantalla de sesiones
- THEN esa sesión ya no autentica los requests subsecuentes
- AND las sesiones restantes quedan sin cambios
- AND la lista de sesiones refleja la remoción (estado success re-renderizado)

### Requirement: RBAC Roles Enforced in the Domain Layer

El system MUST soportar dos roles, `admin` y `user`, donde las decisiones de authorization (quién puede leer qué, quién puede mutar qué) son enforced por el domain service — no por gating de UI. La UI MAY ocultar affordances a los que el user no tiene derecho, pero el server MUST rechazar requests que violen la policy de role.

#### Scenario: A user role is denied an admin-only action

- GIVEN una sesión para un user con role `user`
- WHEN el user invoca una admin-only action a través de `apps/web`
- THEN el domain service rechaza la action
- AND ningún cambio de estado persiste
- AND la UI renderiza el estado error para el access denial

#### Scenario: An admin role is allowed an admin-only action

- GIVEN una sesión para un user con role `admin`
- WHEN el admin invoca la misma admin-only action
- THEN el domain service acepta la action y persiste el cambio
- AND la UI refleja el estado success

### Requirement: Multi-Provider Adapter Wiring

El system MUST registrar el provider Credentials y el provider Google OAuth contra `@auth/prisma-adapter` simultáneamente. Los side effects guiados por el adapter (account linking, persistencia de sesión) MUST ser observados por ambos providers.

#### Scenario: Both providers share a single adapter-backed account

- GIVEN un user registrado
- WHEN el user sign in vía Credentials
- AND luego sign in vía Google OAuth usando el mismo email
- THEN ambas sesiones resuelven al mismo user record
- AND `@auth/prisma-adapter` persiste ambas filas `Account` linkeadas al user

### Requirement: Session Lifecycle and Expiry

Las sesiones MUST expirar después del TTL configurado. Las sesiones expiradas MUST NOT autenticar requests adicionales, y la UI MUST redirigir a la pantalla de sign-in cuando se detecta una sesión expirada.

#### Scenario: Expired session blocks an authenticated request

- GIVEN una sesión más vieja que el TTL configurado
- WHEN el user intenta cualquier authenticated action
- THEN el request es rechazado como no autenticado
- AND el user es redirigido a `/{locale}/sign-in` para el locale activo

### Requirement: Auth Input Validation (Single Source of Truth)

La entrada de email y password MUST ser validada por un Zod schema compartido entre el client form y el server action (sin validadores duplicados). Los valores enviados que fallen la validación MUST ser rechazados en el estado validation-error del form y MUST NOT llegar al auth service.

#### Scenario: Malformed email is rejected at the form

- GIVEN el user está en la pantalla de sign-in
- WHEN el user envía el form de sign-in con un email que falla el Zod email format
- THEN no se realiza ninguna llamada de red al auth service
- AND el form renderiza el estado validation-error con un mensaje inline en el campo email

### Requirement: UI Primitives (shadcn-style Components)

Cada pantalla de auth MUST estar construida con primitives de componentes estilo shadcn instalados localmente como archivos `.tsx` editables (Button, Input, Form, Card, Dialog, DropdownMenu, Toast, y cualquier otro primitive crítico). Los primitives MUST ser reutilizables entre el slice de auth y aceptables para el slice de transactions.

#### Scenario: Auth screens compose from the shared primitive set

- GIVEN el set de primitives instalado bajo el directorio client de auth
- WHEN cualquier pantalla de auth es renderizada
- THEN cada superficie interactiva (button, input, form control, dropdown, toast) está construida desde los primitives instalados
- AND los primitives son importados desde un único canonical path compartido con el slice de transactions

### Requirement: Locale-Prefixed Auth Routing via next-intl

Cada ruta de auth MUST ser alcanzable bajo `/en/...` y `/es/...`. El locale activo MUST determinar el idioma renderizado para cada user-facing string en las pantallas de auth. El locale switcher MUST preservar la superficie de auth activa (p.ej. cambiar de locale estando en la pantalla de sign-in mantiene al user en la pantalla de sign-in en el nuevo locale).

#### Scenario: Sign-in screen is reachable in both locales

- GIVEN la aplicación está corriendo
- WHEN el user navega a `/en/sign-in` o `/es/sign-in`
- THEN la pantalla de sign-in se renderiza en inglés o español respectivamente
- AND los labels del form, el button text, y los validation messages son traducidos vía `next-intl`

#### Scenario: Switching locale preserves the active auth surface

- GIVEN el user está en `/en/sign-in`
- WHEN el user cambia el locale a `es`
- THEN el user cae en `/es/sign-in` (misma superficie, nuevo locale)
- AND no se pierde data del form inadvertidamente

### Requirement: WCAG AA Accessibility for Auth Screens

Cada pantalla de auth MUST ser WCAG AA compliant: contraste de texto 4.5:1, navegación full keyboard, semantic HTML, y atributos ARIA usados sólo cuando semantic HTML es insuficiente. Un audit automatizado usando `@axe-core/playwright` MUST pasar para cada pantalla crítica.

#### Scenario: axe-core audit passes for the sign-in screen

- GIVEN la pantalla de sign-in está renderizada en `/{locale}/sign-in`
- WHEN `@axe-core/playwright` corre contra la pantalla
- THEN no se reportan violaciones AA
- AND cada elemento interactivo es alcanzable vía tab
- AND cada elemento interactivo tiene un accessible name

### Requirement: Complete Form States on Auth Forms

Cada auth form MUST implementar los cinco estados: loading, error, success, empty y validation-error. Vuelcos de HTML crudo NO son aceptables como estado final — cada estado MUST estar diseñado.

#### Scenario: Sign-in form transitions through every state

- GIVEN la pantalla de sign-in en `/{locale}/sign-in`
- WHEN la pantalla se renderiza sin input todavía
- THEN el estado empty es visible (prompt útil, sin errores)
- WHEN el user envía input inválido
- THEN el estado validation-error es renderizado inline sobre el campo ofensor
- WHEN el user envía input válido
- THEN el estado loading se renderiza (submit deshabilitado + affordance de progreso)
- WHEN el response es un authentication failure
- THEN el estado error se renderiza con un mensaje non-leaking
- WHEN el response es success
- THEN la navegación al authenticated landing ocurre y el destino se renderiza en su estado success

### Requirement: Responsive Auth Layout

Cada pantalla de auth MUST renderizarse sin rotura de layout entre los breakpoints mobile (≤640px) y desktop (≥1024px). Los anchos intermedios MUST NOT causar overflow, controles ocultos, o texto ilegible.

#### Scenario: Sign-in screen resizes correctly

- GIVEN el viewport cambia entre 360px y 1440px de ancho
- WHEN la pantalla de sign-in es renderizada
- THEN no ocurre overflow horizontal en ningún ancho testeado
- AND cada control permanece alcanzable y legible

### Requirement: Component Tests for Auth Screens

Cada pantalla de auth crítica MUST tener al menos un Vitest + Testing Library component test cubriendo el happy path. Los tests MUST correr bajo `pnpm test` y reportar green.

#### Scenario: Sign-in component renders the empty state

- GIVEN el componente de sign-in está montado en aislamiento
- WHEN el component test ejercita el render inicial
- THEN el estado empty es visible
- AND el test pasa bajo `pnpm test`

### Requirement: End-to-End Test for the Login Critical Flow

El critical flow login → authenticated landing MUST ser ejercitado por al menos un Playwright e2e test que corra bajo `pnpm turbo run e2e`. El test MUST arrancar desde una sesión limpia, completar el form de sign-in, y asertar que la landing page es alcanzada para ambos locales.

#### Scenario: e2e happy path lands authenticated user in the correct locale

- GIVEN la aplicación está corriendo y existe un user registrado
- WHEN el Playwright e2e test navega a `/{locale}/sign-in`, llena el form, y envía
- THEN el test asegura que la authenticated landing route es alcanzada
- AND la landing page es renderizada en el locale solicitado
- AND `pnpm turbo run e2e` exit 0

## Data Model

El slice de auth persiste registros de identidad a través de `@auth/prisma-adapter` contra `libs/core/database`. Los elementos mínimos del schema expuestos al slice de auth se listan abajo. Los column types referencian tipos Prisma; remitirse al Prisma schema para la proyección SQL.

| Table                | Column              | Type                | Constraints / Notes                                                                   |
| -------------------- | ------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `User`               | `id`                | `String` (`cuid()`) | Primary key.                                                                          |
| `User`               | `email`             | `String`            | NOT NULL; UNIQUE index (collation case-insensitive manejada en el application layer). |
| `User`               | `emailVerified`     | `DateTime?`         | NULL hasta verificarse.                                                               |
| `User`               | `name`              | `String?`           | Display name.                                                                         |
| `User`               | `image`             | `String?`           | Avatar URL.                                                                           |
| `User`               | `passwordHash`      | `String?`           | NULL cuando el user se registra vía OAuth únicamente. Hash bcrypt/argon2.             |
| `User`               | `role`              | `enum Role`         | NOT NULL; uno de `admin`, `user`. Default `user`.                                     |
| `User`               | `createdAt`         | `DateTime`          | NOT NULL.                                                                             |
| `User`               | `updatedAt`         | `DateTime`          | NOT NULL.                                                                             |
| `Account`            | `id`                | `String` (`cuid()`) | Primary key. Adapter-managed.                                                         |
| `Account`            | `userId`            | `String`            | NOT NULL; FK → `User.id` ON DELETE CASCADE.                                           |
| `Account`            | `provider`          | `String`            | NOT NULL; uno de `credentials`, `google`.                                             |
| `Account`            | `providerAccountId` | `String`            | NOT NULL.                                                                             |
| `Account`            | `access_token` etc. | `String?`           | Adapter-managed columns (refresh_token, expires_at, token_type, scope, id_token).     |
| `Session`            | `id`                | `String` (`cuid()`) | Primary key. Adapter-managed.                                                         |
| `Session`            | `userId`            | `String`            | NOT NULL; FK → `User.id` ON DELETE CASCADE.                                           |
| `Session`            | `sessionToken`      | `String`            | NOT NULL; UNIQUE index.                                                               |
| `Session`            | `expires`           | `DateTime`          | NOT NULL.                                                                             |
| `VerificationToken`  | `identifier`        | `String`            | Adapter-managed reset / verification token storage.                                   |
| `VerificationToken`  | `token`             | `String`            | UNIQUE index.                                                                         |
| `VerificationToken`  | `expires`           | `DateTime`          | NOT NULL.                                                                             |
| `PasswordResetToken` | `id`                | `String` (`cuid()`) | Primary key. Usado para flows de password reset con email mockeado.                   |
| `PasswordResetToken` | `userId`            | `String`            | NOT NULL; FK → `User.id` ON DELETE CASCADE.                                           |
| `PasswordResetToken` | `tokenHash`         | `String`            | NOT NULL; UNIQUE index. Hash del token (raw token nunca persistido).                  |
| `PasswordResetToken` | `expiresAt`         | `DateTime`          | NOT NULL.                                                                             |
| `PasswordResetToken` | `consumedAt`        | `DateTime?`         | NULL hasta que el reset ocurre; index `(userId, consumedAt)` para chequeos rápidos.   |

Indexes referenciados arriba:

- `User_email_key` — UNIQUE sobre `User.email` lowercased.
- `Account_provider_providerAccountId_key` — UNIQUE composite sobre `(provider, providerAccountId)`.
- `Session_sessionToken_key` — UNIQUE sobre `Session.sessionToken`.
- `VerificationToken_token_key` — UNIQUE sobre `VerificationToken.token`.
- `PasswordResetToken_tokenHash_key` — UNIQUE sobre `PasswordResetToken.tokenHash`.

El enum `Role` y los valores string de `provider` son parte del auth domain contract y MUST ser reutilizados por el slice de transactions dondequiera que se capture una referencia `createdBy` / `updatedBy` (`User.id` FK más el `role` se lee en el domain layer para enforced RBAC).

## Gherkin feature inventory

Per Locked Decision #3 (4–6 archivos `.feature` por módulo con step defs compartidas), el módulo de auth entrega:

| Archivo                                                | High-level scenarios                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/features/auth/docs/login-email-password.feature` | Scenario: Valid credentials sign the user in · Scenario: Unknown email renders generic error · Scenario: Wrong password renders generic error · Scenario: Validation error on malformed email blocks submit · Scenario: Successful sign-in lands on the locale-correct landing. |
| `libs/features/auth/docs/oauth-google-stub.feature`    | Scenario: Stubbed Google callback mints a session · Scenario: Stubbed Google callback for a new email creates the account then signs in · Scenario: Both providers (Credentials and Google) resolve to the same user record for the same email.                                 |
| `libs/features/auth/docs/password-reset.feature`       | Scenario: Forgot-password for a known email persists a token and a mocked email capture · Scenario: Reset-password with a valid token replaces the credential and consumes the token · Scenario: Reset-password with an expired token is rejected.                              |
| `libs/features/auth/docs/sessions-list.feature`        | Scenario: Listing sessions returns every active session with device label · Scenario: Revoking a session prevents further authentication using that session identifier · Scenario: Revocation re-renders the sessions list with the removed entry gone.                         |
| `libs/features/auth/docs/rbac-admin.feature`           | Scenario: A `user` role attempting an admin-only action is denied by the domain service · Scenario: An `admin` role succeeds on the same action · Scenario: RBAC denial surfaces in the UI error state without leaking policy details.                                          |
| `libs/features/auth/docs/login-locale-routing.feature` | Scenario: `/en/sign-in` y `/es/sign-in` renderizan la pantalla de sign-in en el locale solicitado · Scenario: Switching locale keeps the user on the same auth surface in the new locale.                                                                                       |

Todas las step definitions viven bajo `libs/features/auth/docs/step-defs/` y son compartidas entre los seis archivos `.feature`. El phrasing concreto de los steps se deja a `sdd-design`; los requirement-level scenarios arriba enumeran la superficie de tests que el design debe alcanzar.

## Decisions

### D-AUTH-1 — Failed-credential error wording

Se usa un mensaje genérico de "invalid credentials" tanto para unknown-email como para wrong-password. Rationale: evita develar la existencia de la cuenta manteniendo simple el flow correctivo del user. Trade-off: un user real con varias cuentas pierde la señal de trial-and-error. Aceptable para un repositorio de referencia donde el threat model excluye targeted enumeration.

### D-AUTH-2 — Password reset delivery

El email delivery está mockeado dentro del repositorio de referencia (sin integración SMTP). Rationale: reduce la superficie operacional de un spike; el reset token persiste con una expiry real para que la migración a producción pueda swap-in de un SMTP adapter sin cambios de contract. Documentado como out of scope en §2.2.9 del proposal.

### D-AUTH-3 — Adapter payload layout

Los registros de identidad siguen el schema canónico de `@auth/prisma-adapter` (`User`, `Account`, `Session`, `VerificationToken`) en lugar de un layout custom. Rationale: mantiene el adapter drop-in replaceable y permite al equipo swapear providers (Locked Decision #2) sin rewrites. Trade-off: el schema del adapter es opinionado; el slice de auth lo sigue.

Ninguna deferred decision de `proposal.md` §8 cae dentro del slice de auth; ambos ítems deferred son resueltos en el spec de transactions.
