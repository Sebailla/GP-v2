# Exploración: Fallo del gate BDD en CI con Node 22 + tsx 4.23.0

## Resumen

**Causa raíz**: La configuración `require:` de Cucumber 13 invoca el `require()` CJS de Node para cargar `support/register.ts`. Los scripts `bdd` de los slices registran `tsx/esm` (un hook de loader ESM) mediante `NODE_OPTIONS='--import tsx/esm'`. Los hooks ESM NO interceptan el `require()` CJS. Cuando el camino CJS de Node 22 intenta parsear el archivo `.ts` como CJS, encuentra `import type { AuthWorld }` (sintaxis exclusiva de TypeScript) y lanza `SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule`.

**La hipótesis original (regresión de tsx 4.23.0) es INCORRECTA.** La descarté empíricamente:
- Cambiando a `tsx@4.22.5` (más antiguo) — mismo error.
- Cambiando a `tsx@4.23.1` (más nuevo, publicado hoy con el fix "support tsImport after global preload") — mismo error.
- El bug está en la configuración de la cadena de loaders, no en la versión de tsx.

**El fix real es un cambio de un carácter en dos archivos `package.json`**: `--import tsx/esm` → `--import tsx/cjs` (o `--require tsx/cjs`). `tsx/cjs` registra un hook CJS mediante `module.register` de Node, que es lo que el camino `require:` de cucumber realmente necesita.

**Verificado**: ejecutando `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` en Node 22.14.0 devuelve `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s.

## §1. Matriz de versiones de tsx

### Lockfile (pnpm-lock.yaml)
- `tsx@4.23.0` está izado al `node_modules` raíz — única aparición del paquete resuelto en las líneas 4526 y 8978 (misma versión, dos entradas de resolución pnpm).
- No hay otros paquetes `tsx@<versión>` resueltos. Todos los consumidores transitivos (`vite`, `vitest`, `@vitejs/plugin-react`) referencian `tsx@4.23.0` como peer (p.ej. línea 9121: `tsx: 4.23.0`).
- La línea 39 de `devDependencies` en `package.json` especifica `"tsx": "^4.23.0"`. El `^` permite actualizaciones dentro de 4.23.x.

### Instalado
- `/node_modules/tsx/package.json` → `version: 4.23.0`.

### CI
- `.github/workflows/ci.yml` línea 227: `with: { node-version: 22.13.0, cache: pnpm }` para el job `bdd`.
- Los cuatro jobs de CI (static, test, build, bdd) usan Node 22.13.0.

### Esperado local
- `.nvmrc` → `22.13.0`.
- `engines.node` en `package.json` raíz → `">=22.13.0"`.

### Runner BDD por slice
- `libs/features/auth/server/package.json:17` → `"bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"`
- `libs/features/transactions/server/package.json:17` → idéntico.
- Ningún slice sobreescribe la resolución de `tsx`; ambos resuelven al 4.23.0 raíz.

## §2. Archivos step-def BDD que usan `import type`

| Archivo | Línea | Sentencia |
| --- | --- | --- |
| `libs/features/auth/docs/step-defs/common.steps.ts` | 17 | `import type { AuthWorld } from "./world.js";` |
| `libs/features/auth/docs/step-defs/realm.steps.ts` | 23 | `import type { AuthWorld as _AuthWorld } from "./world.js";` |
| `libs/features/auth/docs/step-defs/realm.steps.ts` | 24 | `import type { StepBinding } from "./common.steps.js";` |
| `libs/features/auth/docs/step-defs/world.ts` | 22 | `import type { Role } from "../../server/src/rbac-service.js";` |
| `libs/features/transactions/docs/step-defs/actions.steps.ts` | 15 | `import type { TransactionsWorld, WorldCategory, WorldCategoryTotal, WorldTransaction } from "./world.js";` |
| `libs/features/transactions/docs/step-defs/common.steps.ts` | 13 | `import type { TransactionsWorld } from "./world.js";` |
| `libs/features/transactions/docs/step-defs/data.steps.ts` | 18 | `import type { TransactionsWorld, WorldCategory, WorldCurrency, WorldFxRate, WorldTransaction } from "./world.js";` |
| `libs/features/transactions/docs/step-defs/data.steps.ts` | 25 | `import type { CategoryKind, TransactionKind } from "../../server/src/domain/entities/index.js";` |
| `libs/features/transactions/docs/step-defs/world.ts` | 33 | `import type { TransactionKind, CategoryKind } from "../../server/src/domain/entities/index.js";` |

El error siempre aparece en `common.steps.ts:17` porque ese archivo es el primero cargado por la cadena CJS.

Los archivos step-def usan `import` ESM (no `import type`) para los valores de runtime que necesitan:
- `support/register.ts` (ambos slices): `import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber"` (runtime) + `import { stepDefinitions as ... } from "../step-defs/*.steps.js"` (runtime).

Por tanto `import type` es puramente una anotación de tipo. DEBERÍA borrarse en tiempo de transpilación, pero solo si el transpilador corre sobre el archivo. El hook ESM de tsx no está registrado cuando cucumber hace el `require()` CJS.

## §3. Configuración del runner BDD

### Slice auth
- `libs/features/auth/docs/cucumber.mjs:25` → `require: ["support/register.ts"]` (cucumber lo carga vía `require()` CJS porque la config `require:` puebla `requirePaths`, ver `node_modules/@cucumber/cucumber/lib/api/support.js:22-25`).
- El archivo NO tiene prefijo `./` ni es absoluto — depende de la resolución de cucumber (que añade cwd).
- Glob `paths` → `*.feature` (6 archivos: login-email-password, login-locale-routing, oauth-google-stub, password-reset, rbac-admin, sessions-list).

### Slice transactions
- `libs/features/transactions/docs/cucumber.mjs:16` → `require: [path.join(docsDir, "support", "register.ts")]` (camino absoluto, mismo camino CJS).
- Glob `paths` → `*.feature` (6 archivos: create-transaction, idempotency-key, list-transactions, multi-currency-conversion, sign-aware-totals, soft-delete-categories).

### Cadena del loader (según fuente de cucumber)
1. `cucumber-js` (binario Node) arranca → lee `NODE_OPTIONS='--import tsx/esm'` → registra el hook del loader ESM de tsx (línea `esm/index.mjs`).
2. Corre `getSupportCodeLibrary` de cucumber (`node_modules/@cucumber/cucumber/lib/api/support.js`).
3. Para cada `requirePaths[i]`, cucumber llama a `tryRequire(path)` (`node_modules/@cucumber/cucumber/lib/try_require.js`).
4. `try_require.js:8` hace `return require(path)`. Es un `require()` CJS plano de Node, que pasa por la cadena de loader CJS.
5. El loader CJS parsea `support/register.ts` como CJS. Encuentra sintaxis `import type` → SyntaxError.
6. El hook ESM de tsx nunca se consulta porque el camino CJS evita los hooks ESM por completo.

El código de error exacto que debería lanzarse es `ERR_REQUIRE_ESM`. El wrapper `try_require.js` lo capturaría y lanzaría el error documentado: "Cucumber expected a CommonJS module at '${path}' but found an ES module. Either change the file to CommonJS syntax or use the --import directive instead of --require."

Pero nuestro error es un `SyntaxError: Unexpected identifier 'AuthWorld'` plano — porque el camino CJS-to-ESM de Node 22 parsea el archivo ANTES de que dispare el rechazo ESM. Node 22 aún no sabe que el archivo "debería" ser ESM (no hay override de `package.json#type` en la ubicación del archivo, no hay extensión explícita `.mts`). Intenta CJS primero, encuentra sintaxis exclusiva de TS, y muere.

## §4. Notas de release de tsx (4.23.0 + historial)

Fuente: https://github.com/privatenumber/tsx/releases (consultado 2026-07-13).

### 4.23.1 (publicado 2026-07-13, hoy)
- Bug fixes: "support tsImport after global preload", watch: avoid clearing piped output, treat script and dependency paths literally.
- Performance: index transform cache lazily, load esbuild lazily, map Node TypeScript formats directly, **use sync module hooks on Node v22.22.3+**.
- **Resultado de test empírico**: aún falla con el mismo `SyntaxError: Unexpected identifier 'AuthWorld'` en Node 22.14.0 + bdd del slice auth. El fix "support tsImport after global preload" NO aborda este caso.

### 4.23.0 (publicado 2026-07-03)
- Un único bug fix: "avoid redundant filesystem probes during module resolution".
- Feature: "multi-scenario startup benchmark suite".
- **Sin cambios de interop CJS/ESM mencionados en las notas de release.**

### 4.22.5 (publicado 2026-07-02)
- Bug fix: "isolate hook state per async module.register() registration".
- Falla empíricamente con el mismo error en Node 22.14.0.

### 4.22.2 (publicado 2026-05-18)
- Bug fixes: "preserve CJS JSON require in ESM hooks", "preserve named exports from CommonJS TypeScript", "support module.exports require(esm) interop".

### 4.22.0 (publicado 2026-05-14)
- Feature: "upgrade esbuild to 0.28".

### Anteriores
- tsx ha enviado los exports `tsx/cjs` y `tsx/esm` desde 4.16.x (verificado en el mapa `exports` de `node_modules/tsx/package.json`). La división en dos hooks de registro precede a la ventana de regresión.

### Última versión conocida funcional
- tsx en sí no es el bug. El hook de registro `tsx/cjs` ha existido durante muchas versiones y funcionaría perfectamente si el script lo usara. No necesitamos downgradear.

## §5. La transformación exacta

### Observación empírica
- `tsx/esm` (el loader ESM, registrado vía `--import tsx/esm`): registra hooks `initialize`, `load`, `resolve` en la cadena del loader ESM de Node. NO registra un hook CJS.
- `tsx/cjs` (el registro CJS, registrado vía `--import tsx/cjs` o `--require tsx/cjs`): llama a `module.register('../register-*.cjs')` que parchea `Module._compile` y `Module._extensions['.ts']` de Node para transpilar archivos `.ts` al vuelo.

### Qué registra tsx/cjs
`node_modules/tsx/dist/cjs/index.cjs`:
```js
"use strict";var r=require("../register-BOkp8V6j.cjs");...;r.register();
```

`register-BOkp8V6j.cjs` parchea `Module._extensions['.ts']` para:
1. Leer el fuente `.ts`.
2. Pasar por esbuild (elimina sintaxis exclusiva de TS incluyendo `import type`).
3. Devolver el fuente compilado a CJS al loader CJS de Node.

### Qué registra tsx/esm
`node_modules/tsx/dist/esm/index.mjs`:
```js
import { ... } from "../register-tkXbOgAS.mjs"; ...; export { ... initialize, load, resolve };
```

Estos se enganchan en la cadena `initialize`/`resolve`/`load` ESM de Node — que solo se consulta cuando un archivo se carga vía `import()` ESM, NO cuando se carga vía `require()` CJS.

### Por qué Node 23 oculta el bug
Node 23 cambió la semántica de `require()` para archivos ESM: cuando `require()` CJS encuentra un archivo ESM, Node 23 devuelve el namespace ESM sincrónicamente vía interop `require(esm)`. El camino CJS se saltea parsear el fuente como CJS.

Node 22 NO hace esto: parsea el fuente como CJS primero, falla con sintaxis exclusiva de TS, y muere.

## §6. Radio de explosión

### Paquetes con suites BDD (los únicos afectados)
- `libs/features/auth` (package.json server tiene script `bdd`; posee 18 escenarios en 6 archivos `.feature`).
- `libs/features/transactions` (package.json server tiene script `bdd`; posee 25 escenarios en 6 archivos `.feature`).
- Total: 43 escenarios, 9 archivos `.feature`, 5 archivos `.steps.ts`, 2 archivos `support/register.ts`, 2 configs `cucumber.mjs`, 2 archivos `package.json` (uno por slice).

### Paquetes SIN suites BDD (turbo run bdd los incluye en el task graph pero terminan inmediatamente)
- `@core/config`, `@core/database`, `@core/events`, `@shared-utils/*`, `@gpr/eslint-plugin-boundary`, `apps/api`, `apps/web`. Ninguno tiene script `bdd` en su package.json.
- Total workspaces: 13 (según `pnpm-workspace.yaml`). De esos, 2 tienen suites BDD.

### Archivos afectados por Shape A (fix recomendado)
- `libs/features/auth/server/package.json` (1 línea cambiada).
- `libs/features/transactions/server/package.json` (1 línea cambiada).
- Ningún otro archivo.

### Archivos NO afectados por Shape A
- Los 5 archivos `.steps.ts` quedan intactos.
- Ambos archivos `world.ts` quedan intactos.
- Ambos archivos `support/register.ts` quedan intactos.
- Ambos archivos `cucumber.mjs` quedan intactos.
- `pnpm-lock.yaml` queda intacto.
- Reglas ESLint de boundary intactas.

### Contrato de test que cualquier fix debe pasar
- `pnpm turbo run bdd` debe terminar con exit 0 en Node 22.13.0 (la versión de CI).
- Los 43 escenarios BDD deben PASAR (18 auth + 25 transactions).
- Sin nuevas violaciones de ESLint boundary.
- Sin nuevas dependencias.

## §7. Restricciones de las convenciones del proyecto

### AGENTS.md §7 (reglas ESLint boundary)
- `no-prisma-outside-core` — `new PrismaClient()` solo en `libs/core/database/src/`. No afectado.
- `no-schemas-outside-shared` — esquemas Zod solo en `libs/features/<x>/shared/schemas/`. No afectado.
- `no-client-server-import` — `libs/features/<x>/client/` NO debe importar de `*/server/`. No afectado.
- `no-cross-module-import` — `libs/features/<x>/...` NO debe importar de `libs/features/<y>/...`. No afectado.
- `no-mojibake-in-docs` — `Documents-es/**/*.md` NO debe contener CJK. No afectado (no se cambió Markdown).

### AGENTS.md §13 (mirror en español)
- Sin archivos `.md` añadidos o cambiados por Shape A → no se requiere mirror en español.
- Shape B/C/D tampoco requeriría nuevos docs (son cambios de configuración).

### Restricciones del workflow de CI
- El job BDD usa Node 22.13.0 + pnpm 11.10.0 + servicio Postgres 16-alpine. Timeout 30 min.
- El fix debe funcionar bajo estas condiciones exactas.

### Restricción: minimizar ediciones de fuente
- AGENTS.md §9 / §12 enfatizan "cambios mínimos" + "tests/docs con el código". El fix más limpio toca 2 líneas de `package.json`.

## §8. Candidatos de forma de fix

### Forma A (recomendada) — cambiar `tsx/esm` → `tsx/cjs` en NODE_OPTIONS

**Qué**: Cambiar `"NODE_OPTIONS='--import tsx/esm'"` por `"NODE_OPTIONS='--import tsx/cjs'"` en `libs/features/auth/server/package.json:17` y `libs/features/transactions/server/package.json:17`.

**Delta de LOC**: 2 líneas (1 por archivo). Cambio de un solo token (`tsx/esm` → `tsx/cjs`).

**Riesgo**: Bajo. tsx/cjs es el hook de registro CJS oficial (publicado desde 4.16.x). Es el espejo de tsx/esm para llamadores CJS.

**Radio de explosión**: 2 archivos. Sin código fuente tocado. Sin impacto ESLint. Sin nuevas dependencias.

**Reversibilidad**: Trivial — revert de una sola línea.

**Verificado**: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` en Node 22.14.0 → 18 escenarios (18 pasados), 101 pasos (101 pasados), 0.34s.

### Forma B — cambiar cucumber de `require:` a `import:`

**Qué**: Cambiar `require: ["support/register.ts"]` por `import: ["support/register.ts"]` en `cucumber.mjs` (ambos slices). Mantener `--import tsx/esm` en el script.

**Delta de LOC**: 2 líneas (1 por archivo).

**Riesgo**: Bajo. La config `import:` de cucumber usa `import()` ESM (según `node_modules/@cucumber/cucumber/lib/api/support.js:30-33`), que tsx/esm SÍ intercepta. Es la dirección "más limpia" a largo plazo — todos los archivos TypeScript se cargarían vía ESM, en línea con el setting `"type": "module"` de los slices.

**Radio de explosión**: 2 archivos `cucumber.mjs`. Sin código fuente tocado.

**Reversibilidad**: Trivial — revert de una sola línea.

**Tradeoff vs Forma A**: Más limpio a largo plazo (ESM de extremo a extremo) pero requiere que el mantenedor de cucumber.mjs entienda la división de hooks CJS/ESM. Forma A es más quirúrgica.

### Forma C — reescribir `support/register.ts` como CJS

**Qué**: Renombrar `support/register.ts` → `support/register.cjs`. Reescribir cada `import` como `require`. Reescribir cada `import type` como JSDoc o type-only imports.

**Delta de LOC**: 60-80 líneas por archivo (2 archivos) = 120-160 líneas. Además cada `import type` en los 5 archivos `.steps.ts` necesitaría inlinearse como `.d.ts` solo-tipos o reemplazarse con JSDoc.

**Riesgo**: Alto. Toca el archivo que PR-7 introdujo explícitamente (`feat(bdd): slice 7 PR-8 — transactions register.ts bridge GREEN (#51)` y `feat(auth): slice 8 PR-1 — auth BDD bridge GREEN (#52)`). Revertir a CJS borra la decisión arquitectónica que el slice tomó.

**Radio de explosión**: Alto. 7 archivos tocados (2 register.ts + 5 steps.ts + 2 world.ts).

**Reversibilidad**: Difícil — muchos archivos involucrados.

### Forma D — reemplazar tsx con otro registro (p.ej. `@swc-node/register`)

**Qué**: Añadir `@swc-node/register` como devDependency, reemplazar referencias a `tsx` en scripts BDD con `swc-node/register`.

**Delta de LOC**: 1 cambio de dep + 2 líneas de script en `package.json`. Más regeneración de `pnpm-lock.yaml`.

**Riesgo**: Medio. Introduce una nueva dependencia que puede tener sus propios quirks. La regla boundary `no-cross-module-import` lo permite (es devDep, no cross-feature). El fix es más invasivo de lo necesario.

**Radio de explosión**: 1 dep + 2 archivos.

**Reversibilidad**: Moderada — necesita eliminación de dep + regeneración del lockfile.

## §9. Contrato de verificación

Tras el fix:
- `pnpm turbo run bdd` termina con exit 0 en Node 22.13.0 (versión de CI).
- Los 43 escenarios BDD siguen pasando (18 auth + 25 transactions).
- `pnpm lint` termina con exit 0.
- `pnpm lint:fixtures` termina con exit 0.
- `pnpm typecheck` no reporta nuevos errores.
- Sin nuevas dependencias en `pnpm-lock.yaml`.
- `git diff` contra develop muestra solo los cambios previstos (2 líneas de `package.json` para Forma A).

## §10. Receta de reproducción diagnóstica

```bash
# Confirmar el bug en Node 22 (usar volta o nvm para fijar un Node 22.x)
export PATH=/Users/sebailla/.volta/tools/image/node/22.14.0/bin:$PATH
node --version  # debería imprimir v22.x.x

# Reinstalar lockfile
pnpm install --frozen-lockfile

# Reproducir el bug
pnpm --filter @features/auth bdd

# Salida esperada:
#   SyntaxError: Unexpected identifier 'AuthWorld'
#       at compileSourceTextModule (node:internal/modules/esm/utils:338:16)
#       at ModuleLoader.importSyncForRequire (node:internal/modules/esm/loader:353:18)
#       at loadESMFromCJS (node:internal/modules/cjs/loader:1385:24)
#       at Module._compile (node:internal/modules/cjs/loader:1536:5)

# Confirmar que el fix funciona
NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd

# Salida esperada:
#   18 scenarios (18 passed)
#   101 steps (101 passed)
#   0m 0.34s
```

En Node 23.x el bug NO se reproduce — el Node 23.8.0 local (default de volta) lo oculta. CI usa Node 22.13.0, que lo expone.

## Recomendación

**Forma A** es el fix recomendado:
- Cambio de 2 líneas (una por `package.json` de slice).
- Cero código fuente tocado.
- Cero impacto ESLint.
- Cero nuevas dependencias.
- Trivialmente reversible.
- Verificado empíricamente que hace pasar los 18 escenarios auth en Node 22.14.0.

La hipótesis original (regresión de tsx 4.23.0) está empíricamente falseada. El fix apunta a la causa raíz real: el `require()` CJS de cucumber evita el hook ESM de tsx. tsx provee `tsx/cjs` justamente para este caso; simplemente no lo estábamos usando.

## Próximos pasos

1. **propose** — Crear la propuesta SDD con Forma A como fix recomendado, Forma B como alternativa, Formas C/D como opciones rechazadas.
2. La propuesta debe referenciar este explore.md y Engram #2306.
3. La propuesta debe incluir una tarea de apply (el cambio de 2 líneas en `package.json` + commit del lockfile si hay) con un gate de verificación de `pnpm turbo run bdd` en Node 22.x.
4. Tras el apply, `pnpm turbo run bdd` debe pasar y el run de CI previamente fallido (29288016689) debe volverse verde.