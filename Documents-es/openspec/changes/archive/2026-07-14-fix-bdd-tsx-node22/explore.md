# Exploración: falla de la puerta BDD de CI en Node 22 + tsx 4.23.0

## Resumen

**Causa raíz**: la configuración `require:` de Cucumber 13 invoca el `require()` CJS de Node para cargar `support/register.ts`. Los scripts `bdd` de los slices registran `tsx/esm` (un hook de loader ESM) vía `NODE_OPTIONS='--import tsx/esm'`. Los hooks ESM NO interceptan el `require()` CJS. Cuando el camino CJS de Node 22 intenta parsear el archivo `.ts` como CJS, se encuentra con `import type { AuthWorld }` (sintaxis exclusiva de TypeScript) y lanza `SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule`.

**La hipótesis original (regresión de tsx 4.23.0) es INCORRECTA.** La descarté empíricamente:
- Cambiar a `tsx@4.22.5` (más viejo) — mismo bug.
- Cambiar a `tsx@4.23.1` (más nuevo, lanzado hoy con el fix "support tsImport after global preload") — mismo bug.
- El bug es la configuración de la cadena de loader, no la versión de tsx.

**El fix real es un cambio de un único carácter en dos archivos `package.json`**: `--import tsx/esm` → `--import tsx/cjs` (o `--require tsx/cjs`). `tsx/cjs` registra un hook CJS vía `module.register` de Node, que es lo que el camino `require:` de cucumber realmente necesita.

**Verificado**: correr `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` en Node 22.14.0 devuelve `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s.

## §1. Matriz de versiones de tsx

### Lockfile (pnpm-lock.yaml)
- `tsx@4.23.0` está hoisted a `node_modules` raíz — ocurrencia única del package resuelto en las líneas 4526 y 8978 (misma versión, dos entradas de resolución de pnpm).
- Ningún otro package `tsx@<version>` resuelto. Todos los consumidores transitivos (`vite`, `vitest`, `@vitejs/plugin-react`) referencian `tsx@4.23.0` como peer (p.ej. línea 9121: `tsx: 4.23.0`).
- La línea 39 de `devDependencies` en `package.json` especifica `"tsx": "^4.23.0"`. El `^` permite upgrades 4.23.x.

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
- Ningún slice overridea la resolución de `tsx`; ambos resuelven al `4.23.0` raíz.

## §2. Archivos step-def de BDD que usan `import type`

| Archivo | Línea | Statement |
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

El error siempre aparece en `common.steps.ts:17` porque ese archivo es el primero que se carga vía la cadena CJS.

Los archivos step-def usan `import` ESM (no `import type`) para los valores de runtime que necesitan:
- `support/register.ts` (ambos slices): `import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber"` (runtime) + `import { stepDefinitions as ... } from "../step-defs/*.steps.js"` (runtime).

Así que `import type` es puramente una anotación de TIPO. DEBERÍA borrarse en tiempo de transpilación, pero sólo si el transpilador corre sobre el archivo. El hook ESM de tsx no está registrado cuando cucumber hace el `require()` CJS.

## §3. Config del runner BDD

### Slice auth
- `libs/features/auth/docs/cucumber.mjs:25` → `require: ["support/register.ts"]` (cucumber cargará esto vía `require()` CJS porque la config `require:` puebla `requirePaths`, ver `node_modules/@cucumber/cucumber/lib/api/support.js:22-25`).
- El archivo NO está prefijado con `./` y NO es absoluto — se apoya en la resolución de path de cucumber (que agrega cwd).
- Glob `paths` → `*.feature` (6 archivos: login-email-password, login-locale-routing, oauth-google-stub, password-reset, rbac-admin, sessions-list).

### Slice transactions
- `libs/features/transactions/docs/cucumber.mjs:16` → `require: [path.join(docsDir, "support", "register.ts")]` (path absoluto, mismo camino CJS).
- Glob `paths` → `*.feature` (6 archivos: create-transaction, idempotency-key, list-transactions, multi-currency-conversion, sign-aware-totals, soft-delete-categories).

### Cadena de loader (según fuente de cucumber)
1. `cucumber-js` (binario Node) arranca → lee `NODE_OPTIONS='--import tsx/esm'` → registra el hook de loader ESM de tsx (línea `esm/index.mjs`).
2. corre `getSupportCodeLibrary` de cucumber (`node_modules/@cucumber/cucumber/lib/api/support.js`).
3. Para cada `requirePaths[i]`, cucumber llama a `tryRequire(path)` (`node_modules/@cucumber/cucumber/lib/try_require.js`).
4. `try_require.js:8` hace `return require(path)`. Este es el `require()` CJS plano de Node, que atraviesa la cadena de loader CJS de Node.
5. El loader CJS parsea `support/register.ts` como CJS. Se encuentra con sintaxis `import type` → SyntaxError.
6. El hook ESM de tsx nunca se consulta porque el camino CJS bypasea los hooks ESM por completo.

El código de error exacto que debería lanzarse es `ERR_REQUIRE_ESM`. El wrapper `try_require.js` custom lo capturaría y lanzaría el error documentado: "Cucumber expected a CommonJS module at '${path}' but found an ES module. Either change the file to CommonJS syntax or use the --import directive instead of --require."

Pero nuestro error es un `SyntaxError: Unexpected identifier 'AuthWorld'` plano — porque el camino de interop CJS-a-ESM de Node 22 parsea el archivo ANTES de que el rechazo ESM se dispare. Node 22 aún no sabe que el archivo "debería" ser ESM (sin override `package.json#type` en la ubicación del archivo, sin extensión `.mts` explícita). Intenta CJS primero, encuentra sintaxis exclusiva de TS, y muere.

## §4. Release notes de tsx (4.23.0 + historia)

Fuente: https://github.com/privatenumber/tsx/releases (fetched 2026-07-13).

### 4.23.1 (lanzado 2026-07-13, hoy)
- Bug fixes: "support tsImport after global preload", watch: avoid clearing piped output, treat script and dependency paths literally.
- Performance: index transform cache lazily, load esbuild lazily, map Node TypeScript formats directly, **use sync module hooks on Node v22.22.3+**.
- **Resultado de test empírico**: aún falla con el mismo `SyntaxError: Unexpected identifier 'AuthWorld'` en Node 22.14.0 + auth slice bdd. El fix "support tsImport after global preload" NO aborda este caso.

### 4.23.0 (lanzado 2026-07-03)
- Fix único: "avoid redundant filesystem probes during module resolution".
- Feature: "multi-scenario startup benchmark suite".
- **Sin cambios de interop CJS/ESM mencionados en las release notes.**

### 4.22.5 (lanzado 2026-07-02)
- Bug fix: "isolate hook state per async module.register() registration".
- Falla empíricamente con el mismo error en Node 22.14.0.

### 4.22.2 (lanzado 2026-05-18)
- Bug fixes: "preserve CJS JSON require in ESM hooks", "preserve named exports from CommonJS TypeScript", "support module.exports require(esm) interop".

### 4.22.0 (lanzado 2026-05-14)
- Feature: "upgrade esbuild to 0.28".

### Anteriores
- tsx envía los exports `tsx/cjs` y `tsx/esm` desde 4.16.x (verificado desde el mapa `exports` de `node_modules/tsx/package.json`). El split en dos hooks de registro precede a la ventana de regresión.

### Última versión conocida funcionando
- tsx en sí no es el bug. El hook de registro `tsx/cjs` existe desde hace muchas versiones y funcionaría bien si el script lo usara. No necesitamos downgradear.

## §5. La transformación exacta

### Observación empírica
- `tsx/esm` (el loader ESM, registrado vía `--import tsx/esm`): registra hooks `initialize`, `load`, `resolve` sobre la cadena de loader ESM de Node. NO registra un hook CJS.
- `tsx/cjs` (el registro CJS, registrado vía `--import tsx/cjs` o `--require tsx/cjs`): llama a `module.register('../register-*.cjs')` que parchea el `Module._compile` y `Module._extensions['.ts']` CJS de Node para transpilar archivos `.ts` on the fly.

### Qué registra tsx/cjs
`node_modules/tsx/dist/cjs/index.cjs`:
```js
"use strict";var r=require("../register-BOkp8V6j.cjs");...;r.register();
```

`register-BOkp8V6j.cjs` parchea `Module._extensions['.ts']` para:
1. Leer la fuente `.ts`.
2. Correr esbuild sobre ella (eliminar sintaxis exclusiva de TS incluyendo `import type`).
3. Devolver la fuente compilada a CJS al loader CJS de Node.

### Qué registra tsx/esm
`node_modules/tsx/dist/esm/index.mjs`:
```js
import { ... } from "../register-tkXbOgAS.mjs"; ...; export { ... initialize, load, resolve };
```

Estos hookean la cadena `initialize`/`resolve`/`load` del ESM de Node — que sólo se consulta cuando un archivo se carga vía `import()` ESM, NO cuando se carga vía `require()` CJS.

### Por qué Node 23 oculta el bug
Node 23 cambió la semántica de `require()` para archivos ESM: cuando el `require()` CJS encuentra un archivo ESM, Node 23 devuelve el namespace ESM sincrónicamente vía interop `require(esm)`. El camino CJS se saltea parsear la fuente como CJS.

Node 22 NO hace esto: parsea la fuente como CJS primero, falla con sintaxis exclusiva de TS y muere.

## §6. Radio de explosión

### Packages con suites BDD (los únicos afectados)
- `libs/features/auth` (server package.json tiene script `bdd`; posee 18 escenarios a lo largo de 6 archivos `.feature`).
- `libs/features/transactions` (server package.json tiene script `bdd`; posee 25 escenarios a lo largo de 6 archivos `.feature`).
- Total: 43 escenarios, 9 archivos `.feature`, 5 archivos `.steps.ts`, 2 archivos `support/register.ts`, 2 configs `cucumber.mjs`, 2 archivos `package.json` (uno por slice).

### Packages SIN suites BDD (turbo run bdd aún los incluye en el task graph pero salen inmediatamente)
- `@core/config`, `@core/database`, `@core/events`, `@shared-utils/*`, `@gpr/eslint-plugin-boundary`, `apps/api`, `apps/web`. Ninguno tiene un script `bdd` en su package.json.
- Workspaces totales: 13 (según `pnpm-workspace.yaml`). De esos, 2 tienen suites BDD.

### Archivos afectados por Forma A (fix recomendado)
- `libs/features/auth/server/package.json` (1 línea cambiada).
- `libs/features/transactions/server/package.json` (1 línea cambiada).
- Sin otros archivos.

### Archivos NO afectados por Forma A
- Los 5 archivos `.steps.ts` quedan intactos.
- Ambos archivos `world.ts` quedan intactos.
- Ambos archivos `support/register.ts` quedan intactos.
- Ambos archivos `cucumber.mjs` quedan intactos.
- `pnpm-lock.yaml` queda intacto.
- Reglas de boundary de ESLint intactas.

### Contrato de test que cualquier fix debe pasar
- `pnpm turbo run bdd` debe salir 0 en Node 22.13.0 (matcheando CI).
- Los 43 escenarios BDD deben PASAR (18 auth + 25 transactions).
- Sin nuevas violaciones de frontera de ESLint.
- Sin nuevas dependencias.

## §7. Restricciones de las convenciones del proyecto

### AGENTS.md §7 (reglas de frontera de ESLint)
- `no-prisma-outside-core` — `new PrismaClient()` sólo en `libs/core/database/src/`. Sin afectar.
- `no-schemas-outside-shared` — schemas de Zod sólo en `libs/features/<x>/shared/schemas/`. Sin afectar.
- `no-client-server-import` — `libs/features/<x>/client/` NO DEBE importar de `*/server/`. Sin afectar.
- `no-cross-module-import` — `libs/features/<x>/...` NO DEBE importar de `libs/features/<y>/...`. Sin afectar.
- `no-mojibake-in-docs` — `Documents-es/**/*.md` NO DEBE contener CJK. Sin afectar (sin Markdown cambiado).

### AGENTS.md §13 (espejo en español)
- Sin archivos `.md` agregados o cambiados por Forma A → sin espejo en español requerido.
- Forma B/C/D tampoco requerirían docs nuevos (son cambios de config).

### Restricciones del workflow de CI
- El job BDD usa Node 22.13.0 + pnpm 11.10.0 + servicio Postgres 16-alpine. Timeout 30 min.
- El fix debe funcionar bajo estas condiciones exactas.

### Restricción: minimizar ediciones de fuente
- AGENTS.md §9 / §12 enfatizan "cambios mínimos" + "tests/docs con el código". El fix más limpio toca 2 líneas de `package.json`.

## §8. Candidatos de forma de fix

### Forma A (recomendada) — swap `tsx/esm` → `tsx/cjs` en NODE_OPTIONS

**Qué**: cambiar `"NODE_OPTIONS='--import tsx/esm'"` a `"NODE_OPTIONS='--import tsx/cjs'"` tanto en `libs/features/auth/server/package.json:17` como en `libs/features/transactions/server/package.json:17`.

**Delta LOC**: 2 líneas (1 por archivo). Cambio de un único token (`tsx/esm` → `tsx/cjs`).

**Riesgo**: Bajo. tsx/cjs es el hook de registro CJS oficial (enviado desde 4.16.x). Es el espejo de tsx/esm para callers CJS.

**Radio de explosión**: 2 archivos. Sin código fuente tocado. Sin impacto en ESLint. Sin nuevas dependencias.

**Revertibilidad**: Trivial — revert de una sola línea.

**Verificado**: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` en Node 22.14.0 → 18 scenarios (18 passed), 101 steps (101 passed), 0.34s.

### Forma B — cambiar cucumber de `require:` a `import:`

**Qué**: cambiar `require: ["support/register.ts"]` → `import: ["support/register.ts"]` en `cucumber.mjs` (ambos slices). Mantener `--import tsx/esm` en el script.

**Delta LOC**: 2 líneas (1 por archivo).

**Riesgo**: Bajo. La config `import:` de Cucumber usa `import()` ESM (según `node_modules/@cucumber/cucumber/lib/api/support.js:30-33`), que tsx/esm SÍ intercepta. Esta es la dirección "más limpia" a largo plazo — todos los archivos TypeScript se cargarían vía ESM, matcheando el setting `"type": "module"` del package.json de los slices.

**Radio de explosión**: 2 archivos `cucumber.mjs`. Sin código fuente tocado.

**Revertibilidad**: Trivial — revert de una sola línea.

**Tradeoff vs Forma A**: Más limpia a largo plazo (ESM por completo) pero requiere que el mantenedor de cucumber.mjs entienda el split de hook CJS/ESM. La Forma A es más quirúrgica.

### Forma C — reescribir `support/register.ts` como CJS

**Qué**: renombrar `support/register.ts` → `support/register.cjs`. Reescribir cada `import` como `require`. Reescribir cada `import type` como JSDoc o imports type-only.

**Delta LOC**: 60-80 líneas por archivo (2 archivos) = 120-160 líneas. Más cada `import type` en los 5 archivos `.steps.ts` necesitaría inlinearizarse como type-only `.d.ts` o reemplazarse con JSDoc.

**Riesgo**: Alto. Toca el archivo que el PR-7 introdujo explícitamente (`feat(bdd): slice 7 PR-8 — transactions register.ts bridge GREEN (#51)` y `feat(auth): slice 8 PR-1 — auth BDD bridge GREEN (#52)`). Volver a CJS borra la decisión arquitectónica que el slice tomó.

**Radio de explosión**: Alto. 7 archivos tocados (2 register.ts + 5 steps.ts + 2 world.ts).

**Revertibilidad**: Difícil — muchos archivos involucrados.

### Forma D — reemplazar tsx con otro registro (p.ej. `@swc-node/register`)

**Qué**: agregar `@swc-node/register` como devDependency, reemplazar referencias a `tsx` en los scripts BDD con `swc-node/register`.

**Delta LOC**: 1 cambio de dep + 2 líneas de script en `package.json`. Más regeneración de `pnpm-lock.yaml`.

**Riesgo**: Medio. Introduce una nueva dependencia que puede tener sus propias quirks. La regla de frontera `no-cross-module-import` lo permite (es dev dep, no cross-feature). El fix es más invasivo de lo necesario.

**Radio de explosión**: 1 dep + 2 archivos.

**Revertibilidad**: Moderada — necesita remoción de dep + regeneración de lockfile.

## §9. Contrato de verificación

Después del fix:
- `pnpm turbo run bdd` sale 0 en Node 22.13.0 (versión CI).
- Los 43 escenarios BDD continúan pasando (18 auth + 25 transactions).
- `pnpm lint` sale 0.
- `pnpm lint:fixtures` sale 0.
- `pnpm typecheck` no reporta errores nuevos.
- Sin nuevas dependencias en `pnpm-lock.yaml`.
- `git diff` contra develop muestra sólo los cambios de archivo intentados (2 líneas de `package.json` para Forma A).

## §10. Receta de reproducción diagnóstica

```bash
# Confirmar el bug de Node 22 (usar volta o nvm para pinear a un Node 22.x)
export PATH=/Users/sebailla/.volta/tools/image/node/22.14.0/bin:$PATH
node --version  # debe imprimir v22.x.x

# Reinstalar lockfile
pnpm install --frozen-lockfile

# Reproducir el bug
pnpm --filter @features/auth bdd

# Output esperado:
#   SyntaxError: Unexpected identifier 'AuthWorld'
#       at compileSourceTextModule (node:internal/modules/esm/utils:338:16)
#       at ModuleLoader.importSyncForRequire (node:internal/modules/esm/loader:353:18)
#       at loadESMFromCJS (node:internal/modules/cjs/loader:1385:24)
#       at Module._compile (node:internal/modules/cjs/loader:1536:5)

# Confirmar que el fix funciona
NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd

# Output esperado:
#   18 scenarios (18 passed)
#   101 steps (101 passed)
#   0m 0.34s
```

En Node 23.x el bug NO se reproduce — el Node 23.8.0 local (volta default) lo oculta. CI usa Node 22.13.0, que lo expone.

## Recomendación

**Forma A** es el fix recomendado:
- Cambio de 2 líneas (una por slice `package.json`).
- Cero código fuente tocado.
- Cero impacto en ESLint.
- Cero nuevas dependencias.
- Trivialmente revertible.
- Empíricamente verificado que hace que los 18 escenarios de auth pasen en Node 22.14.0.

La hipótesis original (regresión de tsx 4.23.0) está empíricamente falsificada. El fix apunta a la causa raíz real: el `require()` CJS de cucumber bypasea el hook ESM de tsx. tsx provee `tsx/cjs` exactamente para este caso; simplemente no lo estábamos usando.

## Próximos pasos

1. **propose** — Crear la propuesta SDD con Forma A como el fix recomendado, Forma B como la alternativa, Forma C/D como opciones rechazadas.
2. La propuesta debe referenciar este explore.md y Engram #2306.
3. La propuesta debe incluir un apply de 1 task (el cambio de 2 líneas de `package.json` + commit de lockfile si alguno) con una puerta de verificación de `pnpm turbo run bdd` en Node 22.x.
4. Después del apply, `pnpm turbo run bdd` debe pasar y la corrida de CI previamente fallando (29288016689) debe ponerse verde.
