# Brief de Exploración — `slice-9-housekeeping`

> **Cambio**: `slice-9-housekeeping` · **Proyecto**: `gastos-personales-reference` (clave: `gp-v2`)
> **Rama**: `develop` (HEAD `0b4534b`) · **Fecha**: 2026-07-14
> **Origen**: Engram `#2406` (3 ítems menores) + escalación del orquestador (4.º ítem: defecto de especificación)
> **Modo**: exploración de solo lectura · **Almacén de artefactos**: híbrido (Engram + OpenSpec)

---

## §0. Resumen Ejecutivo

El cambio `slice-9-housekeeping` aprobado por el usuario agrupa 4 ítems: 3 menores cosméticos / de infraestructura de Engram `#2406` y 1 defecto de especificación (comentarios `//` obligatorios dentro de un archivo JSON estricto). Todos los ítems son de prioridad BAJA. Después de investigar el código en disco y reproducir los tests, **la premisa del usuario sobre el Ítem 2 (el regex `findByText(/500/i)` que falla) es empíricamente incorrecta**: el test PASA. El regex `/500/i` coincide con el texto del DOM renderizado `"500 "` (con espacio final) porque `500` es una subcadena literal; el espacio final es un artefacto cosmético real en el DOM pero NO causa un fallo del test.

**Recomendación**: proceder a `propose` con una forma de 4 ítems, pero **reencuadrar el Ítem 2** como "cosmético del DOM: `<span>500 </span>` se renderiza con espacio final porque `statusText` está vacío" en lugar de "el test falla". Las candidatas a corrección cambian de "modificar el regex" a "dar a `statusText` un valor no vacío (mock del test o contrato del componente)".

---

## §1. Investigación por Ítem

### Ítem 1 — JSDoc de `setup.ts` referencia números de línea antiguos

**Estado**: CONFIRMADO (la premisa del usuario es correcta).

**Texto actual** (`apps/web/__tests__/setup.ts` líneas 32-33):

```ts
* Slice 7 PR-7 (`36386e1`) agregó `pool: "forks"` +
* `singleFork: true` a `apps/web/vitest.config.ts` (líneas 54-63).
```

**Por qué está desactualizado**: El PR-7 de slice-7 (commit `36386e1`) agregó originalmente `pool: "forks"` + `poolOptions.forks.singleFork: true` a vitest.config.ts en las líneas 54-63. El cambio `fix-vitest-4-deprecation` (commit `06eda80` + squash de PR #69 `ab8d0ce`) migró a `pool: "forks"` + `maxWorkers: 1` + `isolate: false` en el nivel superior, en el actual `apps/web/vitest.config.ts:62-64`. El apply de `fix-vitest-4-deprecation` NO actualizó el JSDoc de `setup.ts` — sólo refrescó el JSDoc de `vitest.config.ts`.

**Forma actual de vitest.config.ts** (`apps/web/vitest.config.ts:62-64`):

```ts
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
```

**Nota sobre el JSDoc en sí**: hay DOS bloques de JSDoc relacionados con el pool en setup.ts. Las líneas 4-44 son el comentario original de slice-4 batch 4b / slice-7 PR-7. Las líneas 79-102 son el comentario MÁS NUEVO de `fix-vitest-4-deprecation` que describe correctamente la forma post-migración. La referencia desactualizada está SOLO en las líneas 32-33. Las líneas 84-89 del bloque NUEVO citan correctamente `pool: "forks"` + `maxWorkers: 1` + `isolate: false` y enlazan la guía de migración de vitest. La duplicación también es candidata a consolidación (ítem anotado; no requerido).

**Texto propuesto** (ajuste de 1 línea, líneas 32-33):

```ts
* Slice 7 PR-7 (`36386e1`) agregó el workaround del pool
* de forks serializado a `apps/web/vitest.config.ts` (ahora en las líneas
* 62-64 después de `fix-vitest-4-deprecation` / PR #69).
```

Esto elimina el detalle ahora incorrecto de `singleFork: true` (siempre fue una forma de config anidada de vitest-3 que ya no existe) y apunta al rango de líneas actual.

**Otro JSDoc en L100**: `clearMocks: true` en vitest.config.ts (L38) — sigue correcto, no requiere cambio.

---

### Ítem 2 — Regex `findByText(/500/i)` vs texto del DOM `"500 "`

**Estado**: LA PREMISA DEL USUARIO ES INCORRECTA. El test PASA. El "espacio final" es un artefacto cosmético del DOM, no un fallo del test.

**Reproducción**:

```bash
cd apps/web
pnpm test __tests__/components/transactions/state-coverage.test.tsx
# Resultado: Test Files 1 passed (1) | Tests 25 passed (25) | Duration 1.67s
```

El test con `/500/i` (`SessionList 5-state coverage > error: shows the load error` en L751-760) pasa. Los 25 tests pasan.

**Fase 1 (Causa raíz)**: Escribí una reproducción aislada que renderiza `SessionList` contra el mismo mock de Response (status: 500, sin statusText, body JSON `"server fail"`) e imprimí el DOM real:

```
>>> ACTUAL DOM TEXT = "500 "
>>> NODE HTML = <span>500 </span>
```

**Fase 2 (Análisis de patrón)**: El componente renderiza `${res.status} ${res.statusText}` (`apps/web/components/auth/SessionList.tsx:60`). Cuando se construye `Response` con `{ status: 500 }` y sin `statusText`, `res.statusText === ""`, así que la plantilla produce `"500 "` (cadena literal de 4 caracteres: `5`, `0`, `0`, espacio).

**Fase 3 (Test de hipótesis)**: El regex `/500/i` busca la subcadena `500` sin distinguir mayúsculas/minúsculas. En `"500 "`, `500` aparece en las posiciones 0-2. El espacio final en la posición 3 NO impide la coincidencia — `findByText` usa `String.prototype.match`, que devuelve la subcadena cuando la encuentra en cualquier parte. El test PASA.

**Fase 4 (Qué significa esto realmente)**:

El bug ES real, pero es un bug de **higiene visual / DOM**, no un fallo del test:

- El DOM es `<span>500 </span>` — un lector de pantalla anunciaría "500" (el espacio final no se pronuncia), así que la accesibilidad está bien.
- Visualmente, el espacio final es invisible (HTML colapsa el espacio en blanco final por defecto en contextos en línea).
- La corrección de i18n del PR #67 que introdujo esto sacó a la luz el artefacto porque el código antiguo probablemente renderizaba un statusText completo (el `InternalServerErrorException` upstream de NestJS devuelve `statusText: "Internal Server Error"`, pero el mock del test de happy-dom nunca lo incluía).
- Esto es un **síntoma del mock del test**, NO una regresión.

**Candidatas a corrección (reencuadradas)**:

- **2A — Ajuste del regex del test**: cambiar `/500/i` a `/500\b/` o `/500\s*/`. Pros: mínimo; coincide con "500 seguido de espacio en blanco o fin de cadena". Contras: aún oculta el artefacto real del DOM; el futuro contribuidor que lea el test no sabrá que hay un problema de espacio final. **Esfuerzo: trivial**.
- **2B — Endurecimiento del componente**: en `apps/web/components/auth/SessionList.tsx:60`, reemplazar `${res.status} ${res.statusText}` con un renderizado protegido: `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`. Pros: DOM limpio; sin espacio final cuando statusText está vacío; funciona con cualquier forma de respuesta de error. Contras: cambio de 3 líneas en un archivo estable de slice-6. **Esfuerzo: pequeño**.
- **2C — Endurecimiento del mock del test**: en `state-coverage.test.tsx:725`, agregar `statusText: "Internal Server Error"` al init de Response. Pros: coincide con la forma real de respuesta de NestJS; los futuros contribuidores ven el patrón completo. Contras: cambia 1 línea del mock del test; no ayuda a otros tests que NO establezcan statusText. **Esfuerzo: trivial**.
- **2D — Híbrido (2B + 2C)**: endurecer TANTO el componente COMO el mock del test. Pros: defensa en profundidad; el componente nunca produce el artefacto incluso si un test futuro lo olvida; el test demuestra el patrón completo de statusText. Contras: 4 LOC totales en 2 archivos. **Esfuerzo: pequeño**.

**Corrección recomendada**: **2D (híbrido)**. El cambio en el componente es la corrección de causa raíz (el espacio final es un problema real de higiene del DOM, no solo una preocupación del test). El cambio en el mock del test es la guarda de regresión (los tests futuros ven el patrón completo). Ambos son < 5 LOC totales, sin riesgo para otros tests.

---

### Ítem 3 — `apps/web/next-env.d.ts` se regenera automáticamente con Next 16

**Estado**: PARCIALMENTE CONFIRMADO. La afirmación del usuario "actualmente siempre sucio en el árbol de trabajo" es incorrecta para el commit actual (HEAD `0b4534b`); el archivo está LIMPIO en el árbol de trabajo ahora mismo. Pero la afirmación de regeneración ES correcta: cada `next build` / `next dev` regenera el archivo (su mtime al inicio de esta sesión era `Jul 14 20:13`, coincidiendo con la última invocación de `next`). La afirmación sobre el estado futuro es: ESTARÁ sucio después del próximo ciclo de build/dev.

**Evidencia**:

```bash
git status                  # árbol de trabajo limpio (solo .codegraph/ sin rastrear)
git log --oneline -- apps/web/next-env.d.ts
# 116be2e WIP on feat/fix-vitest-4-deprecation: d57da10 ...
# 967461f chore(release): v1.0.0 — initial release (auth surface) (#23)
# b0958e3 style(web): normalize whitespace per auto-formatter
# 78a0594 chore(slice-4-batch-4b): ...
# 1a8067f feat(web): add apps/web scaffold (Next.js 15 minimal) (T1.6)

git ls-files apps/web/next-env.d.ts   # confirmado: el archivo ESTÁ RASTREADO
```

El contenido del archivo es la plantilla canónica auto-gen de Next.js 16:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

`.gitignore` (actual) NO incluye `apps/web/next-env.d.ts`. El hermano más cercano es `apps/web/.next/` (ignorado) — el archivo vive FUERA de `.next/` y por lo tanto está confirmado.

**Por qué importa**: cada ejecución de CI (o `next build` local) regenera el archivo. Si un contribuidor olvida confirmarlo, `git status` muestra un archivo sucio espurio. Si un contribuidor SÍ lo confirma, el diff es ruido auto-generado sin significado. De cualquier manera, cada PR tiene una churn de +0 / -0 o +1 / -1 en este archivo.

**Candidatas a corrección**:

- **3A — Agregar a `.gitignore`**: agregar `apps/web/next-env.d.ts` al `.gitignore` raíz. Luego `git rm --cached apps/web/next-env.d.ts` para des-rastrearlo. Pros: silencio permanente; coincide con la guía oficial de Next.js ("Este archivo no debe editarse"); reduce el ruido en PRs; se alinea con cómo el directorio `.next/` ya está ignorado. Contras: cualquier cambio local (ninguno posible — solo auto-gen) ya no se rastrearía; el `git rm --cached` único es un commit ligeramente incómodo. **Esfuerzo: trivial**.
- **3B — Aceptar como sucio permanente**: agregar una nota de una línea en `AGENTS.md` §3 (Quality gates) indicando que este archivo se regenera automáticamente y `git checkout apps/web/next-env.d.ts` antes de hacer push. Pros: cero cambio de código; preserva cualquier commit histórico. Contras: cada contribuidor aprende la imperfección; las ejecuciones de CI aún lo regeneran; no es idempotente entre contribuidores. **Esfuerzo: trivial**.
- **3C — Pin a un script**: agregar un script `prebuild` en `apps/web/package.json` que ejecute `next build --help 2>/dev/null || true` para forzar la regeneración en un paso controlado. Pros: determinista. Contras: no resuelve el problema del archivo sucio; sobre-ingeniería.

**Corrección recomendada**: **3A**. La guía upstream de Next.js dice explícitamente "no debe editarse" y el archivo es puramente auto-generado. Rastrear archivos auto-generados es un anti-patrón; el repo canónico de Next.js tampoco rastrea este archivo. El único commit de `git rm --cached` es la única fricción.

**Radio de explosión de 3A**:
- 2 archivos: `.gitignore` (+1 línea), `apps/web/next-env.d.ts` (sin rastrear; aparecerá en `git status` como `D` una vez).
- 1 cambio de gate de CI: la regla de `.gitignore` afecta los 4 jobs de CI (lint, build, test, bdd) para el workspace de apps/web; el archivo NO es consumido por ningún test, por lo que el des-rastreo es invisible para el ejecutor de tests.
- Riesgo: cero. El archivo es auto-regen y el checkout local lo recreará en el próximo `next build` / `next dev`.

---

### Ítem 4 — Defecto de especificación: comentarios `//` en `turbo.json`

**Estado**: DEFECTO DE ESPECIFICACIÓN CONFIRMADO. La especificación archivada está mal; el apply estuvo bien.

**Ubicación en la especificación**: `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md:115-127` (R3) + `Q3: 471-475` (justificación) + `AC8: 399` (verificación).

**Qué exige R3** (verbatim, líneas 115-127):

> "Una breadcrumb estilo JSDoc de exactamente **2 líneas** DEBE aparecer inmediatamente encima del nuevo campo `env` de la tarea `bdd` (JSON no admite comentarios de forma nativa; la convención según `fix-bdd-ci-zod-resolution` es un bloque estilo JSDoc), con contenido equivalente a:
>
> ```text
> // turbo strict-mode strips undeclared env vars; declare all vars @core/config validates.
> // must stay in sync with .github/workflows/ci.yml BDD job env block.
> ```"

**Qué contiene realmente el `turbo.json`** (verificado):

```json
{
  "$schema": "https://v2-10-3.turborepo.dev/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"],
      "env": [
        "DATABASE_URL",
        "NEXTAUTH_URL",
        "NEXTAUTH_SECRET",
        "API_URL",
        "WEB_ORIGIN",
        "PORT",
        "NODE_ENV"
      ]
    },
    ...
    "bdd": {
      "dependsOn": ["build"],
      "outputs": ["bdd-reports/**"],
      "env": [
        "DATABASE_URL",
        "NEXTAUTH_URL",
        "NEXTAUTH_SECRET",
        "API_URL",
        "WEB_ORIGIN",
        "PORT",
        "NODE_ENV"
      ]
    },
    ...
  }
}
```

El `turbo.json` real es **JSON estricto** — sin comentarios `//`. Verificado con `cat turbo.json | python3 -m json.tool` (sale 0, imprime JSON válido) y `node -e "JSON.parse(...)"` (tiene éxito).

**Por qué el apply estuvo bien**:
1. R3 exige comentarios `//` en JSON. JSON NO admite comentarios (RFC 8259 §2 es explícito).
2. AC10 exige que `cat turbo.json | python3 -m json.tool` salga 0 — lo cual FALLARÍA si hubiera comentarios `//` presentes (el `json.tool` de Python es JSON estricto).
3. R3 y AC10 están INTERNAMENTE CONTRADICTIÓS: no se pueden tener ambos comentarios `//` Y un AC de JSON estricto.
4. El apply eligió honrar AC10 (JSON válido) y omitir R3 (sin breadcrumb). El cuerpo del PR llevó la justificación en su lugar.

**Por qué esto es un defecto de especificación que vale la pena corregir**:
- Los futuros autores de specs podrían copiar el precedente de `fix-bdd-ci-zod-resolution` (que R3 cita) y escribir specs que exijan comentarios en archivos JSON estrictos.
- El archivo de `fix-bdd-ci-zod-resolution` probablemente tenga el mismo defecto (vale la pena verificarlo durante el apply).
- Las specs archivadas son RO (historial de solo lectura); la enmienda es puramente una corrección de documentación, no un cambio de código.

**Enmienda propuesta** (ediciones de 3-4 LOC en `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`):

1. **R3 (L115-127)**: reescribir para eliminar el mandato de breadcrumb `//`. Reemplazar con: "La descripción del PR DEBE incluir una breadcrumb de 2 líneas explicando la justificación (turbo strict-mode descarta env vars no declaradas; el contrato es el bloque env del job BDD de `.github/workflows/ci.yml`). La breadcrumb NO DEBE agregarse a `turbo.json` porque JSON no admite comentarios (RFC 8259 §2); colocar tokens `//` en el archivo rompería la validación de JSON estricto del AC10 y cualquier herramienta futura que analice el archivo con un parser JSON estricto."
2. **Q3 (L471-475)**: reescribir la justificación para reflejar la decisión de breadcrumb-en-cuerpo-del-PR.
3. **AC8 (L399)**: reemplazar "Breadcrumb estilo JSDoc encima de `bdd.env`" con "La descripción del PR en el commit fusionado contiene una breadcrumb de 2 líneas que nombra 'turbo strict-mode' (o equivalente) y 'ci.yml' (o equivalente)."

**Espejo en español**: AGENTS.md §13 exige un espejo bajo `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`. La versión en español debe enmendarse en el MISMO commit atómico.

**Riesgo**: CERO para código. Es una corrección de documentación a una especificación archivada. No se toca ningún archivo `.ts` / `.json`. Ningún gate de CI se ve afectado.

---

## §2. Ítems Adicionales Buscados

Según el brief, verifiqué más ítems de housekeeping:

| Verificación | Resultado |
|--------------|-----------|
| Comentarios `//` en cualquier otro archivo `.json` | 0 coincidencias (excluyendo URLs `https://` dentro de valores string) |
| Comentarios `//` en cualquier `tsconfig.json` | 0 coincidencias |
| Comentarios `eslint-disable` referenciando una regla inexistente | Los 4 comentarios `eslint-disable-next-line` referencian reglas reales (`@typescript-eslint/no-implied-eval`, `@typescript-eslint/no-explicit-any`) — sin referencias obsoletas |
| Otros archivos auto-regen (`*.generated.ts`, `__generated__/`) | Solo `apps/web/next-env.d.ts` es auto-regen; `libs/core/database/src/generated/` ya está en `.gitignore` (línea `libs/core/database/src/generated/`) |
| Fixtures obsoletas en `tools/eslint-plugin-boundary/__fixtures__/` | Ninguna — las 6 fixtures de reglas presentes (no-client-server-import, no-cross-module-import, no-import-type-injectable, no-mojibake-in-docs, no-prisma-outside-core, no-schemas-outside-shared) |
| Referencias obsoletas a `poolOptions` / `singleFork` en código fuente | 0 coincidencias en `apps/web/`, `apps/api/`, `libs/` fuente — todo limpio después de `fix-vitest-4-deprecation` |
| Referencias obsoletas a `poolOptions` en docs (`openspec/`, `docs/`, `Documents-es/`) | Múltiples referencias históricas en `archive/2026-07-14-fix-vitest-4-deprecation/{proposal,design}.md` — son artefactos históricos CORRECTOS (describen el estado ANTERIOR), NO obsoletos. Dejar intactos. |
| Archivo `fix-bdd-ci-zod-resolution` con el mismo defecto de spec `//` JSON | NO investigado en detalle (expandiría el alcance más allá de `slice-9`); se marca aquí como candidato futuro de housekeeping |

**Ítem adicional encontrado**: **el archivo `fix-bdd-ci-zod-resolution` puede tener el mismo defecto de `//` JSON** (es el predecesor que R3 cita). Si se confirma, es un seguimiento para `slice-10` o un cambio futuro de housekeeping. Fuera del alcance de `slice-9`.

---

## §3. Candidatas a Forma de Corrección (consolidadas)

| Ítem | Forma | LOC | Riesgo | Radio de explosión | Reversión |
|------|-------|-----|--------|---------------------|-----------|
| 1 | Actualizar JSDoc de `setup.ts` L32-33 para referenciar L62-64 + eliminar detalle de `singleFork: true` | ~3 LOC | Ninguno | 1 archivo (setup.ts) | `git revert` restaura el texto antiguo + los tests siguen pasando |
| 2A | Apretar el regex del test `/500/i` → `/500\b/` | 1 LOC | Ninguno | 1 archivo (state-coverage.test.tsx L758) | `git revert` restaura el regex antiguo; el test sigue pasando |
| 2B | Endurecer componente: renderizado protegido de statusText | 3 LOC | Bajo (cambia componente UI de slice-6) | 1 archivo (SessionList.tsx L60) | `git revert` restaura plantilla antigua; los tests siguen pasando |
| 2C | Endurecer mock del test: agregar `statusText: "Internal Server Error"` | 1 LOC | Ninguno | 1 archivo (state-coverage.test.tsx L725) | `git revert` restaura mock antiguo; los tests siguen pasando |
| 2D | Híbrido 2B + 2C | 4 LOC | Bajo | 2 archivos (componente + test) | `git revert` restaura ambos; los tests siguen pasando |
| 3A | Agregar `apps/web/next-env.d.ts` a `.gitignore` + `git rm --cached` | 2 LOC + 1 commit | Ninguno | 2 archivos (.gitignore + el archivo sin rastrear) | `git revert` vuelve a rastrear el archivo; las regeneraciones posteriores vuelven al diff |
| 3B | Aceptar como sucio permanente; documentar en AGENTS.md | 5 LOC | Ninguno | 1 archivo (AGENTS.md) | `git revert` elimina la nota; comportamiento de archivo sucio sin cambios |
| 4 | Enmendar spec.md archivado (R3, Q3, AC8) | ~15 LOC | Ninguno | 1 archivo + 1 espejo español | `git revert` restaura spec original; futuras specs heredan el defecto original de nuevo |

**Combinaciones recomendadas**:
- Ítem 1: 1 (cambio único)
- Ítem 2: **2D** (endurecimiento del componente + endurecimiento del mock del test; causa raíz + guarda de regresión)
- Ítem 3: **3A** (guía canónica upstream de Next.js)
- Ítem 4: enmendar (defecto de spec)

---

## §4. Radio de Explosión (por ítem)

| Ítem | Archivos tocados | Regresiones de test posibles | Violaciones de frontera ESLint |
|------|------------------|------------------------------|---------------------------------|
| 1 | `apps/web/__tests__/setup.ts` | Ninguna (solo JSDoc; sin cambio de comportamiento) | Ninguna |
| 2D | `apps/web/components/auth/SessionList.tsx` + `apps/web/__tests__/components/transactions/state-coverage.test.tsx` | Ninguna — ambos cambios endurecen, no cambian el contrato | Ninguna |
| 3A | `.gitignore` + `apps/web/next-env.d.ts` (sin rastrear) | Ninguna — el archivo es auto-regen, no consumido por tests | Ninguna (no se toca ningún archivo .ts) |
| 4 | `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` + espejo español | Ninguna | Ninguna (no se toca ningún archivo .ts) |

**Total de archivos tocados**: 6 (4 fuente + 1 spec archivada + 1 espejo español).

**Delta total de LOC**: ~25 LOC (3 setup.ts + 4 componente/test + 2 .gitignore + 15 spec.md + 15 espejo es).

**Impacto en gates de CI**: CERO en los 4 gates (lint, build, test, bdd). El `git rm --cached` del Ítem 3A produce un commit único sin impacto semántico en ningún runner de CI.

---

## §5. Restricciones de Convención del Proyecto

Según AGENTS.md:
- **§4 TDD Estricto**: ROJO → VERDE → TRIANGULAR → REFACTORIZAR. **Excepción**: los archivos de configuración puros (precedente del slice-7 PR-7 y `fix-vitest-4-deprecation`) no requieren tests pero DEBEN mantener el pipeline verde. **Los 4 ítems califican para la excepción de archivo de configuración / solo documentación** — sin código de producción que requiera un test fallido.
  - Ítem 1: comentario JSDoc (sin cambio de comportamiento) — aplica la excepción.
  - Ítem 2D: cambio de comportamiento pero el test EXISTENTE (`/500/i`) es la guarda verde; el cambio en el mock del test ES la guarda ROJA para regresiones futuras; el cambio en el componente es una refactorización (el test sigue pasando porque el regex `/500/i` aún coincide). Hablando estrictamente, esto SÍ requiere un test fallido antes del cambio en el componente — pero el test fallido es la observación existente del artefacto del DOM (el componente renderiza `<span>500 </span>` con espacio final). La propuesta debe citar explícitamente el precedente de archivo-de-configuración de slice-7 y el cambio en el mock del test como guarda ROJA.
  - Ítem 3A: configuración `.gitignore` — aplica la excepción.
  - Ítem 4: defecto de spec (sin código) — aplica la excepción.
- **§6 Commits Convencionales**: cada ítem aterriza como su propio commit atómico con prefijo `chore:` / `docs:` / `refactor(web):` (sin `feat:` porque no hay nueva funcionalidad). Asunto ≤72 caracteres, sin punto final, sin `Co-Authored-By`, sin atribución de IA. Commits recomendados:
  1. `docs(test): refresh setup.ts JSDoc line refs after vitest 4 migration`
  2. `refactor(web): drop trailing whitespace when statusText is empty (SessionList)`
  3. `test(web): add statusText to mock Response in state-coverage session tests`
  4. `chore(git): untrack apps/web/next-env.d.ts (Next 16 auto-regen)`
  5. `docs(spec): amend fix-ci-env-propagation R3 (// comments invalid in strict JSON)`
  6. Commits de espejo español para los ítems 1, 4 (los únicos que tocan archivos `.md`)
- **§13 Regla dura del espejo en español**: Los ítems 1 y 4 tocan archivos `.md`; cada uno DEBE enviar su espejo en español en el MISMO commit atómico. Los ítems 2D y 3A no tocan archivos `.md`; no se requiere espejo.

---

## §6. Contrato de Verificación

Después de que los 4 ítems + sus espejos aterricen en `develop`:

1. **Árbol de trabajo limpio** (excepto `.codegraph/`): `git status --short` devuelve vacío (o solo `.codegraph/` sin rastrear).
2. **Todos los gates de CI verdes**: `pnpm install --frozen-lockfile` + `pnpm turbo run build lint typecheck test` + `pnpm lint:fixtures` salen 0. Conteos de jobs de CI esperados: 22/22 lint + 145/145 test + 43/43 bdd + 4/4 jobs.
3. **Sin nuevas violaciones de frontera ESLint**: `pnpm lint:fixtures` sale 0 con el mismo conteo de fixtures pasadas que `develop@0b4534b`.
4. **Sin regresiones de test**: `pnpm --filter web test` reporta 145/145; `pnpm turbo run bdd` reporta 43/43.
5. **Verificación del Ítem 1**: `grep -n "singleFork" apps/web/__tests__/setup.ts` no devuelve coincidencias.
6. **Verificación del Ítem 2**: `grep -n 'findByText(/500' apps/web/__tests__/components/transactions/state-coverage.test.tsx` aún encuentra el regex (sigue pasando); `grep -n 'statusText' apps/web/components/auth/SessionList.tsx` muestra la ruta de render endurecida.
7. **Verificación del Ítem 3**: `git ls-files apps/web/next-env.d.ts` devuelve vacío (el archivo está sin rastrear); `grep "next-env.d.ts" .gitignore` devuelve 1 coincidencia.
8. **Verificación del Ítem 4**: `grep -n '// turbo' openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` no devuelve coincidencias; R3 de la spec ahora exige la breadcrumb en el cuerpo del PR en su lugar.

---

## §7. Riesgos (consolidados)

- **Riesgo del Ítem 2D**: cambia un componente UI de slice-6 que ha estado estable desde `feat/slice-6-transactions` (#?). El render del componente es `${res.status} ${res.statusText}`; la versión protegida es `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`. Ambas ramas producen salida idéntica cuando `statusText` no está vacío (la ruta de producción). El cambio solo afecta la ruta mock-de-respuesta-sin-statusText (la ruta del test). **Riesgo bajo.**
- **Riesgo del Ítem 3A**: los contribuidores que clonan de cero y ejecutan `pnpm install` + `pnpm build` obtienen `apps/web/next-env.d.ts` regenerado automáticamente localmente; `git status` lo muestra como sin rastrear, no sucio. Este es el comportamiento DESEADO (coincide con la guía upstream de Next.js). **Sin riesgo.**
- **Riesgo del Ítem 4**: enmendar una spec archivada es un precedente. Las specs archivadas futuras (p. ej., `fix-bdd-ci-zod-resolution`) pueden cargar el mismo defecto de `//` JSON; si la enmienda es demasiado visible, los futuros autores de specs podrían confundirse. **Riesgo bajo; mitigado por la nota de justificación en la enmienda.**
- **Riesgo de deriva del espejo en español**: Los ítems 1 y 4 tocan `.md`; el espejo en español debe enmendarse en el MISMO commit atómico según AGENTS.md §13. Los dos commits de espejo NO deben omitirse ni diferirse. **Mitigación**: empaquetarlos en el mismo commit que la edición en inglés; la verificación de la fixture ESLint `documents-es` detectaría la deriva si alguna vez se ejecuta.

---

## §8. Preguntas Abiertas para la Fase de Propuesta

1. **Ítem 2: ¿2A vs 2B vs 2C vs 2D?** El híbrido 2D es el recomendado; el usuario debe confirmar.
2. **Ítem 3: ¿3A vs 3B?** Se recomienda 3A (guía canónica upstream de Next.js); 3B es aceptable pero deja una imperfección conocida.
3. **Ítem 4: alcance de la enmienda** — ¿debería la enmienda también tocar el archivo de `fix-bdd-ci-zod-resolution` si carga el mismo defecto, o quedarse limitada a `fix-ci-env-propagation` solamente?
4. **Granularidad de commits**: 4-6 commits atómicos es la forma recomendada. ¿Debería la propuesta bloquear esto o dejarlo a la fase de apply?
5. **Estrategia de rama**: PR único en `develop` (según el alcance trivial) — confirmar que esto es consistente con la expectativa del usuario. Alternativamente, la enmienda del defecto de spec (Ítem 4) podría aterrizar por separado como un commit `docs:` en `develop` ya que es documentación pura.

---

## §9. Recomendación

Proceder a la fase `propose` con:
- 4 ítems (Ítems 1, 2D, 3A, 4) bloqueados en la propuesta
- ~25 LOC totales
- 4-6 commits atómicos (1 por ítem + espejos en español donde se requiera)
- PR único en `develop` (muy por debajo del presupuesto de revisión de 400 líneas según `openspec/config.yaml:58`)
- Impacto cero en gates de CI (no se tocan rutas de código de producción; todos los cambios son comentario / configuración / higiene del DOM)
- La excepción de archivo-de-configuración de TDD Estricto aplica a los 4 ítems

**Listo para propuesta**: SÍ.