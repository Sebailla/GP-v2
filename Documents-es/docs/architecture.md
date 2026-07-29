# Arquitectura

> **Estado**: espejo en espanol parcial (slice 8 PR-A2).
> Las secciones §7-§12 llegan traducidas en este PR; las
> secciones §1-§6 conservan la prosa de slice 1 hasta que un PR
> futuro las reemplace con la traduccion sincronizada (AGENTS.md §13
> contrato de sincronizacion).
> **Proyecto**: `gastos-personales-reference`.
> **Espejo en espanol**: este archivo. La version canonica en
> ingles vive en `docs/architecture.md` (REGLA DURA segun AGENTS.md §13).
> **Politica de traduccion**: traduccion tecnica (no localization
> cultural). Los terminos tecnicos estandar del sector se quedan en
> ingles segun AGENTS.md §13: `commit`, `merge`, `branch`, `ADR`, `PR`,
> `slice`, `stage`, `BDD`, `e2e`, `lint`, `typecheck`, `test`,
> `build`, `fixture`, `runner`, `pipeline`, `monorepo`, `feature`,
> `workspace`, `package`, `import`, `export`, `module`, `schema`,
> `port`, `adapter`, `repository`, `service`, `domain`, `application`,
> `infrastructure`, `client`, `server`, `shared`, `core`, `utils`,
> `events`, `database`, `config`, `script`, `bash`, `idempotent`,
> `preflight`, `finalize`. Paths, identificadores y contenido de
> code blocks se preservan verbatim.

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

- Google via `@auth/prisma-adapter`) y los cuatro eventos emitidos.
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

## 7. `libs/shared-utils` — regla de helpers puros

Todo paquete bajo `libs/shared-utils/<x>/` DEBE ser un **helper
puro**: sin I/O, sin dependencias de framework, sin Prisma, sin
NestJS, sin Next.js, sin React. Cualquier cosa que toque el mundo
externo (disco, red, env, tiempo, aleatoriedad) pertenece a
`server/` o `infrastructure/` del slice, no aca. Esta regla es
lo que mantiene `libs/shared-utils` barato de testear (Vitest
solamente, sin levantar contenedores) y seguro de importar desde
cualquier paquete — incluyendo codigo de `client/`.

**Los tres paquetes que existen hoy** (slice 4 batch-4a agrego
`date-formatting`; slice 5 PR-1 agrego `currency`; slice 5 PR-3
agrego `decimal` por D-TX-6):

| Paquete | Proposito | Por que tiene que vivir aca |
|---|---|---|
| `@shared-utils/date-formatting` | Wrappers de `Intl.DateTimeFormat` con locale, round-trip ISO-8601 | Tanto los formularios del client como la validacion del server necesitan el mismo formato de fecha |
| `@shared-utils/currency` | Lista ISO-4217 + formateador de display | El slice transactions muestra codigos de moneda; auth muestra montos en recibos de password-reset |
| `@shared-utils/decimal` | Wrappers de `decimal.js` — `toDecimal`, `fromPrismaDecimal`, `sum`, `roundHalfEven` | D-TX-6 prohibe la aritmetica IEEE-754 sobre dinero; el wrapper da un unico lugar canonico para las reglas de conversion |

Los tres se consumen via el alias `@shared-utils/*` declarado en
`tsconfig.base.json`. Agregar un cuarto es una decision deliberada;
ver §11 para la convencion de nombre de branch cuando aterriza un
paquete nuevo.

### 7.1 Cuando agregar un nuevo paquete `@shared-utils`

Un nuevo paquete helper es la decision correcta cuando **se cumplen
las tres** condiciones:

1. El helper se consume desde **al menos dos workspaces**
   (por ej. `@features/auth` y `@features/transactions`, o
   `@features/<x>` mas `apps/web`).
2. El helper **no tiene efectos secundarios** — sin I/O, sin
   lecturas de env, sin hooks de framework.
3. El helper crearia un **import circular o duplicacion** si se
   colocara dentro de `shared/` de un solo slice.

Si solo se cumple la condicion 1: mantenerlo inline en el slice
consumidor primero; promover a `@shared-utils` en la primera
duplicacion. Si la condicion 2 falla: el helper pertenece a
`server/` o `infrastructure/` del slice, no a `libs/shared-utils`.
AGENTS.md §8 nombra "single source of truth" como la razon de
esta regla: todo calculo financiero que ocurra sobre el mismo
input DEBE rutear por el mismo code path o el audit trail se
rompe.

### 7.2 Por que `decimal.js` (no `BigInt`, no `number`)

D-TX-6 cerro la eleccion: dinero es `@shared-utils/decimal`. La
rationale (preservada verbatim del diseno de slice-5 §4.1 para que
contribuyentes futuros la encuentren):

- **`number`** es IEEE-754 double. `0.1 + 0.2 !== 0.3`. Drift en
  totales + chequeos de threshold = dinero real perdido del ledger
  del usuario. Inaceptable para audit trails.
- **`BigInt`** no tiene punto decimal. Satoshis-como-bigint es el
  unico uso viable; montos decimales en ARS/USD/EUR no lo son.
- **`decimal.js`** es el wrapper mas pequeno que sirve. Escala
  fija (28 digitos por default), modo de redondeo configurable
  (`roundHalfEven` para half-to-even / banker's rounding, que
  coincide con IFRS), serializacion a string que sobrevive JSON
  sin perdida de precision.

El `Decimal` runtime de Prisma (importado type-only via
`@core/database`) se convierte en el **boundary del repository**
con `fromPrismaDecimal(row.field.toString())`. Los adapters NO
devuelven un `Decimal` de Prisma hacia arriba al domain layer;
devuelven un value object de `@shared-utils/decimal`. Este es
el boundary que hace la aritmetica en `number` imposible por
construccion.

{ #section-7 }

## 8. Contrato de slicing — `libs/features/<x>/{server,shared,docs}`

Cada slice de feature es dueno de **cuatro carpetas top-level**,
y el plugin de ESLint impone cada una. El scaffold de referencia
hoy tiene `server/`, `shared/` y `docs/` pobladas; `client/` esta
reservada para el siguiente slice (slice-1 Locked Decision #12
extiende el alias de paths sin forzar un directorio `client/`
hoy — ver la nota "anomalia de client/" en §2).

### 8.1 El contrato de las cuatro carpetas

| Carpeta | Vive ahi | MUST NOT import |
|---|---|---|
| `client/` | Componentes React, hooks, glue browser-only (slice posterior) | nada de `server/`, nada de `apps/api/*` |
| `server/` | Servicios NestJS, controllers, adapters de infrastructure, ports de repository | nada de `client/`, `apps/web/*` |
| `shared/` | Esquemas Zod, tipos puros, helpers isomorfos (sin React, sin NestJS) | `server/`, `client/`, `@core/database`, `@core/events` |
| `docs/` | Archivos `.feature`, step definitions, bridge de cucumber, world state, soporte BDD | `client/`, `apps/*` (BDD es concern de test, no de runtime) |

Dos axiomas siguen:

1. **`shared/` es la unica carpeta que las demas pueden importar.**
   `client/`, `server/` y `docs/` pueden importar de `shared/`.
   `shared/` no puede importar de nada dentro del slice excepto
   otros modulos de `shared/`.
2. **`docs/` es la unica carpeta que puede importar desde todo el
   slice.** Los escenarios BDD testean la integracion; el bridge
   (`register.ts`) llama servicios de `server/` por su barrel
   publico. `docs/` NO se filtra de vuelta a `server/` o
   `client/`.

Las excepciones son deliberadas, no ausencias: `shared/` es el
seam donde los esquemas cruzan la frontera, asi que tiene el
derecho de depender "hacia arriba" de ninguna otra cosa dentro
del slice.

### 8.2 Los path aliases cargan con el contrato

`tsconfig.base.json` declara los aliases; `eslint.config.mjs`
inspecciona los imports contra ellos. Todo `import` a otro
workspace pasa por un alias — nunca un reach-through relativo
`../../../`. Los aliases en uso hoy (slice 4 batch-4a + slice
5 PR-1):

- `@features/auth` → `libs/features/auth/server` (default; par
  con `/*` para sub-paths)
- `@features/auth/shared` → `libs/features/auth/shared` (explicito;
  deja a `server/` importar `shared/schemas/login` sin round-trip
  por default)
- `@features/auth/docs` → `libs/features/auth/docs` (explicito;
  los step-defs BDD y los archivos `.feature` lo usan)
- Misma triplet para `@features/transactions`

La regla `no-cross-module-import` (§10) captura el caso malo:
`import { authService } from "@features/auth/server"` esta bien
dentro del propio `docs/support/` del slice; NO esta bien
dentro de `@features/transactions/server/`. La capa ESLint lee
el path del archivo contenedor y rechaza el import antes de
llegar al type-checker.

### 8.3 El barrel publico es la API

Cada paquete `server/` declara su superficie publica con
`src/index.ts`. Consumidores — el propio `docs/support/` del slice
y slices externos — `import { AuthService, SessionService, … }`
del barrel solamente. La regla fuerza una disciplina: nada dentro
del barrel cruza a otro slice; nada afuera alcanza pasando el
barrel hacia los internos.

El `src/index.ts` del slice auth es el ejemplo canonico:

- Exporta los cuatro servicios (`AuthService`, `SessionService`,
  `RbacService`, `PasswordResetService`) mas las tres clases
  de repository adapter (`PrismaUserRepository`,
  `PrismaSessionRepository`,
  `PrismaPasswordResetTokenRepository`).
- Exporta las clases de error del slice
  (`InvalidCredentialsError`, `SessionNotFoundError`, etc.)
  para que las aserciones de los steps BDD puedan
  `expect(...).toBeInstanceof(...)` sin alcanzar
  `domain/errors/`.
- NO exporta el wrapper de `@auth/prisma-adapter` (slice 8.1.2
  lo restrego a client-only; ver commit `2e05fc5`).

### 8.4 Ejemplo recorrido — extraer `notifications` de un monolito

Supongamos que el siguiente slice de migracion saca un modulo
`notifications` de `gastos-personales/src/notifications/`. La
trayectoria que deberia seguir:

**Paso 1 — pre-flight (`scripts/migrate/00-preflight.sh`).**
Verificar `pnpm`, `docker`, `git`, Node 22. Abortar si el working
tree esta sucio. El pre-flight completo es un script separado
(Locked Decision #4 formato dual); la arquitectura dice solo que
los PRs sin pre-flight limpio NO deben empezar el slice.

**Paso 2 — extraer domain (`10-extract-domain.sh`).** Mover
`src/notifications/{domain,application,infrastructure}` a
`libs/features/notifications/server/src/`. Ajustar los paths de
`tsconfig.base.json`: agregar `@features/notifications` →
`libs/features/notifications/server`. Notar que este es EL lugar
donde se crea el contrato de slicing; despues de este paso hay
dos code paths a la misma logica, y el duplicado DEBE eliminarse
antes de mergear (los consumidores del path viejo quedan huerfanos
en ese punto).

**Paso 3 — crear el esqueleto del slice
(`20-create-feature-slice.sh`).** Materializar
`libs/features/notifications/{client,server,shared,docs}` con
`package.json`, `tsconfig.json`, `vitest.config.ts`,
`cucumber.mjs`, y un `src/index.ts` vacio en cada uno. El
`package.json` del slice declara las cuatro entradas subpath
(`.` para server, `/shared`, `/docs`, `/client`).

**Paso 4 — escribir los feature files (`docs/*.feature` segun
Locked Decision #3).** Cuatro a seis archivos `.feature` como
minimo; cada regla de negocio del modulo fuente mapea a al menos
un scenario. Los step definitions van bajo
`docs/step-defs/{common,<feature>}.steps.ts`. El bridge de
cucumber vive en `docs/support/register.ts` y sigue el mismo
patron `a9b550d` de build-wrapper que auth y transactions.

**Paso 5 — agregar el barrel `shared/schemas/`.** Cualquier input
que el nuevo slice valide recibe un esquema Zod bajo
`shared/schemas/<input>.ts`, re-exportado desde
`shared/schemas/index.ts`. La regla `no-schemas-outside-shared`
convierte esto en un invariante estructural no negociable.

**Paso 6 — wirear las rutas (`30-wire-routes.sh`).**
`apps/api/src/app.module.ts` registra el modulo NestJS del slice;
`apps/web` agrega la superficie UI del slice (diferido para este
scaffold — ver la "anomalia de client/" de §2). La adicion del
path de tsconfig es idempotente: re-correr el script con el alias
ya presente sale con exit 0 + `already applied`.

**Paso 7 — portar tests + BDD (`40-port-tests.sh`).** Los suites
de Vitest se copian con `cp -r`; los archivos `.feature` vienen
del paso 4. `pnpm --filter @features/notifications test` y
`pnpm --filter @features/notifications bdd` ambos salen 0.

**Paso 8 — actualizar los docs (`50-update-docs.sh`).** Anexar
una seccion `## Diseno del dominio — notifications` a
`docs/architecture.md` (la seccion aterriza en la prosa del slice
8, reflejando la estructura de §4 y §5). Espejar la nueva seccion
en `Documents-es/docs/architecture.md` en el mismo atomic commit
(AGENTS.md §13).

**Paso 9 — finalizar (`99-finalize.sh`).** Correr lint, typecheck,
test, BDD. Si los cuatro salen 0, escribir el marker file
`.migration-notifications-done`. Re-runs subsiguientes de
`99-finalize.sh` cortan en el marker.

La trayectoria de ocho pasos es la receta canonica "monolito ->
slice". Corre una vez por slice durante la migracion real desde
`gastos-personales/` (cambio separado, no es scope del slice 8
segun AGENTS.md §11).

{ #section-8 }

## 9. Estrategia de BDD colocalizada

BDD vive **al lado del codigo que testea**, en
`libs/features/<x>/docs/`, no en un folder top-level `tests/` o
`features-e2e/`. La eleccion es estructural — los scenarios y
step-defs colocalizados sobreviven el copy/paste a traves de la
migracion del slice, y el runner de cucumber los descubre con el
mismo Vitest config que ya existe en el slice (agregado en slice
7 PR-7 + el bump de include en slice 8 PR-1
`vitest.config.ts`).

### 9.1 La forma del directorio

```
libs/features/<x>/docs/
├── cucumber.mjs                      # entry del binario cucumber; require()s register.ts
├── *.feature                         # 4-6 archivos Gherkin segun Locked Decision #3
├── __tests__/                        # tests vitest in-slice para el bridge + step-defs
│   └── register.test.ts              # test RED → GREEN del contrato del bridge
├── step-defs/                        # step definitions compartidos
│   ├── common.steps.ts               # genericos ("Given estoy logueado", …)
│   ├── <feature>.steps.ts            # 4-6 archivos reflejando los .feature
│   └── world.ts                      # declara <X>World + create<X>World()
└── support/                          # glue no-step; cargado una sola vez
    ├── env-bootstrap.js              # setea DATABASE_URL etc. antes del load del bridge
    ├── register.ts                   # el bridge de cucumber 13 (patron a9b550d)
    ├── service-context.ts            # singleton a nivel modulo: repos + services
    └── register.cjs                  # opcional; requerido cuando cucumber.mjs no acepta .ts
```

El split es deliberado. **`step-defs/*.steps.ts` carga los
steps en lenguaje humano** ("Given el usuario se loguea con
credenciales validas"). **`support/*.ts` carga el mecanismo que
wirea esos steps a cucumber** (el bridge, el world, el service
context a nivel modulo, el bootstrapping del entorno).

### 9.2 El patron del bridge de cucumber-13 (`a9b550d`)

El bridge en `libs/features/<x>/docs/support/register.ts`
publica cada entrada de `step-defs/*.steps.ts` en los registros
de cucumber 13 `Given`/`When`/`Then`, usando un wrapper
callback-style cuyo `fn.length === argsArray.length`. El
insight clave (capturado del bridge de transactions en `a9b550d`,
ahora espejado en auth via slice 8 PR-1 / commit `af56075`):

Cucumber 13 inspecciona la aridad de cada step registrado. Si
`fn.length === argsArray.length`, toma la rama
`callbackInterface` y empuja un callback `(err, result) =>
void` sobre `argsArray`. Si `fn` devuelve un thenable, toma la
rama `promiseInterface`. Si ambas flags matchean, tira el error
"function uses multiple asynchronous interfaces" y toda la suite
se congela.

El fix de transactions en slice-7 resolvio esto construyendo
un wrapper callback-style:

```ts
function buildWrapper(numCaptures: number, stepFn: StepFn): CallbackWrapper {
  if (numCaptures === 0) {
    return function (done) { /* world via this.inner; resolve/stepFn */ };
  }
  // Sintetizar una funcion con numCaptures capture parameters + done;
  // new Function es la unica forma de setear fn.length dinamicamente.
  const paramNames = Array.from({ length: numCaptures }, (_, i) => `c${i + 1}`).join(", ");
  const stringCalls = Array.from({ length: numCaptures }, (_, i) => `String(c${i + 1})`).join(", ");
  const factory = new Function("stepFn",
    `return function (${paramNames}, done) { /* …world=this.inner; Promise.resolve(stepFn(world, …)).then(…); */ };`,
  );
  return factory(stepFn);
}
```

El wrapper declara exactamente `numCaptures` parametros con
nombre mas un callback `done` al final.
`fn.length === numCaptures + 1`, que matchea con
`argsArray.length`, asi que cucumber toma la rama callback
exclusivamente. El wrapper nunca devuelve una Promise de su
cuerpo sincronico, asi que el guard de dual-interface no puede
dispararse.

Slice 8 PR-1 porto esto verbatim al slice auth
(`libs/features/auth/docs/support/register.ts`) con cinco
sustituciones documentadas en el comentario de header del archivo.
El unico cambio auth-especifico es que `AuthWorld` reemplaza a
`TxWorld`; todo lo demas es byte-identico.

### 9.3 El contrato del bridge — que asserciona cada test

El `docs/__tests__/register.test.ts` de cada slice asseriona
tres cosas (espejado desde
`libs/features/transactions/docs/__tests__/register.test.ts`,
177 LOC, hacia auth en slice 8 PR-1):

1. **La aridad del wrapper matchea `argsArray.length`.** Mockear
   cucumber (spies en `Given`, `When`, `Then`, `setWorldConstructor`).
   Registrar un binding de 2-captures. Invocar el wrapper
   registrado con `thisArg = new AuthWorldWrapper()` y
   `argsArray = ["first", "second", callback]`. Assertir que
   la `fn` interna es llamada con
   `(world.inner, "first", "second")` exactamente, length 3.
   Assertir que el `callback` es invocado una vez sin argumento
   de error.
2. **La regex de capture-group expone ambas capturas.** Assertir
   que la `RegExp` registrada en cucumber expone `match[1]` y
   `match[2]` cuando se matchea contra un string de muestra.
   Esta es la asercion RED que prueba que el bridge transforma
   los placeholders `{string}` en capture groups reales, no
   alternaciones non-capturing.
3. **`setWorldConstructor` se llama una vez al cargar el bridge.**
   Assertir que el spy es invocado al menos una vez cuando
   `import "../support/register.js"` corre, con una clase cuyo
   prototipo expone `.inner: <X>World`.

Tres aserciones, tres clases de regresion. El fix que llevo la
suite de transactions a GREEN en slice-7 (`a9b550d`) cubre las
tres; el port a auth en slice-8 (`af56075`) las preserva.

### 9.4 World state — mutable, reset por scenario

`AuthWorld` y `TxWorld` son objetos de estado **mutables**
pasados como `world` a cada step binding. Cada scenario obtiene
un `AuthWorldWrapper`/`TransactionsWorldWrapper` fresco (la
clase registrada con `setWorldConstructor`); cada scenario ve
un world limpio.

Los campos del world cargan estado a **nivel de step**:
`lastErrorMessage`, `sessionCreated`, `lastUserId`. NO cargan
persistencia cross-scenario — esa vive en `service-context.ts`,
un singleton a nivel modulo construido una vez por carga del
bridge. `service-context.ts` carga el in-memory user repository
y la instancia del servicio (`{ users, authService }` en auth,
`{ prismaUnitOfWork, fxProvider, … }` en transactions), asi que
el estado creado en el scenario A genuinamente persiste hacia
el scenario B cuando el test lo quiere (ej. "Given previamente
me loguee" dentro de una regla multi-scenario).

**La separacion en dos niveles es intencional.** Cruzar las
capas forzaria una de dos fallas:

- Si `service-context` fuera per-scenario, entonces los
  scenarios que dependen de estado previo (el patron del
  password-reset flow "Given un reset token fue emitido antes")
  tendrian que re-seedear estado en cada step — verboso y
  fragil.
- Si `World` fuera el store cross-scenario, entonces el reset
  per-scenario de cucumber romperia toda la garantia de
  persistencia — y `setWorldConstructor` existe precisamente
  para evitar ese patron.

El bridge (`register.ts`) es la **indireccion** que deja al
`thisArg` de cucumber cargar un wrapper fresco por scenario
mientras el singleton sigue vivo. El fix de slice 8 PR-1
preservo este diseno de dos niveles verbatim; no colapsarlo.

### 9.5 Discovery — arrays de include en `vitest.config.ts`

Para que el Vitest del slice descubra
`docs/__tests__/*.test.ts`, el `server/vitest.config.ts` del
slice DEBE incluir el path:

```ts
include: [
  "src/__tests__/**/*.test.ts",
  "../shared/schemas/__tests__/**/*.test.ts",
  "../docs/__tests__/**/*.test.ts",   // test del contrato del bridge BDD
],
```

Transactions tenia esta linea desde slice 7 PR-7 (commit
`36386e1`). Auth no — slice 8 PR-1 agrego la tercer entrada.
Slices futuros heredan el patron del canonico
`libs/features/transactions/server/vitest.config.ts`; una
entrada ausente significa que el test de contrato del bridge
nunca corre y una regresion al estilo
`(world, ...args) => ...` no se atraparia en tests unitarios.

{ #section-9 }

## 10. Reglas de boundary ESLint — el loop de enforcement de cinco reglas

El plugin custom de ESLint en `tools/eslint-plugin-boundary/`
codifica el contrato arquitectonico como un plugin de ESLint en
flat config. Cinco reglas cubren las cuatro boundaries de codigo
mas la boundary de docs. Cada regla viene con un par de fixtures
(un `invalid.<ext>` que debe disparar la regla y un `valid.<ext>`
que debe quedar en silencio); el chequeo de sanidad de las reglas
es `pnpm lint:fixtures`, que DEBE salir 0 en cada commit que
toque el plugin o sus fixtures.

### 10.1 Las cuatro reglas de codigo

| Regla | Forma prohibida | Donde dispara | Por que existe |
|---|---|---|---|
| `no-prisma-outside-core` | `new PrismaClient()`, `new Prisma.<Model>Delegate`, `Prisma.dmmf`, etc. en cualquier lugar excepto `libs/core/database/src/` | Todos los `*.ts` / `*.tsx` / `*.js` / `*.cjs` / `*.mjs` | AGENTS.md §7 — un unico Prisma client; los adapters consumidores llegan solo a `@core/database` |
| `no-schemas-outside-shared` | Zod `z.object(...)`, `z.enum(...)`, `z.discriminatedUnion(...)`, etc. fuera de `libs/features/<x>/shared/schemas/` + `libs/core/config/env.schema.ts` | Todos los archivos code-side | AGENTS.md §7 — un unico lugar para literales de esquema; el form del client y el ZodValidationPipe del server importan el mismo esquema |
| `no-cross-module-import` | `from "@features/<x>/..."` cruzando slices (ej. transactions importa de auth) | Todos los archivos code-side | AGENTS.md §7 — los reach-throughs cross-slice deben pasar por `@core/events` o un port compartido, nunca un path directo |
| `no-client-server-import` | `from "*/server/..."` dentro de `libs/features/<x>/client/*` (y el simetrico `from "*/client/..."` dentro de `libs/features/<x>/server/*`) | La carpeta `client/` cuando exista; el guard simetrico dispara cuando los directorios `client/` lleguen | Enforcement de la split-architecture — el boundary existe por una razon |

Para `no-cross-module-import`, la regla lee el path del archivo
que importa y rechaza el import antes de que llegue al
type-checker. Misma logica para `no-client-server-import`
cuando `client/` aterrice.

### 10.2 La unica regla del lado docs

La quinta regla, `no-mojibake-in-docs`, escanea
`Documents-es/**/*.md` en busca de codepoints CJK / ideograficos
(el drift de auto-translation que poluciono el espejo antes del
slice 8). Usa un visitor `Program` de ESLint mas
`sourceCode.getText()` para reportar cada codepoint ofensor con
path y offset. Cableada en slice 8 PR #3 (`b2f3401`) con
`@eslint/markdown@8.0.3` (pin exacto — sin caret — segun la
mitigacion de Stack-churn de slice-1 §5).

La regla esta scoped a `Documents-es/**/*.md` en
`eslint.config.mjs`, no a `*.ts` / `*.tsx`: sin el scoping, la
prosa en espanol en comentarios TypeScript dispararia la regla
falsamente (clase de regresion que el runner atrapo durante la
triangulacion de slice-8 PR #3). El folder
`tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/`
contiene `invalid.md` (CJK en lineas 6 y 8 — pre-existente),
`secondCjkLine.invalid.md` (CJK en linea 5 — agregado en slice
8 PR #3 para triangular dependencia de posicion de linea), y
`valid.md` (sin CJK).

### 10.3 Contrato del fixture-runner

`tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` es un
runner chiquito y de proposito unico — sin `jest`, sin
`vitest`. Por cada regla en el array `RULES`, hace:

1. glob `__fixtures__/<rule-name>/{valid,invalid}.<ext>`,
2. invoca ESLint programmaticamente sobre cada fixture,
3. assertiona que `valid.*` reporta 0 errores y `invalid.*`
   reporta ≥1 error, y
4. imprime una linea `PASS` / `FAIL` por fixture.

Para `no-mojibake-in-docs`, un paso extra escanea cada
`Documents-es/**/*.md` de produccion (excluyendo
`__fixtures__/`) y assertiona cero codepoints CJK — sale 1 con
el path ofensor en un hit. `pnpm lint:fixtures` DEBE salir 0 en
CI; el commit de slice-8 PR #3 lo hizo parte del merge gate via
el BDD gate + la triangulacion de la regla.

El flag per-rule `allowMultipleInvalids` (slice-8 PR #3
diseno §4.4) mantiene a las cuatro reglas `.ts` en el
invariante de single-invalid-fixture mientras permite a la regla
`.md` acumular casos de triangulacion (hoy: `invalid.md` +
`secondCjkLine.invalid.md`).

### 10.4 Por que ESLint, no un chequeo CI separado

La tentacion natural es enforcer estas reglas en un linter
separado — un script bash, un CLI custom, un pre-commit hook.
Tres razones por las que las reglas viven como ESLint:

1. **Feedback del editor.** ESLint integra con cada editor que
   usa el equipo (VSCode, JetBrains). La misma regla dispara al
   guardar Y en CI Y en `pnpm lint`. Un script standalone tiene
   feedback de CI pero no de editor; el round-trip desde
   "acabo de romper el boundary" hasta "squiggly en VSCode" es
   la unica senial lo suficientemente rapida que los humanos
   captan.
2. **Auto-fix donde aplique.** Algunas reglas de ESLint pueden
   ofrecer sugerencias `--fix`-eables. Ninguna de las cinco
   reglas de boundary lo hace hoy (los fixes serian invasivos),
   pero la puerta queda abierta — y una forma de ESLint es el
   prerequisito.
3. **Un config, un comando.** `eslint.config.mjs` es la unica
   fuente de verdad. Agregar una sexta regla es un PR al plugin
   + un par de fixtures; sin linter separado que wirear.

El plugin de ESLint es intencionalmente CommonJS `.cjs` (no
TypeScript) — segun spec §"Out of scope" item 7, refactorizarlo
a TypeScript es su propio cambio con su propio SDD lifecycle.

{ #section-10 }

## 11. Branch model + workflow SDD

El modelo de branch y las convenciones de commit del scaffold de
referencia son los dos docs que determinan si trabajo nuevo
aterriza de una forma que el equipo puede revisar. La forma es
de dos lados:

- **Branching** es una cadena deliberada que mantiene `main`
  limpio y `develop` deployable.
- **Committing** sigue Conventional Commits para que cada commit
  message responda "que cambio y por que" en una linea; cada
  commit es atomico para que `git revert <sha>` revierta una
  unidad logica de comportamiento.

### 11.1 El grafo de branches

```
main                 (immutable — GitHub-protected)
  │
  └── develop         (branch de trabajo — todo PR apunta aca
       │              hasta que el chain de slice-1 / slice-8 cierre,
       │              despues forkea chains `feat/...`)
       │
       ├── feat/<version>-slice-<N>-<name>-<stage>     (child
       │                                                  chains;
       │                                                  cada uno apunta
       │                                                  al tracker)
       │     │
       │     └── feat/<version>-slice-<N>-<name>-<stage>-<X>
       │           (sub-child; apunta al parent inmediato)
       │
       └── fix/<short-name> / chore/<short-name> / docs/<short-name>
             (PRs one-shot que apuntan a `develop` directamente)
```

**`main` es inmutable.** AGENTS.md §2 mas la regla de branch
protection de GitHub (`no force-push, no delete`) hacen a
`main` write-once desde la perspectiva del equipo. Cada release
tag es un squash-merge desde `develop`; el tag en si es
historia inmutable (`v1.1.1` es el release G2 actual; `v1.1.2`
aterra cuando slice 8 cierre).

**`develop` es la branch de integracion.** Todo PR que no sea
explicitamente un chain sobre un tracker `feat/...` mergea
directo a `develop`. El BDD gate (slice 8 PR-2, commit
`c9d3112`) corre en todo PR-a-`develop`; el failure bloquea el
merge.

**Las feature branches apuntan al tracker.** Cuando un cambio
(un slice) es lo suficientemente grande como para necesitar
PRs chained, el orquestador abre una branch
`feat/<version>-slice-<N>-<name>` desde `develop` y los child
PRs apuntan a ese tracker. El tracker queda open / draft hasta
que cada child PR haya mergeado, despues se squash-mergea a
`develop` para cerrar el slice. Esta es la estrategia
`feature-branch-chain` (definida en `openspec/config.yaml`);
slice-7 y slice-8 la siguen ambos.

**Convencion de nombres de branch** (slice-7 locked, slice-8
mantenido): `feat/<semver-bumped-major.minor>-slice-<N>-<short-name>`.
El bump de version refleja la semantica del cambio: serie
`v1.1.x` para features backward-compatible; `v1.2.x` para
breaking changes; `v2.x` para rewrites mayores. Las branches
child append-ean el stage: `feat/v1.1.2-slice-8-docs-arch-a2`
es el segundo-stage child del tracker de slice-8.

### 11.2 Conventional Commits, atomico, sin trailer de AI

Cada commit message sigue Conventional Commits (AGENTS.md §6):

- **Type**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
  `build`, `ci`, `perf`, `style`. Los titulos de PR usan el
  mismo vocabulario.
- **Scope**: el package o superficie que el cambio toca (auth,
  bdd, web, architecture, lint, migrate). Requerido para trabajo
  de slice; opcional para chores de una linea.
- **Subject**: imperativo presente, ≤72 chars, sin punto final.
  "Add foo" no "Added foo" ni "Adds foo".
- **Body**: explica WHY, no WHAT. El diff es el WHAT.

Atomic commits (AGENTS.md §5): cada commit representa un
comportamiento, fix, migracion o unidad de docs deliverable.
`git revert <sha>` revierte una task limpiamente. Los tests y
los docs quedan con el codigo que verifican.

**Sin trailer de AI-attribution.** AGENTS.md §6 regla dura. Los
commit messages NO DEBEN contener lineas `Co-Authored-By:
<anything-AI>` o equivalentes de AI co-author. El committer es
el humano; el AI fue el ejecutor; el humano es dueno del merge.

### 11.3 Chained-PR + patron del tracker

Cuando un slice excede el budget de revision de 400 lineas, el
orquestador aplica la estrategia de delivery `ask-on-risk`
(declarada en `openspec/config.yaml`): detenerse, mostrar el
forecast de workload al usuario, obtener un split explicito o
un `size:exception` registrado antes de implementar. Slice 8
uso esto dos veces — una para PR-A2 (architecture §7-§12 +
espejo espanol, ~850 LOC), una para PR-B2 (playbook §8-§11 +
espejo espanol, ~950 LOC). El usuario acepto `size:exception`
en ambos casos; la arquitectura y el playbook se enviaron como
PRs unicos con esa anotacion en el body del PR.

El patron de chained-PR usa **tres ritmos**:

1. **Chain simple (1 → 2 → 3)**: ordenado, dependiente. PR #1
   debe aterrizar antes que PR #2; PR #2 antes que PR #3. La
   cadena auth-bridge → BDD-gate en slice 8 tiene esta forma.
2. **Fan-out paralelo**: childs independientes, todos
   apuntando al mismo tracker. Los `PR #3 + PR #4 + PR #6 +
   PR #8` de slice 8 fueron un fan-out — cero deps mutuos,
   todos abiertos despues de que PR #1+PR #2 mergeen.
3. **Secuenciado pese a deps paralelas**: los targets de
   archivo se solapan. `PR #5` (architecture §7-§12 EN) se
   secuencia despues de `PR #4` (architecture §1-§6 EN) porque
   tocan el mismo archivo; `PR #7` (playbook §8-§11) se
   secuencia despues de `PR #6` (playbook §1-§7) por la misma
   razon.

El skill de chained-PR (`feature-branch-chain`) es la
referencia canonica para los pasos del merge-bookkeeping.

{ #section-11 }

## 12. Glosario + cross-references

El glosario completo vive en
`openspec/changes/vertical-slicing-reference-scaffold/` como
parte de las locked decisions de slice-1 (decisiones 1-11).
Esta seccion re-establece solo los terminos que todo lector de
este documento necesita, mas links al material mas profundo.

### 12.1 Glosario (workspace-local)

| Termino | Significado |
|---|---|
| Slice | Un modulo de feature bajo `libs/features/<x>/` con el contrato de las cuatro carpetas (§8.1) |
| Slice-package | Uno de `client/`, `server/`, `shared/`, `docs/` dentro de un slice; corresponde a un subpath export de TypeScript |
| Boundary | Una regla enforzada (ESLint o path alias en `tsconfig.base.json`) que previene que una ubicacion importe desde otra |
| Bridge | El factory de step-binding de cucumber en `libs/features/<x>/docs/support/register.ts`; el patron de wrapper callback-style `a9b550d` |
| `AuthWorld` / `TxWorld` / `<X>World` | Objeto de estado mutable per-scenario pasado como primer argumento a cada step binding de cucumber |
| World-wrapper | La clase registrada con `setWorldConstructor` en el bridge; expone un `.inner: <X>World` tipado y lee el world via `this` |
| Service context | Singleton a nivel modulo construido una vez por carga del bridge; carga persistencia cross-scenario (`{ users, authService }`, etc.) |
| Path alias | Un alias de import `@scope/name` declarado en `tsconfig.base.json`; la unica forma legal de cruzar fronteras de workspace |
| Pure helper | Un paquete bajo `libs/shared-utils/`; sin I/O, sin deps de framework, sin lecturas de env (§7) |
| D-TX-N | Numero de Locked Decision del diseno de transactions de slice-1 (D-TX-5: soft-delete; D-TX-6: decimal.js) |
| G-N | Un outcome gate a nivel proposal (G8: bridge fix; G14-18: outcome gates del slice docs) |

### 12.2 Cross-references

- **Slice-1 source of truth** (locked decisions 1-11, catalogo de
  los 9 domain events, diseno de transactions D-TX-1 through
  D-TX-6): `openspec/changes/vertical-slicing-reference-scaffold/`
- **Slice-8 change folder** (proposal / spec / design / tasks
  de este slice):
  `openspec/changes/slice-8-closing-bdd-and-docs/`
- **Migration playbook** (aterra en `docs/migration-playbook.md`):
  slice 8 PR-B1 (secciones 1-7) + PR-B2 (secciones 8-11 +
  espejo espanol); el playbook es el companero ejecutable del
  ejemplo recorrido "extract notifications" de §8.4.
- **AGENTS.md** (convenciones locales del proyecto — branch
  model, strict TDD, atomic commits, conventional commits,
  boundary rules, SSoT, UI-complete-not-scaffold, regla
  dura del espejo espanol): `AGENTS.md` en el root del repo.
- **README.md** (entry point — resumen del stack, scripts,
  one-shot setup): `README.md` en el root del repo.
- **G2 GitHub release tag** (el milestone al que este slice
  redondea): `v1.1.1` en `main`. Slice-8 cierra incrementando
  a `v1.1.2`.
- **Espejos en espanol existentes** (mantenidos en sync segun
  AGENTS.md §13):
  `Documents-es/openspec/changes/slice-8-closing-bdd-and-docs/design.md`
  (el espejo del diseno, establecido en la fase de diseno del
  slice 8). Este PR agrega `Documents-es/docs/architecture.md`
  solo para las nuevas secciones §7-§12.
- **Evidencia del chain de slice-7** (squash `bb25aab` en
  `develop`; commit bridge-fix `a9b550d` en
  `libs/features/transactions/docs/support/register.ts`): el
  patron canonico del que todo bridge nuevo parte.

{ #section-12 }

_La prosa completa de cada seccion llega en el slice 8. Consulta
`openspec/changes/vertical-slicing-reference-scaffold/tasks.md` §T8.1
(ingles) y §T8.2 (espejo en espanol)._
