# Delta Spec — `fix-orphan-shared-directories`

> **Proyecto**: `gastos-personales-reference` (`gp-v2`) · **Fecha**: 2026-07-14
> **Modo**: `auto` · **Almacén**: hybrid · **Strict TDD**: ACTIVO
> **Forma**: A · **Entrega**: PR único; `auto-chain` no disparado
> **Fuentes**: propuesta Engram `#2384`; explore Engram `#2382`

## 1. Encabezado

Estado: borrador · fase de spec. El cambio promueve los dos árboles de esquemas `shared/` de los features a paquetes del workspace y elimina los workarounds de resolución del store de pnpm.

## 2. Intención

Hacer explícita la propiedad de las dependencias para que los imports directos de `zod` se resuelvan mediante la resolución normal de paquetes en lugar de paths duplicados en los tsconfig de las apps hacia el store interno de pnpm.

## 3. Objetivos

- **G1**: Ambos directorios shared son paquetes del workspace.
- **G2**: pnpm reconoce ambos paquetes.
- **G3**: Ambos workarounds de `zod` en las apps se eliminan.
- **G4**: Los 11 importadores siguen resolviendo sin churn de imports en el código fuente.
- **G5**: El pipeline completo de Turbo pasa.
- **G6**: Los conteos de tests baseline se mantienen sin cambios.
- **G7**: No regresionan los slices/fixes previos ni las fixtures de frontera.

## 4. No-objetivos

Sin ediciones sobre esquemas, reescrituras de importadores, `tsconfig.json` por paquete, cambios en paquetes `server`, upgrades de dependencias, cambios en reglas de frontera, ni consolidación de paquetes.

## 5. Requerimientos funcionales

- **R1 (MUST)**: `libs/features/auth/shared/package.json` MUST declarar `name: "@features/auth/shared"`, `version: "0.0.0"`, `private: true`, `main: "./src/index.ts"`, y `dependencies: { zod: "4.4.3" }`.
- **R2 (MUST)**: `libs/features/transactions/shared/package.json` MUST tener la forma de R1 con `name: "@features/transactions/shared"`.
- **R3 (MUST)**: Cada paquete MUST contener `src/index.ts` que re-exporte cada módulo de esquema, incluyendo formas como `export * from "./schemas/login"`.
- **R4 (MUST)**: `pnpm-workspace.yaml` MUST declarar ambos paquetes explícitamente o mediante un glob `packages` que los cubra.
- **R5 (MUST)**: `apps/api/tsconfig.json` MUST eliminar `paths.zod` y su JSDoc de tres líneas; ninguna referencia a `zod` puede quedar.
- **R6 (MUST)**: `apps/web/tsconfig.json` MUST eliminar `paths.zod` y cualquier JSDoc asociado; ninguna referencia a `zod` puede quedar.
- **R7 (MUST)**: Los 11 importadores MUST resolver correctamente con los imports relativos/aliases existentes preservados.
- **R8 (MUST)**: `pnpm turbo run test bdd lint typecheck build` MUST salir con 0.
- **R9 (MUST)**: Web 145/145, API 22/22, y BDD 43/43 MUST pasar.
- **R10 (SHOULD)**: `docs/architecture/decisions/0011-shared-as-workspace-packages.md` y su espejo en español SHOULD documentar la decisión.
- **R11 (SHOULD)**: Cada nuevo manifiesto SHOULD llevar una explicación estilo JSDoc de por qué existe la frontera del paquete shared.

## 6. Escenarios

```gherkin
Scenario: Los paquetes shared del workspace existen
  Given ambos directorios shared previamente no tenían package.json
  When se aplica el fix
  Then cada package.json MUST existir con el nombre de paquete especificado
  And cada MUST declarar la versión 4.4.3 de zod como dependency

Scenario: pnpm reconoce los paquetes nuevos
  Given los dos archivos package.json nuevos existen
  When corre pnpm install --frozen-lockfile
  Then pnpm MUST reconocer ambos nombres de paquete como paquetes del workspace
  And pnpm-workspace.yaml MUST contener una declaración que los cubra

Scenario: Los workarounds de los tsconfig de las apps se eliminan
  Given ambos tsconfig de las apps previamente mapeaban paths.zod al store interno de pnpm
  When se aplica el fix
  Then ambos mappings paths.zod y sus comentarios asociados MUST estar ausentes
  And ninguna referencia a zod MUST quedar en ninguno de los tsconfig de las apps

Scenario: Los 11 importadores siguen resolviendo zod
  Given ambos paquetes del workspace declaran zod y los paths de los importadores se preservan
  When corren pnpm install y el build
  Then los 11 importadores MUST resolver mediante la resolución normal de paquetes
  And no se MUST reportar ningún error TS2307

Scenario: El pipeline completo de Turbo pasa
  Given el fix se aplicó
  When corre pnpm turbo run test bdd lint typecheck build
  Then toda tarea solicitada MUST salir con 0

Scenario: Los conteos de tests coinciden con la baseline
  Given el fix se aplicó
  When corren las suites de API, web y BDD
  Then API MUST reportar 22/22 y web MUST reportar 145/145 pasando
  And BDD MUST reportar 43/43 escenarios pasando

Scenario: Los slices previos y las reglas de frontera no regresionan
  Given las cadenas del slice 7 y slice 8 y los fixes previos están en verde
  When corren el pipeline completo, las fixtures de lint y la suite de Cucumber
  Then todos MUST pasar sin regresión
```

## 7. Superficie de restricciones

Los esquemas siguen bajo `shared/schemas` del feature; no se introducen imports client→server ni cross-feature. Strict TDD requiere observar la falla de resolución antes de los cambios de producción/config, luego GREEN mediante typecheck/build focalizado, triangulación a través de todos los importadores, y verificación completa del refactor. El ADR requiere el espejo en español obligatorio; este spec de cambio intencionalmente no lo tiene según instrucción del orquestador.

## 8. Plan de tests

| Cobertura | Comando | Esperado |
|---|---|---|
| Install del workspace | `pnpm install --frozen-lockfile` | ambos paquetes reconocidos |
| Gate completo | `pnpm turbo run test bdd lint typecheck build` | exit 0 |
| API | `pnpm --filter api test` | 22/22 PASS |
| Web | `pnpm --filter web test` | 145/145 PASS |
| BDD | `pnpm turbo run bdd` | 43/43 PASS |
| Fronteras | `pnpm lint:fixtures` | exit 0 |

## 9. Criterios de aceptación

Las verificaciones de archivos/resolución R1–R7 pasan; la evidencia de los comandos R8–R9 coincide exactamente; ambos barrels exportan cada esquema; no se reescribe ningún importador; R10 incluye su espejo en español sincronizado si se autoriza; R11 está presente o se justifica su omisión.

## 10. Fuera de alcance

Sin expansión de i18n, observabilidad, hardening, enforcement del gate de cobertura, UI de audit log, expansión de OAuth, rate limiting, ni migración del repositorio original.

## 11. Preguntas abiertas — Resueltas

- **Q1**: MANTENER los imports relativos/aliases existentes.
- **Q2**: NO hacer tsconfigs por paquete.
- **Q3**: SÍ, agregar barrels `src/index.ts`.
- **Q4**: SÍ, agregar el ADR corto más el espejo en español.
- **Q5**: SÍ, verificar la declaración del workspace; el glob existente `libs/*/*/*` satisface R4, por lo que se edita solo si la verificación desmiente la cobertura.

## 12. Trazabilidad

| Requerimiento | Objetivos satisfechos |
|---|---|
| R1, R2 | G1 |
| R3 | API del barrel |
| R4 | G2 |
| R5, R6 | G3 |
| R7 | G4 |
| R8 | G5, G7 |
| R9 | G6 |
| R10 | ADR |
| R11 | Racional del paquete |
