# Diseno Tecnico — `slice-8-closing-bdd-and-docs`

> **Estado**: borrador · fase de diseno
> **Proyecto**: `gastos-personales-reference` · **Branch**: `develop` (tracker `feat/slice-8-closing-bdd-and-docs`)
> **Almacen de artefactos**: hybrid · **Modo**: interactivo · **Delivery**: `ask-on-risk` · **Chain**: `feature-branch-chain` · **Presupuesto de revision**: 400 lineas
> **TDD estricto**: activo (AGENTS.md §4)
> **Autor**: orquestador SDD → ejecutor `sdd-design`
> **Fecha**: 2026-07-12
> **Entradas leidas**: `proposal.md` (Engram #2226), `spec.md` (Engram #2228), `libs/features/transactions/docs/support/register.ts` (188 LOC, post-`a9b550d`), `libs/features/transactions/docs/__tests__/register.test.ts` (177 LOC), `libs/features/auth/docs/support/register.ts` (80 LOC, roto), `libs/features/auth/docs/step-defs/world.ts` (126 LOC), `libs/features/auth/docs/support/service-context.ts` (235 LOC), `libs/features/auth/server/{package.json,vitest.config.ts,tsconfig.json}`, `libs/features/transactions/server/vitest.config.ts`, `eslint.config.mjs` (66 LOC, sin parser markdown cableado), `tools/eslint-plugin-boundary/{index.cjs,rules/no-mojibake-in-docs.cjs,lib/cjk-detect.cjs,scripts/run-fixtures.mjs,__fixtures__/no-mojibake-in-docs/...}`, `.github/workflows/ci.yml` (196 LOC, lineas 187-196 placeholder), `package.json` (root, sin `@eslint/markdown`), `docs/architecture.md` (77 LOC stub), `openspec/changes/vertical-slicing-reference-scaffold/{design.md,tasks.md,proposal.md}`

---

## 1. Vision general de la arquitectura

```
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │                        slice-8-closing-bdd-and-docs                          │
   │                                                                              │
   │   ┌────────────────────────┐       ┌─────────────────────────────────────┐    │
   │   │  8.1 auth BDD bridge   │       │       8.2 BDD CI gate               │    │
   │   │  fix (chained PR #1)   │──────▶│  .github/workflows/ci.yml (+30 LOC) │    │
   │   │                        │  dep  │                                     │    │
   │   │  libs/features/auth/   │       │  needs: [static, test] · postgres   │    │
   │   │  docs/support/register │       │  -service · pnpm turbo run bdd      │    │
   │   │  .ts (+ ~150 LOC)      │       │                                     │    │
   │   │  + docs/__tests__/     │       └─────────────────────────────────────┘    │
   │   │  register.test.ts      │                                                  │
   │   │  (NEW ~177 LOC)        │       ┌─────────────────────────────────────┐    │
   │   │  + vitest.config.ts    │       │   8.3 no-mojibake-in-docs wire      │    │
   │   │  include bump (+1 LOC) │       │  (chained PR #3, paralelo a 8.2)   │    │
   │   └────────────────────────┘       │                                     │    │
   │                                    │  eslint.config.mjs:                 │    │
   │   ┌────────────────────────────────│   - @eslint/markdown pin @ 8.0.3    │    │
   │   │  8.4 docs prose + scripts      │   - parser block for **/*.md        │    │
   │   │  (chained PR #4 + PR #5)      │   - rule block para Documents-es/   │    │
   │   │                                │     *.md                            │    │
   │   │  PR-A: docs/architecture.md    │  run-fixtures.mjs:                   │    │
   │   │     + Documents-es/docs/…/…    │   - soporte multi-invalid fixture   │    │
   │   │     (~500 LOC + 500 mirror)    │                                     │    │
   │   │                                │  __fixtures__/…/secondCjkLine       │    │
   │   │  PR-B: docs/migration-         │   .invalid.md (NEW)                  │    │
   │   │  playbook.md (≥600 LOC) +      │                                     │    │
   │   │  7 scripts/migrate/*.sh +      └─────────────────────────────────────┘    │
   │   │  mirrors (≥600 LOC + 600 LOC)                                                │
   │   └─────────────────────────────────────────────────────────────────────────┘
   │                              ▲                                                 │
   │                              │ evidencia del chain de slice 7                │
   │                              │ bb25aab (squash), a9b550d (bridge fix)         │
   └──────────────────────────────────────────────────────────────────────────────┘
```

Grafo de dependencias: **8.1 debe mergear primero** (8.2 corre `pnpm turbo run bdd`; si 8.1 no esta mergeado el gate se traba en timeouts). 8.3 no tiene dependencias. 8.4 no tiene dependencias. Orden del PR chain: **PR #1 (8.1) → PR #2 (8.2) → PR #3 (8.3) || PR #4 (8.4-PR-A) + PR #5 (8.4-PR-B)** (8.3, PR-A, PR-B son paralelizables contra la branch tracker despues de que 8.1 aterrice).

---

## 2. Sub-slice 8.1 — Fix del auth BDD bridge

### 2.1 Decision de arquitectura: `buildWrapper` compartido vs duplicado en el slice auth

**Eleccion**: **DUPLICAR `buildWrapper`, `countStringPlaceholders`, `buildPattern`** en `libs/features/auth/docs/support/register.ts` (verbatim desde `libs/features/transactions/docs/support/register.ts` lineas 72-165), con la tabla de sustituciones de §2.2 abajo. **NO extraer a un `@core/bdd-bridge` compartido ni similar.**

**Alternativas consideradas**:

| Opcion | Pro | Contra | Veredicto |
|---|---|---|---|
| **A. Duplicar** | (1) Cero acoplamiento entre slices; cada slice es dueno de su propio bridge. (2) Segun AGENTS.md §7 las reglas de boundary prohíben el cross-module import; un bridge compartido seria cross-slice (auth+transactions). (3) El riesgo de drift es bajo porque la API de `userCodeRunner` de cucumber 13 es estable en un horizonte de 12 meses. | Riesgo de drift a largo plazo. | **ELEGIDA** |
| B. `libs/core/bdd-bridge/` compartido | Single source of truth (DRY). | (1) Dep compartida cross-slice viola el espiritu de `no-cross-module-import` salvo que se coloque en `@core/`; `@core/` esta reservado para infraestructura segun el diseno de slice-1 §3.4 / decision records. (2) Cucumber es una preocupacion de TEST; ponerlo en `@core/` pondria infra de test en codigo importado por produccion. (3) El slice transactions ya esta mergeado y estable — refactorizarlo para un bridge compartido anade scope sin beneficio. | Rechazada |
| C. Re-export desde `@features/transactions/docs/support/register` | Previene el drift mecanicamente. | (1) Import cross-slice directo (`libs/features/auth/docs/support/register.ts → libs/features/transactions/docs/support/register`) — explicitamente prohibido por la regla de boundary `no-cross-module-import` (diseno slice-1 §3.4 tabla linea 316). (2) Acopla un slice estable a un refactor en curso. | Rechazada |

**Rationale (AGENTS.md §8 "single source of truth")**: AGENTS.md §8 nombra tres preocupaciones de SSoT — esquemas Zod, cliente Prisma, y efectos secundarios entre modulos. El factory del bridge de cucumber **no** es una de esas preocupaciones; es detalle de implementacion del archivo bridge de cada slice. AGENTS.md §7 dice "los literales de esquema Zod viven solo en `libs/features/<x>/shared/schemas/`" — por analogia, el factory del bridge debe vivir en `libs/features/<x>/docs/support/`. Cada slice es dueno de su bridge de la misma forma que cada feature es duena de sus slices.

**Requisitos de port verbatim** (DEBEN cumplirse para cualquier port futuro de bridge):

1. Las cuatro cadenas `"[transactions/support/register]"` DEBEN convertirse en `"[auth/support/register]"` (3 ocurrencias: linea 77, 107, y el camino de early-return de 0-captures).
2. El import `TxWorld` (linea 44) DEBE reemplazarse por `AuthWorld` importado desde `../step-defs/world.js`.
3. El cast `as unknown as new () => TxWorld` (linea 128) DEBE convertirse en `cast as unknown as new () => AuthWorld`.
4. La asercion `this.inner` (`(this as { inner: TxWorld } | undefined)?.inner`, linea 75) DEBE convertirse en `(this as { inner: AuthWorld } | undefined)?.inner`.
5. `countStringPlaceholders` y `buildPattern` (lineas 143-165) DEBEN copiarse **byte-a-byte** — son funciones puras de `pattern: string`; no se refactoriza.

### 2.2 `world.ts` de auth + nuevo `AuthWorldWrapper` — forma declarada

**Nueva clase** en `libs/features/auth/docs/support/register.ts` (colocada en la misma posicion que el wrapper de transactions, despues de `buildWrapper`):

```ts
setWorldConstructor(
  class AuthWorldWrapper {
    public readonly inner: AuthWorld = createAuthWorld();
  } as unknown as new () => AuthWorld,
);
```

Esto refleja `libs/features/transactions/docs/support/register.ts` lineas 125-129 — misma forma, distinto nombre.

**Contrato de invocacion del wrapper** es verbatim del transactions: `stepFn(world.inner, String(cap_1), …, String(cap_N))`, `fn.length === N + 1`, world via `this.inner`, no se devuelve Promise del cuerpo sincronico. Ver spec §8.1 lineas 132-145.

**Imports** que el bridge DEBE agregar al area de la linea 24:

```ts
import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber";
import { stepDefinitions as authCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as authRealm } from "../step-defs/realm.steps.js";
import { createAuthWorld, type AuthWorld } from "../step-defs/world.js";
```

### 2.3 Superficie de step bindings — verbatim

El bridge DEBE publicar cada entrada de `step-defs/common.steps.ts` (35 entradas, verificado por `grep -c '^\s\+keyword: "' libs/features/auth/docs/step-defs/common.steps.ts` = 35) y `step-defs/realm.steps.ts` (40 entradas). **Total 75 step bindings.** El spec dice 37+38=75; el conteo real es 35+40=75. El diseno usa el conteo verificado.

`ALL_BINDINGS = [...authCommon, ...authRealm]` DEBE hacer spread de ambos arrays, haciendo matching con la linea 49 del slice transactions.

### 2.4 Archivo de test RED — `libs/features/auth/docs/__tests__/register.test.ts`

**Replicar exactamente** el test de transactions (`libs/features/transactions/docs/__tests__/register.test.ts`, 177 LOC). Tres aserciones requeridas segun spec §8.1 lineas 152-176:

1. **Wrapper arity + world via `.inner`**: registrar un binding de 2-captures con `vi.fn()`. Invocar el wrapper registrado con `thisArg = new AuthWorldWrapper()` y `argsArray = ["first", "second", callback]`. Asserir `stepFn.mock.calls[0]` es igual a `[world.inner, "first", "second"]` (longitud exactamente 3) y `callback` invocado una vez sin argumento de error. El tipo "FakeWorld" en el archivo de test es `interface FakeWorld { readonly inner: AuthWorld }` (reflejando la forma de la linea 95 del test de transactions, reorientado a campos de AuthWorld: solo verificar la identidad del objeto world).
2. **Regex de capture-group**: asserir `match[1]` === `'"alpha"'` y `match[2]` === `'"beta"'` cuando matchea contra `'the value is "alpha" and "beta"'`. RED porque el bridge de auth existente en la linea 60 usa el no-capturante `(?:"[^"]*"|[^ s"]+)` (le falta el `((` exterior).
3. **`setWorldConstructor` invocado al menos una vez**: incluir `setWorldConstructor: vi.fn()` en el modulo mockeado (mock de transactions linea 62). Importar `../support/register.js` y luego asserir que el spy fue llamado una vez con una clase cuyo prototipo contiene `.inner: AuthWorld`.

**Patron de imports** (vitest + cucumber mockeado, port exacto desde transactions lineas 48-87):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@cucumber/cucumber", () => {
  const given = vi.fn(); const when = vi.fn(); const thenFn = vi.fn();
  const setWorldConstructor = vi.fn();
  return {
    Given: (p: unknown, fn: unknown) => given(p, fn),
    When:   (p: unknown, fn: unknown) => when(p, fn),
    Then:   (p: unknown, fn: unknown) => thenFn(p, fn),
    setWorldConstructor: (fn: unknown) => setWorldConstructor(fn),
    __mocks__: { given, when, thenFn, setWorldConstructor },
  };
});
import { registerBinding } from "../support/register.js";
import * as cucumberMock from "@cucumber/cucumber";
```

### 2.5 Descubribilidad en Vitest — REQUIRED `vitest.config.ts` bump

**Hallazgo de descubrimiento**: `libs/features/transactions/server/vitest.config.ts` (linea 23) incluye `"../docs/__tests__/**/*.test.ts"`. **`libs/features/auth/server/vitest.config.ts` NO lo incluye** — su include es `["src/__tests__/**/*.test.ts", "../shared/schemas/__tests__/**/*.test.ts"]`. El nuevo test de register NO sera descubierto por `pnpm --filter @features/auth test` salvo que 8.1 agregue la linea.

**DEBE AGREGARSE** a `libs/features/auth/server/vitest.config.ts` (3ra entrada del array, haciendo matching con transactions):

```ts
include: [
  "src/__tests__/**/*.test.ts",
  "../shared/schemas/__tests__/**/*.test.ts",
  "../docs/__tests__/**/*.test.ts",  // NEW (8.1)
],
```

Esto es **una LOC extra** fuera del scope listado del spec pero mecanicamente requerida para el outcome GREEN (`pnpm --filter @features/auth test` exits 0 con 2 PASS). El orquestador DEBE tratar esto como in-scope para 8.1; se senala explicitamente para que el orquestador no se rehuse a aplicar cuando el diff de 8.1 exceda por unas lineas el estimador de LOC del spec.

### 2.6 Separacion del service-context (mitigacion R1, verificado)

`libs/features/auth/docs/support/service-context.ts` (235 LOC) declara el **singleton a nivel de modulo** `{ users: InMemoryUserRepository, authService: AuthService }` construido una vez por carga del bridge. El `AuthWorld` per-scenario lleva las aserciones a nivel de step (`sessionCreated`, `lastErrorMessage`); el singleton lleva la persistencia cross-scenario (el mapa de usuarios en memoria).

**El bridge 8.1 NO DEBE alterar `service-context.ts`** (spec §8.1 lineas 82-90 + 180-188). El diseno de dos niveles es intencional y el bridge es la indireccion que permite que `thisArg` de cucumber lleve un `AuthWorldWrapper` fresco por scenario mientras el singleton vive separado.

### 2.7 NO SE DEBE tocar — declarado

- `libs/features/auth/docs/cucumber.mjs`
- `libs/features/auth/docs/support/env-bootstrap.js`
- `libs/features/auth/docs/support/service-context.ts`
- `*.feature` bajo `libs/features/auth/docs/`
- `*.steps.ts` bajo `libs/features/auth/docs/step-defs/`
- `libs/features/transactions/docs/support/register.ts` (fuente canonica)

### 2.8 Outcome gates

- `pnpm --filter @features/auth bdd` exit 0 con **18/18 PASS** en <2s (conteo verificado de escenarios via `grep -c "Scenario:" libs/features/auth/docs/*.feature | awk`).
- `pnpm --filter @features/auth test` exit 0 con **2/2 PASS** sobre `register.test.ts`.
- `pnpm --filter @features/transactions bdd` continua pasando **25/25** (sin regresion).

---

## 3. Sub-slice 8.2 — BDD como CI gate

### 3.1 Forma del YAML — declarada

Append un quinto job al final de `.github/workflows/ci.yml` (despues del job `build` en las lineas 143-185 y despues del comentario placeholder de BDD/e2e en las lineas 187-196). El quinto job DEBE reemplazar el comentario placeholder; el bloque de comentario DEBE eliminarse.

```yaml
  # ---- 5. BDD (Cucumber) gate ------------------------------------------------
  # Corre `pnpm turbo run bdd` contra un servicio Postgres. Gatea cada PR a
  # develop/main con un suite BDD pasando; surface del log de cucumber ante
  # fallo mediante la retencion default de GitHub (90 dias).
  #
  # El job e2e de Playwright esta intencionalmente diferido a un slice
  # posterior (per spec §8.2 lineas 295-298 + proposal §4.5). Agregando solo
  # BDD aqui se mantiene el chain angosto y revisable.
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
        env: { DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gastos_reference_test }
        run: pnpm --filter @core/database exec prisma migrate deploy

      - name: Run BDD
        run: pnpm turbo run bdd
```

### 3.2 Decisiones de reuso vs copia

**Bloque de servicio** (Postgres, ports, healthcheck): COPIADO verbatim del job `test` existente en `.github/workflows/ci.yml` lineas 85-101. **NO refactorizado a un anchor YAML** — el guard de review-budget (400 LOC, 1 PR) del spec no puede absorber trabajo de extraccion de anchors YAML, y los anchors YAML en GitHub Actions tienen casos bordes bien conocidos (env sensible, resolucion de action `with: { }`). El duplicado son 17 LOC; la alternativa (`anchors: &pg-service` + reuso) ahorra 8 LOC y anade 2 LOC de metadata del anchor — neto 6 LOC ahorradas, no vale el costo de ofuscacion.

**Env vars**: COPIADAS verbatim del job `test` lineas 102-109. Misma rationale (sin anchor YAML, aceptando el duplicado de 7 lineas).

**Versiones de acciones** (`pnpm/action-setup@v4` `version: 11.10.0`, `setup-node@v4` `node-version: 22.13.0`): COPIADAS verbatim de los tres jobs existentes (lineas 32-39, 116-122, 151-156). Segun la mitigacion "Stack churn" de slice-1 §5; el pin es obligatorio.

### 3.3 NO SE DEBE

- Sin step `actions/upload-artifact` para los logs de cucumber — GitHub retiene los step logs durante 90 dias por default. Agregar un step de artifact gasta un presupuesto de artifact de 1MB+ sobre datos que GitHub ya guarda.
- Sin `continue-on-error: true` en el step `Run BDD`. El punto entero de este job es **fallar el PR** ante una regresion del bridge.
- SIN narrowing del set de trigger `on:` (ya cubre `pull_request: [develop, main]` y `push: [develop, main]` en las lineas 4-7). El nuevo job DEBE heredar esos.
- SIN job Playwright e2e en este slice (diferido per spec §8.2 lineas 295-298; el comentario placeholder de slice-1 en las lineas 187-196 menciona ambos, pero 8.2 entrega **solo** BDD).

### 3.4 Semantica de trigger

El job hereda el `on:` a nivel de workflow (lineas 4-7). Corre en cada `pull_request` a `develop`/`main` Y cada `push` a `develop`/`main`. El bloque `concurrency` (lineas 11-13) cancela runs duplicados en el mismo ref — aplica transitivamente.

---

## 4. Sub-slice 8.3 — Wire de `@eslint/markdown` + activacion de `no-mojibake-in-docs`

### 4.1 Pin de `@eslint/markdown` — declarado

Agregar al **root** `package.json` `devDependencies` (NO a `@features/auth` o `@features/transactions`, NO a `tools/eslint-plugin-boundary` — `eslint.config.mjs` es cargado por el proceso eslint root, que resuelve via el root):

```json
"@eslint/markdown": "8.0.3"
```

**Pin exacto** (sin caret, sin tilde) per spec §8.3 lineas 329-336. Segun la mitigacion "Stack churn" de slice-1 §5: el parser historicamente ha enviado cambios que rompen la API del parser entre minor versions.

### 4.2 Cambios en `eslint.config.mjs` — declarados

**Bloque 1 — bloque del parser** (insertar despues del bloque TypeScript existente en lineas 42-52, antes del bloque de reglas globales en lineas 56-59):

```js
import markdownParser from "@eslint/markdown";

{
  files: ["**/*.md"],
  languageOptions: {
    parser: markdownParser,
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
},
```

El import `boundary` de la linea 13 se REUSA (import unico de plugin — spec §8.3 lineas 384-385); NO agregar un segundo import de plugin.

**Bloque 2 — bloque de aplicacion de la regla** (insertar despues de linea 59, antes de `client-only` en linea 62):

```js
{
  files: ["Documents-es/**/*.md"],
  plugins: { "@gpr/boundary": boundary },
  rules: { "@gpr/boundary/no-mojibake-in-docs": "error" },
},
```

**`boundary.configs.recommended`** en linea 53-59 incluye `no-mojibake-in-docs` (per `tools/eslint-plugin-boundary/index.cjs` linea 53) pero esta restringido a `**/*.{ts,tsx,js,mjs,cjs}` (linea 57). La regla se dispara en CADA archivo en ese glob — no solo `.ts` — porque `no-mojibake-in-docs.cjs` no tiene filter de path (solo usa un visitor `Program` y obtiene `sourceCode.getText()`). En archivos `.ts`/`.tsx` la regla se dispararia erroneamente ante comentarios en prosa espanola en archivos `.ts`. **La config actual de ESLint NO lintea archivos `*.md`** (no hay parser markdown). Despues del wiring de 8.3, el Bloque 2 NUEVO del glob `Documents-es/**/*.md` restringe la regla al arbol mirror.

**El Bloque 1 (parser)** DEBE ir antes de cualquier bloque de reglas que matchee archivos `.md` — ESLint flat config aplica el parser primero.

### 4.3 Archivo de fixture de triangulacion — `secondCjkLine.invalid.md`

**Path**: `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` (sibling del `invalid.md` existente).

**Contenido** (~6 LOC, con un unico caracter CJK en una linea no primera):

```md
# Spanish mirror - secondCjkLine

Este documento prueba que el linter detecta CJK
independientemente de la linea donde aparezca.

Linea intencional con un solo ideograma disperso: U+6F22
```

Donde `U+6F22` es la notacion en tiempo de diseno para el ideograma CJK en el codepoint 0x6F22; la fase de apply DEBE sustituir el codepoint real cuando escriba el archivo de fixture (asi `findCjkInText` reporta el hit). Esto captura una clase de regresion donde el runner/regla solo escanea los primeros N caracteres o la primera linea. El caracter CJK DEBE terminar en la **ultima** linea (linea 5), forzando el escaneo del documento entero.

### 4.4 Actualizacion del runner — `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs`

**Dos hallazgos de descubrimiento** bloquean el escenario "secondCjkLine fixture firing" del spec, en su forma verbatim:

1. **Glob de linea 62**: `glob(\`**/${variant}*.${ext}\`)` matchea TANTO `invalid.md` COMO `secondCjkLine.invalid.md`. Las lineas 141-145 lanzan un error cuando hay mas de un invalid matcheado.

2. **Lineas 162-232** tratan a invalid como "exactamente un fixture → ≥1 errors". Un segundo fixture invalid con match de path hace match con el mismo glob `**/invalid*.md` y es rechazado.

**El runner DEBE actualizarse** para soportar un modelo de "invalids nombrados" para la regla `no-mojibake-in-docs`. Dos implementaciones aceptables:

- **Opcion A — preferida**: cambiar el loop de reglas (lineas 115-235) para permitir `invalids.length >= 1` para `no-mojibake-in-docs` especificamente (otras reglas mantienen `length === 1`). Agregar un booleano por regla `allowMultipleInvalids` al array `RULES` (lineas 47-53).

- **Opcion B**: renombrar el glob del runner de `**/invalid*.md` a `**/invalid.md` (match exacto solamente) para la regla `no-mojibake-in-docs`, y agregar un loop SEPARADO que itere todos los `invalid*.md` cuando la regla opta in. Mayor churn en el diff.

**Elegir Opcion A** — adicion de un solo booleano, menor LOC. Sketch de implementacion:

```js
const RULES = [
  "no-client-server-import",
  "no-prisma-outside-core",
  "no-schemas-outside-shared",
  "no-cross-module-import",
  { name: "no-mojibake-in-docs", allowMultipleInvalids: true },
];
```

Entonces en la asercion actual "exactamente un invalid" (lineas 137-145), branch sobre `rule.allowMultipleInvalids`:

```js
if (!rule.allowMultipleInvalids && invalids.length > 1) {
  throw new Error(`ambiguous invalid fixture …`);
}
```

Para `no-mojibake-in-docs`, itera TODOS los archivos `invalid*.md`. Cada llamada a `detectCjkInMdFixture` del archivo debe reportar `>=1` errores. El comentario header del runner (lineas 1-30) DEBE actualizarse para documentar la semantica multi-invalid solo para reglas `.md`.

### 4.5 Escaneo CJK del arbol de produccion (spec §8.3 lineas 387-399)

El runner DEBE agregar un paso de expansion de target despues del loop de fixtures por regla: glob `Documents-es/**/*.md` (el ignore existente en `eslint.config.mjs` linea 30 excluye `__fixtures__/**`, entonces el glob ve solo los mirrors de produccion), llamar `findCjkInText` sobre el contenido de cada archivo, y exit 1 si cualquier mirror de produccion contiene CJK. Sketch de implementacion (insercion despues de linea 235, antes del log "Fixture summary" en linea 238):

```js
console.log("");
console.log("Production Documents-es/**/*.md CJK scan:");
const prodMirrorFiles = [];
for await (const entry of glob("Documents-es/**/*.md", { cwd: repoRoot })) {
  prodMirrorFiles.push(resolve(repoRoot, entry));
}
let prodViolations = 0;
for (const file of prodMirrorFiles) {
  const text = readFileSync(file, "utf8");
  const hits = findCjkInText(text);
  if (hits.length === 0) {
    console.log(`PASS  ${relative(repoRoot, file)}  (clean)`);
    passed += 1;
  } else {
    console.error(`FAIL  ${relative(repoRoot, file)}  (${hits.length} CJK codepoints)`);
    failures.push({
      rule: "no-mojibake-in-docs",
      fixture: relative(repoRoot, file),
      reason: `production mirror contains ${hits.length} CJK codepoints`,
    });
    failed += 1;
    prodViolations += 1;
  }
}
```

El suite de fixtures DEBE correr este escaneo en `develop` para asserir que los mirrors existentes (e.g. `Documents-es/docs/architecture.md` stub de slice-1) pasan — lo cual hacen, porque el mirror existente solo contiene caracteres latin espanol extendidos (verificado via `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md` returns empty al momento del diseno).

### 4.6 Outcome gates

- `pnpm lint:fixtures` exit 0; el runner reporta `PASS  no-mojibake-in-docs/Documents-es/invalid.md (errors>=1)`, `PASS  no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md (errors>=1)`, `PASS  no-mojibake-in-docs/valid.md (errors=0)`, y `PASS` para cada `Documents-es/**/*.md` de produccion.
- `pnpm lint` exit non-zero cuando se agrega un caracter CJK a cualquier `Documents-es/**/*.md`.
- `eslint.config.mjs` declara el parser `@eslint/markdown` para `**/*.md` y la regla para `Documents-es/**/*.md`.

---

## 5. Sub-slice 8.4 — Expansion de `docs/architecture.md` + `docs/migration-playbook.md`

### 5.1 `docs/architecture.md` — outline por secciones (presupuestos de LOC per spec §8.4 tabla 462)

| # | Heading | Budget (LOC) | Files referenciados |
|---|---|---|---|
| 1 | `# Architecture` + Overview + non-goals | 30-50 | openspec/changes/vertical-slicing-reference-scaffold/{proposal,design}.md §1 |
| 2 | `## Repository layout` | 80-120 | arbol de paths completo; AGENTS.md §7 boundaries |
| 3 | `## Monorepo tooling` | 50-70 | package.json, turbo.json, tsconfig.base.json |
| 4 | `## Domain design — auth` | 50-70 | libs/features/auth/{client,server,shared,docs}, auth.config.ts |
| 5 | `## Domain design — transactions` | 50-70 | libs/features/transactions/{client,server,shared,docs}, los 6 Prisma adapters |
| 6 | `## libs/core (database, events, config)` | 50-70 | libs/core/{database,events,config}/, prisma.config.ts, env.schema.ts |
| 7 | `## libs/shared-utils` | 20-30 | libs/shared-utils/decimal/ (decimal.js wrapper per D-TX-6) |
| 8 | `## Slicing contract — libs/features/<x>/{client,server,shared}` | 50-70 | cada package.json, tsconfig.json de slice |
| 9 | `## BDD colocated strategy` | 30-50 | docs/*.feature + step-defs/, cucumber.mjs, vitest.config.ts include |
| 10 | `## ESLint boundaries (the five rules)` | 50-70 | tools/eslint-plugin-boundary/, las reglas no-prisma-outside-core/no-schemas-outside-shared/no-cross-module-import/no-client-server-import/no-mojibake-in-docs, sanity de fixtures |
| 11 | `## Branch model + SDD workflow` | 30-50 | AGENTS.md §2/§3, openspec/config.yaml `phases`, feature-branch-chain, ask-on-risk |
| 12 | `## Glossary + cross-references` | 20-30 | taxonomia de 9 events (slice-1 §3.5), locked decisions #1-#11, links a openspec/changes/{vertical-slicing-reference-scaffold,slice-8-closing-bdd-and-docs}/ |

**Total**: 460-680 LOC; tope duro 600 LOC. Los headers de seccion + anchors de cross-reference se reutilizan en `Documents-es/docs/architecture.md` (el mirror se traduce, no se localiza).

**Estilo**: cada seccion arranca con una declaracion imperativa de 1-2 oraciones sobre el invariante, luego prosa explicando el POR QUE; cerrando con un anchor `{ #section-N }` para que el mirror espanol pueda espejar-por-numero-de-heading sin renombrar.

### 5.2 `docs/migration-playbook.md` — outline por secciones (presupuestos de LOC per spec §8.4 tabla 484)

| # | Heading | Budget (LOC) | Senales fuente |
|---|---|---|---|
| 1 | `# Migration playbook` + Purpose + audience (human reviewer + AI agent) | 30-50 | slice-1 Locked Decision #10 |
| 2 | `## Stage 00 — preflight` | 60-90 | `scripts/migrate/00-preflight.sh` (este slice) |
| 3 | `## Stage 10 — extract domain` | 100-150 | src/modules/<f>/{domain,application,infrastructure} → libs/features/<f>/server/src |
| 4 | `## Stage 20 — create feature slice` | 100-150 | scaffold client/server/shared packages |
| 5 | `## Stage 30 — wire routes` | 80-120 | tsconfig.base.json paths, apps/api/src/app.module.ts |
| 6 | `## Stage 40 — port tests (Vitest + BDD)` | 80-120 | src/__tests__/ + docs/*.feature |
| 7 | `## Stage 50 — update docs` | 60-90 | docs/architecture.md (este slice) |
| 8 | `## Stage 99 — finalize` | 60-90 | lint, typecheck, test, bdd validation |
| 9 | `## ESLint boundaries as the enforcement loop` | 30-50 | contrato `pnpm lint:fixtures` exit-0 |
| 10 | `## When to introduce @core/events` | 30-50 | el canal de events cross-slice |
| 11 | `## Cross-references + glossary` | 20-30 | links a artefactos slice-1/8 |

**Total**: 650-1030 LOC; tope duro 1000 LOC per spec §8.4 tabla 485.

**Cada seccion de stage DEBE incluir ≥3 snippets de antes/despues de codigo O file-tree** (spec §8.4 linea 499). Cada par de snippets va dentro de bloques ``` ```fenced``` ```; no se usa una macro `code-block before/after` — el playbook es markdown plano para legibilidad del revisor humano. Estructura ejemplo para Stage 10:

```md
### Before — `src/modules/<feature>/domain/`

```ts
// src/modules/<feature>/domain/<aggregate>.ts
```

### After — `libs/features/<feature>/server/src/domain/`

```ts
// libs/features/<feature>/server/src/domain/<aggregate>.ts
```
```

Token overhead de un snippet de stage: ~12 LOC por snippet × 3 snippets × 2 fences = ~72 LOC/stage, factorizado en los presupuestos por stage arriba.

### 5.3 `scripts/migrate/*.sh` — inventario exacto de archivos + contrato de idempotencia

Contrato de cada script (spec §8.4 tabla 503-516):

| Filename | Input | Accion | Output | Guardia de idempotencia | Codigos de salida |
|---|---|---|---|---|---|
| `00-preflight.sh` | none | `which pnpm docker git` + `git status --porcelain` (debe estar vacio) + Node 22 check | echo "preflight: OK" | imprime "preflight: already applied" cuando todos los checks pasan (no hay estado que escribir) | 0 ok / 1 missing-tool / 2 dirty-tree |
| `10-extract-domain.sh <feature>` | `<feature>` arg posicional | `cp -r src/modules/<feature>/{domain,application,infrastructure} libs/features/<feature>/server/src/` despues de verificar target-empty | libs/features/<feature>/server/src/{domain,application,infrastructure}/<br>echo "stage 10: applied <feature>" | si el directorio target existe + no esta vacio: echo "stage 10: already applied <feature>" exit 0 | 0 / 1 missing-arg / 2 target-non-empty-conflict |
| `20-create-feature-slice.sh <feature>` | `<feature>` arg posicional | crear `package.json`, `tsconfig.json`, `src/index.ts` para los packages client + server + shared | tres packages + entrada de path alias en tsconfig.base.json | si `libs/features/<feature>/` existe: echo "stage 20: already applied <feature>" exit 0 | 0 / 1 missing-arg / 2 conflict |
| `30-wire-routes.sh <feature>` | `<feature>` arg posicional | (a) append `@features/<feature>` a los paths de `tsconfig.base.json` (idempotente — skip si esta presente); (b) registrar el wrapper module en `apps/api/src/app.module.ts` | diff muestra que tsconfig + module estan wirados | echo "stage 30: already applied <feature>" si se detectan ambos wirings | 0 / 1 missing-arg / 2 conflict |
| `40-port-tests.sh <feature>` | `<feature>` arg posicional | (a) `cp src/modules/<feature>/__tests__/* libs/features/<feature>/server/src/__tests__/`; (b) crear stub vacio `docs/*.feature` per slice-1 Locked Decision #3 (4-6 features) | tests movidos + stubs de feature | echo "stage 40: already applied <feature>" si el conteo de tests no cambia | 0 / 1 missing-arg |
| `50-update-docs.sh <feature>` | `<feature>` arg posicional | (a) append §4.N a `docs/architecture.md` (anchor `{ #<feature> }`); (b) espejar la seccion a `Documents-es/docs/architecture.md` | diff muestra que ambas secciones EN/ES se agregaron | echo "stage 50: already applied <feature>" si el anchor existe en ambos | 0 / 1 missing-arg |
| `99-finalize.sh <feature>` | `<feature>` arg posicional | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @features/<feature> bdd` | exit 0 en pase completo | echo "stage 99: already finalized <feature>" si existe el archivo marcador `.migration-<feature>-done` | 0 / non-zero se propaga desde el comando subyacente |

**Header comun** (DEBE estar presente en cada script):

```sh
#!/usr/bin/env bash
# scripts/migrate/<NN>-<stage>.sh — slice-1 Locked Decision #4 stage idempotente.
# Re-ejecutar en una branch vacia es un no-op o imprime "already applied" y exit 0.
set -euo pipefail
```

**Test de idempotencia**: `scripts/migrate/__tests__/idempotency.test.sh` (NEW, ~50 LOC, usa un loop bash minimo — sin dependencia de `bats`) DEBE asserir que cada script exit 0 cuando se corre dos veces sobre una branch temp fresca y que el segundo run imprima el marcador `already applied`.

### 5.4 Estrategia del mirror en espanol

`Documents-es/docs/architecture.md` (mirror de §5.1) y `Documents-es/docs/migration-playbook.md` (mirror de §5.2) DEBEN existir.

**Politica de traduccion** (per la regla dura de AGENTS.md §13):

- **Traducido**: oracion por oracion a espanol profesional; puntuacion de fin de frase preservada; la estructura de la oracion no tiene que espejar 1:1.
- **Se queda en ingles** (per la lista de terminos estandar de la industria de AGENTS.md §13 + spec §8.4 linea 532): `commit`, `merge`, `branch`, `ADR`, `PR`, `slice`, `stage`, `BDD`, `e2e`, `lint`, `typecheck`, `test`, `build`, `fixture`, `runner`, `pipeline`, `monorepo`, `feature`, `workspace`, `package`, `import`, `export`, `module`, `function`, `error`, `warning`, `interface`, `type`, `class`, `schema`, `port`, `adapter`, `repository`, `service`, `domain`, `application`, `infrastructure`, `client`, `server`, `shared`, `core`, `utils`, `events`, `database`, `config`, `script`, `shell`, `bash`, `idempotent`, `preflight`, `finalize`.
- **Se queda en ingles**: paths de archivo (`libs/features/auth/...`), refs de git (`a9b550d`, `bb25aab`), nombres de branch (`develop`, `main`), identifiers, contenidos de code-block (todo dentro de fences ``` — nunca se traduce).
- **Se queda en ingles**: prestamos tecnicos del aleman/italiano/etc. mapeados via identifiers snake-case (e.g., `playbook` se queda como `playbook` porque ese es el nombre de locked decision; `commit` no se traduce a `confirmar`).

**Verificacion de mojibake** (spec §8.4 lineas 539-548): cada commit de docs DEBE correr:

```bash
grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md
```

DEBE retornar exit 1 (sin match). La regla ESLint de 8.3 tambien enforce esto en tiempo de `pnpm lint`.

### 5.5 PR split para 8.4 (chaining ask-on-risk)

Per la tabla 698-707 de spec §8.4, 8.4 es ~1500-2200 LOC y **DEBE splitearse en al menos 2 chained PRs (PR-A + PR-B)**:

- **PR-A** (`docs/architecture.md` + `Documents-es/docs/architecture.md`): ~500 LOC EN + ~500 LOC ES = **~1000 LOC**. Sigue > 400 de budget.
- **PR-B** (`docs/migration-playbook.md` + `Documents-es/docs/migration-playbook.md` + `scripts/migrate/*.sh` (7 archivos) + `scripts/migrate/__tests__/idempotency.test.sh`): ~700 LOC EN + ~700 LOC ES + ~70 LOC sh + ~50 LOC test = **~1520 LOC**.

**Recomendacion de re-split** (el orquestador debe preguntar per `ask-on-risk`):

| PR | Contenido | LOC estimada |
|---|---|---|
| 8.4 PR-A1 | `docs/architecture.md` EN (Sections 1-6) | ~350 |
| 8.4 PR-A2 | `docs/architecture.md` EN (Sections 7-12) + `Documents-es/docs/architecture.md` mirror | ~550 |
| 8.4 PR-B1 | `docs/migration-playbook.md` EN (Sections 1-7) | ~550 |
| 8.4 PR-B2 | `docs/migration-playbook.md` EN (Sections 8-11) + ES mirror | ~700 |
| 8.4 PR-C | `scripts/migrate/*.sh` (7 archivos) + `__tests__/idempotency.test.sh` | ~150 |

Total: 5 chained PRs para 8.4 (en lugar de 2). Cada PR ≤550 LOC, comodamente bajo el techo de budget 400-500. El orquestador DEBE presentar este split O una decision `size:exception` al usuario antes de aplicar 8.4 (per `delivery_strategy=ask-on-risk`).

---

## 6. Grafo de dependencias + orden del PR chain

```
        8.1 (PR #1, ~150 LOC)
            │
            ▼
        8.2 (PR #2, ~30 LOC) ◄── bloqueado por 8.1 porque el job BDD corre contra el codigo fix
            │
            ▼ (8.1+8.2 mergean en develop)
            
        ──┬─────────┬──────────┐
          │         │          │
          ▼         ▼          ▼
        8.3      8.4 PR-A    8.4 PR-A2 → ... → 8.4 PR-C
       (PR#3,    (PR#4,
       ~50 LOC)   ~350 LOC)
       
       ┌─────────────────────┐
       │ Las tres ramas      │
       │ pueden paralelizarse│
       │ contra el tracker   │
       │ feat/slice-8-…      │
       │ (sin deps mutuas)   │
       └─────────────────────┘
```

**Orden del chain** (obligatorio): `8.1 → 8.2 → 8.3 || 8.4 PR-A1..A2 || 8.4 PR-B1..B2 || 8.4 PR-C` (5-7 chained PRs).

**Regla de paralelizacion**: 8.3, 8.4-PR-A1, 8.4-PR-A2, 8.4-PR-B1, 8.4-PR-B2, 8.4-PR-C todos abren contra el tracker `feat/slice-8-closing-bdd-and-docs` DESPUES de que PR #2 (8.2) mergea — no pueden abrir contra `develop` porque el tracker vive en la punta del chain. El orquestador debe driverarlos uno-a-uno despues de que PR #2 aterrice.

---

## 7. Estrategia de rollback

| Sub-slice | `git revert <sha>` | Comportamiento de CI tras revert | Comportamiento local tras revert |
|---|---|---|---|
| 8.1 | Revierte el rewrite de `register.ts` + el include de 1-line de `vitest.config.ts` | (a) PRs a `develop` despues de que 8.2 aterrice FALLARIAN el BDD gate en el step `pnpm turbo run bdd` (auth 18/18 = 18/18 timeout-fail → el step sale non-zero). (b) `pnpm lint` puede fallar en `no-mojibake-in-docs` si se introdujo un caracter CJK en este PR (no se hara — 8.1 no toca docs). | `pnpm --filter @features/auth bdd` regresa a los timeouts de 5000ms; `pnpm --filter @features/auth test` reporta a register.test.ts en el estado RED 2-FAIL. |
| 8.2 | Revierte el quinto job YAML + elimina el comentario placeholder | El check `BDD (Cucumber)` DESAPARECE de la lista de checks. Los PRs ya no fallan por regresiones del bridge. Ningun otro job de CI depende de `bdd` (es un consumidor de `needs: [static, test]`, no un `neededBy`), asi que los otros cuatro jobs siguen corriendo sin cambios. | `pnpm turbo run bdd` sigue funcionando localmente. |
| 8.3 | Revierte el bloque parser de `eslint.config.mjs` + el branch multi-invalid del runner + `secondCjkLine.invalid.md` | (a) `pnpm lint` ya no parsea archivos `.md`; la regla vuelve a estar dormida (mismo estado que en slice-1). (b) `pnpm lint:fixtures` revierte a la expectativa de single-invalid-fixture; el nuevo archivo de triangulacion DEBE eliminarse tambien (el revert lo incluye). | `pnpm lint` continua linteando archivos .ts/.tsx. La regla se queda en el plugin `@gpr/boundary` pero su unico camino de disparo (el nuevo bloque `Documents-es/**/*.md`) se elimina. |
| 8.4 (cada sub-PR individualmente) | Cada uno de los 5 sub-PRs es su propio target de revert | Ningun CI gate toca la prosa de los docs. Si un PR de docs se revierte y los fixtures siguen pasando, no hay quiebre en CI. | Los docs regresan a su estado pre-PR (architecture o playbook). Los mirrors en espanol se revierten en el mismo commit. |

**Revert del change entero**: revertir el merge squash de `feat/slice-8-closing-bdd-and-docs` en `develop`. Toda la evidencia del chain de slice-7 (`a9b550d`, `bb25aab`) queda preservada.

**NO SE DEBE** (per proposal §7): force-push, reescribir historia, tocar `main`, modificar `openspec/changes/vertical-slicing-reference-scaffold/`, amend de `a9b550d` / `bb25aab`.

---

## 8. Estrategia de test (TDD estricto per AGENTS.md §4 + openspec/config.yaml `strict_tdd: true`)

| Sub-slice | Test RED | Camino GREEN | Casos de triangulacion |
|---|---|---|---|
| 8.1 | `libs/features/auth/docs/__tests__/register.test.ts` (~177 LOC, NEW). Replica el test de transactions (177 LOC). Tres aserciones per spec §8.1 lineas 152-172. | Modificar `libs/features/auth/docs/support/register.ts` (port de transactions lineas 1-188 con las sustituciones de §2.1). Agregar `"../docs/__tests__/**/*.test.ts"` al include de `libs/features/auth/server/vitest.config.ts`. | (a) step de 0-captures (`fn.length === 1`); (b) step de 1-capture (`fn.length === 2`); (c) N-capture con N=5 (el patron auth existente mas grande). Cada caso asssere `stepFn.mock.calls[0][0]` === `world.inner`. |
| 8.2 | **El test ES el job de CI corriendo en verde sobre un PR probe.** Manual: abrir un PR de prueba que revierta `register.ts` al estado roto; esperar que el check `BDD (Cucumber)` FALLE. Revertir el revert; esperar VERDE. | Append del YAML en §3.1. | (a) trigger PR-to-`develop`; (b) trigger push-to-`develop`; (c) el step BDD sale non-zero ante regresion del bridge. |
| 8.3 | Extender `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` para que `no-mojibake-in-docs` acepte multi-invalid fixtures. Agregar `secondCjkLine.invalid.md` (linea 5 CJK). Agregar escaneo CJK del arbol de produccion (lineas despues del loop de fixtures). | Cablear `@eslint/markdown@8.0.3` per §4.1-§4.2. | (a) `invalid.md` (CJK en lineas 6, 8) reporta ≥1 error; (b) `secondCjkLine.invalid.md` (CJK en linea 5) reporta ≥1 error; (c) `valid.md` reporta 0 errors; (d) el escaneo del arbol de produccion reporta 0 CJK sobre todos los `Documents-es/**/*.md` en una branch limpia. |
| 8.4 | `scripts/migrate/__tests__/idempotency.test.sh` (~50 LOC, NEW). Para cada uno de los 7 scripts: spawnear el script en un git worktree temp, correr dos veces, asserir exit 0 + texto `already applied` en la corrida 2. | Implementar scripts per §5.3. | (a) `00-preflight.sh` con todas las tools presentes / con `pnpm` faltante; (b) `10-extract-domain.sh` sobre target vacio / sobre target poblado; (c) idempotencia de re-run anidada: el mismo script corrido 3× sigue saliendo 0 cada vez. |
| 8.4 (prosa de docs) | SIN test unitario RED. La verificacion es: (a) `wc -l docs/architecture.md` ≥400; (b) `wc -l docs/migration-playbook.md` ≥600; (c) `grep -c '^\s*\`\`\`' docs/migration-playbook.md` ≥42 (3 snippets × 2 fences × 7 stages per spec §8.4 scenario lineas 575-577); (d) `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md` exit 1 (sin match). Estos son gates manuales de `sdd-verify`, no tests de Vitest. |

---

## 9. Riesgos (espejo de proposal §6 + cross-refs del spec)

| # | Riesgo | Severidad | Modo de fallo | Mitigacion | Cuando escalar |
|---|---|---|---|---|---|
| R1 | Divergencia del world-contract de auth (resuelto en spec §8.4 lineas 622-645 + este diseno §2.6). | INFO (resuelto) | N/A — verificado que `service-context.ts` vive a nivel de modulo, `AuthWorld` lleva el state de step. El fix del bridge NO toca `service-context.ts`. | El nuevo test (`register.test.ts`) captura cualquier regresion futura en la indireccion world-vs-wrapper. | NUNCA (resuelto). |
| R2 | La expansion de docs en ~1500-2200 LOC excede el budget de revision de 400 lineas. | WARNING | Fatiga del revisor; el PR rebota. | §5.5 divide 8.4 en 5 chained PRs (A1, A2, B1, B2, C) en lugar de 2. Cada PR ≤550 LOC. | `ask-on-risk` DEBE dispararse antes de 8.4 apply — el usuario elige (a) splitear aun mas, (b) `size:exception` aceptado, (c) diferir el playbook a slice 9. |
| R3 | La API del parser de `@eslint/markdown` puede shift entre minors 8.x. | SUGGESTION | El pin se rompe despues de un `pnpm update`. | (a) Pin exacto `8.0.3` en devDependencies del `package.json` root (sin caret). (b) Documentar el procedimiento de bump en el body del commit de 8.3. (c) Bumps futuros son mecanicos — abrir un nuevo change, bumpear, re-correr `pnpm lint:fixtures`. | Solo cuando se bumpea el pin (slice-N+1). |
| R4 | **El include bump de `vitest.config.ts`** esta FUERA del scope listado del spec pero REQUERIDO para el outcome GREEN (`pnpm --filter @features/auth test` exits 0). | WARNING (NEW) | Sin el, el `register.test.ts` de 8.1 es descubierto por `vitest` desde la raiz del slice pero NO por `pnpm --filter @features/auth test` (el filtro resuelve el script `test` del package que usa su propio vitest config). El test RED del spec NO correria; CI pasaria sin ejercer el contrato del bridge. | Tratar como in-scope para 8.1. Este diseno lo senala explicitamente para que el orquestador NO marque 8.1 como out-of-spec cuando el diff de apply-stage exceda levemente el estimador de LOC del spec. | Si el `sdd-verify` del spec luego prueba que el include bump es requerido Y esta ausente, el fix del bridge esta incompleto — escalar. |
| R5 | El branch multi-invalid del runner en 8.3 puede regresionar el invariante de los otros 4 reglas (single-invalid fixture). | SUGGESTION (NEW) | Un cambio futuro podria re-introducir la asercion "exactamente un invalid" como global en lugar de por-regla. Las otras 4 reglas (basadas en `.ts`) DEBEN mantener el invariante de exactamente-uno. | El diseno §4.4 usa un campo `allowMultipleInvalids: true` por regla en `RULES[i]` — mantiene las otras 4 reglas estrictas. El test RED para 8.3 itera las 5 reglas; si algun caso `.ts` con `invalids.length > 1` se dispara (solo mediante drift intencional de fixtures), el runner exit 1. | Si el conteo de `invalid.{ts}` de las reglas `.ts` alguna vez excede 1, es una regresion en la disciplina de fixtures — escalar segun el espiritu de `no-cross-module-import` (un fixture por variante de regla). |

---

## 10. Forecast de carga de revision

| Sub-slice | PR # | LOC estimada (additions) | vs 400 budget | ask-on-risk? |
|---|---|---|---|---|
| 8.1 — auth bridge | PR #1 | ~180 (150 register.ts port + 30 register.test.ts menos overlap + 1 vitest.config.ts) | Low | No |
| 8.2 — CI YAML | PR #2 | ~30 (quinto job block, reemplaza placeholder) | Low | No |
| 8.3 — markdown lint | PR #3 | ~50 (eslint config +1 import + 2 bloques + branch multi-invalid del runner + escaneo de produccion + 6 LOC fixture) | Low | No |
| 8.4 PR-A1 | PR #4 | ~350 (architecture.md Sections 1-6 EN) | Low/Med | **Si** al apply-time si se mergea con PR-A2 |
| 8.4 PR-A2 | PR #5 | ~550 (architecture.md Sections 7-12 EN + mirror ES completo) | High | **Si** — el orquestador DEBE parar y preguntar per `ask-on-risk` |
| 8.4 PR-B1 | PR #6 | ~550 (playbook.md Sections 1-7 EN, incluye ≥21 fences de snippet) | High | **Si** |
| 8.4 PR-B2 | PR #7 | ~700 (playbook.md Sections 8-11 EN + mirror ES) | High | **Si** |
| 8.4 PR-C | PR #8 | ~150 (7 × ~10 LOC sh + 50 LOC idempotency test) | Low | No |

**Totales**: 8 PRs, ~2560 LOC de additions. El cluster de 8.4 (PR #4-#8) definitivamente dispara `ask-on-risk` per la tabla 698-707 de spec §8.4. El orquestador DEBE presentar al usuario el split de 5 PRs vs. un `size:exception` explicito antes de aplicar 8.4 PR-A2.

---

## 11. Cross-references

- **Proposal**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226).
- **Spec**: `openspec/changes/slice-8-closing-bdd-and-docs/spec.md` (Engram #2228).
- **Cierre de slice-7**: `bb25aab` en `develop` (squash de PR-51, 25/25 transactions BDD PASS).
- **Patron del bridge-fix**: commit `a9b550d` en `libs/features/transactions/docs/support/register.ts` (lineas 72-118 = `buildWrapper`; lineas 125-129 = `TransactionsWorldWrapper`; lineas 143-165 = pattern + count helpers).
- **Template del test del bridge de transactions**: `libs/features/transactions/docs/__tests__/register.test.ts` (177 LOC).
- **Diseno slice-1 §3.4 (selector de reglas de boundary para `no-mojibake-in-docs`)**: `openspec/changes/vertical-slicing-reference-scaffold/design.md` lineas 322-324.
- **Slice-1 Locked Decision #4 (formato dual del playbook)**: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` linea 93.
- **Slice-1 task T8.5 (contrato de 7 scripts)**: `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` lineas 876-882.
- **Diseno slice-1 §2 (repository layout, path scripts/migrate/)**: lineas 226-233 (el canonical home).
- **Tipo World de auth (verificado)**: `libs/features/auth/docs/step-defs/world.ts` lineas 55-126 (interface + factory).
- **Service context de auth (verificado, NO SE DEBE tocar)**: `libs/features/auth/docs/support/service-context.ts` (235 LOC).
- **Placeholder CI (reemplazado por 8.2)**: `.github/workflows/ci.yml` lineas 187-196.
- **ESLint flat config**: `eslint.config.mjs` linea 13 (boundary import), 42-52 (TS parser block), 56-59 (global rules block). 8.3 inserta el parser block despues de linea 52, el rule block despues de linea 59.
- **Invariante del runner que se cambia**: `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` lineas 137-145 (asercion de exactly-one-invalid) + lineas 162-232 (test set loop).
- **Fixtures existentes de auth**: `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/{valid.md, Documents-es/invalid.md}` (el nuevo `secondCjkLine.invalid.md` es sibling).
- **Gap de descubribilidad de Vitest**: `libs/features/auth/server/vitest.config.ts` lineas 18-21 (NO incluye `../docs/__tests__/**/*.test.ts`); `libs/features/transactions/server/vitest.config.ts` linea 23 (SI lo incluye). 8.1 debe alinear auth con transactions.
- **AGENTS.md §7 (boundary rules)** + **§8 (SSoT)** + **§11 (out-of-scope)** + **§13 (Spanish mirror)**.
- **openspec/config.yaml**: `strict_tdd: true`, `delivery_strategy: ask-on-risk`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`.

---

## 12. Preguntas abiertas para `sdd-tasks`

Las siguientes NO son blockers para que `sdd-design` complete, pero `sdd-tasks` DEBE resolverlas en `tasks.md` antes de que `sdd-apply` arranque:

1. **Confirmacion del split de PRs de 8.4**: cual de los splits de 5-PR (A1, A2, B1, B2, C) quiere el usuario? El spec lista split de 2-PR; este diseno recomienda 5. `ask-on-risk` se dispara aqui.
2. **Framework de test para `scripts/migrate/__tests__/idempotency.test.sh`**: loop bash (este diseno recomienda) vs `bats` (per slice-1 T8.5). El loop bash no tiene nueva dependencia; `bats` necesita una devDep. **Recomiendo el loop bash** — el spec de slice-1 ya dice "bats O un shell-test runner tiny"; la eleccion de minima-dependencia es el loop bash.
3. **Numero de linea de `secondCjkLine.invalid.md`**: el diseno elige linea 5 (intencionalmente lejos de linea 1). Si la pasada TDD del apply elige una linea diferente, la regla debe seguir disparandose — cubierto por `findCjkInText` que escanea el documento entero (no solo linea 1). La eleccion de linea 5 es ilustrativa.
4. **Impacto del dependency tree de `@eslint/markdown@8.0.3`**: 8.0.3 puede tirar de `@eslint/plugin-kit` como peer. La fase de apply DEBE correr `pnpm install` sobre la version pineada y verificar que `pnpm lint` exit 0 con un arbol `Documents-es/**/*.md` vacio. Si el dependency tree trae duplicados inesperados, escalar per R3.
5. **Formato de cross-references de §12 en `docs/architecture.md`**: deben renderizarse como una lista numerada (estilo del diseno de slice-1) o como una lista de definicion estilo `<dl>`? Recomiendo la lista numerada (hace matching con el §12 del diseno de slice-1).

---

## 13. Estado

**Status**: `success`. Artefacto de diseno listo en `openspec/changes/slice-8-closing-bdd-and-docs/design.md`.

**Decisiones tecnicas clave locked** (recap):

1. **DUPLICAR `buildWrapper` en auth** (NO compartido). Single source of truth es per-slice, no per-bridge. AGENTS.md §7 / §8 boundary + el diseno de slice-1 §3.4 `no-cross-module-import` prohiben el import cross-slice del bridge; `@core/` esta reservado para infra de runtime, no para infra de test.
2. **CI YAML inline-duplicado** (sin anchors YAML). Ahorra 6 LOC vs anchors; el review-budget gana.
3. **El include bump de `vitest.config.ts` SI esta in-scope para 8.1** (el spec lo paso por alto en silencio; sin el, el test RED nunca corre en CI). Senalado en §2.5 y §9 R4.
4. **El branch multi-invalid del runner es un booleano por regla**, no una relajacion global. Las otras 4 reglas mantienen su disciplina de single-invalid.
5. **La expansion de docs se divide en 5 chained PRs** (no 2 per spec). Per-PR ≤550 LOC; el orquestador DEBE ask-on-risk antes de PR-A2.

**Siguiente fase**: `sdd-tasks` (la pregunta abierta §12.1 necesita resolucion del usuario antes de 8.4 apply).
