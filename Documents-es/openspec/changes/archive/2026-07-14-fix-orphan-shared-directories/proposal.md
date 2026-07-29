# Propuesta — `fix-orphan-shared-directories`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Modo**: auto · **Almacén de artefactos**: hybrid · **Forma del fix**: A

## 1. Intención

`libs/features/auth/shared` y `libs/features/transactions/shared` son módulos de esquemas que contienen código fuente (10 archivos de esquemas Zod + 2 barrels + tests Vitest colocados junto al código) sin tener su propio `package.json`. Como los imports directos de `zod` dentro de esos archivos no se pueden resolver mediante el ancestor-walk de Node10 cuando los directorios carecen de frontera de paquete, el código carga con un workaround frágil: **dos** mappings `paths` en `tsconfig` (uno en `apps/api/tsconfig.json` y otro duplicado en `apps/web/tsconfig.json`) que apuntan directamente al store interno de pnpm en `node_modules/.pnpm/zod@4.4.3/node_modules/zod`. El mapping depende del layout exacto de hoisting de pnpm y se rompe en el momento en que pnpm mueva esa ruta. El fix verificado consiste en promover cada `shared/` a un paquete propio del workspace (Forma A en `explore.md` §6) para que la propiedad de la dependencia sea explícita y la resolución fluya por la cadena normal `package.json → node_modules/zod`. Blast radius: 11 importadores de producción + los 2 workarounds de tsconfig de las apps + la metadata del workspace.

## 2. Alcance

### En alcance
- `libs/features/auth/shared/package.json` — paquete NUEVO del workspace `@features/auth/shared` que declara `zod` como `dependency`.
- `libs/features/auth/shared/tsconfig.json` — `tsconfig` por paquete NUEVO opcional (ver §8 Q2).
- `libs/features/transactions/shared/package.json` — paquete NUEVO del workspace `@features/transactions/shared` que declara `zod` como `dependency`.
- `libs/features/transactions/shared/tsconfig.json` — `tsconfig` por paquete NUEVO opcional (ver §8 Q2).
- `pnpm-workspace.yaml` — confirmar que el glob existente `libs/*/*/*` ya captura ambos paquetes nuevos; no requiere edición salvo que el glob necesite ajustarse para que el workspace los reconozca. Ver §8 Q5.
- `apps/api/tsconfig.json` — ELIMINAR el mapping `zod` de `paths` (entrada de 5 líneas más su comentario JSDoc de 4 líneas).
- `apps/web/tsconfig.json` — ELIMINAR el mapping `zod` de `paths` (entrada de 12 líneas más su comentario JSDoc de 9 líneas).
- 11 importadores de producción — MANTENER los imports relativos (ver §8 Q1), por lo que no se requieren ediciones de código fuente más allá de lo que las eliminaciones de los mappings de tsconfig implican.

### Fuera de alcance
- Ninguna edición sobre los 10 archivos fuente de esquemas.
- Ninguna edición sobre `libs/features/auth/server/package.json` ni sobre `libs/features/transactions/server/package.json` (la Forma A mantiene intactos los paquetes `server` existentes; la Forma C queda rechazada).
- Ninguna edición sobre el esquema de env de `@core/config` ni sobre ningún paquete de core.
- Ningún refactor de los paquetes `server` existentes para fusionar esquemas (Forma C — rechazada explícitamente por `explore.md` §6).
- Ningún cambio en las reglas de frontera de ESLint ni en `no-schemas-outside-shared`; los esquemas siguen viviendo bajo `libs/features/<x>/shared/schemas/`.
- Ninguna reescritura de barrel/`src/index.ts` en la capa `server`; las re-exportaciones existentes de `../../shared/schemas/index.js` siguen funcionando.
- Ningún cambio en la configuración de Vitest (los aliases existentes resuelven a rutas de fuente y siguen siendo válidos una vez que los paths de los paquetes coincidan).
- Ningún cambio en dependencias de Next.js ni de NestJS.

## 3. Enfoque

Promover cada directorio `shared/` a un paquete de primera clase del workspace con su propio `package.json`. Cada paquete nuevo:

- Declara `name` siguiendo el scope propuesto (`@features/auth/shared` y `@features/transactions/shared`).
- Declara `zod: 4.4.3` como `dependency` (no `devDependency`) para que pnpm lo hoisted dentro del `node_modules` del paquete.
- Define `private: true`, `type: "module"`, `main`/`types` apuntando a `./schemas/index.ts`, y un mapa `exports` que refleja el patrón de `libs/features/auth/server/package.json`.
- Se mantiene ESM, con versión `1.1.1` (igual que los paquetes `server` hermanos por ahora).

Por qué funciona:

1. **Normaliza la resolución.** Una vez que cada `shared/` tiene su propio `package.json`, los imports directos de `zod` dentro de los archivos de esquema se resuelven a través de la cadena `node_modules/zod` propia del paquete mediante el ancestor-walk de Node10. El workaround `paths.zod` del `tsconfig` deja de ser necesario en ninguna de las apps.
2. **Preserva el bounded context.** Cada árbol shared pertenece exactamente a un slice (auth o transactions); no se introducen imports cross-slice. La regla de ESLint `no-schemas-outside-shared` sigue vigente.
3. **Mantiene la costura client/server.** Los esquemas siguen siendo código de contrato compartido, no se pliegan dentro de los paquetes `server` (lo que habría violado la costura según la Forma C de `explore.md` §6).
4. **Blast radius mínimo.** Los importadores siguen resolviendo por los mappings de tsconfig `@features/auth/*` y `@features/transactions/shared/*` ya existentes más los paths relativos `../../shared/schemas/index.js`. Cuando los mappings de `zod` se eliminan, esos aliases siguen resolviendo los esquemas a través del workspace, ahora respaldados por la metadata real del paquete.
5. **Se alinea con `pnpm-workspace.yaml`.** El glob existente `libs/*/*/*` ya matchea ambos directorios de paquete nuevos; pnpm los levantará en cuanto `package.json` esté presente, sin requerir edición del workspace (ver §8 Q5 para el caso condicional).

## 4. Inventario de archivos afectados

| Archivo | Cambio | Delta de LOC |
|------|--------|-----------|
| `libs/features/auth/shared/package.json` | NUEVO: paquete del workspace `@features/auth/shared` con dep `zod@4.4.3` | +15 / 0 |
| `libs/features/auth/shared/tsconfig.json` | NUEVO (opcional, ver §8 Q2): extiende base, refleja patrones de las apps | +10 / 0 |
| `libs/features/transactions/shared/package.json` | NUEVO: paquete del workspace `@features/transactions/shared` con dep `zod@4.4.3` | +15 / 0 |
| `libs/features/transactions/shared/tsconfig.json` | NUEVO (opcional, ver §8 Q2): extiende base, refleja patrones de las apps | +10 / 0 |
| `pnpm-workspace.yaml` | Editar solo si el glob `libs/*/*/*` no matchea; ver §8 Q5 | +2 / 0 (o 0/0) |
| `apps/api/tsconfig.json` | Editar: ELIMINAR el mapping `zod` de `paths` + su JSDoc de 4 líneas | -9 / 0 |
| `apps/web/tsconfig.json` | Editar: ELIMINAR el mapping `zod` de `paths` + su JSDoc de 9 líneas | -21 / 0 |
| 11 importadores | Sin edición (Q1=MANTENER relativo; los paths relativos + aliases existentes siguen siendo válidos) | 0 / 0 |

**Total estimado: ~30–50 LOC netas** (depende de si Q2 agrega tsconfigs por paquete y de si Q5 requiere edición del workspace). PR único; no se dispara auto-chain.

## 5. Objetivos

- **G1**: Tanto `libs/features/auth/shared/package.json` como `libs/features/transactions/shared/package.json` existen con metadata válida del workspace, `name`, `zod@4.4.3` declarado como `dependency`, y `main`/`exports` apuntando a `./schemas/index.ts`.
- **G2**: `pnpm-workspace.yaml` reconoce ambos paquetes nuevos (sea por el glob `libs/*/*/*` existente o por una edición explícita según §8 Q5).
- **G3**: El mapping `zod` de `paths` se elimina tanto de `apps/api/tsconfig.json` como de `apps/web/tsconfig.json`, junto con sus comentarios JSDoc.
- **G4**: Los 11 importadores de producción siguen resolviendo sus imports correctamente a través de los aliases y paths relativos de tsconfig existentes.
- **G5**: `pnpm turbo run test bdd lint typecheck build` sale con 0 en todos los workspaces.
- **G6**: 145/145 tests de apps/web + 22/22 tests de apps/api + 43/43 escenarios BDD todos en PASS.
- **G7**: Sin regresión: la cadena del slice 7 + la cadena del slice 8 + los fix-PRs previos siguen pasando.

## 6. No-objetivos

Sin ediciones sobre los archivos fuente de esquemas, sin ediciones sobre `libs/features/auth/server/package.json` ni sobre `libs/features/transactions/server/package.json`, sin ediciones sobre `@core/config`, sin fusión de esquemas en los paquetes `server` (Forma C rechazada), sin cambios en reglas de ESLint, sin reescritura de barrel `src/index.ts` en la capa `server`, sin cambios en la configuración de Vitest, sin cambios en dependencias de Next/Nest, sin cambios en la infraestructura de tests, sin tests nuevos, sin tests `.skip`/`.todo`.

## 7. Riesgos

| ID | Riesgo | Probabilidad | Mitigación |
|----|------|------------|------------|
| R1 | La forma `main`/`exports` del nuevo `package.json` no coincide con la ruta de resolución que esperan las apps. | Media | Reflejar exactamente la forma `main`/`types`/`exports` de `libs/features/auth/server/package.json`; mantener `./schemas/index.ts` como entrypoint para que los paths relativos + aliases sigan resolviendo. |
| R2 | pnpm hoisted `zod` de forma diferente a la esperada y una resolución de `zod` sigue fallando para alguna app. | Baja–Media | Declarar `zod@4.4.3` en `dependencies` (no en `devDependencies`) para que aterrice en el `node_modules` propio del paquete; correr `pnpm install` + `pnpm turbo run typecheck` después de la edición e inspeccionar cualquier fallo. |
| R3 | El glob del workspace no levanta los paquetes nuevos, dejando pnpm fuera de sync. | Baja | Confirmar que `libs/*/*/*` ya cubre `libs/features/<x>/shared/`; si no, agregar una entrada explícita a `pnpm-workspace.yaml` (Q5). |
| R4 | El `tsconfig.json` por paquete (si Q2=SÍ) se desvía del tsconfig base raíz. | Baja | Mantener cada tsconfig nuevo mínimo: solo `extends: "../../../../tsconfig.base.json"` más el set mínimo de overrides necesarios para los esquemas; copiar una referencia conocida buena. |
| R5 | Las fixtures de las reglas de frontera o los tests del plugin eslint referencian el mapping viejo de zod y fallan. | Baja | Correr `pnpm lint:fixtures` como parte de la verificación; actualizar cualquier fixture que haya pineado el workaround a propósito. |
| R6 | Eliminar el workaround expone un bug de resolución latente preexistente en otro lugar. | Baja | El fix es observable vía tests (G6); cualquier issue latente aparece de inmediato y puede triagerse en el mismo PR o separarse según la política de PRs. |

## 8. Preguntas abiertas para la fase de Spec

- **Q1**: ¿Actualizar los 11 importadores para usar los nuevos nombres de paquete (por ejemplo `@features/auth/shared/schemas/login`) o mantener los imports relativos (`../../shared/schemas/index.js`) y los aliases existentes? **Recomendación: MANTENER relativo + aliases**. Blast radius menor, sin churn en 11 archivos, los esquemas siguen viviendo donde la arquitectura dice que deben vivir.
- **Q2**: ¿Agregar un `tsconfig.json` por paquete para cada nuevo `shared/`? **Recomendación: NO**. El fix no lo requiere; puede agregarse más adelante si el paquete gana código que no sea esquema o exports cross-paquete.
- **Q3**: ¿Agregar un barrel `src/index.ts` a cada paquete nuevo que re-exporte los esquemas? **Recomendación: NO**. El entrypoint del paquete ya es `./schemas/index.ts`; un barrel extra suma capas sin ganancia y complica la estabilidad de los paths.
- **Q4**: ¿Agregar un ADR que documente la decisión arquitectónica de hacer que cada `shared/` sea un paquete de primera clase del workspace? **Recomendación: SÍ**. Un ADR corto + espejo ES según AGENTS.md §13 captura por qué se eliminó el workaround y qué significa la nueva frontera de paquete para futuros directorios shared/.
- **Q5**: ¿`pnpm-workspace.yaml` requiere alguna edición, o el glob existente `libs/*/*/*` ya cubre los paquetes nuevos? **Recomendación: VERIFICAR PRIMERO**, y editar solo si es necesario. El glob matchea mecánicamente ambas rutas, así que la respuesta probable es que no requiere edición, pero la fase de apply debe confirmarlo con `pnpm list -r` antes de asumirlo.
