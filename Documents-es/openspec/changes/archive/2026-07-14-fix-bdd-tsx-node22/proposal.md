# Propuesta — `fix-bdd-tsx-node22`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-13
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-bdd-tsx-node22`
> **Almacén de artefactos**: hybrid · **Modo**: auto
> **Forma del fix**: **A** — swap de 2 líneas de configuración; trivialmente revertible.
> **PR único**: 2 archivos en alcance, tope de ~82 LOC netas (muy por debajo del presupuesto de revisión de 400 líneas) · `auto-chain` NO disparado.

---

## 1. Intención

La puerta BDD de CI en `develop` está rota en Node 22. La corrida `29288016689` de CI (enlazada desde el brief de exploración) falla todo PR con validación BDD con `SyntaxError: Unexpected identifier 'AuthWorld'` en `compileSourceTextModule` (Node `22.14.0`, stack idéntica en `22.13.0`). La causa raíz está verificada empíricamente, no hipotetizada: la configuración `require:` de Cucumber 13 invoca el `require()` **CJS** de Node para cargar `support/register.ts` (`@cucumber/cucumber/lib/try_require.js:8`), mientras que los scripts `bdd` de los slices registran el hook de loader **ESM** (`--import tsx/esm`). Los hooks ESM NO interceptan el `require()` CJS. Node 22 entonces parsea el archivo `.ts` como CJS, encuentra la sintaxis `import type { AuthWorld }` (sólo de TypeScript), y lanza. La hipótesis (Engram #2301) que atribuía el bug a tsx 4.23.0 está empíricamente falsificada: tsx 4.22.5, 4.23.0 y 4.23.1 fallan idénticamente. El fix es un swap de un token por línea: `--import tsx/esm` → `--import tsx/cjs` (el hook de registro CJS oficial de tsx, presente desde tsx 4.16.x, actualmente en `4.23.0`). Verificado empíricamente: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` en Node `22.14.0` devuelve `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s. Radio de explosión: todo PR con validación BDD desde slice-7 en adelante o bien fue admin-mergeado o bien lleva una puerta BDD rota — arreglar esto desbloquea el próximo ciclo de BDD CI verde.

---

## 2. Alcance

### 2.1 En alcance

1. `libs/features/auth/server/package.json` línea 17 — cambiar el `NODE_OPTIONS` del script `bdd` de `--import tsx/esm` a `--import tsx/cjs`. Edición de un único token (`tsx/esm` → `tsx/cjs`).
2. `libs/features/transactions/server/package.json` línea 17 — misma edición de un único token.
3. Observación Engram en `topic_key sdd/fix-bdd-tsx-node22/proposal`, `type=architecture`, `project=gp-v2`, `scope=project`, `capture_prompt=false` persiste la propuesta en el almacén de artefactos hybrid (coincide con el archivo OpenSpec bajo §11).

### 2.2 Fuera de alcance

- Sin cambios en ningún archivo `support/register.ts` (ambos slices).
- Sin cambios en ningún archivo `cucumber.mjs` (ambos slices).
- Sin cambios en ningún archivo `.steps.ts` / `.feature` / `world.ts` (la superficie BDD de los slices queda intacta).
- Sin cambios en `.github/workflows/ci.yml` (la configuración del job BDD es correcta: Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, timeout de 30 min — sólo necesita que los scripts de slice funcionen).
- Sin pin de versión de tsx (el bug es el hook incorrecto, no la versión; `^4.23.0` ya cubre el rango completo 4.23.x).
- Sin cambio de versión de Node (Node 22.13.0 es el target de CI; el fix funciona en Node 22.x según el test empírico en `22.14.0` y se mantiene consistente en Node 23.x según el mismo contrato de hook).
- Sin cambios en `apps/web` o `apps/api`.
- Sin nuevas devDependencies; sin regeneración de `pnpm-lock.yaml`.
- Sin nuevas reglas ESLint, sin ediciones al plugin de boundary, sin impacto en `pnpm lint:fixtures`.
- Sin nuevos escenarios BDD, sin nuevos tests unitarios/e2e.
- Sin ADR (informalmente: el cambio son dos líneas de `package.json` intercambiando entre dos entradas oficiales de tsx documentadas en <https://tsx.is>; un ADR para esto es burocrático). **Q1 en §11 pide al usuario confirmar.**
- Sin espejo en `Documents-es/` — ningún `.md` en inglés se agrega bajo `openspec/` o `docs/` por este cambio (según AGENTS.md §13; mismo precedente que la propuesta de `fix-api-nestjs-di` que sólo espejó la nueva ADR, no la propuesta en sí).
- Nada de la lista de fuera de alcance de AGENTS.md §11 (i18n más allá de en/es, Sentry, rate-limiting, proveedores OAuth más allá de Google, hardening de producción, observabilidad, gate de cobertura, UI de audit log).

---

## 3. Enfoque

Swap puro de configuración. Un token por archivo. Sin código, sin tests, sin infra. Dos líneas cambian; todo lo demás queda igual.

### 3.1 Por qué `tsx/cjs` funciona

tsx 4.16.x en adelante envía DOS hooks de registro (verificado en el mapa `exports` de `node_modules/tsx/package.json`):

- `tsx/esm` — registrado vía `--import tsx/esm`. Hookea la cadena `initialize`/`resolve`/`load` del ESM de Node. Interceptado SOLO cuando un archivo se carga vía `import()` ESM.
- `tsx/cjs` — registrado vía `--import tsx/cjs` (o `--require tsx/cjs`). Llama a `module.register('../register-*.cjs')` que parchea `Module._extensions['.ts']` y `Module._compile` para correr esbuild sobre fuentes `.ts` **antes** de que el parser CJS de Node las vea. Esto elimina la sintaxis exclusiva de TS (`import type`, propiedades de parámetro, enums) y devuelve CJS transpilado a Node. Este es exactamente el camino que toma la configuración `require:` de Cucumber (`try_require.js:8` → `require(path)`).

Los scripts de slice estaban registrando el hook equivocado. Cucumber usa `require()` CJS; el script registraba un hook ESM. Ningún swap de versión corrige ese mismatch — sólo cambiar al hook CJS lo hace.

### 3.2 Por qué Node 22 expone el bug y Node 23 lo oculta

El parser CJS de Node 22 es estricto: cuando el `require()` CJS encuentra un archivo `.ts` sin override `package.json#type`, lo parsea como CJS primero y muere con sintaxis exclusiva de TS (`SyntaxError: Unexpected identifier 'AuthWorld'`). Node 23 cambió la semántica de `require()` para archivos ESM (interop `require(esm)`), saltándose el paso de parseo CJS para archivos que los hooks ESM ya hayan registrado — que es exactamente por qué el Node 23.8.0 local (volta default) oculta el bug mientras que el Node 22.13.0 de CI lo expone.

### 3.3 Qué cambia el fix (concretamente)

```diff
- "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
+ "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

Diff idéntico aplicado tanto a `libs/features/auth/server/package.json:17` como a `libs/features/transactions/server/package.json:17`. Dos líneas, un token cada una.

### 3.4 Por qué no la Forma B (configuración `import:` de Cucumber)

Cucumber también soporta una configuración `import:` que usa `import()` ESM en lugar de `require()` CJS, lo que dejaría funcionar a `--import tsx/esm`. Esta es la "dirección más limpia a largo plazo" (todo TypeScript cargado vía ESM, en consonancia con el setting `"type": "module"` de los slices). Se rechaza para este cambio porque:

- Cambia el mecanismo de loader de Cucumber, que es más significativo arquitectónicamente que un tweak de un token en el script.
- Es una forma de fix diferente (Forma B en el brief de exploración) y no es lo que se verificó empíricamente.
- La Forma A es la intervención mínima-quirúrgica; la Forma B se puede retomar en un cambio dedicado si el equipo quiere estandarizar en ESM por completo.

---

## 4. Capacidades

> Contrato entre esta propuesta y `sdd-spec`. Investigar `openspec/specs/` primero para usar los nombres correctos de capacidades existentes. Nota: `openspec/specs/` NO existe aún en esta rama (los slices han entregado sólo spec-proposals, no specs independientes).

### 4.1 Nuevas capacidades

**Ninguna.** Este es un fix sólo de configuración que restaura el comportamiento esperado del runner BDD pre-existente. No hay nuevas superficies de contrato.

### 4.2 Capacidades modificadas

**Ninguna.** No hay cambios de comportamiento a nivel de spec. Los escenarios BDD, las definiciones de steps, los tipos world, los archivos Gherkin `.feature`, las configuraciones de Cucumber y los archivos `support/register.ts` permanecen byte a byte idénticos. El fix sólo cambia QUÉ hook de loader de Node transforma TypeScript en el momento de `require()` — los escenarios y su semántica no cambian.

> Nota para `sdd-spec`: si la fase de spec decidiera que se justifica una capacidad (p.ej. `bdd-runner-loader-chain` documentando "el runner BDD debe transformar TypeScript en el mismo camino de loader que Cucumber usa"), puede introducirla. La propuesta se mantiene neutral porque el directorio `openspec/specs/` existente está vacío y la propuesta no debe inventar un nombre de capacidad preventivamente.

---

## 5. Áreas afectadas

| Archivo | Cambio | Delta LOC |
|------|--------|----------:|
| `libs/features/auth/server/package.json` | Editar (swap `--import tsx/esm` → `--import tsx/cjs` en el script `bdd`, línea 17) | +1 / -1 |
| `libs/features/transactions/server/package.json` | Editar (mismo swap, línea 17) | +1 / -1 |

**Total estimado**: +2 / -2, **2 LOC netas**. Muy por debajo del presupuesto de revisión de 400 líneas → **el PR único es apropiado**, `auto-chain` NO se dispara.

**Archivos NO tocados (verificado contra el brief de exploración §1, §2, §6):**
- Todos los 9 archivos `.feature` (6 auth + 6 transactions — un momento: explore §6 dice 9 archivos para 12 features divididos como 6+6, totalizando 12; esta propuesta no necesita enumerarlos).
- Todos los 5 archivos `.steps.ts` (3 en auth, 2 en transactions; explore §2 los enumera).
- Ambos archivos `world.ts`.
- Ambos archivos `support/register.ts`.
- Ambos archivos `cucumber.mjs`.
- `pnpm-lock.yaml`.
- `tools/eslint-plugin-boundary/` (ni regla, ni fixture, ni config, ni ediciones al runner).
- `.github/workflows/ci.yml`.
- `apps/web/**` y `apps/api/**`.
- `Documents-es/**`.
- Ningún `docs/architecture/decisions/*.md` (sin ADR — ver Q1 en §11).

---

## 6. Criterios de éxito

`sdd-verify` correrá estas 6 puertas.

**Funcional (G1–G3)**: G1 — `pnpm --filter @features/auth bdd` sale con 0 en Node 22.13.0 (versión CI); los 18 escenarios de auth pasan; los 101 steps de auth pasan. G2 — `pnpm --filter @features/transactions bdd` sale con 0 en Node 22.13.0; los 25 escenarios de transactions pasan. G3 — `pnpm turbo run bdd` sale con 0 a lo largo del workspace (los 11 workspaces sin un script `bdd` salen inmediatamente y no contribuyen fallos).

**Seguridad de regresión (G4)**: G4 — el conteo de escenarios BDD permanece 43/43 (18 auth + 25 transactions); ningún escenario es skipeado, marcado pending ni removido por el fix.

**Higiene (G5–G6)**: G5 — el job BDD de CI (`pnpm turbo run bdd`) en `feat/fix-bdd-tsx-node22` reporta **PASS** (previamente `FAIL`), confirmando que el fix end-to-end aterrizó. G6 — `git diff` contra `develop` muestra exactamente el cambio de 2 archivos, 2 líneas en §5; ningún edit incidental al lockfile, config ESLint, workflow de CI ni archivos `.ts`.

---

## 7. Riesgos

| ID | Riesgo | Probabilidad | Mitigación |
|----|--------|--------------|------------|
| R1 | `tsx/cjs` podría diferir de `tsx/esm` para top-level await o async module loading, rompiendo algunos escenarios. | Baja | Los escenarios BDD no usan top-level await (verificado por inspección en slice-7 PR-7). El test empírico en Node 22.14.0 ya mostró que los 18 escenarios de auth pasan con `tsx/cjs` en 0.34s. El slice de transactions tiene la misma forma de imports — misma expectativa. |
| R2 | `tsx/cjs` podría no estar disponible en versiones antiguas de tsx. | Baja | tsx 4.16.x envía ambos hooks; `^4.23.0` (rango en package.json) satisface `>=4.16.0`. El hook está documentado en <https://tsx.is/getting-started>. |
| R3 | Un major futuro de tsx podría remover `tsx/cjs`. | Baja | El mapa `exports` de tsx declara ambos hooks desde 4.16.x sin nota de deprecación; ambos son entry points documentados. Si se removiera, el fix futuro sería una actualización de 2 líneas espejando el fix actual — misma forma, diferente token. |
| R4 | El fix podría regresionar entornos de dev locales corriendo Node 23.x. | Baja | `tsx/cjs` hookea la cadena de loader CJS sin importar el major de Node; tanto Node 22 (target CI) como Node 23 (dev default) obtienen el mismo contrato de hook. El test empírico `tsx/cjs` en Node 22.14.0 reproduce el mismo comportamiento de hook documentado para interop ESM/CJS de Node 22+. |
| R5 | Un PR previo pudo haber admin-mergeado un override de la puerta BDD que asume la configuración antigua `tsx/esm`; ese override podría ahora fallar. | Baja | Los PRs slice-7 / slice-8 no entregan ningún override de configuración `tsx` más allá de los dos scripts `bdd`. El historial de admin-merge (de slice-7 PR-7, PR-8, slice-8 PR-1) fue un workaround para esta misma puerta — el fix ahora cierra esa brecha y ningún override queda obsoleto. |

---

## 8. Plan de rollback

**Cambio completo**: `git revert <merge-sha>` en `develop` deshace el PR único limpiamente. Las 2 líneas de `package.json` vuelven a `--import tsx/esm`; la puerta BDD falla con el mismo `SyntaxError` con el que falla hoy. Aceptable porque la puerta BDD ya estaba rota en `develop@ea7732f` (el estado pre-fix) — revertir sólo restaura la línea base conocida como mala.

**Rollback por línea** (revert independiente de cualquier slice):
- Revertir `libs/features/auth/server/package.json:17` sólo: el BDD de auth falla como antes; el BDD de transactions pasa por su cuenta. Aceptable si un único slice necesita una salida de emergencia.
- Revertir `libs/features/transactions/server/package.json:17` sólo: simétrico.

**No se hará**: force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-api-nestjs-di}/`, amend de cualquier commit de slice-7 o slice-8, downgrade de tsx, cambio de versión de Node, swap a Forma B/C/D en línea (esas son cambios separados).

---

## 9. Dependencias

- `tsx@^4.23.0` (declarado en `package.json` raíz línea 39). Ya instalado en `4.23.0` (resolución hoisted única en `pnpm-lock.yaml`). Envía tanto `tsx/cjs` como `tsx/esm` desde 4.16.x. **Sin upgrade requerido.**
- `@cucumber/cucumber` 13.x (usa la configuración `require:` → camino CJS `require()`). Ya instalado. **Sin upgrade requerido.**
- Node 22.13.0 (CI) y Node 22.14.0 (empírico local). Ambos exponen idénticamente el contrato del hook de registro `tsx/cjs`. **Sin bump de engine.**
- Harness BDD existente: `support/register.ts` (ambos slices) + `cucumber.mjs` (ambos slices) + archivos de step-def (5 archivos) + archivos `.feature` (12 a lo largo de ambos slices). Todo permanece byte-idéntico. **Sin reescritura de harness.**
- El directorio de cambios OpenSpec `openspec/changes/fix-bdd-tsx-node22/` ya existe con `explore.md` (Engram #2306).

---

## 10. Preguntas abiertas para `sdd-spec`

1. **ADR 0009** — ¿debería el cambio entregar una pequeña ADR (`docs/architecture/decisions/0009-bdd-cjs-loader.md`) documentando la elección de hook de loader? **Recomendación: NO.** El cambio son dos líneas de `package.json` intercambiando entre dos entradas oficiales de tsx; un ADR para un tweak de configuración de este tamaño es sobrecarga burocrática. La propuesta defiere al usuario. Si la respuesta es SÍ, la ADR + espejo en español juntos agregan ~80 LOC netas; ambos quedan muy por debajo de cualquier tope de tamaño y siguen el precedente de formato de `0007-slice-8-doc-loc-exception.md`.
2. **Script `bdd:debug`** — ¿deberíamos agregar un script hermano `bdd:debug` que use `--import tsx/cjs --inspect` para debugging local? **Recomendación: NO.** Scope creep; no solicitado; el script `bdd` existente es suficiente para debugging local una vez que esté funcionando.
3. **Flag `--bail` en CI** — ¿deberíamos agregar `pnpm turbo run bdd --bail` al job de CI para que la corrida falle rápido en el primer slice? **Recomendación: NO.** Fuera de alcance; el job BDD ya corre todos los slices y el setup existente es suficiente. El fix es independiente de la semántica de fail-fast de CI.
4. **Creación de capacidad en `openspec/specs/`** — según §4.2, la propuesta afirma que no hay cambio de comportamiento a nivel de spec. Si `sdd-spec` discrepa y quiere formalizar el contrato de hook de loader (p.ej. capacidad `bdd-runner-loader-chain`: "el runner BDD debe transformar TypeScript en el mismo camino de loader que Cucumber usa"), esa capacidad aterrizaría como `openspec/specs/bdd-runner-loader-chain/spec.md`. **Recomendación: deferir al juicio de `sdd-spec`.** Esta propuesta no preemptivamente nombra una capacidad.

---

## 11. Referencias cruzadas

- Brief de exploración: `openspec/changes/fix-bdd-tsx-node22/explore.md` (observación Engram #2306).
- Hipótesis original (incorrecta): Engram #2301 — "tsx 4.23.0 regression". Falsificada empíricamente por el sub-agente de exploración; superseded por #2306.
- Mapa de exports de tsx: campo `exports` de `node_modules/tsx/package.json` — declara tanto `tsx/esm` como `tsx/cjs` desde 4.16.x (citado en explore §4 y §5).
- Anatomía de la cadena de loader: explore §3 (`@cucumber/cucumber/lib/try_require.js:8` + la cadena de loader CJS de Node).
- Test empírico: explore §5 y §10 — `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` en 0.34s en Node 22.14.0.
- Corrida de CI fallando (ahora arreglada): `29288016689` (citada en explore §10 "Next steps").
- Slice-7 PR-7 (bridge `register.ts` de transactions GREEN), Slice-7 PR-8, Slice-8 PR-1: la cadena de PRs admin-mergeados que trabajaron alrededor de esta puerta; este fix cierra la puerta subyacente para que los PRs futuros con validación BDD no necesiten el workaround.
- Reporte de verificación de slice-8: Gate 3 / deuda pre-existente de slice-7 bajo observación F1 — este cambio es exactamente esa deuda, finalmente saldada.
- Convenciones del proyecto: AGENTS.md §4 (TDD estricto — fix sólo de config, sin test RED necesario porque no hay código de producción a probar), §5 (commits atómicos — las 2 líneas de `package.json` aterrizan en UN solo commit), §6 (Conventional Commits — único `fix(bdd): use tsx/cjs loader hook so BDD runs on Node 22`), §7 (fronteras arquitectónicas — ninguna afectada), §11 (lista de fuera de alcance — ninguno de sus items tocado), §12 (checklist pre-commit — commit de propósito único, trivial de rollback, ESLint intacto), §13 (espejo en español — no requerido porque ningún `.md` en inglés se agrega bajo `openspec/` o `docs/`).
- Precedente de formato de propuesta: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/proposal.md` (espejó esta estructura).

---

## 12. Siguiente fase

`next_recommended`: **`spec`**.

`sdd-spec` debería:
- Confirmar la postura "sin cambio de capacidad" de §4 (este es un fix sólo de configuración). Si la fase de spec discrepa, crear `openspec/specs/bdd-runner-loader-chain/spec.md` según Q4 en §10.
- Resolver Q1 (¿ADR?), Q2 (¿`bdd:debug`?), Q3 (¿`--bail` en CI?) con el usuario.
- Producir una spec delta en `openspec/changes/fix-bdd-tsx-node22/spec.md` capturando los criterios de éxito G1–G6 como escenarios observables (la spec es esencialmente "el hook de loader es `tsx/cjs`, los 43 escenarios BDD pasan en Node 22.13.0").

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1–R5 (ver §7) · `goals_count`: 6 · `open_questions_count`: 4 (Q1–Q3 de §10, Q4 de §4.2).
