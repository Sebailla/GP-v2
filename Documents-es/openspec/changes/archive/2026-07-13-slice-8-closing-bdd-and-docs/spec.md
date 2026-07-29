# Delta Spec — `slice-8-closing-bdd-and-docs`

> **Cambio**: `slice-8-closing-bdd-and-docs` · **Proyecto**: `gastos-personales-reference`
> **Branch**: `develop` (tracker `feat/slice-8-closing-bdd-and-docs`)
> **Modo**: interactivo · **Almacen de artefactos**: hybrid
> **Fecha**: 2026-07-12
> **Propuesta**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226, `sdd/slice-8-closing-bdd-and-docs/proposal`)
> **Cierre del slice-7**: `bb25aab` en `develop` (25/25 BDD de transactions PASS) · **Patron de fix del bridge**: `a9b550d`

---

## Proposito

Bloquear los cuatro sub-slices de `slice-8-closing-bdd-and-docs` como requerimientos
concretos y testeables, con un escenario Given/When/Then por requerimiento. Cada
"deberia" o "puede" en esta spec se resuelve como un `MUST`, `MUST NOT`, o `SHALL`
segun RFC 2119.

Esta spec es intencionalmente **plana** (un unico `spec.md` en la raiz del cambio),
no dividida bajo `specs/<domain>/spec.md`. La forma plana refleja la convencion
de slice-1 de `openspec/changes/vertical-slicing-reference-scaffold/` y coincide
con el layout plano de la propia propuesta.

## Resumen de capacidades

El cambio agrega o modifica exactamente cuatro capacidades. El slice de transactions
existente (ya especfificado en
`openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md`)
queda **sin modificar** por este cambio; la spec existente del slice de auth se
modifica solo por el cambio de wrapper de 8.1.

| #   | Capacidad                                          | Tipo   | Resultados                                                                                                  |
| --- | -------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| 8.1 | Fix del auth BDD bridge                            | MODIFY | Suite BDD de auth: 18/18 PASS en <2s; test Vitest del bridge 2/2 PASS; sin regresion en transactions 25/25.  |
| 8.2 | Gate BDD de CI                                     | ADD    | Nuevo job `bdd` en `.github/workflows/ci.yml` corre en cada PR a `develop`/`main`; el fallo se ve en el PR. |
| 8.3 | Activacion de lint `no-mojibake-in-docs`           | MODIFY | `pnpm lint` marca CJK en cualquier `Documents-es/**/*.md`; `pnpm lint:fixtures` sale 0 con la regla activa. |
| 8.4 | Docs de arquitectura + playbook de migracion (y espejos) | ADD    | `docs/architecture.md` ≥400 LOC; `docs/migration-playbook.md` ≥600 LOC + 7 `.sh` idempotentes; espejos existen y estan limpios de CJK. |

---

## Sub-slice 8.1 — Fix del auth BDD bridge (MODIFY)

### Capacidad: Contrato del auth BDD bridge

El bridge de cucumber 13 del slice auth en
`libs/features/auth/docs/support/register.ts` MUST publicar cada binding de step
desde `step-defs/*.ts` en los registros `Given`/`When`/`Then` de cucumber usando
un wrapper cuyo `fn.length` coincida exactamente con el `argsArray.length` de
cucumber para el conteo de capturas del binding, de modo que cucumber 13 tome
la rama `callbackInterface` exclusivamente y NO lance el error "function uses
multiple asynchronous interfaces".

#### Tipo del world de auth — declaracion explicita (resuelve pregunta §8 #1 de la propuesta)

El slice auth **MUST** declarar el siguiente tipo de world en
`libs/features/auth/docs/step-defs/world.ts` (ya presente, MUST NOT removerse)
y vincularlo mediante una llamada `setWorldConstructor` en el bridge:

```ts
export interface AuthWorld { /* ver libs/features/auth/docs/step-defs/world.ts lineas 55-97 */ }
export function createAuthWorld(): AuthWorld { /* lineas 103-126 */ }
```

El bridge **MUST** introducir una nueva llamada `setWorldConstructor(AuthWorldWrapper)`
(actualmente ausente — verificado via `grep setWorldConstructor` sobre
`libs/features/auth/**` retornando cero matches) que construya:

```ts
class AuthWorldWrapper {
  public readonly inner: AuthWorld = createAuthWorld();
}
```

El wrapper es el `thisArg` del bridge. El `.inner` del wrapper es lo que cada
binding de step recibe como primer argumento. **El bridge MUST NOT pasar el
wrapper mismo a los bindings de step — MUST pasar `wrapper.inner`.**

Esta forma refleja la del wrapper de transactions en
`libs/features/transactions/docs/support/register.ts` lineas 125-129
(`class TransactionsWorldWrapper { public readonly inner: TxWorld = createTransactionsWorld(); }`)
de modo que un unico modelo mental aplica a ambos slices.

**Adaptador para el `service-context.ts` existente del slice auth**: el bridge
**MUST NOT** alterar `service-context.ts` (segun propuesta §2.1 "do NOT modify …
`service-context.ts`"). El `ServiceContext` de `service-context.ts` (servicio de
auth + UserRepository en memoria) es un singleton a nivel de modulo construido
una vez al cargar el bridge y compartido entre escenarios — esto es independiente
del ciclo de vida de world por escenario de cucumber. El world de auth seguira
cargando las aserciones a nivel de step (`sessionCreated`, `lastErrorMessage`,
etc.) mientras que el service context carga la persistencia entre escenarios
(el mapa de usuarios en memoria). Estas dos incumbencias son distintas y el fix
del bridge MUST NO las debe confundir.

#### Patron de bridge — debe reusar `a9b550d`

El bridge **MUST** reusar `buildWrapper(numCaptures, stepFn)` de
`a9b550d` (`libs/features/transactions/docs/support/register.ts` lineas
72-118), porteado verbatim con las siguientes sustituciones:

- El string de mensaje de error `"[transactions/support/register]"` **MUST**
  reescribirse a `"[auth/support/register]"` (cada ocurrencia en el cuerpo
  de la factory).
- El import `TxWorld` **MUST** reemplazarse con un import `AuthWorld` desde
  `../step-defs/world.js`.
- Los helpers `countStringPlaceholders` y `buildPattern` (lineas 143-165 del
  bridge de transactions) **MUST** copiarse verbatim.

El camino rapido de 0 capturas y el camino de `new Function()` para aridades
arbitrarias de captura **MUST** estar ambos presentes. El camino de aridades
arbitrarias es necesario porque los 75 step bindings del slice auth incluyen
28 con al menos un placeholder `{string}` y conteos variables de captura
(verificado por
`grep -hE 'pattern: "(.*\{string\}.*)' libs/features/auth/docs/step-defs/*.ts |
wc -l` = 28).

#### Registro de step bindings — superficie completa a re-publicar

El bridge **MUST** publicar cada entrada de
`libs/features/auth/docs/step-defs/common.steps.ts` (37 entradas, export
`stepDefinitions`) y `libs/features/auth/docs/step-defs/realm.steps.ts`
(38 entradas, export `stepDefinitions`) — total 75 step bindings. Verificado
al 2026-07-12 via `grep -c '^\s\+keyword: "' libs/features/auth/docs/step-defs/*.ts`.

#### Reglas de transformacion de patron — declaradas

Para cada `pattern` de binding, el bridge **MUST**:

1. Reemplazar los placeholders `{string}` por el grupo de captura regex
   `((?:"[^"]*"|[^\\s"]+))` — los `((` exteriores vuelven cada placeholder un
   grupo de captura real (el `getInvocationParameters` de cucumber depende
   de que `String.prototype.matchAll` retorne las capturas).
2. Escapar los caracteres de barra diagonal con `\/`.
3. Anclar el regex con `^` y `$`.

#### Contrato de invocacion del wrapper (verbatim desde `a9b550d`)

Para un binding con N capturas `{string}`, el `argsArray` de cucumber al momento
de invocar tiene la forma `[capture_1, ..., capture_N, (err, result) => void]`
(length = N + 1). El wrapper **MUST**:

1. Declarar exactamente N parametros nombrados de captura mas un callback
   `done` al final. `fn.length === N + 1`.
2. Leer `world` desde `this.inner` (cucumber pasa la instancia de
   `AuthWorldWrapper` como `thisArg`); error si `world === undefined`.
3. Llamar `void Promise.resolve(stepFn(world, String(cap_1), ...,
   String(cap_N))).then(() => done(), (err) => done(err instanceof Error ? err : new Error(String(err))))`.
4. Nunca retornar una Promise desde el cuerpo sincronico (asi la guarda de
   interfaz dual no puede dispararse).

#### Contrato del test RED

`libs/features/auth/docs/__tests__/register.test.ts` MUST agregarse
(espejando `libs/features/transactions/docs/__tests__/register.test.ts`,
177 LOC) y MUST afirmar como minimo lo siguiente:

1. **Aridad del wrapper + world desde `.inner`**: mockear
   `@cucumber/cucumber` (spies de `Given`, `When`, `Then`, `setWorldConstructor`).
   Registrar un binding de 2 capturas `{ keyword: "Given", pattern:
   "the value is {string} and {string}", fn: vi.fn() }`. Invocar el wrapper
   registrado con `thisArg = new AuthWorldWrapper()` y
   `argsArray = ["first", "second", callback]`. Afirmar que el `fn` interno
   es llamado con `expect.objectContaining` que coincida con `world.inner`
   (un `AuthWorld` fresco) en la posicion 0, `"first"` en la posicion 1,
   `"second"` en la posicion 2, y length exactamente 3. Afirmar que el
   `callback` se invoca una vez sin argumento de error.
2. **Regex de grupo de captura**: afirmar que el `RegExp` registrado ante
   cucumber expone las dos capturas via `match[1]` / `match[2]` cuando se
   matchea contra `'the value is "alpha" and "beta"'`. Esta es la afirmacion
   RED que el bug de regex sin grupo de captura del slice auth falla hoy.
3. **`setWorldConstructor` se llama una vez al cargar el bridge**: afirmar
   que el spy se invoca al menos una vez durante
   `import "../support/register.js"`, con una clase/constructor cuyas
   instancias expongan un `.inner` de tipo `AuthWorld`. Esta es la afirmacion
   RED que prueba que el bridge ahora vincula un wrapper (hoy: cero llamadas
   a `setWorldConstructor`).

El archivo de test MUST ser ejecutable via `pnpm --filter @features/auth test` y
salir 0 con 2 PASS (segun el contrato declarado de la propuesta; el test de
transactions corre 2 casos por analogia).

#### MUST NOT tocar

El cambio del bridge **MUST NOT** modificar ninguno de:

- `libs/features/auth/docs/cucumber.mjs`
- `libs/features/auth/docs/support/env-bootstrap.js`
- `libs/features/auth/docs/support/service-context.ts`
- Cualquier archivo `*.feature` bajo `libs/features/auth/docs/`
- Cualquier archivo `*.steps.ts` bajo `libs/features/auth/docs/step-defs/`
- `libs/features/transactions/docs/support/register.ts` (la fuente canonica
  de `buildWrapper`)

#### Puerta de resultado (G1–G5 de propuesta §5)

`pnpm --filter @features/auth bdd` sale 0 con 18/18 PASS en <2s.
`pnpm --filter @features/auth test` sale 0 con el nuevo test del bridge
≥2/2 PASS. `pnpm --filter @features/transactions bdd` continua pasando
25/25 (sin regresion).

#### Escenario: El wrapper del bridge enruta correctamente un binding de 2 capturas

- GIVEN un step binding con `pattern: "the value is {string} and {string}"` y `fn: vi.fn()`
- WHEN el bridge publica el binding y cucumber invoca el wrapper con `thisArg = new AuthWorldWrapper()` y `argsArray = ["first", "second", callback]`
- THEN el `fn` interno es llamado con `(world.inner, "first", "second")` exactamente
- AND `callback` se invoca una vez sin argumento de error

#### Escenario: El regex de grupo de captura expone ambas capturas

- GIVEN que el bridge registro un binding con 2 placeholders `{string}`
- WHEN el `RegExp` registrado se matchea contra `'the value is "alpha" and "beta"'`
- THEN `match[1]` es igual a `'"alpha"'` y `match[2]` es igual a `'"beta"'`

#### Escenario: El bridge de auth llama a setWorldConstructor al cargar

- GIVEN un proceso vitest fresco con `@cucumber/cucumber` mockeado
- WHEN `import "../support/register.js"` corre (carga del bridge)
- THEN el spy `setWorldConstructor` se invoca al menos una vez
- AND la clase registrada produce instancias con un `.inner: AuthWorld` tipado

---

## Sub-slice 8.2 — BDD como gate de CI (ADD)

### Capacidad: Job de BDD en CI

`.github/workflows/ci.yml` MUST anexarse con un 5to job (`bdd`) que corra
`pnpm turbo run bdd` contra un servicio Postgres 16-alpine, gateando cada
`pull_request` y cada `push` a `develop`/`main` en una suite BDD que pase.

#### Forma del job — declarada

```yaml
bdd:
  name: BDD (Cucumber)
  runs-on: ubuntu-latest
  needs: [static, test]
  timeout-minutes: 30
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: gastos_reference_test
      ports:
        - 5432:5432
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gastos_reference_test
    NEXTAUTH_SECRET: ci-only-do-not-use-in-prod
    NEXTAUTH_URL: http://localhost:3000
    WEB_ORIGIN: http://localhost:3000
    API_URL: http://localhost:3001
    PORT: 3001
    NODE_ENV: test
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 11.10.0 }
    - uses: actions/setup-node@v4
      with: { node-version: 22.13.0, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - name: Generate Prisma client
      env: { DATABASE_URL: postgresql://placeholder.localhost/db }
      run: pnpm --filter @core/database exec prisma generate
    - name: Apply Prisma migrations
      run: pnpm --filter @core/database exec prisma migrate deploy
      env: { DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gastos_reference_test }
    - name: Run BDD
      run: pnpm turbo run bdd
```

El job **MUST** declarar `needs: [static, test]` para que corra solo despues
de que pasen los gates de lint + unit/integration (saltarse BDD en un fallo
solo-estatico ahorra ~3 min de tiempo de CI). `timeout-minutes: 30` es el
limite superior; la linea base de slice-7 muestra corridas BDD completas en
<30s con caches frias.

#### Set de disparadores — declarado

El bloque `on:` al tope de `ci.yml` ya cubre
`pull_request: [develop, main]` y `push: [develop, main]`. El nuevo job
**MUST NOT** reducir el set de disparadores.

#### Que pasa cuando BDD falla

El job `bdd` falla el workflow (comportamiento por defecto de GitHub Actions —
sin `continue-on-error`). El fallo se ve en la lista de checks del PR dentro
de la ventana de timeout de 30 minutos. El log de cucumber se sube como output
del step (no se requiere paso extra de `actions/upload-artifact` — GitHub retiene
los logs de step por 90 dias por defecto).

#### MUST NOT agregar en este sub-slice

Este sub-slice **MUST NOT** agregar el job de Playwright e2e. El placeholder
de slice-1 en linea 188 de `ci.yml` cubre tanto BDD como e2e; este slice entrega
**solo** el gate BDD. El job de e2e se difiere a un slice futuro.

#### Escenario: El job BDD aparece en un PR a develop

- GIVEN un PR abierto contra `develop` despues de que este cambio aterrice
- WHEN el workflow de CI corre
- THEN la lista de checks contiene un check `BDD (Cucumber)`
- AND el check pasa dentro del timeout de 30 minutos

#### Escenario: Una regresion del bridge falla el gate BDD

- GIVEN el archivo del bridge de auth ha sido revertido al estado roto (el wrapper de rest-args `(world, ...args) => ...`)
- WHEN el job BDD corre en un PR
- THEN el step `pnpm turbo run bdd` sale con codigo no cero
- AND el check `BDD (Cucumber)` del PR queda marcado como fallido

---

## Sub-slice 8.3 — `@eslint/markdown` + activacion de `no-mojibake-in-docs` (MODIFY)

### Capacidad: Deteccion de CJK en `Documents-es/**/*.md` via ESLint

La regla `no-mojibake-in-docs` (ya implementada en
`tools/eslint-plugin-boundary/rules/no-mojibake-in-docs.cjs`, 65 LOC) MUST
dispararse durante `pnpm lint` contra cada archivo `Documents-es/**/*.md`. El
visitor `Program` de la regla lee el texto fuente y reporta cada codepoint
CJK via `context.report` — `@eslint/markdown` provee el AST de markdown asi
que el hook `Program` por defecto de ESLint se dispara.

#### Pin de `@eslint/markdown` — declarado

El `package.json` del workspace MUST pinear `@eslint/markdown` a la version
exacta **`8.0.3`** (ultima publicada; verificada via
`npm view @eslint/markdown version` al 2026-07-12). El pin es exacto
(sin rango caret) segun la mitigacion "Stack churn" de slice-1 §5: el parser
ha enviado cambios incompatibles de API de parser entre versiones menores
historicamente. El pin MUST estar en `devDependencies` en el `package.json`
raiz del repo. Futuros bumps son mecanicos — abrir un cambio nuevo, bumpear,
re-correr la suite de fixtures.

#### Estado de fixtures — pre-existente (la afirmacion de la propuesta es inexacta)

La propuesta §2.3 afirma que la fixture `invalid.md` "no existe" — esto es
**incorrecto**. La fixture ya esta presente en
`tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/invalid.md`
(8 LOC; contiene caracteres CJK de dos alfabetos del este de Asia como ejemplo
en las lineas 6 y 8) junto al `valid.md` (8 LOC; sin CJK).
El runner (`scripts/run-fixtures.mjs`) ya cubre este path de fixture
mediante `detectCjkInMdFixture` (lineas 94-108).

**Por lo tanto 8.3 NO necesita crear la fixture.** 8.3 MUST agregar un
caso de triangulacion `secondCjkLine.invalid.md` en
`tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md`
conteniendo exactamente un caracter CJK en una linea que no sea la primera —
para probar que la regla detecta CJK independientemente de la posicion en la
linea (atrapa una clase de regresion donde el runner solo escanea los primeros
N caracteres).

#### Cambios en `eslint.config.mjs` — declarados

`eslint.config.mjs` MUST agregar dos bloques:

1. Un bloque de parser (despues del bloque existente `**/*.{ts,tsx}` en
   lineas 42-52) que registre `@eslint/markdown` como parser para
   `**/*.md`:

   ```js
   {
     files: ["**/*.md"],
     languageOptions: {
       parser: markdownParser,
       parserOptions: { ecmaVersion: 2022, sourceType: "module" },
     },
   }
   ```

2. Un bloque de aplicacion de regla (despues del bloque aplicable
   globalmente existente en lineas 57-59) restringido a
   `Documents-es/**/*.md`:

   ```js
   {
     files: ["Documents-es/**/*.md"],
     plugins: { "@gpr/boundary": boundary },
     rules: { "@gpr/boundary/no-mojibake-in-docs": "error" },
   }
   ```

El import `boundary` (linea 13) MUST reusarse; NO agregar un segundo import
del plugin.

#### Expansion de objetivos de `run-fixtures.mjs`

El runner MUST agregar un paso de expansion de objetivos (una nueva funcion,
sin cambios a los loops de reglas existentes): despues de que el loop de
fixtures por regla complete, el runner MUST globear `Documents-es/**/*.md`
(excluyendo el directorio de fixtures via el patron ignore existente en
linea 30 de `eslint.config.mjs`) y afirmar que ningun archivo en el arbol
de espejos de produccion contiene un caracter CJK. La verificacion usa el
`findCjkInText` existente de `tools/eslint-plugin-boundary/lib/cjk-detect.cjs`.

Si cualquier `Documents-es/**/*.md` de produccion contiene CJK, el runner
sale 1 con la ruta del archivo ofensor + offset impresos. La lista de
objetivos del runner en el header del script MUST actualizarse para
documentar este alcance expandido.

#### Puertas de resultado (G9–G13 de propuesta §5)

`pnpm lint:fixtures` sale 0 con la regla activa y la fixture `secondCjkLine`
disparandose. `pnpm lint` sale con codigo no cero cuando cualquier
`Documents-es/**/*.md` contiene CJK. `eslint.config.mjs` declara
`@eslint/markdown` como parser para `**/*.md`. `valid.md` continua
reportando 0 errores; `invalid.md` continua reportando ≥1 errores;
`secondCjkLine.invalid.md` reporta ≥1 errores.

#### Escenario: Cablear `@eslint/markdown` expone CJK en el espejo de produccion

- GIVEN `Documents-es/docs/architecture.md` se muta para contener un unico caracter CJK (por ejemplo, un ideograma han) mid-parrafo
- WHEN `pnpm lint` corre
- THEN ESLint sale con codigo no cero
- AND el mensaje de error nombra la ruta del archivo y el offset

#### Escenario: La fixture de triangulacion secondCjkLine se dispara

- GIVEN `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` contiene un unico caracter CJK en linea 5 (no linea 1)
- WHEN `pnpm lint:fixtures` corre
- THEN el runner reporta `PASS  no-mojibake-in-docs/secondCjkLine.invalid.md  (errors>=1)`

---

## Sub-slice 8.4 — Expansion de `docs/architecture.md` + `docs/migration-playbook.md` (ADD)

### Capacidad: Prosa de arquitectura + playbook con espejos en espanol

Los dos artefactos de arquitectura del repo MUST ser prosa completa (no stubs).
El documento de arquitectura MUST cubrir cada invariante de layout que el repo
de referencia enforza. El playbook MUST dar una receta concreta y ejecutable
para migrar un modulo Next.js + NestJS a la forma
`libs/features/<x>/{client,server,shared}`.

#### Formato del playbook — RESUELTO (pregunta §8 #2 de la propuesta)

La **Decision Bloqueada #4** de la propuesta de slice-1 declara al playbook
en **formato dual**: prosa `.md` + shells idempotentes hermanos
`scripts/migrate/<stage>.sh` (uno por etapa del playbook). La Decision
Bloqueada #4 es parte de la umbrella de slice-1 y NUNCA fue enmendada. Por
lo tanto el slice 8 **MUST honrar el formato dual**.

Razon para honrar (no romper):

- Romper una Decision Bloqueada requiere un nuevo decision record estilo ADR.
  Tal record no existe en el alcance del slice 8.
- El formato dual fue especificamente diseñado para consumidores AI-agent
  (`scripts/migrate/*.sh`) — slice 8 no tiene un argumento de framing
  solo-humano que lo invalide.
- La tarea T8.5 de slice-1 nombra los siete scripts exactos
  (`00-preflight.sh` hasta `99-finalize.sh`); los nombres son contrato,
  no sugerencia.

Los siete scripts **MUST** ser idempotentes: re-correrlos en una rama vacia
es un no-op o imprime `already applied` y sale 0.

#### `docs/architecture.md` — secciones y presupuesto de LOC

El stub existente de 77 LOC MUST expandirse a **≥400 LOC, ≤600 LOC**. Secciones:

| #   | Seccion                                                                | Presupuesto (LOC) | Limite duro |
| --- | ---------------------------------------------------------------------- | ----------------- | ----------- |
| 1   | Overview + non-goals                                                   | 30-50             | 50          |
| 2   | Layout del repositorio (apps, libs, tools, openspec, docs, scripts)   | 80-120            | 120         |
| 3   | Tooling del monorepo (pnpm, turbo, path aliases de tsconfig, eslint)   | 50-70             | 70          |
| 4   | Diseno de dominio: auth (`libs/features/auth/{client,server,shared}`)  | 50-70             | 70          |
| 5   | Diseno de dominio: transactions (`libs/features/transactions/{...}`)   | 50-70             | 70          |
| 6   | `libs/core` (database, events, config)                                 | 50-70             | 70          |
| 7   | `libs/shared-utils`                                                    | 20-30             | 30          |
| 8   | Contrato de slicing de `libs/features/<x>` (client / server / shared)  | 50-70             | 70          |
| 9   | Estrategia de BDD colocalizado (`docs/*.feature` + `step-defs/*.steps.ts`) | 30-50          | 50          |
| 10  | Fronteras ESLint (las cinco reglas, que prohibe cada una, sanidad de fixtures) | 50-70      | 70          |
| 11  | Modelo de ramas + workflow SDD                                        | 30-50             | 50          |
| 12  | Glosario + referencias cruzadas                                        | 20-30             | 30          |

Los limites duros son topes superiores; los totales MUST caer entre 400 y 600
LOC segun G14 de propuesta §5.

#### `docs/migration-playbook.md` — secciones y presupuesto de LOC

El playbook MUST ser un archivo NUEVO de **≥600 LOC, ≤1000 LOC**. Secciones:

| #   | Seccion                                              | Presupuesto (LOC) | Limite duro |
| --- | ---------------------------------------------------- | ----------------- | ----------- |
| 1   | Proposito + audiencia (revisor humano + agente IA)   | 30-50             | 50          |
| 2   | Etapa 00 — preflight                                 | 60-90             | 90          |
| 3   | Etapa 10 — extract domain                            | 100-150           | 150         |
| 4   | Etapa 20 — create feature slice                      | 100-150           | 150         |
| 5   | Etapa 30 — wire routes                               | 80-120            | 120         |
| 6   | Etapa 40 — port tests (Vitest + BDD)                 | 80-120            | 120         |
| 7   | Etapa 50 — update docs (architecture + glossary)     | 60-90             | 90          |
| 8   | Etapa 99 — finalize (PR checklist, rollback)         | 60-90             | 90          |
| 9   | Fronteras ESLint como loop de enforcement            | 30-50             | 50          |
| 10  | Cuando introducir `@core/events`                     | 30-50             | 50          |
| 11  | Referencias cruzadas + glosario                      | 20-30             | 30          |

**Cada seccion de etapa MUST incluir ≥3 snippets antes/despues de codigo o de
arbol de archivos** (segun G15 de propuesta §5).

#### `scripts/migrate/*.sh` — inventario exacto de archivos

Siete scripts MUST crearse en `scripts/migrate/`:

1. `00-preflight.sh` — verifica `pnpm`, `docker`, `.git`, sin cambios sin commit.
2. `10-extract-domain.sh` — copia `src/modules/<feature>/{domain,application,infrastructure}` en `libs/features/<feature>/server/src/`.
3. `20-create-feature-slice.sh` — scaffoldea el esqueleto `libs/features/<feature>/{client,server,shared}` (package.json, tsconfig.json, src/index.ts).
4. `30-wire-routes.sh` — registra `@features/<feature>` en los paths de `tsconfig.base.json` y en `apps/api/src/app.module.ts`.
5. `40-port-tests.sh` — copia las suites de Vitest al slice; agrega el scaffold BDD `docs/*.feature`.
6. `50-update-docs.sh` — agrega la seccion `<feature>` a `docs/architecture.md`; refleja al `Documents-es/`.
7. `99-finalize.sh` — validacion final pre-PR (lint, typecheck, test, bdd, e2e).

Cada script MUST protegerse con `set -euo pipefail`, imprimir un header al
empezar, y terminar con `echo "stage NN: already applied" && exit 0` cuando
se re-corre en una rama vacia (el contrato de idempotencia de la Decision
Bloqueada #4 de slice-1).

Cada script MUST ser testeable por idempotencia. Un test RED en
`scripts/migrate/__tests__/idempotency.test.sh` (NUEVO; usa `bats` o un loop
bash minimo) MUST afirmar: correr el script dos veces en una rama temp fresca;
ambas invocaciones salen 0; la segunda invocacion imprime `already applied`
(o equivalente). GREEN: los scripts implementan la guarda. TRIANGULATE: falta
`pnpm`, falta `docker`, falta `.git`. REFACTOR: compartir un helper
`ensure-tools.sh` entre los siete.

#### Espejos en espanol

`Documents-es/docs/architecture.md` y
`Documents-es/docs/migration-playbook.md` MUST existir. El espejo MUST ser
una traduccion tecnica al espanol (no localizacion cultural) del original
en ingles segun AGENTS.md §13. Terminos estandar de la industria quedan en
ingles: `commit`, `merge`, `branch`, `ADR`, `PR`, `slice`, `stage`, `BDD`,
`e2e`, `lint`, `typecheck`, `test`, `build`. Prosa en espanol por lo demas —
oraciones traducidas, no transpuestas palabra por palabra.

Ambos espejos MUST estar en el mismo commit atomico que su fuente en ingles
(regla dura de AGENTS.md §13).

#### Verificacion de mojibake

El comando de verificacion:

```bash
grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md
```

MUST retornar vacio (exit 1 = sin match). La verificacion MUST correrse
manualmente antes de que cada commit de docs aterrice.

#### Puertas de resultado (G14–G18 de propuesta §5)

`docs/architecture.md` ≥400 LOC con las 12 secciones de arriba.
`docs/migration-playbook.md` ≥600 LOC con 11 secciones, cada una con ≥3
snippets antes/despues. `scripts/migrate/*.sh` existe con 7 archivos.
`Documents-es/docs/architecture.md` + `Documents-es/docs/migration-playbook.md`
existen. La verificacion de mojibake retorna vacio.

#### MUST NOT tocar

Este sub-slice **MUST NOT** migrar `gastos-personales/` (AGENTS.md §11). El
playbook se entrega aqui; la migracion real corre en un cambio aparte con
su propio ciclo SDD (segun slice-1 §3 Decision Bloqueada #7 + linea 822 de
la propuesta de slice-1). Este sub-slice MUST NOT introducir ningun fixture
e2e nuevo; el playbook referencia e2e solo por nombre.

#### Escenario: El documento de arquitectura alcanza el piso de LOC

- GIVEN que `docs/architecture.md` se reescribe desde el stub de 77 LOC
- WHEN `wc -l docs/architecture.md` corre
- THEN el conteo es ≥400 y ≤600
- AND las 12 secciones listadas arriba estan todas presentes (grep por cada encabezado de seccion)

#### Escenario: El playbook tiene ≥3 snippets antes/despues por etapa

- GIVEN que `docs/migration-playbook.md` se crea
- WHEN `grep -c '^\s*```' docs/migration-playbook.md` corre
- THEN el conteo es ≥ (3 snippets × 2 fences × 7 etapas) = 42 bloques fenceados como minimo

#### Escenario: Los scripts son idempotentes

- GIVEN que `scripts/migrate/__tests__/idempotency.test.sh` esta escrito
- WHEN el test corre cada uno de los 7 scripts dos veces en una rama temp fresca
- THEN cada script sale 0 en ambas invocaciones
- AND la segunda invocacion imprime `already applied` (o equivalente a stage-NN)

#### Escenario: Los espejos en espanol existen y estan limpios de CJK

- GIVEN que ambos docs en ingles se commitean en el mismo commit atomico que sus espejos en espanol
- WHEN `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md` corre
- THEN el codigo de salida es 1 (sin match)
- AND `wc -l Documents-es/docs/{architecture,migration-playbook}.md` reporta conteos dentro de ±20% de los originales en ingles

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226, `sdd/slice-8-closing-bdd-and-docs/proposal`)
- **Cierre del slice-7**: `bb25aab` en `develop` (squash de PR-51; 25/25 BDD de transactions PASS)
- **Fuente del patron de fix del bridge**: commit `a9b550d` en `libs/features/transactions/docs/support/register.ts`
- **Template de spec de transactions** (para referencia de forma, NO objetivo de delta):
  `openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md` (507 LOC)
- **Decision Bloqueada #4 de slice-1** (formato dual del playbook):
  `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` linea 93
- **Tarea T8.5 de slice-1** (contrato de 7 scripts idempotentes):
  `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` linea 876
- **AGENTS.md §11** (fuera de alcance, reflejado en propuesta §4)
- **AGENTS.md §13** (regla dura del espejo en espanol)
- **Fixtures existentes** (pre-existentes, NO creadas por 8.3):
  `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/{invalid,valid}.md`
- **Placeholder de CI** (reemplazado por 8.2):
  `.github/workflows/ci.yml` lineas 187-196
- **Bridge de auth existente** (reemplazado por 8.1):
  `libs/features/auth/docs/support/register.ts` (80 LOC, roto en lineas 38-76)
- **Bridge de transactions existente** (template para 8.1):
  `libs/features/transactions/docs/support/register.ts` (188 LOC, arreglado en `a9b550d`)
- **Superficie de step bindings de auth** (75 entradas — 37 common + 38 realm — a re-publicar):
  `libs/features/auth/docs/step-defs/{common,realm}.steps.ts`
- **Tipo de world de auth** (ya declarado, sera envuelto por 8.1):
  `libs/features/auth/docs/step-defs/world.ts` lineas 55-126

---

## Preguntas abiertas resueltas (propuesta §8)

### Pregunta #1 — Contrato de `setWorldConstructor` del slice auth

**Respuesta**: El slice auth actualmente NO tiene llamada a `setWorldConstructor`
(verificado por `grep setWorldConstructor libs/features/auth/` retornando
cero matches — solo el slice de transactions lo usa). 8.1 MUST introducir
`setWorldConstructor(AuthWorldWrapper)` en el bridge, reflejando el wrapper
de transactions en `libs/features/transactions/docs/support/register.ts`
lineas 125-129.

La interfaz del world de auth existente (`AuthWorld`, declarada en
`libs/features/auth/docs/step-defs/world.ts` lineas 55-97) es el contenedor
de estado canonico y MUST permanece sin cambios — el wrapper solo provee la
indireccion `.inner` que requiere el mecanismo de `thisArg` de cucumber.

La mitigacion R1 de la propuesta (leer `service-context.ts` antes de aplicar)
se realizo. `service-context.ts` (235 LOC) es un singleton a nivel de modulo
de `{ users: InMemoryUserRepository, authService: AuthService }`. Se construye
una vez por carga del bridge y se comparte entre escenarios. El `AuthWorld`
por escenario carga las aserciones a nivel de step; el `ServiceContext` carga
la persistencia entre escenarios. El fix del bridge de 8.1 **MUST NOT**
altera este diseno de dos niveles.

### Pregunta #2 — Formato del playbook

**Respuesta**: Honrar la **Decision Bloqueada #4** de slice-1: formato dual
(prosa `.md` + shells idempotentes hermanos `scripts/migrate/<stage>.sh`,
uno por etapa del playbook). Los siete nombres de scripts de la tarea T8.5
de slice-1 son el contrato: `00-preflight.sh`, `10-extract-domain.sh`,
`20-create-feature-slice.sh`, `30-wire-routes.sh`, `40-port-tests.sh`,
`50-update-docs.sh`, `99-finalize.sh`. La idempotencia es obligatoria.

El framing del orquestador decia "slice 1 introdujo un contrato de formato
dual `.md` + `.sh`" — el framing es correcto; el artefacto NO se entrego
(la umbrella de slice-1 cerro sin entregar el playbook), que es precisamente
por que el slice 8 lo retoma. La Decision Bloqueada #4 no ha sido enmendada;
honrarla.

---

## Fuera de alcance

Reflejado de propuesta §4 (que refleja AGENTS.md §11) mas las adiciones
especificas de slice-8:

1. Cualquier cosa en AGENTS.md §11 (i18n mas alla de `en`/`es`, Sentry, rate-limit,
   OAuth mas alla de Google, hardening de prod, observabilidad, UI de audit log,
   enforzamiento de gate de cobertura en CI, migracion de `gastos-personales/`).
2. Agregar escenarios BDD nuevos (slice 8 solo arregla el bridge).
3. Migrar `gastos-personales/` a vertical slicing — el playbook se entrega
   aqui; la migracion corre en un cambio aparte.
4. Tocar la evidencia del chain del slice-7 (`a9b550d`, `bb25aab`).
5. Agregar el job de Playwright e2e a CI — el placeholder de slice-1 en
   linea 188 cubre tanto BDD como e2e; slice 8 entrega **solo** el gate BDD.
6. Reemplazar el patron del bridge de `a9b550d` con cualquier otra cosa —
   reinventar esta prohibido.
7. Refactorizar `tools/eslint-plugin-boundary` a TypeScript (las reglas son
   `.cjs`; convertirlas es su propio cambio).
8. Lenguaje de artefactos distinto del ingles (strings de UI, comentarios,
   identificadores quedan en ingles; el espanol vive solo en el espejo).
9. Agregar un gate de cobertura a CI.
10. Construir la automatizacion del espejo OneNote (la excepcion documentada
    en la regla de docs-mirror de AGENTS.md).
11. Tocar `openspec/changes/vertical-slicing-reference-scaffold/`
    (la umbrella de slice-1 es inmutable para slice 8).

---

## Pronostico de carga de revision

Segun la estrategia de entrega `ask-on-risk` del orquestador y el presupuesto
de revision de 400 lineas:

| Sub-slice | LOC estimado | Riesgo de presupuesto | Decision necesaria antes de apply |
| --------- | ------------ | --------------------- | --------------------------------- |
| 8.1       | ~180-220     | Bajo                  | No                                |
| 8.2       | ~30-40       | Bajo                  | No                                |
| 8.3       | ~40-60       | Bajo                  | No                                |
| 8.4 PR-A  | ~800-1100    | Alto                  | **Si** — el orquestador se detiene segun `ask-on-risk` si LOC > 1200 |
| 8.4 PR-B  | ~1500-2200   | Alto                  | **Si** — el orquestador se detiene segun `ask-on-risk` si LOC > 1800; se esperan 3 PRs encadenados (esqueleto, etapas, espejo) |

**PRs encadenados recomendados**: Si — el slice 8 se entrega como 5 PRs
encadenados bajo `feat/slice-8-closing-bdd-and-docs` (8.1 → 8.2 → 8.3 → 8.4
PR-A → 8.4 PR-B, con 8.4 PR-B probablemente partiendose mas en el momento del
apply).

---

## Siguiente fase

`next_recommended`: **`design`**.

La fase de diseno (sdd-design) producira:
- La adaptacion exacta de `buildWrapper` para auth (diff a nivel de paths contra
  el bridge de transactions).
- La forma YAML de CI con cada `env` var alineada al job `test` existente
  (slice-1 ya tiene el bloque de servicio Postgres en lineas 85-101 — el
  diseno debe declarar reuso vs copia).
- El contenido del bloque de parser de `eslint.config.mjs` (segun la superficie
  de API de `@eslint/markdown@8.0.3`).
- Los cuerpos de los 7 `scripts/migrate/*.sh` (uno por etapa; patron de guarda
  de idempotencia).
- Un outline de `docs/architecture.md` mostrando la jerarquia de encabezados
  de cada seccion.
- Un outline de `docs/migration-playbook.md` con las ubicaciones de los ≥3
  snippets antes/despues por etapa.

`status`: **`success`** · `skill_resolution`: **`paths-injected`**
(architecture-patterns, turborepo, work-unit-commits) · `risks`: R1
(WARNING — divergencia de world-contract resuelta como se documento arriba),
R2 (WARNING — la expansion de docs en ~2500 LOC totales puede requerir mas
particion de PRs al momento del apply), R3 (SUGGESTION — pin de
`@eslint/markdown` a 8.0.3 es el ultimo al momento de la spec; documentar
el procedimiento de bump para upgrades futuros).
