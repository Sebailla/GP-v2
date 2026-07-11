# Transactions Specification

> **Domain**: transactions
> **Change**: `vertical-slicing-reference-scaffold`
> **Project**: `gastos-personales-reference`
> **Stack reference**: NestJS 10, Prisma + Postgres (Docker), Next.js 15 App Router client, `@cucumber/cucumber` BDD
> **Cross-references**: `proposal.md` §2.1.4 (tx edges), §7.4 (G18, G19, G24–G28), §8 deferred items #1 y #2, §11 (UI-1..UI-4, G40–G47)

## Purpose

Definir el comportamiento que el slice de transactions MUST satisfacer en el repositorio de referencia. El slice ingiere, lista, actualiza y soft-delete transactions; convierte montos entre currencies usando FX rates con un staleness warning cuando el rate tiene más de 24 horas; rechaza duplicados en retry vía un mecanismo de idempotency-key; persiste valores monetarios con precisión `Decimal` (nunca `BigInt`); audita cada write con `createdBy` / `updatedBy`; filtra categorías soft-deleted de cada query de categorías (non-negotiable); y calcula sign-aware, per-category totales con threshold alerts. Las superficies de UI para cada pantalla de transactions son alcanzables a través de rutas con prefijo de locale de `next-intl` (`/en/...`, `/es/...`), usan primitives de componentes estilo shadcn, son WCAG AA compliant, y se entregan con estados de form completos (loading, error, success, empty, validation-error). Cada pantalla crítica tiene al menos un component test y un e2e test.

Este spec aborda las Locked Decisions #7 (multi-currency + soft-delete), #9 (tx edges en alcance), y los §8 deferred items #1 (storage strategy de idempotency-key) y #2 (FX rate source), más el addendum de UI (#11, decisiones UI-1..UI-4).

## Requirements

### Requirement: Transaction Validation

Una transaction MUST ser aceptada sólo cuando `amount > 0`, el currency code es un ISO 4217 conocido presente en `Currency`, y la categoría existe en `Category` con `deletedAt IS NULL`. La validación MUST ocurrir a través del Zod schema compartido antes de la persistencia; una validación fallida MUST cortocircuitar antes de cualquier side effect.

#### Scenario: Valid input is accepted

- GIVEN un currency code conocido, una categoría no borrada, y `amount > 0`
- WHEN el user envía el form create-transaction para el locale activo
- THEN la transaction es persistida
- AND el estado success del form es renderizado

#### Scenario: Non-positive amount is rejected

- GIVEN un intento de envío con `amount = 0` o un valor negativo
- WHEN el form es enviado
- THEN ninguna transaction es creada
- AND el estado validation-error es renderizado en el campo amount

#### Scenario: Unknown currency is rejected

- GIVEN un `amount` y una categoría, pero un currency code que no existe en `Currency`
- WHEN el form es enviado
- THEN ninguna transaction es creada
- AND el estado validation-error es renderizado en el campo currency

#### Scenario: Soft-deleted category is rejected

- GIVEN una categoría que fue soft-deleted (`deletedAt IS NOT NULL`)
- WHEN el user intenta crear una transaction contra esa categoría
- THEN ninguna transaction es creada
- AND el form renderiza el estado error con un mensaje "category not available"

### Requirement: Multi-Currency Storage and Conversion

El system MUST persistir cada transaction en su currency nativa y calcular, en el momento de la escritura, el monto equivalente en la reporting currency del user usando el `FxRate` más reciente. El equivalente en reporting currency MUST ser persistido junto al monto nativo para una agregación rápida de read-time.

#### Scenario: Create transaction in a non-reporting currency

- GIVEN un user con reporting currency `USD`
- AND una fila `Currency` para `ARS`
- AND un `FxRate` reciente para `ARS → USD`
- WHEN el user crea una transaction con `amount = 1000` ARS
- THEN la transaction es persistida con `nativeAmount = 1000`, `nativeCurrency = 'ARS'`, y `reportingAmount` calculado desde el FX rate
- AND el estado success es renderizado con el monto convertido visible

#### Scenario: Same-currency transaction skips FX

- GIVEN un user con reporting currency `USD`
- WHEN el user crea una transaction con `amount = 50` USD
- THEN el `reportingAmount` equals el `nativeAmount` (no se realiza lookup FX)

### Requirement: FX Rate Staleness Warning

Cuando el `FxRate` más reciente usado para la conversión es más viejo que 24 horas, el system MUST persistir la transaction AND emitir un domain event señalando el rate stale. El write de la transaction MUST NOT ser bloqueado por staleness; el warning es metadata para el manejo downstream.

#### Scenario: Stale FX rate surfaces as a warning at write-time

- GIVEN un `FxRate` para el currency pair relevante cuyo `recordedAt` es más viejo que 24 horas
- WHEN una transaction es creada contra ese pair
- THEN la transaction es persistida
- AND un domain event `fxRate.stale` es publicado con el pair y la duración de la staleness
- AND el estado success del form incluye un affordance visible de "rate is stale"

#### Scenario: Fresh FX rate does not trigger a warning

- GIVEN un `FxRate` para el currency pair relevante cuyo `recordedAt` está dentro de 24 horas
- WHEN una transaction es creada contra ese pair
- THEN ningún evento `fxRate.stale` es publicado
- AND ningún warning es renderizado

### Requirement: Idempotency-Key on Transaction Create

El system MUST aceptar un header `Idempotency-Key` sobre el endpoint create-transaction. Dos requests que lleven la misma key MUST resultar en exactamente una fila de transaction; el segundo response MUST devolver la transaction originalmente persistida sin crear un duplicado.

#### Scenario: Replayed request returns the same transaction

- GIVEN un request válido de creación de transaction con header `Idempotency-Key: <K>`
- WHEN el mismo request es reintentado con la misma key
- THEN ninguna segunda fila `Transaction` es creada
- AND ambos responses se refieren al mismo transaction ID y payload idéntico

#### Scenario: Different keys create independent transactions

- GIVEN un request válido de creación de transaction con header `Idempotency-Key: <K1>`
- WHEN el user envía el mismo payload con una key diferente `<K2>`
- THEN dos transactions distintas son persistidas
- AND ambos responses tienen éxito con sus respectivos transaction IDs

### Requirement: Decimal Precision for Monetary Values

El system MUST persistir montos monetarios usando Prisma `Decimal`. El slice MUST NOT introducir `BigInt` para montos monetarios. Los reads MUST surfacear valores `Decimal` sin un paso de integer-cast que trunque centavos.

#### Scenario: Decimal cents are preserved on persistence

- GIVEN un envío de transaction de `amount = 12.34`
- WHEN la transaction es creada
- THEN el `nativeAmount` persistido equals `12.34` exactamente (sin truncamiento a `12`)
- AND el valor leído de vuelta equals `12.34`

#### Scenario: Large amounts do not overflow into BigInt

- GIVEN un envío de transaction de `amount = 999999999999.99`
- WHEN la transaction es creada
- THEN el valor persistido es `999999999999.99` como un `Decimal`
- AND no se realiza ninguna coerción a `BigInt`

### Requirement: Audit Log on Every Transaction Write

Cada fila `Transaction` persistida o mutada MUST llevar user IDs en `createdBy` y `updatedBy`. Los IDs MUST referenciar registros `User` existentes. Las operaciones de mutación (update, delete) MUST actualizar `updatedAt` y `updatedBy`; soft-delete MUST preservar el `createdBy` original.

#### Scenario: Create populates createdBy and updatedBy

- GIVEN una sesión autenticada para el user `U`
- WHEN `U` crea una transaction
- THEN la fila persistida tiene `createdBy = U.id` y `updatedBy = U.id`
- AND `createdAt` y `updatedAt` están poblados

#### Scenario: Update refreshes updatedBy but not createdBy

- GIVEN una transaction originalmente creada por el user `U1`
- WHEN el user `U2` actualiza la transaction
- THEN `updatedBy = U2.id` y `updatedAt` refleja el update
- AND `createdBy` permanece `U1.id`

### Requirement: Soft-Delete Filter on All Category Queries

Cada read y write de `Category` MUST incluir `deletedAt IS NULL` en el filtro. El slice MUST NOT exponer opt-outs. Esta regla es non-negotiable a través del slice.

#### Scenario: Active categories are returned

- GIVEN una mezcla de categorías activas y soft-deleted
- WHEN el slice de transactions lista categorías para cualquier UI control
- THEN sólo categorías activas son devueltas

#### Scenario: Soft-deleted categories cannot be selected for a new transaction

- GIVEN una categoría que fue soft-deleted
- WHEN el user abre el form create-transaction
- THEN la categoría soft-deleted está ausente de la lista seleccionable
- AND un intento de enviar una transaction referenciando esa categoría es rechazado por el validation pipeline

### Requirement: Sign-Aware Totals (Income vs Expense)

El slice MUST clasificar cada transaction como income (signo positivo en el `kind`/enum) o expense (signo negativo), y MUST calcular totales roll-up distinguiendo income, expense, y net. Los totales MUST respetar la reporting currency.

#### Scenario: Income and expense totals are reported separately

- GIVEN dos transactions en la reporting currency: una income de `+100` y una expense de `-40`
- WHEN el totals service calcula el summary
- THEN income total = `100`, expense total = `40` (reportado como magnitud positiva), net = `60`

#### Scenario: Net matches the difference

- GIVEN el mismo input de arriba
- WHEN el totals service calcula el net
- THEN net = income total − expense total magnitude = `60`

### Requirement: Per-Category Totals

El slice MUST agrupar totales por categoría para la reporting currency activa. Los totales agrupados MUST respetar el filtro soft-delete sobre categorías.

#### Scenario: Totals grouped by active category

- GIVEN transactions en dos categorías activas distintas
- WHEN el per-category totals service corre
- THEN un subtotal es devuelto por categoría, con el nombre de la categoría y el monto neto

#### Scenario: Soft-deleted categories are excluded

- GIVEN transactions asignadas a una categoría soft-deleted
- WHEN el per-category totals service corre
- THEN la categoría soft-deleted NOT aparece en el resultado
- AND esas transactions son excluidas de los rollups por categoría (sí contadas en los totales generales income/expense)

### Requirement: Threshold Alerts

Cuando una transaction o roll-up cruza un threshold configurado (por categoría o absoluto), el slice MUST emitir un domain event al que código downstream (notifications, toasts, audit) pueda subscribirse.

#### Scenario: Threshold crossed on create

- GIVEN un threshold `T` configurado para la categoría
- WHEN el user crea una transaction cuyo amount excede `T`
- THEN la transaction es persistida
- AND un domain event `transactions.threshold.exceeded` es publicado con el category ID y el amount

#### Scenario: Threshold not crossed produces no event

- GIVEN la misma configuración
- WHEN el user crea una transaction cuyo amount es menor o igual a `T`
- THEN ningún threshold event es publicado

### Requirement: Listing, Pagination, and Filtering

El endpoint de listado MUST soportar paginación, filtrado por categoría (sólo activas), filtrado por rango de fechas, y filtrado por currency. Las categorías soft-deleted MUST NOT aparecer en el filtro. Un empty result set MUST ser representable como una lista vacía con `total = 0`.

#### Scenario: Paginated listing returns a page of results

- GIVEN más transactions que el page size
- WHEN el user pide la página `n` con el page size configurado
- THEN como máximo `pageSize` filas son devueltas
- AND el response incluye un count `total` y un cursor para la siguiente página

#### Scenario: Filter by category excludes soft-deleted categories

- GIVEN una categoría `C` que fue soft-deleted
- WHEN el user pide un listado filtrado por `C`
- THEN un empty result set es devuelto con `total = 0`

### Requirement: Update and Soft-Delete Operations

El slice MUST soportar la actualización de campos mutables (amount, currency, category, notes) y soft-delete. Soft-delete setea `deletedAt` y refresca `updatedBy`; la fila permanece en la DB para auditoría pero es filtrada por cada read query que incluya el soft-delete predicate.

#### Scenario: Update mutable fields

- GIVEN una transaction existente
- WHEN el user edita el amount y notes a través de la pantalla de edición para el locale activo
- THEN los nuevos valores son persistidos
- AND `updatedBy` y `updatedAt` reflejan el cambio
- AND el estado success es renderizado

#### Scenario: Soft-delete removes the transaction from listings

- GIVEN una transaction existente
- WHEN el user la soft-delete
- THEN `deletedAt` es seteado
- AND la transaction está ausente de los listados subsecuentes y per-category totales
- AND la fila de auditoría conserva `createdBy` y `updatedBy`

### Requirement: FX Rate Provider as a Port

El slice MUST obtener FX rates a través de un port (interface) llamado `FxRateProvider`. El repositorio de referencia entrega una implementación in-memory por defecto seeded con un pequeño set de pairs y un clock actualizable. La forma del port permite que un provider real (HTTP, file, etc.) sea slotted in más tarde sin cambiar el slice de transactions.

#### Scenario: Default in-memory provider supplies a recent rate

- GIVEN el in-memory provider está seeded con un rate `ARS → USD` grabado ahora
- WHEN el slice de transactions necesita el rate
- THEN el provider devuelve el rate seeded
- AND las conversiones proceden sin fallo

#### Scenario: Unknown pair surfaces a domain error

- GIVEN el in-memory provider no tiene rate para el pair solicitado
- WHEN el slice de transactions necesita ese pair
- THEN el lookup falla con un domain-defined error
- AND el estado error visible para el user en el form create reporta el fallo

### Requirement: Idempotency Storage Strategy

El system MUST persistir idempotency keys en una tabla dedicada `IdempotencyKey` (forma canónica estilo Stripe). La tabla MUST contener la key, el user al que pertenece, el fingerprint del request, el payload del response, y un TTL. El repositorio de referencia usa una fila `IdempotencyKey` separada por key para mantener el TTL cleanup independiente del lifecycle de la `Transaction`.

#### Scenario: First request with a key persists both rows

- GIVEN un valor de header `Idempotency-Key` nuevo
- WHEN el request crea una transaction exitosamente
- THEN una fila `IdempotencyKey` es insertada con la key, el user ID, el request fingerprint, y el response payload cacheado
- AND una fila `Transaction` es insertada

#### Scenario: Replay returns the cached response

- GIVEN un triple `(key, user, fingerprint)` previamente cacheado dentro del TTL
- WHEN el mismo request es reintentado
- THEN ninguna nueva fila `IdempotencyKey` es creada
- AND ninguna nueva fila `Transaction` es creada
- AND el response payload cacheado es devuelto

#### Scenario: Fingerprint mismatch is rejected

- GIVEN un triple `(key, user)` previamente cacheado
- WHEN la misma key es reusada con un request fingerprint distinto
- THEN el request es rechazado con un conflict error
- AND no se muta estado

#### Scenario: Expired keys are eligible for removal

- GIVEN una fila `IdempotencyKey` cuyo `expiresAt` está en el pasado
- WHEN el cleanup corre (o un replay es intentado)
- THEN el replay es tratado como un fresh request
- AND la fila puede ser removida por el cleanup procedure

### Requirement: UI Primitives (shadcn-style Components)

Cada pantalla de transactions MUST estar construida con primitives de componentes estilo shadcn instalados localmente como archivos `.tsx` editables (reusando el mismo set de primitives que el slice de auth). Primitives críticos incluyen Button, Input, Form, Card, Dialog, DropdownMenu, Select, Toast, y Table.

#### Scenario: Transactions screens compose from the shared primitive set

- GIVEN los primitives instalados bajo el directorio client de transactions
- WHEN cualquier pantalla de transactions es renderizada
- THEN cada superficie interactiva está construida desde los primitives instalados
- AND no se usan forms HTML con estilos inline como estado final

### Requirement: Locale-Prefixed Transactions Routing via next-intl

Cada ruta de transactions MUST ser alcanzable bajo `/en/...` y `/es/...`. El locale activo MUST determinar el idioma renderizado para labels, validation messages, success/error text, y threshold warning text. Cambiar de locale MUST preservar la superficie activa (p.ej. cambiar desde `/en/transactions` mantiene al user en `/es/transactions`).

#### Scenario: List transactions screen is reachable in both locales

- GIVEN la aplicación está corriendo
- WHEN el user navega a `/en/transactions` o `/es/transactions`
- THEN el listado se renderiza en inglés o español respectivamente
- AND cada label y mensaje es traducido vía `next-intl`

#### Scenario: Switching locale preserves the surface

- GIVEN el user está en `/en/transactions/new`
- WHEN el user cambia el locale a `es`
- THEN el user cae en `/es/transactions/new` con los campos del form preservados donde sea posible

### Requirement: WCAG AA Accessibility for Transactions Screens

Cada pantalla de transactions MUST ser WCAG AA compliant: contraste de texto 4.5:1, navegación full keyboard, semantic HTML, y atributos ARIA usados sólo cuando semantic HTML es insuficiente. Un audit automatizado usando `@axe-core/playwright` MUST pasar para cada pantalla crítica.

#### Scenario: axe-core audit passes for the transactions list

- GIVEN el transactions list está renderizado en `/{locale}/transactions`
- WHEN `@axe-core/playwright` corre contra la pantalla
- THEN no se reportan violaciones AA
- AND cada row action es alcanzable vía keyboard
- AND cada row action tiene un accessible name

### Requirement: Complete Form States on Transactions Forms

Cada form de transactions (create, edit, delete confirmation) MUST implementar los cinco estados: loading, error, success, empty y validation-error. Vuelcos de HTML crudo NO son aceptables.

#### Scenario: Create-transaction form transitions through every state

- GIVEN la pantalla create-transaction en `/{locale}/transactions/new`
- WHEN la pantalla se renderiza sin input todavía
- THEN el estado empty es visible
- WHEN el user envía input inválido
- THEN el estado validation-error es renderizado inline
- WHEN el user envía input válido
- THEN el estado loading se renderiza con submit deshabilitado
- WHEN el response es un failure (p.ej. FX error)
- THEN el estado error se renderiza con un mensaje recoverable
- WHEN el response es success
- THEN la navegación al listado (o a la fila recién creada) ocurre con el estado success visible

### Requirement: Responsive Transactions Layout

Cada pantalla de transactions MUST renderizarse sin rotura de layout entre los breakpoints mobile (≤640px) y desktop (≥1024px). Los anchos intermedios MUST NOT causar overflow, controles ocultos, o texto ilegible.

#### Scenario: Transactions list resizes correctly

- GIVEN el viewport cambia entre 360px y 1440px de ancho
- WHEN el transactions list es renderizado
- THEN no ocurre overflow horizontal
- AND cada row action es alcanzable y legible en ambos breakpoints

### Requirement: Component Tests for Transactions Screens

Cada pantalla de transactions crítica MUST tener al menos un Vitest + Testing Library component test cubriendo el happy path. Los tests MUST correr bajo `pnpm test` y reportar green.

#### Scenario: List component renders the empty state when there are no transactions

- GIVEN el componente list está montado con un dataset vacío
- WHEN el component test renderiza
- THEN el estado empty es visible
- AND el test pasa bajo `pnpm test`

### Requirement: End-to-End Test for the Transactions Critical Flow

El critical flow login → transactions list → create transaction MUST ser ejercitado por al menos un Playwright e2e test que corra bajo `pnpm turbo run e2e`. El test MUST arrancar limpio, sign in, listar transactions, crear una nueva transaction, y asertar que la nueva fila aparece.

#### Scenario: e2e create-transaction flow

- GIVEN la aplicación está corriendo y existe un user registrado
- WHEN el Playwright e2e test sign in, navega al transactions list, abre el create form, llena el form, y envía
- THEN la nueva transaction es visible en el listado
- AND `pnpm turbo run e2e` exit 0

## Data Model

El slice de transactions persiste contra `libs/core/database`. Los elementos del Prisma schema expuestos al slice se listan abajo. Los column types referencian tipos Prisma; remitirse al Prisma schema para la proyección SQL.

| Table            | Column                  | Type                   | Constraints / Notes                                                                                                           |
| ---------------- | ----------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Currency`       | `code`                  | `String`               | Primary key. ISO 4217 three-letter code (p.ej. `USD`, `ARS`, `EUR`).                                                          |
| `Currency`       | `name`                  | `String`               | NOT NULL. Display name.                                                                                                       |
| `Currency`       | `symbol`                | `String`               | NOT NULL. Currency symbol.                                                                                                    |
| `Currency`       | `decimals`              | `Int`                  | NOT NULL. Default 2.                                                                                                          |
| `Currency`       | `createdAt`             | `DateTime`             | NOT NULL.                                                                                                                     |
| `FxRate`         | `id`                    | `String` (`cuid()`)    | Primary key.                                                                                                                  |
| `FxRate`         | `fromCode`              | `String`               | NOT NULL; FK → `Currency.code`.                                                                                               |
| `FxRate`         | `toCode`                | `String`               | NOT NULL; FK → `Currency.code`.                                                                                               |
| `FxRate`         | `rate`                  | `Decimal`              | NOT NULL. Almacenado como `Decimal`, NOT `Float`, para evitar drift de representación binaria.                                |
| `FxRate`         | `recordedAt`            | `DateTime`             | NOT NULL. Index `(fromCode, toCode, recordedAt DESC)` para el lookup "most recent".                                           |
| `Category`       | `id`                    | `String` (`cuid()`)    | Primary key.                                                                                                                  |
| `Category`       | `name`                  | `String`               | NOT NULL.                                                                                                                     |
| `Category`       | `slug`                  | `String`               | NOT NULL; UNIQUE index.                                                                                                       |
| `Category`       | `kind`                  | `enum CategoryKind`    | NOT NULL. Uno de `income`, `expense`.                                                                                         |
| `Category`       | `deletedAt`             | `DateTime?`            | NULL cuando está activa. Soft-delete marker; cada read MUST incluir `deletedAt: null`.                                        |
| `Category`       | `createdAt`             | `DateTime`             | NOT NULL.                                                                                                                     |
| `Category`       | `updatedAt`             | `DateTime`             | NOT NULL.                                                                                                                     |
| `Transaction`    | `id`                    | `String` (`cuid()`)    | Primary key.                                                                                                                  |
| `Transaction`    | `amount`                | `Decimal`              | NOT NULL. Siempre magnitud positiva; el signo se determina por `kind`. Tipo `Decimal`, NUNCA `BigInt`.                        |
| `Transaction`    | `currencyCode`          | `String`               | NOT NULL; FK → `Currency.code`.                                                                                               |
| `Transaction`    | `kind`                  | `enum TransactionKind` | NOT NULL. Uno de `income`, `expense`. El signo deriva de `kind`: expense convencionalmente presentado como totales negativos. |
| `Transaction`    | `reportingAmount`       | `Decimal?`             | Nullable cuando native == reporting; si no, el monto convertido en la reporting currency del user.                            |
| `Transaction`    | `reportingCurrencyCode` | `String?`              | Nullable cuando native == reporting; FK → `Currency.code`.                                                                    |
| `Transaction`    | `fxRateId`              | `String?`              | Nullable cuando native == reporting; FK → `FxRate.id`. NULL cuando no se requirió conversión.                                 |
| `Transaction`    | `categoryId`            | `String`               | NOT NULL; FK → `Category.id`. Los lookups MUST `JOIN` sólo sobre categorías activas.                                          |
| `Transaction`    | `notes`                 | `String?`              | Texto libre opcional.                                                                                                         |
| `Transaction`    | `occurredAt`            | `DateTime`             | NOT NULL. Fecha en la que ocurrió la transaction (no el write time).                                                          |
| `Transaction`    | `createdBy`             | `String`               | NOT NULL; FK → `User.id`. El slice de auth es source-of-truth para `User.id`.                                                 |
| `Transaction`    | `updatedBy`             | `String`               | NOT NULL; FK → `User.id`.                                                                                                     |
| `Transaction`    | `createdAt`             | `DateTime`             | NOT NULL.                                                                                                                     |
| `Transaction`    | `updatedAt`             | `DateTime`             | NOT NULL.                                                                                                                     |
| `Transaction`    | `deletedAt`             | `DateTime?`            | NULL cuando está activa. Soft-delete marker.                                                                                  |
| `IdempotencyKey` | `id`                    | `String` (`cuid()`)    | Primary key.                                                                                                                  |
| `IdempotencyKey` | `key`                   | `String`               | NOT NULL; UNIQUE index por `(userId, key)`.                                                                                   |
| `IdempotencyKey` | `userId`                | `String`               | NOT NULL; FK → `User.id`.                                                                                                     |
| `IdempotencyKey` | `requestFingerprint`    | `String`               | NOT NULL. Hash del request payload canónico.                                                                                  |
| `IdempotencyKey` | `responsePayload`       | `Json`                 | Response body cacheado para replay.                                                                                           |
| `IdempotencyKey` | `responseStatus`        | `Int`                  | HTTP status code del response cacheado.                                                                                       |
| `IdempotencyKey` | `transactionId`         | `String?`              | FK → `Transaction.id` cuando el response cacheado es una creación de transaction.                                             |
| `IdempotencyKey` | `expiresAt`             | `DateTime`             | NOT NULL. Index para TTL cleanup.                                                                                             |
| `IdempotencyKey` | `createdAt`             | `DateTime`             | NOT NULL.                                                                                                                     |
| `AuditLog`       | `id`                    | `String` (`cuid()`)    | Primary key.                                                                                                                  |
| `AuditLog`       | `entityType`            | `String`               | NOT NULL. Discriminador (`Transaction`, `Category`).                                                                          |
| `AuditLog`       | `entityId`              | `String`               | NOT NULL.                                                                                                                     |
| `AuditLog`       | `action`                | `String`               | NOT NULL. Uno de `create`, `update`, `softDelete`.                                                                            |
| `AuditLog`       | `actorId`               | `String`               | NOT NULL; FK → `User.id`.                                                                                                     |
| `AuditLog`       | `payload`               | `Json?`                | Detalles opcionales del cambio.                                                                                               |
| `AuditLog`       | `createdAt`             | `DateTime`             | NOT NULL.                                                                                                                     |

Indexes referenciados arriba:

- `Category_slug_key` — UNIQUE sobre `Category.slug`.
- `Category_active_kind_idx` — composite `(kind, deletedAt)` para listados filtrados.
- `FxRate_pair_recorded_idx` — composite `(fromCode, toCode, recordedAt DESC)` para el lookup "most recent".
- `Transaction_user_occurred_idx` — composite `(createdBy, occurredAt DESC)` para listados user-scoped.
- `Transaction_category_active_idx` — composite `(categoryId, deletedAt)` para per-category totales con el filtro soft-delete aplicado.
- `IdempotencyKey_user_key_key` — UNIQUE composite sobre `(userId, key)`.
- `IdempotencyKey_expiresAt_idx` — index sobre `expiresAt` para TTL cleanup.
- `AuditLog_entity_idx` — composite `(entityType, entityId)`.

Enums: `Role` (compartido con auth spec: `admin`, `user`), `CategoryKind` (`income`, `expense`), `TransactionKind` (`income`, `expense`).

## Gherkin feature inventory

Per Locked Decision #3 (4–6 archivos `.feature` por módulo con step defs compartidas), el módulo de transactions entrega:

| Archivo                                                             | High-level scenarios                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/features/transactions/docs/create-transaction.feature`        | Scenario: Valid submission persists the transaction with reporting-currency equivalent · Scenario: `amount = 0` is rejected with validation error · Scenario: Unknown currency is rejected with validation error · Scenario: Soft-deleted category is rejected.                             |
| `libs/features/transactions/docs/list-transactions.feature`         | Scenario: Paginated listing returns a page of rows · Scenario: Empty data set renders the empty state with `total = 0` · Scenario: Filter by soft-deleted category returns an empty list.                                                                                                   |
| `libs/features/transactions/docs/multi-currency-conversion.feature` | Scenario: Cross-currency write computes `reportingAmount` from the FX rate · Scenario: Same-currency write skips FX lookup · Scenario: Stale rate (>24h) persists the transaction AND emits `fxRate.stale` · Scenario: Fresh rate emits no stale warning.                                   |
| `libs/features/transactions/docs/idempotency-key.feature`           | Scenario: First request with a new key creates the transaction and the idempotency row · Scenario: Replay with same key returns the cached response without duplicating · Scenario: Same key with different fingerprint is rejected · Scenario: Expired key allows a fresh request through. |
| `libs/features/transactions/docs/soft-delete-categories.feature`    | Scenario: Active categories appear in selectors · Scenario: Soft-deleted categories are filtered from selectors AND from transactions list/totals · Scenario: Attempting to attach a soft-deleted category to a new transaction is rejected.                                                |
| `libs/features/transactions/docs/sign-aware-totals.feature`         | Scenario: Income and expense totals are reported separately · Scenario: Net = income − expense magnitude · Scenario: Per-category totals group by active category · Scenario: Threshold exceeded on create emits `transactions.threshold.exceeded`.                                         |

Todas las step definitions viven bajo `libs/features/transactions/docs/step-defs/` y son compartidas entre los seis archivos `.feature`. El phrasing concreto de los steps se deja a `sdd-design`; los requirement-level scenarios arriba enumeran la superficie de tests que el design debe alcanzar.

## Decisions

### D-TX-1 — Idempotency-key storage: tabla dedicada `IdempotencyKey`

Resuelto §8 deferred item #1 del `proposal.md`. Se usa una tabla dedicada `IdempotencyKey`; el rechazo de la alternativa (índice `UNIQUE` sobre una columna de `Transaction`) se basa en costo vs flexibilidad futura:

- **Pros de una tabla dedicada**: TTL cleanup independiente (sin acoplamiento al archivado de transactions); capacidad de cachear el response payload y reproducirlo en retry (el comportamiento canónico estilo Stripe); almacenamiento distinto del fingerprint para detectar reuso de key con payloads distintos; trail de auditoría limpio de "qué registros de idempotency existieron".
- **Cons de una tabla dedicada**: tabla extra, migración extra, un cleanup procedure (TTL job o lazy expiry on read).
- **Pros de una columna sobre `Transaction`**: sin tabla extra; la fila de transaction en sí misma documenta la key.
- **Cons de una columna sobre `Transaction`**: el TTL queda atado al lifecycle de la transaction (no puede expirar independientemente de un audit log); el payload replay-cacheado no tiene un slot natural donde vivir; el reuso accidental de key con un fingerprint distinto sólo se detecta vía violación `UNIQUE`, que es más difícil de mapear a un domain error.

La tabla dedicada gana en **costo de storage vs simplicidad de query** porque la superficie de storage del repositorio de referencia es pequeña pero el replay path (devolver el mismo response en retry) necesita un slot de payload que la fila `Transaction` no ofrece naturalmente. Trade-off acknowledged: una tabla extra y un procedure de TTL sweep.

### D-TX-2 — FX rate source: port `FxRateProvider` con implementación in-memory por defecto

Resuelto §8 deferred item #2 del `proposal.md`. El slice declara un port `FxRateProvider` con dos métodos (rate más reciente para un pair, con fallback para el caso `toCode = fromCode`). El repositorio de referencia entrega la implementación in-memory por defecto seeded al startup; la forma del port permite que un provider real HTTP/file sea slotted in más tarde. Trade-off: interface extra a mantener en sync, pero el seam se paga solo en el momento en que un provider real se conecta.

### D-TX-3 — Same-currency conversion es no-op

Cuando la currency de la transaction equals la reporting currency del user, el slice skipea el lookup FX y setea `reportingAmount = nativeAmount`, `reportingCurrencyCode = currencyCode`, `fxRateId = NULL`. Reason: evitar warnings de staleness espurios en usuarios single-currency. Ningún evento es emitido.

### D-TX-4 — Stale-rate no bloquea writes

Un FX rate stale (>24h) no bloquea el write; la transaction es persistida con el rate disponible y un domain event `fxRate.stale` es publicado. Reason: la corrección de la transaction outweighs la frescura del rate; el evento permite que código downstream (notifications, audit) decida la policy.

### D-TX-5 — Soft-delete filter es non-opt-out

Cada path de query de categoría (read para selectors, read para transactions join-eando categoría, agrupamiento de totales) MUST filtrar `deletedAt IS NULL`. La abstracción de repository MUST aplicar el filtro por default, sin un escape hatch surfaced a las capas superiores. Reason: la reaparición silenciosa de categorías soft-deleted corrompería los selectors visibles al user y los totales. El costo de olvidar es lo suficientemente alto como para que los opt-outs no estén permitidos.

### D-TX-6 — Decimal sobre BigInt para montos monetarios

Los montos monetarios son Prisma `Decimal` end-to-end. `BigInt` no se usa porque silenciosamente trunca centavos (semántica integer). Trade-off: la aritmética `Decimal` es ligeramente más lenta que `BigInt` en tight loops, pero el slice no es high-frequency enough para que esto importe, y `Decimal` es la semántica correcta.

### D-TX-7 — RBAC para transactions actions

Las transactions actions (create, update, soft-delete) están gateadas al role `user` o `admin`. El role `admin` adicionalmente puede soft-deleted transactions pertenecientes a otros users; el role `user` sólo puede mutar las propias. El check es enforced en el domain service (según la invariant de Locked Decision #8 de que RBAC se enforcea en el domain layer, no en la UI). Trade-off documentado para `sdd-design`: si la capacidad cross-user del admin se entrega en este slice o se difiere a un change posterior.

Ninguna open question queda pendiente; las fases downstream (`sdd-design`, `sdd-tasks`) heredan estas decisiones.
