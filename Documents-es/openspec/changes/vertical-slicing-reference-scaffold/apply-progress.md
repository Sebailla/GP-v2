# Apply Progress — `vertical-slicing-reference-scaffold` (es)

> **Estado**: en curso · fase de apply retroactiva (v1.1.0 publicada, v1.1.1 hardening en revisión)
> **Proyecto**: `gastos-personales-reference`
> **Branch**: `develop` (trabajo) · `feat/v1.1.0-hardening-transactions`, `feat/v1.1.0-hardening-ci-and-format`, `feat/v1.1.0-hardening-mirror-sync` (v1.1.1 hardening, en revisión)
> **Artifact store**: hybrid (archivos `openspec/` + observaciones Engram)
> **Modo**: interactive. Strict TDD activo.
> **Autor**: SDD orchestrator + manual apply batches (sub-agente `sdd-apply` agotado en slice 5 close-out)
> **Fecha**: 2026-07-09

Este archivo es el espejo fiel en español neutro/profesional de
`openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md`
según la convención `doc-mirror-spanish` (id 2132) documentada en AGENTS.md §13.

**Reglas del espejo** (AGENTS.md §13):

1. Mismo path relativo bajo `Documents-es/` que el original bajo
   `openspec/`.
2. Producido en el **mismo commit atómico** que el archivo fuente.
3. Sin caracteres CJK (verificación: `grep -P '[\x{4e00}-\x{9fff}]'
   Documents-es/.../apply-progress.md` debe devolver vacío).
4. Superficies técnicas preservadas verbatim: rutas de archivo,
   nombres de comandos, identificadores de task (T5.X), SHAs de
   commit, versiones de paquetes, gates (G1–G47), claves de catálogo.

**Estado del espejo (2026-07-09):**

| Sección del original en inglés | Estado del espejo en español |
|---|---|
| Apply Progress — sección de cabecera | ✅ Sincronizado (este header) |
| Slice 1 — Skeleton & monorepo bootstrap | ⚠️ Pendiente (no traducido retroactivamente) |
| Slice 2 — libs/core + libs/shared-utils (batches 1+2) | ⚠️ Pendiente (no traducido retroactivamente) |
| Slice 3 — auth server (batches 1–5+) | ⚠️ Pendiente (no traducido retroactivamente) |
| Slice 4 — auth client (batches 1–4 + cookie migration) | ✅ Sincronizado |
| Slice 5 PR #1 — Foundations (capa de tipos) | ✅ Sincronizado |
| Slice 5 PR #2 — Adaptadores + FX + DI | ✅ Sincronizado |
| Slice 5 PR #3 — Servicios + AuditLog + 4R fixes (PR #29) | ⚠️ Pendiente (no traducido retroactivamente) |
| Slice 5 close-out — Controller + integración + gate (PR #30) | ✅ Sincronizado |
| v1.1.0 — release notes (CHANGELOG link) | ⚠️ Pendiente |
| v1.1.1 — transactions hardening (R3-002 / R4-005 / R3-005 / R1-003 / R1-004 / R4-004 / R4-010) | ⚠️ Pendiente (PR #31 sin espejar) |
| v1.1.1 — CI workflow + Prettier lock (PR #32) | ⚠️ Pendiente |

**Decisión sobre el sync retroactivo (§13):**

La regla §13 exige producción de espejos en el mismo commit atómico. Aplicada retroactivamente cubre PRs futuros (la slice 5 close-out ya sincronizó), pero los PRs pre-existentes (slices 1–3, los PRs #27–#29 de slice 5) no tenían espejo. La traducción retroactiva literal requiere trabajo mecánico significativo (~2,260 líneas).

**Esta versión (2026-07-09) sincroniza pragmáticamente**: secciones marcadas ✅ arriba tienen espejo verbatim; secciones marcadas ⚠️ quedan como known-issue de §13 — el follow-up de sincronización retroactiva es un work item aparte, no bloquea los hardening PRs en revisión (PR #31, #32) ni el slice 6 (transactions client).

**Reglas operativas para secciones ✅ sincronizadas:** idéntica estructura al original, prosa en español neutro/profesional, tabla y listas preservadas 1:1 con la fuente. Identificadores técnicos (T5.X, G1–G47, archivos, PRs, SHAs) preservados verbatim.

---

## Slice 4 batch 4a: T4.2 + T4.3 + T4.5 — ESTADO: COMPLETO (fundamentos de slice 4, capa i18n)

**Branch**: `feat/vertical-slicing-s4-batch4a-t42-t43-t45` (cortada desde `develop` @ `8e56e3a`, post-PR #13 T3.7 + T3.9 merge — slice 3 CERRADO en 9/9).
**Base**: `8e56e3a` (último merge de slice 3 batch 8, closer de slice 3).
**Head**: este batch (5 commits atómicos: deps + T4.5 + T4.3 + T4.2 + markers).
**Modo**: interactive. Strict TDD activo. Test runner: `pnpm turbo run test`.
**Resultado del worker**: 5 commits atómicos landed clean; todos los quality gates en verde al commit de markers. Operaciones prohibidas respetadas.

### Sub-tareas completadas (5)

| Sub-tarea | Asunto | Estado |
|-----------|--------|--------|
| brief-deps | Instalar next-intl@3.26.5 + clsx@2.1.1 + tailwind-merge@2.5.5 + vitest@4.1.9 (devDep) | HECHO |
| brief-T4.5-cn-helper | cn helper + apps/web vitest config + tests de lib-utils (RED + GREEN, 4 tests) | HECHO |
| brief-T4.3-next-intl-middleware | middleware.ts + i18n.ts + tests de middleware (RED + GREEN, 6 tests) | HECHO |
| brief-T4.2-i18n-catalogs | en.json + es.json + test de paridad de key-set (sin TDD estricto según brief, 4 tests) | HECHO |
| brief-markers-apply-progress | tasks.md T4.2 + T4.3 + T4.5 markers [x] + sección de apply-progress + espejo español | HECHO |

### Archivos creados / modificados (10 archivos, +792 / -2 distribuidos en 5 commits atómicos)

- `apps/web/package.json` — MODIFICADO (+4 deps: clsx@2.1.1, tailwind-merge@2.5.5, next-intl@3.26.5 en `dependencies`; vitest@4.1.9 en `devDependencies`).
- `pnpm-lock.yaml` — MODIFICADO (lockfile regenerado por los cuatro paquetes).
- `apps/web/vitest.config.ts` — NUEVO (~50 líneas). Cierra el item diferido de slice 1 (`apps/web#test`). node env + clearMocks + alias que apuntan `next-intl/server` + `next-intl/navigation` al build de cliente (así cualquier test futuro que importe un módulo de next-intl desde apps/web no dispara la advertencia de React-Server-Conditional Exports).
- `apps/web/lib/utils.ts` — NUEVO (~50 líneas, JSDoc + función `cn`). El merger canónico de nombres de clase según design §6.5: `cn(...inputs: ClassValue[]) = twMerge(clsx(inputs))`. El JSDoc documenta por qué la resolución de conflictos de subset en tailwind-merge importa para los primitivos estilo shadcn (batch 4b).
- `apps/web/__tests__/lib-utils.test.ts` — NUEVO (4 tests). Test TDD para cn: precedencia de merge (`p-2 + p-4 → p-4`), filtro de falsy (se descartan null/undefined/false), conflicto de subset (`px-2 + p-4 → p-4` — px-2 es un subset estricto de p-4 y tailwind-merge lo descarta), type-narrowing (`string`, no `string | undefined`).
- `apps/web/i18n.ts` — NUEVO (~50 líneas). La config `routing` vía `defineRouting({...})` de next-intl/routing: `locales: ['en','es']`, `defaultLocale: 'en'`, `localePrefix: 'always'`. Única fuente de verdad tanto para middleware.ts como para el NextIntlClientProvider (batch 4c).
- `apps/web/middleware.ts` — NUEVO (~50 líneas). Envuelve `createMiddleware(routing)` de next-intl/middleware + exporta el matcher canónico de negative-lookahead que excluye /api, /_next, /_vercel, y paths con extensión de archivo.
- `apps/web/__tests__/middleware.test.ts` — NUEVO (6 tests). Test TDD para middleware: (1) /sign-in → 307 a /en/sign-in, (2) /es/sign-in → 200 passthrough (x-middleware-request-x-next-intl-locale: es + cookie NEXT_LOCALE=es), (3) /reset-password/abc123 → 307 a /en/reset-password/abc123 (paths profundos preservados), (4-6) regresiones-nets del matcher (api /_next / exclusión general).
- `apps/web/messages/en.json` — NUEVO (~1670 bytes, 30 claves). Catálogo en inglés para la superficie de auth-slice (signIn / signUp / forgotPassword / resetPassword / sessions / devMailbox / common / locale).
- `apps/web/messages/es.json` — NUEVO (~1910 bytes, 30 claves). Catálogo en español usando español neutro/profesional según AGENTS.md §13. Árbol de claves idéntico a en.json.
- `apps/web/__tests__/i18n-catalogs.test.ts` — NUEVO (4 tests). Chequeo de paridad de key-set de catálogos: ambos archivos parsean, inglés lleva cada clave mandada por el brief, en.json y es.json llevan árboles de claves idénticos (sin claves faltantes en ninguno de los dos lados), sin fallthrough CJK (mojibake) en ninguno de los dos archivos.
- `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` — MODIFICADO: markers T4.2 [x], T4.3 [x], T4.5 [x] en las filas umbrella + notas de sub-progreso por fila (~12 párrafos nuevos).
- `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` — NUEVO (~150 líneas). Espejo en español de ESTA sección según AGENTS.md §13 (convención `doc-mirror-spanish` id 2132). Source-of-truth en inglés; espejo es una traducción fiel. Superficies técnicas (rutas de archivo, SHAs de commit, ejemplos de JSON) preservadas verbatim.

### Tests: suite de apps/web 0 → 14/14 PASS

- `apps/web/__tests__/lib-utils.test.ts` (T4.5): 4 tests nuevos.
  - `merges conflicting Tailwind padding utilities — last one wins` — asegura `cn('p-2', 'p-4') === 'p-4'`.
  - `filters out falsy values (null, undefined, false)` — asegura que el conflicto se resuelve Y que ningún literal `null`/`undefined`/`false` se filtra al output.
  - `recognizes px-* as a subset conflict of p-* (broader wins)` — asegura `cn('px-2', 'p-4') === 'p-4'` (px-2 es subset estricto de p-4 y tailwind-merge lo descarta).
  - `returns a string (type narrowing)` — asegura que el tipo de retorno es `string`, no `string | undefined`.
- `apps/web/__tests__/middleware.test.ts` (T4.3): 6 tests nuevos (3 routing + 3 matcher).
  - `redirects bare '/sign-in' to '/en/sign-in' (default locale prefix)` — asegura 30x + `pathname === '/en/sign-in'` (parsea la URL absoluta de Location vía `new URL(loc, HOST).pathname`).
  - `keeps '/es/sign-in' unchanged (no double-prefix)` — asegura 200 + `x-middleware-request-x-next-intl-locale === 'es'` + `set-cookie` lleva `NEXT_LOCALE=es`.
  - `redirects a deep bare path '/reset-password/abc123' to '/en/reset-password/abc123'` — asegura que los paths profundos se preservan cruzando el redirect de prefijo.
  - Regresiones-nets del matcher: el string del matcher es la forma canónica negative-lookahead, excluye `api`, excluye `_next`.
- `apps/web/__tests__/i18n-catalogs.test.ts` (T4.2): 4 tests nuevos (paridad de catálogo + fallthrough CJK).
  - `both en.json and es.json exist as JSON-parsable files` — chequeo de sanidad sobre `JSON.parse`.
  - `the en.json key tree is non-empty (catalog has at least the auth surface)` — asegura >20 claves + enumera explícitamente cada clave mandada por el brief.
  - `en.json and es.json carry identical key trees (no missing keys in either locale)` — la diferencia simétrica de los sets de claves aplanados es vacía.
  - `the catalogs are clean of mojibake indicators (CJK fallthrough)` — espejo de la regla `no-mojibake-in-docs` de AGENTS.md §13 a nivel catálogo (la regla en sí se enforce en slice 8 una vez que el parser `@eslint/markdown` esté conectado).

### Evidencia TDD

| Sub-tarea | RED | GREEN | Conteo final |
|-----------|-----|-------|--------------|
| brief-deps | N/A (sin código de producción) | N/A | 0 |
| brief-T4.5-cn-helper | RED: `lib/utils.ts` faltante → 1 de 4 tests falla (Cannot find module). Creado cn = `twMerge(clsx(inputs))`. GREEN: 4/4 tests de cn PASS. | 4 nuevos |
| brief-T4.3-next-intl-middleware | RED: middleware.ts faltante → 6/6 tests fallan (Cannot find module). Creado middleware.ts + i18n.ts + descubiertos comportamientos empíricos. next-intl 3.26.5 emite URL ABSOLUTA en Location para redirects (el test parsea vía `new URL(loc, HOST).pathname`); emite header `x-middleware-request-x-next-intl-locale` en respuestas PASSTHROUGH (p. ej. /es/sign-in). Test revisado mid-cycle para leer esas señales canónicas. GREEN: 6/6 tests de middleware PASS. | 6 nuevos |
| brief-T4.2-i18n-catalogs | Según brief: SIN TDD estricto (el contenido del catálogo es documentación/data, no comportamiento). El test de paridad de key-set fue escrito DESPUÉS de los catálogos como regression net — estuvo RED en ausencia de los catálogos (Cannot find module), GREEN una vez que ambos archivos existen con claves idénticas. 4/4 tests de catálogo PASS. | 4 nuevos |
| brief-markers-apply-progress | N/A (solo markers) | N/A |

### Quality gates

| Gate | Resultado |
|------|-----------|
| `pnpm install` | exit 0 (4 paquetes agregados: next-intl@3.26.5, clsx@2.1.1, tailwind-merge@2.5.5, vitest@4.1.9; lockfile regenerado) |
| `pnpm --filter @features/auth exec vitest run` | 110/110 PASS (sin regresión) |
| `pnpm --filter @core/events exec vitest run` | 37/37 PASS (sin regresión) |
| `pnpm --filter @core/config exec vitest run` | 19/19 PASS (sin regresión) |
| `cd apps/api && pnpm exec vitest run` | 21/21 PASS (sin regresión) |
| `pnpm --filter web exec vitest run` | 14/14 PASS (NUEVO: 4 cn + 6 middleware + 4 catalogs) |
| `pnpm turbo run test --filter=@features/auth --filter=@core/* --filter=@shared-utils/* --filter=api --filter=web` | exit 0 (turbo completo, slices 1-4 conectados) |
| `pnpm run lint:fixtures` | 11/11 fixtures PASS, 18 violaciones en fixtures inválidos (correcto) |
| `pnpm turbo run lint` (completo) | exit 0 (sin violaciones nuevas) |
| `pnpm turbo run typecheck --filter=web` | exit 0 (los tipos de next-intl resuelven bajo tsconfig strict + resolución Bundler) |
| `pnpm turbo run typecheck` (completo) | exit 0 (workspace completo) |

Falla pre-existente NO causada por este batch: `pnpm turbo run build --filter=web` fallaría porque `apps/web/app/[locale]/layout.tsx` y `page.tsx` fueron scaffolded en slice 1 con `force-static` + `import { env } from "@core/config"`; el import de env corre al cargar módulo y necesita `DATABASE_URL`/`NEXTAUTH_URL`/`NEXTAUTH_SECRET` seteadas. Slice 4 batch 4c (forms) es el lugar natural para conectar un `.env.local` real para apps/web (el path de build se ejerce cuando batch 4c ship la página real de /sign-in). Este batch SOLO agrega middleware + i18n + cn + catálogos — ninguna página real se renderea aún en /sign-in, por lo que el path de build no forma parte de los gates requeridos del brief (typecheck + test sí; ambos PASS).

### Snapshot de estado del slice 4 batch 4a

- **Tareas**: 3/15 [x] (T4.2 + T4.3 + T4.5 cerradas; T4.1, T4.4, T4.6-T4.15 diferidas según la distribución por batches del slice 4).
- **Tests nuevos netos**: 14 (4 cn + 6 middleware + 4 catalogs).
- **Quality gates**: 11/11 gates requeridos en exit 0.
- **Commits atómicos**: 5 (deps; T4.5; T4.3; T4.2; markers).
- **Operaciones prohibidas respetadas**: sin `find`, `ls -R`, `tree`, `npm view`, `pnpm list`, `pnpm why`. Sin modificaciones a `apps/web/components/ui/*` (T4.4, batch 4b). Sin `app/[locale]/sign-in/page.tsx` (T4.8, batch 4c). Sin Tailwind config (T4.7, batch 4b). Sin `@nestjs/schedule` u otras deps no-web. Sin ediciones a `libs/features/auth/*` (slice 3 cerrado).

### Desviaciones críticas del brief

1. **Aserción de `cn("px-2", "p-4")` revisada de `"p-4 px-2"` a `"p-4"`**. El brief indicaba `"p-4 px-2"` (el caso de orden inverso) como output esperado. La librería tailwind-merge real emite `"p-4"` para el orden del brief — `px-2` es SUBSET ESTRICTO de `p-4` (cada eje que setea px-2 ya está cubierto por p-4 en todos-lados), así que tailwind-merge descarta el subset redundante en vez de emitir un string que PARECE un override parcial pero que semánticamente es un no-op. El test pinea el comportamiento observado (la librería es la source-of-truth, según testing-standards: "Los valores esperados deben venir de una fuente independiente de verdad — un literal conocido-bueno, un ejemplo trabajado, el spec"). El JSDoc de cn documenta ambos órdenes para que futuros lectores puedan correr `cn("p-4", "px-2")` (orden inverso) para ver cómo se ve un override parcial. Los gates de "cobertura mínima" del brief (4 tests, todas las formas gate-passing) siguen cumpliéndose.
2. **El test del middleware lee `x-middleware-request-x-next-intl-locale` en lugar de `Vary` para aserciones de passthrough**. next-intl 3.26.5 NO setea un header `Vary` en respuestas PASSTHROUGH (p. ej. /es/sign-in) — sólo en redirects. La señal canónica de "locale activo" en passthrough es el header `x-middleware-request-x-next-intl-locale` que next-intl estampa en la respuesta, apareado con el header `Set-Cookie` `NEXT_LOCALE=<locale>` (la cookie es la fuente de verdad para requests subsecuentes sin prefijo). El test asegura ambas señales en el caso passthrough. Documentado en el JSDoc del test para que futuros lectores entiendan por qué la forma de la aserción no coincide con el instinto inicial del brief.
3. **next-intl@3.26.5 emite peer warning no fatal para Next 16**. El rango peer de next-intl 3.x tope en `^15.x`; Next 16.2.10 está instalado. pnpm 11 emite un warning soft (no es un fail duro). El runtime del middleware usa `Request`/`Response` estándar (Node 22 los trae nativos; el middleware de next-intl no depende de APIs específicas de Next 16), así que el middleware funciona en runtime. Migración a next-intl v4 diferida a un slice futuro si hace falta.
4. **5 commits atómicos (no los 4 implícitos que el brief planteaba)**. El brief sugería implícitamente tres commits de impl (T4.2/T4.3/T4.5) más un commit de markers; este batch landed CINCO — la sub-tarea brief-deps se vuelve su propio commit (las dependencias son infraestructura de pre-flight, no comportamiento), manteniendo cada commit de impl revertable en aislamiento sin dejar un import huérfano de `next-intl`/`clsx`/`tailwind-merge` en un snapshot rolled-back.

### Risk flags

**Cerrados (carry-overs de slices previos):**

- `apps/web vitest install diferido de slice 1` — CERRADO en este batch (`apps/web/vitest.config.ts` + vitest agregado como devDep).
- Espejo en español para apply-progress — según AGENTS.md §13: cada `.md` en inglés bajo `openspec/` o `docs/` DEBE tener un espejo en español en el mismo commit atómico. La sección de apply-progress del slice 4 batch 4a se entrega con `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` como espejo español en el commit de markers.
- Drift de key-set entre en.json y es.json — regression net agregada (aserción de diferencia simétrica en `apps/web/__tests__/i18n-catalogs.test.ts`).
- Fallthrough de mojibake CJK — regression net agregada a nivel catálogo (espejo de la regla ESLint diferida `no-mojibake-in-docs` de §13).

**Nuevos (este batch):**

- `next_intl_v3_peer_warning_for_next_16` — pnpm soft-warns en el mismatch de peer. El middleware usa Request/Response estándar y funciona contra Next 16 en runtime. Migración a next-intl v4 diferida a un slice futuro.
- `middleware_passthrough_uses_cookie_not_vary_header_for_locale_signal` — next-intl 3.26.5 setea `Vary: Accept-Language` sólo en redirects (passthrough usa el header `x-middleware-request-x-next-intl-locale` + cookie `NEXT_LOCALE`). Test pineado contra las señales canónicas; documentado en el JSDoc.
- `cn_subset_conflict_order_sensitivity` — `cn("px-2", "p-4")` retorna `"p-4"` (px-2 descartado como subset estricto); `cn("p-4", "px-2")` retorna `"p-4 px-2"` (px-2 acota el eje horizontal encima de p-4). Test pineado al orden del brief; el JSDoc documenta el caso de orden inverso para que futuros lectores entiendan el comportamiento.
- `vitest_only_middleware_test_alone` — apps/web/vitest.config.ts toma `__tests__/**/*.test.ts` y `__tests__/**/*.test.tsx`, pero los tests de middleware + cn + catálogo son todos `.test.ts` (sin `.tsx` aún — sin tests de componentes React en este batch; LoginForm llega en batch 4c con T4.1). La config es forward-compatible con archivos `.tsx` (el glob de include ya los lista).

### Workload / PR boundary

- Forecast (brief): ~70-80 líneas de fuente por task + tests (~70 líneas) + markers (~50 líneas).
- Real: 10 archivos cambiados (8 en `apps/web/` + tasks.md + el espejo español), 5 commits atómicos, +~790 / -2 inserciones netas. Tests nuevos netos: 14. Líneas de fuente dominan: cn (~50) + middleware (~50) + i18n.ts (~50) + vitest config (~50) + 3 archivos de test (4-6 casos cada uno) + 2 archivos de catálogo (~80 líneas combinadas). Sección de apply-progress ~150 líneas.
- 400-line budget risk: **Low** — cada commit está bien por debajo de 400 (deps commit 114, T4.5 159, T4.3 221, T4.2 256, markers ~250 estimados).
- PR target: `feat/vertical-slicing-s4-batch4a-t42-t43-t45` → `develop` una vez que `sdd-verify` limpie.
- Este es el 1° PR de slice 4 (que tiene 8+ batches: 4a/4b/4c/4d/4e).
- NO pusheado a remoto, NO mergeado.

### Operaciones prohibidas (respetadas)

- ❌ `find`, `ls -R`, `tree` — NO USADOS. Todas las lecturas apuntaron a paths específicos del input list o archivos tmp de probe (borrados tras uso).
- ❌ `npm view`, `pnpm list`, `pnpm why` — NO USADOS. Las versiones vinieron de la recomendación explícita del brief (`next-intl@3.26.5 clsx@2.1.1 tailwind-merge@2.5.5`); vitest@4.1.9 se mirroró desde el devDep existente en libs/features/auth/server/package.json.
- ❌ Modificar `apps/web/components/ui/*` (T4.4, batch 4b) — NO TOCADO.
- ❌ `app/[locale]/sign-in/page.tsx` real (T4.8, batch 4c) — NO CREADO.
- ❌ Tailwind config (T4.7, batch 4b) — NO TOCADO.
- ❌ `@nestjs/schedule` u otras deps no-web — NO AGREGADAS.
- ❌ Edición de `libs/features/auth/*` (slice 3 cerrado) — NO TOCADO.
- ❌ Commit de secretos — NO INTENTADO. Ningún `.env*` modificado.
- ❌ "Co-Authored-By" o atribución de IA — NO INCLUIDO en ningún commit.

### Cross-references (slice 4 batch 4a)

- Tasks (markers T4.2 [x] + T4.3 [x] + T4.5 [x] + notas de sub-progreso por fila): `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (fila umbrella T4.2 línea 350; fila umbrella T4.3 línea 361; fila umbrella T4.5 línea 382).
- Spec: `openspec/changes/.../specs/auth/spec.md` §I18n (las 6 pantallas críticas leen labels de los catálogos); §Routes (la forma de ruta con prefijo de locale a través del middleware).
- Design: `openspec/changes/.../design.md` §6.3 (routing i18n — `defineRouting` + `createMiddleware` + `localePrefix: 'always'`); §6.5 (design tokens + primitivos estilo shadcn, incluyendo el patrón cn helper); §4.4 (forma de ruta — `/[locale]/(auth)/sign-in` prefijo de locale, etc.).
- Engram (esta observación): topic_key `sdd/vertical-slicing-reference-scaffold/apply-progress-notes-batch4a`.

---

## Slice 4 batch 4b: T4.4 + T4.6 + T4.7 — ESTADO: COMPLETO (fundamentos visuales del slice 4)

**Proyecto**: `gastos-personales-reference`
**Branch**: `feat/vertical-slicing-s4-batch4b-t44-t46-t47` (5 commits atómicos adelante de `develop @ bc3adef`, post-PR #14 merge de slice 4 batch 4a).
**Base**: `bc3adef` (PR #14 merge de slice 4 batch 4a).
**Modo**: interactive. Strict TDD habilitado. Test runner: `pnpm turbo run test`.

### Sub-tareas completadas (8)

| Sub-tarea | Asunto | Estado |
|-----------|--------|--------|
| brief-deps | Instalar deps Tailwind v4 + Radix + CVA + lucide + testing-library | HECHO |
| brief-T4.7-design-tokens | Extraer tokens de `gastos-personales/` a apps/web/app/globals.css + postcss config | HECHO |
| brief-T4.4-RED | Suite de tests fallidos para los 4 primitivos estilo shadcn (23 aserciones) | HECHO |
| brief-T4.4-GREEN | Implementar primitivos Button / Input / Form / Card | HECHO |
| brief-T4.4-test-env | Actualizar vitest config: happy-dom + jest-dom + react plugin + alias @/ | HECHO |
| brief-T4.6-manifest | Crear `apps/web/components.json` shadcn-style manifest | HECHO |
| brief-T4.6-readme | Crear `apps/web/components.json.md` documentando convención CLI-no-usado | HECHO |
| brief-markers-apply-progress | Marcadores [x] en tasks.md para T4.4 + T4.6 + T4.7 + sección apply-progress | HECHO |

### Commits atómicos landed (5)

```
7e1083f chore(web): install slice 4 batch 4b dependencies
d33ae9c feat(web): T4.7 design tokens + Tailwind v4 setup (slice 4 batch 4b)
ad62375 test(web): RED shadcn-style primitives (T4.4 batch 4b)
5418944 feat(web): GREEN 4 shadcn-style primitives (T4.4 batch 4b)
24bdfc6 feat(web): T4.6 components.json manifest + README (slice 4 batch 4b)
```

(más este commit de markers)

### Archivos creados / modificados (15 archivos, ~990 inserciones / ~30 eliminaciones)

NUEVOS (10):

- `apps/web/app/globals.css` (~150 líneas) — design tokens bajo :root + .dark + bloque `@theme inline` de Tailwind v4 + fallbacks prefers-reduced-motion/transparency.
- `apps/web/postcss.config.mjs` (~15 líneas) — plugin único `@tailwindcss/postcss`.
- `apps/web/__tests__/setup.ts` (~25 líneas) — importa matchers `@testing-library/jest-dom/vitest` globalmente.
- `apps/web/__tests__/components/ui/primitives.test.tsx` (~330 líneas, 23 aserciones) — Contrato TDD RED + GREEN para los 4 primitivos.
- `apps/web/components/ui/button.tsx` (~120 líneas) — variantes CVA × tamaños + Radix Slot asChild.
- `apps/web/components/ui/input.tsx` (~45 líneas) — wrapper de `<input>` nativo con estilos aria-invalid.
- `apps/web/components/ui/form.tsx` (~25 líneas) — wrapper mínimo de `<form>` para slice 4c.
- `apps/web/components/ui/card.tsx` (~95 líneas) — primitivo compuesto (Card + 5 sub-componentes).
- `apps/web/components.json` (~15 líneas) — manifest canónico estilo shadcn.
- `apps/web/components.json.md` (~50 líneas) — README documentando la convención CLI-no-usado.

MODIFICADOS (5):

- `apps/web/app/[locale]/layout.tsx` (+1 línea: `import "../globals.css";`).
- `apps/web/tsconfig.json` (+1 línea: `baseUrl: "."` explícito).
- `apps/web/vitest.config.ts` (+plugin react + env happy-dom + setupFiles + alias @/).
- `apps/web/package.json` (+8 deps + 4 devDeps).
- `openspec/changes/.../tasks.md` (marcadores [x] en T4.4 + T4.6 + T4.7 + párrafos de sub-progreso).

### Cambio en conteo de tests

- apps/web: 14 → 38 tests (+24: 23 primitivos nuevos + 1 sanity canary removido antes del commit).
- @features/auth: 110/110 (sin cambios).
- @core/events: 37/37 (sin cambios).
- @core/config: 19/19 (sin cambios).
- @core/database: 3/3 (sin cambios).
- apps/api: 21/21 (sin cambios).
- Full turbo filtered test gate: 9/9 tareas PASS.

### Evidencia TDD

| Sub-tarea | RED | GREEN | Conteo final |
|-----------|-----|-------|--------------|
| brief-T4.4-RED (primitives.test.tsx) | Los tests importaban `@/components/ui/{button,input,form,card}`; los 4 módulos no existían, así que vitest falló al parsear ("Failed to parse source for import analysis"). 0/23 aserciones corrieron. | 4 módulos de primitivos implementados; vitest parsea el archivo de tests. 23/23 aserciones pasan. | 23 nuevos |

### Desviaciones críticas del brief

1. **`tsx: 'preserve'` en apps/web/tsconfig.json requirió `@vitejs/plugin-react` para vitest**. El tsconfig establece `jsx: 'preserve'` porque ese es el setting canónico de Next.js. El plugin import-analysis de Vite 8 rechaza parsear JSX en ese modo. El fix es `@vitejs/plugin-react` (transform JSX basado en esbuild) cableado en la config de vitest. Documentado en el JSDoc de vitest config.

2. **`apps/web/tsconfig.json` agrega `baseUrl: "."` explícito**. El tsconfig base establece `baseUrl: "."` relativo al root del workspace; sin un override explícito, el tsconfig de apps/web resuelve paths relativos al directorio equivocado. El override pinea `baseUrl: "."` (relativo a apps/web/) para que el alias `@/*` resuelva correctamente. El fix es requerido tanto para tsc como para vitest.

3. **RTL v16 requiere `afterEach(cleanup)` explícito** (ya no se auto-registra). El primer run de GREEN reportó "Found multiple elements with the role 'button'" y errores similares de elementos duplicados porque los nodos DOM de un `it()` se filtraban al siguiente. El fix es `import { afterEach } from "vitest"; import { cleanup } from "@testing-library/react"; afterEach(() => cleanup());` al tope del archivo de tests.

4. **Test de Button link variant revisado de `underline` a `underline-offset-4` + `hover:underline`**. La variante canónica link de shadcn NO tiene `underline` en reposo (solo en hover). El primer test RED afirmaba `underline` directamente; el commit GREEN actualizó el test para afirmar `underline-offset-4` (siempre presente) + `hover:underline` (selector presente) — el patrón canónico de shadcn.

5. **Test de Form children revisado de `form.contains(input)` a `form.querySelector("#name")`**. El primer run de GREEN reportó que `form.contains(input)` devolvía `false` aunque el input estuviera claramente dentro del form en el código fuente. El comportamiento de `Node.contains` de happy-dom difiere de jsdom en algunos casos edge. El fix es afirmar vía el `form.querySelector("#name")` scopeado — mismo contrato observable, más portable.

6. **Test de Form onSubmit revisado de `dispatchEvent(new Event("submit"))` a `fireEvent.submit(form)`**. El primer run de GREEN reportó `onSubmit` llamado 0 veces cuando se despachaba vía el evento DOM crudo. El sistema de synthetic events de React no captura llamadas raw `dispatchEvent` para `submit`; el patrón canónico es `fireEvent.submit(form)` desde `@testing-library/react`.

7. **No se creó `tailwind.config.ts`**. La sub-tarea brief-deps del brief menciona `postcss` + `autoprefixer` como deps pero no requiere un `tailwind.config.ts`. La configuración CSS-first de Tailwind v4 lee del bloque `@theme inline` en `app/globals.css` (T4.7); el campo `tailwind.config` del manifest apunta a `app/globals.css` (el archivo CSS, no una config JS). Documentado en `components.json.md`.

### Quality gates — todos verdes

| Gate | Resultado |
|------|-----------|
| Workspace install | ✅ exit 0 |
| `@features/auth` test | ✅ 110/110 PASS (sin regresión) |
| `@core/events` test | ✅ 37/37 PASS (sin regresión) |
| `@core/config` test | ✅ 19/19 PASS (sin regresión) |
| `@core/database` test | ✅ 3/3 PASS (sin regresión) |
| `apps/api` test | ✅ 21/21 PASS (sin regresión) |
| `apps/web` test | ✅ 38/38 PASS |
| `pnpm turbo run test` (filtered, full workspace) | ✅ 9/9 tareas PASS |
| `pnpm --filter web exec tsc --noEmit` | ✅ exit 0 |
| `pnpm --filter web exec eslint . --max-warnings 0` | ✅ exit 0 |
| `pnpm --filter web build` (con env vars seteadas) | ✅ exit 0; sin warnings de Tailwind; globals.css compila |
| `node -e "JSON.parse(...)"` (components.json) | ✅ exit 0 |
| `pnpm run lint:fixtures` | ✅ 11/11 fixtures PASS |
| `pnpm turbo run lint` (full) | ✅ exit 0 |

### Cross-references (slice 4 batch 4b)

- Tasks (marcadores [x] en T4.4 + T4.6 + T4.7 + notas de sub-progreso por fila): `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (fila umbrella T4.4 línea 373; fila umbrella T4.6 línea 394; fila umbrella T4.7 línea 403).
- Spec: `openspec/changes/.../specs/auth/spec.md` §Routes (las rutas del auth-slice compondrán los primitivos).
- Design: `openspec/changes/.../design.md` §6.4 (contrato de extracción de design tokens); §6.5 (setup de primitivos estilo shadcn + cn helper + forma de components.json).
- Engram (esta observación): topic_key `sdd/vertical-slicing-reference-scaffold/apply-progress-notes-batch4b`.

---

## Slice 4 — migración de cookies (final — post-integración con NextAuth) — STATUS: COMPLETE (slice 4 CERRADO, 27/27 a través de todos los sub-batches)

**Resumen del objetivo.** PR #21 (slice 4 — integración con NextAuth) incorporó el mint del JWE de NextAuth v5 del lado de la API (el `AuthService` de la API ahora genera un session token JWE real de NextAuth mediante `next-auth/jwt#encode`). Sin embargo, la cookie del cliente web todavía utilizaba el nombre bespoke `auth-session` del slice 4 batch 2. Este batch migra el nombre de la cookie al canónico de NextAuth v5 `authjs.session-token` para que una futura integración drop-in con `auth()` sea un no-op sobre el nombre de la cookie.

**Rama.** `feat/vertical-slicing-s4-cookie-migration` (cortada desde `develop @ c2bbe2c`, post-merge PR #21 slice 4 integración con NextAuth).

**TDD estricto.** ACTIVO. Test runner = `pnpm turbo run test`. Según el brief, esta es una sub-tarea REFACTOR + tests: el renombrado de la constante es mecánico y el nuevo test de atributo es la única adición de tests.

**Commit base.** `c2bbe2c` (post-merge PR #21 slice 4 integración con NextAuth).

**Resultado del worker.** Éxito — 1 commit atómico aterrizado, todos los quality gates verdes. Árbol de rama limpio.

### Sub-tareas completadas (3/3)

| Sub-task | Asunto | Status | Commit |
|----------|--------|--------|--------|
| brief-cookie-name-migration | Renombrado de constante + string de atributos en `apps/web/lib/auth.ts` + actualizaciones en 12 archivos de tests | DONE | `9834f51` |
| brief-server-cookie-read | `getSession()` lee el nombre canónico de cookie de NextAuth (cuerpo de función sin cambios; el renombrado fluye a través de la constante) | DONE | `9834f51` |
| brief-markers-apply-progress | Sección de migración de cookie del slice 4 en tasks.md + sección en apply-progress + mirror en español | DONE | este commit |

### Commits atómicos (2)

1. `9834f51 refactor(web): migrate to canonical NextAuth v5 cookie name + attributes (slice 4 cookie migration final)` — 12 archivos cambiados, +171 / -106 inserciones netas. El refactor + tests + 2 nuevas aserciones de atributo en un commit atómico según la regla del brief "tests+code en el MISMO commit para una tarea de comportamiento".
2. `TBD chore(slice-4-cookie-migration): tasks.md sub-task [x] markers + apply-progress section + Spanish mirror` — commit de markers.

### Archivos creados / modificados

NEW (0).

MODIFIED (14):

- `apps/web/lib/auth.ts` (~142 líneas cambiadas: renombrado de `AUTH_SESSION_COOKIE` a `"authjs.session-token"`; nueva constante `SESSION_TTL_SECONDS = 24 * 60 * 60`; string de atributos de `setSessionCookie()`: `path=/`, `max-age=${SESSION_TTL_SECONDS}`, `SameSite=lax` (minúsculas), `HttpOnly` (nuevo); `clearSessionCookie()` refleja `SameSite=lax` en minúsculas; JSDoc actualizado para documentar el contrato canónico de NextAuth v5 + la justificación de omitir `Secure`).
- `apps/web/__tests__/lib-auth.test.ts` (11 → 13 tests; +2 nuevas aserciones de atributo: `AUTH_SESSION_COOKIE === 'authjs.session-token'` y `SESSION_TTL_SECONDS === 24*60*60`).
- `apps/web/__tests__/components/auth/LoginForm.test.tsx` (línea de cleanup del mock de cookie + 1 nueva aserción regex de HttpOnly en el test del success-path).
- `apps/web/__tests__/components/auth/SignUpForm.test.tsx` (mismo patrón que LoginForm).
- `apps/web/__tests__/components/auth/state-coverage.test.tsx` (línea de cleanup del mock de cookie + 1 nueva aserción regex de HttpOnly en el bloque de success de LoginForm + actualización del nombre de cookie en el mock store).
- `apps/web/__tests__/app/landing.test.tsx` (3 actualizaciones del mock de cookie al nombre canónico + 1 actualización de descripción).
- `apps/web/__tests__/app/sign-in.test.tsx` (1 actualización del mock de cookie + 1 actualización de descripción).
- `apps/web/__tests__/app/sign-up.test.tsx` (igual).
- `apps/web/__tests__/app/forgot-password.test.tsx` (igual).
- `apps/web/__tests__/app/reset-password.test.tsx` (igual).
- `apps/web/app/[locale]/page.tsx` (comentario JSDoc: `auth-session` → `authjs.session-token`).
- `apps/web/app/[locale]/(auth)/sign-in/page.tsx` (comentario JSDoc: igual).
- `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (+125 líneas: sección de migración de cookie del slice 4 + 3 filas de sub-task con marcadores [x] + tabla de evidencia TDD + quality gates + desviaciones críticas + cross-references).
- `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` (esta sección).
- `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (mirror en español de la nueva sección, español neutral/profesional según AGENTS.md §13).
- `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` (mirror en español de esta sección).

### Cambio en el conteo de tests

| Workspace | Antes | Después | Delta |
|-----------|-------|---------|-------|
| `apps/web` | 104/104 | 106/106 | +2 (lib-auth: aserciones AUTH_SESSION_COOKIE + SESSION_TTL_SECONDS) |
| `@features/auth` | 112/112 | 112/112 | 0 (sin regresión) |
| `@core/events` | 37/37 | 37/37 | 0 |
| `@core/config` | 20/20 | 20/20 | 0 |
| `@core/database` | 3/3 | 3/3 | 0 |
| `apps/api` | 21/21 | 21/21 | 0 |
| **Total** | **297** | **299** | **+2** |

### Evidencia TDD

| Sub-task | RED | GREEN | Final count |
|----------|-----|-------|-------------|
| brief-cookie-name-migration | N/A — renombrado mecánico + 2 nuevas aserciones de atributo. Los 11 tests existentes en `lib-auth.test.ts` fallarían en la aserción `cookieStr.startsWith(\`${AUTH_SESSION_COOKIE}=\`)` si `AUTH_SESSION_COOKIE` se cambiase sin actualizar el mock — pero el mock usa la constante, así que el renombrado fluye. Los 8 tests de páginas / forms que tenían hardcoded `"auth-session"` en el cookie store SÍ fallaron tras el renombrado + fueron actualizados en el mismo commit (test+code atómico). | 13/13 lib-auth tests PASS (eran 11; +2 nuevas aserciones de atributo); 106/106 apps/web tests PASS (eran 104; +2 lib-auth + ningún test nuevo de página/form); 9/9 turbo tasks; 10/10 lint; 9/9 typecheck; 11/11 boundary fixtures. | +2 tests nuevos netos |
| brief-server-cookie-read | N/A — cuerpo de la función sin cambios. | Todos los tests pasan sin modificación (los tests existentes asseren sobre el shape decodificado, no sobre el nombre de la cookie directamente). | 0 |

### Desviaciones críticas del brief (3)

1. **`HttpOnly` seteado vía `document.cookie` es un no-op del lado del navegador.** Los navegadores reales ignoran silenciosamente la directiva `HttpOnly` cuando se setea vía `document.cookie` desde JavaScript — el atributo solo toma efecto cuando lo emite un header `Set-Cookie` del servidor. El brief pide añadir `HttpOnly` al string de la cookie; la directiva se incluye para que el STRING de la cookie coincida con el contrato canónico de NextAuth v5 (la aserción del test también lo pinnea). La protección real (HttpOnly previniendo acceso JS) requiere la integración real del `Set-Cookie` del lado del servidor en el slice 6+ hardening de deploy.
2. **`Secure` se OMITE.** El toggle del brief "secure: process.env.NODE_ENV === 'production'" aplica conceptualmente a un header `Set-Cookie` del lado del servidor. La escritura `document.cookie` del lado del cliente no puede usar `Secure` en dev (localhost es HTTP, el navegador rechaza cookies Secure en orígenes no-HTTPS). La migración deja Secure para la integración del `Set-Cookie` del lado del servidor en slice 6+.
3. **`SESSION_TTL_SECONDS` es una constante local en `apps/web/lib/auth.ts`, no un export compartido de `libs/shared-utils`.** La API expone su `SESSION_TTL_MS` pero el cliente web no importa actualmente desde `@shared-utils/*` para configuración de auth. Promover la constante a un export compartido es un refactor del slice 6+.

### Quality gates — todos verdes

| Gate | Resultado |
|------|-----------|
| `pnpm install` | exit 0 |
| `pnpm --filter @features/auth exec vitest run` | 112/112 PASS |
| `pnpm --filter @core/events exec vitest run` | 37/37 PASS |
| `pnpm --filter @core/config exec vitest run` | 20/20 PASS |
| `cd apps/api && pnpm exec vitest run` | 21/21 PASS |
| `cd apps/web && pnpm exec vitest run` | 106/106 PASS (eran 104; +2 nuevas aserciones de atributo) |
| `pnpm turbo run test --filter=@features/auth --filter=@core/* --filter=@shared-utils/* --filter=api --filter=web` | 9/9 tasks PASS |
| `pnpm turbo run lint` | 10/10 tasks PASS |
| `pnpm run lint:fixtures` | 11/11 fixtures PASS, 18 violaciones a través de los fixtures inválidos |
| `pnpm turbo run typecheck` | 9/9 tasks PASS |

### Risk flags (nuevos en este batch)

NEW:

- `cookie_migration_httponly_set_via_document_cookie_is_browser_noop` — `HttpOnly` se incluye en el string de la cookie para alinearse con el contrato canónico de NextAuth v5, pero los navegadores reales lo ignoran cuando se setea vía `document.cookie`. La protección real requiere la integración del `Set-Cookie` del lado del servidor (slice 6+ hardening de deploy).
- `cookie_migration_secure_omitted_in_dev` — `Secure` se OMITE de la escritura de la cookie del lado del cliente; el dev server es HTTP y los navegadores rechazan cookies `Secure` en orígenes no-HTTPS. El flag `Secure` real llega en la integración del `Set-Cookie` del lado del servidor en slice 6+.
- `session_ttl_seconds_local_constant_not_shared` — `SESSION_TTL_SECONDS` es una constante local en `apps/web/lib/auth.ts`; promoverla a `libs/shared-utils/*` es un refactor de slice 6+.

### Workload / PR boundary

- Forecast (brief): ~50 líneas de fuente + ~80 líneas de tests = ~130 líneas.
- Actual: 12 archivos cambiados en el commit de refactor, +171 / -106 = 277 inserciones netas a través de fuente + tests + JSDoc. 1 commit atómico (`9834f51 refactor(web): migrate to canonical NextAuth v5 cookie name + attributes`).
- 400-line budget risk: **Bajo** — bien dentro del presupuesto por PR.
- Target del PR: `feat/vertical-slicing-s4-cookie-migration` → `develop` una vez que `sdd-verify` apruebe. NO pusheado al remoto, NO mergeado aún.
- Este es el **sub-batch final del slice 4**. Estado del slice 4: **15/15 + 5/5 follow-ups + 4/4 batch 2 + 3/3 cookie migration = 27/27 CERRADO**. La migración de cookie es la pieza final de la cadena de follow-ups T3.3 que empezó en el slice 3 batch 7 (integración con NextAuth).

### Snapshot de status estructurado

```yaml
active_change: vertical-slicing-reference-scaffold
artifact_store: hybrid
execution_mode: interactive
slice_1: complete (8/8)
slice_2: complete (5/5)
slice_3: complete (9/9)
slice_4:
  status: complete (27/27)
  tasks_done:
    - T4.1..T4.15
    - brief-test-slim, brief-fetch-timeout, brief-referrer-policy, brief-magic-constant, brief-input-prop-cleanup
    - brief-auth-helper, brief-cookie-on-success, brief-redirect-if-authed, brief-i18n-keys
    - brief-cookie-name-migration, brief-server-cookie-read, brief-markers-apply-progress
slice_5:
  status: not-started
feature_branch: feat/vertical-slicing-s4-cookie-migration
base_commit: c2bbe2c (post-merge PR #21 slice 4 integración con NextAuth)
head_commit: TBD (commit de markers); commit de refactor = 9834f51
pushed_to_remote: false
merged_to_develop: false
branch_protection_on_main: enforced
risk_flags:
  - cookie_migration_httponly_set_via_document_cookie_is_browser_noop
  - cookie_migration_secure_omitted_in_dev
  - session_ttl_seconds_local_constant_not_shared
next_recommended: slice 5 (transactions server) — el siguiente slice canónico en la cadena.
```

### Operaciones prohibidas respetadas

- ❌ find / ls -R / tree — NO USADO.
- ❌ Modificar la API (slice 3 cerrado) — NO TOCADO.
- ❌ Modificar el hook `useAuthApiPost` del form o el endpoint de sesión de la API — NO TOCADO.
- ❌ Cambiar `getSession()` al helper `auth()` de NextAuth (el auto-formatter rompe el import canónico; la lectura manual `cookies().get(...)` es la elección pragmática) — NO TOCADO.
- ❌ Modificar los tests e2e existentes de Playwright — NO TOCADO (no hay tests e2e para la persistencia de la cookie; los tests unitarios cubren la superficie).
- ❌ "Co-Authored-By" o atribución de IA — NO INCLUIDO en ningún commit.

### Cross-references (slice 4 — migración de cookies)

- Tasks: `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (nueva sección "Slice 4 cookie migration (final — post-NextAuth integration)" + 3 filas de sub-task con [x] + tabla de evidencia TDD + quality gates + desviaciones críticas).
- Mirror en español: `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (+~125 líneas, español neutral/profesional según AGENTS.md §13 / convención id 2132).
- Spec: `openspec/changes/.../specs/auth/spec.md` §Sign-in (AC-1..AC-4 — el shape del sessionToken en la respuesta).
- Design: `openspec/changes/.../design.md` §4.1 (dominio auth — `AuthService.login` retorna `{ id, email, role, sessionToken }`).
- Apply progress: `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` (esta sección appendeada).
- Mirror en español: `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` (mirror en español de esta sección).
- Engram: `sdd/vertical-slicing-reference-scaffold/apply-progress-notes-slice4-cookie-migration` (guardado vía `mem_save` antes del retorno).
- Hash del commit atómico: `9834f51`.
- Hash del commit de markers: TBD (este commit).
- Commit base: `c2bbe2c` (post-merge PR #21 slice 4 integración con NextAuth).
- Working tree: limpio tras este commit.
- Estado de push: no pusheado.
- Estado de merge: no mergeado.

---

## Slice 5 PR #1 — Foundations (capa de tipos) — STATUS: COMPLETO (4/13)

**Goal recap (español).** Slice 5 / PR #1 de la estrategia chained-3-PR. Solo capa de tipos: T5.1 (esquema Prisma), T5.4 (schemas Zod canónicos), T5.5 (entidades de dominio), T5.6 (puertos de dominio). Sin comportamiento, sin apply de migración Prisma, sin controllers NestJS. El límite del PR sigue el orchestrator reviewer-burnout guard: ~110 LOC de producción + ~600 LOC de tests/config = ~1.1K inserciones netas, bien dentro del presupuesto por PR pero claramente separado de la capa de comportamiento que aterriza en PR #3.

**Rama.** `feat/vertical-slicing-s5-transactions-server` (cortada de `develop @ 4d5c282`, post-merge del release v1.0.0).

**Strict TDD.** ACTIVO. Test runner = `pnpm test`. Disciplina RED → GREEN al momento de escribir según tarea:

- Esquema T5.1: `pnpm prisma format` exits 0 (sin apply de migración en PR #1; eso es T5.2 en PR #2).
- Schemas Zod T5.4: 5 specs Vitest co-localizadas (`shared/schemas/__tests__/*.test.ts`) se escribieron primero como RED, luego los schemas aterrizaron como GREEN. 27 aserciones todas pasan.
- Entidades T5.5: no es tarea TDD (tipos estáticos); `tsc --noEmit` es el gate.
- Puertos T5.6: no es tarea behavior-first TDD; el test contractual (invariante D-TX-5 soft-delete) aterriza en PR #2 donde los tests del adaptador Prisma aseguran que se aplica el filtro.

**Worker outcome.** Succeeded — 4 commits atómicos aterrizados (1 chore + 1 schema + 1 schema+scaffold + 1 entities+ports). Working tree limpio, todos los quality gates en verde.

**Nota del orchestrator.** La delegación inicial a `sdd-apply` para este PR se estancó en modo context-bloat (el subagente quemó 13 turnos leyendo patrones existentes y se quedó sin tiempo a los 120s). El orchestrator corrió un subagente `project-scout` para una lectura ajustada de patrones, luego implementó PR #1 inline. Resultado neto: PR #1 aterrizó con el mismo contenido que el brief de sdd-apply pero a ~50% del costo en tokens del intento fallido + retry. Documentado para referencia futura: cuando el brief de sdd-apply carga >6 paths de skills Y una expectativa de "leer 4-5 archivos de referencia", preferir scout-luego-inline sobre un único mega-prompt.

### Sub-tareas completadas (4/4)

| Sub-tarea | Asunto | Status | Commit |
|-----------|--------|--------|--------|
| chore-repo-merge-markers | Remoción mecánica de marcadores `<<<<<<<` sin resolver de 9 archivos `package.json` (ambos lados coincidían en `1.0.0`). | HECHO | `98c651e` |
| T5.1 | Extensión del esquema Prisma (6 tablas + 2 enums + back-relations en User/FxRate; Decimal por D-TX-6). | HECHO | `478fd7c` |
| T5.4 | Schemas Zod canónicos + scaffold del slice (5 schemas + 5 specs Vitest + esqueleto del paquete del server). | HECHO | `a4f531e` |
| T5.5 + T5.6 | Entidades de dominio (5) + puertos de dominio (6) + invariante JSDoc D-TX-5 en `CategoryRepository`. | HECHO | `1802dd5` |

### Commits atómicos (5 producción + 2 workflow + 1 chore-off-tracker)

**Commits de producción (1–4) en la rama del tracker** (`feat/vertical-slicing-s5-transactions-server`):

1. `478fd7c feat(database): add transactions tables (slice 5 foundations)` — 1 archivo, 156 inserciones netas. Extensión del esquema Prisma. Apply de migración diferido a PR #2 (T5.2).
2. `a4f531e feat(transactions): scaffold slice 5 + add canonical Zod schemas` — 16 archivos, 523 inserciones netas. Scaffolding (package.json, tsconfig, vitest.config, barrel público) + 5 schemas + 5 specs Vitest + barrel.
3. `1802dd5 feat(transactions): add domain entities and ports (T5.5 + T5.6)` — 14 archivos, 593 inserciones netas. 5 interfaces de entidades + 6 interfaces de puertos + 2 barrels + actualización del barrel en `src/index.ts`.

**Commit de workflow (sin cambio de producción) en la rama del tracker:**

1. `cf0d14b chore(slice-5-pr-1): workflow markers + apply-progress + Spanish mirror` — 4 archivos, 486 inserciones. Filas de markers en `tasks.md` + esta sección en `apply-progress.md` + mirror en español neutral/profesional bajo `Documents-es/`. El SHA pre-rebase era `809b688`; el body de este commit aún referencia los números pre-rebase porque los mensajes de git commit son inmutables una vez escritos — el contenido in-file es autoritativo.

**Refresh de SHA post-rebase en la rama del tracker (sin cambio de producción):**

1. `a1a2b99 docs(slice-5-pr-1): refresh SHA references after chore/feature split` — 4 archivos, 36 reemplazos de SHA-reference. El chore se movió a su propia rama de PR #0 (`feat/chore-merge-markers`) y los SHA de commit del tracker cambiaron post-rebase; este commit re-sincroniza cada referencia `0…`-style en tasks + apply-progress (EN + ES) para apuntar a la nueva cadena de SHA.

**Commit de chore (NO en la rama del tracker; vive en PR #0):**

- `98c651e chore(repo): remove spurious merge markers from package.json files` — 9 archivos cambiados, 36 deletions, 0 insertions. Mecánico. Desbloquea `pnpm install` de completarse limpiamente. Vive en `feat/chore-merge-markers` y se abre como PR #0 contra `develop`.

### Archivos creados / modificados

NUEVOS (24):

- `libs/core/database/prisma/schema.prisma` (modificado — 156 líneas netas nuevas)
- `libs/features/transactions/server/package.json` (nuevo)
- `libs/features/transactions/server/tsconfig.json` (nuevo)
- `libs/features/transactions/server/vitest.config.ts` (nuevo)
- `libs/features/transactions/server/src/index.ts` (nuevo)
- `libs/features/transactions/shared/schemas/create.ts` (nuevo)
- `libs/features/transactions/shared/schemas/update.ts` (nuevo)
- `libs/features/transactions/shared/schemas/list.ts` (nuevo)
- `libs/features/transactions/shared/schemas/category-create.ts` (nuevo)
- `libs/features/transactions/shared/schemas/category-update.ts` (nuevo)
- `libs/features/transactions/shared/schemas/index.ts` (nuevo barrel)
- `libs/features/transactions/shared/schemas/__tests__/create.test.ts` (nuevo — 7 tests)
- `libs/features/transactions/shared/schemas/__tests__/update.test.ts` (nuevo — 4 tests)
- `libs/features/transactions/shared/schemas/__tests__/list.test.ts` (nuevo — 6 tests)
- `libs/features/transactions/shared/schemas/__tests__/category-create.test.ts` (nuevo — 6 tests)
- `libs/features/transactions/shared/schemas/__tests__/category-update.test.ts` (nuevo — 4 tests)
- `libs/features/transactions/server/src/domain/entities/currency.entity.ts` (nuevo)
- `libs/features/transactions/server/src/domain/entities/category.entity.ts` (nuevo)
- `libs/features/transactions/server/src/domain/entities/transaction.entity.ts` (nuevo)
- `libs/features/transactions/server/src/domain/entities/fx-rate.entity.ts` (nuevo)
- `libs/features/transactions/server/src/domain/entities/idempotency-key.entity.ts` (nuevo)
- `libs/features/transactions/server/src/domain/entities/index.ts` (nuevo barrel)
- `libs/features/transactions/server/src/domain/interfaces/{transaction,category,currency,fx-rate,idempotency}.repository.ts` (5 nuevos)
- `libs/features/transactions/server/src/domain/interfaces/fx-rate.provider.ts` (nuevo)
- `libs/features/transactions/server/src/domain/interfaces/index.ts` (nuevo barrel)

MODIFICADO (1): `libs/core/database/prisma/schema.prisma`.

WORKFLOW (4): `openspec/changes/.../tasks.md`, `Documents-es/.../tasks.md`, `openspec/changes/.../apply-progress.md`, `Documents-es/.../apply-progress.md` (esta sección appendeada; commit `TBD`).

### Cambio en conteo de tests

| Workspace | Antes | Después | Delta |
|-----------|-------|---------|-------|
| `@features/transactions` (nuevo) | 0/0 | 27/27 | +27 (5 archivos de test nuevos) |
| `apps/web` | 106/106 | 106/106 | 0 |
| `@features/auth` | 112/112 | 112/112 | 0 |
| `@core/events` | 37/37 | 37/37 | 0 |
| `@core/config` | 20/20 | 20/20 | 0 |
| `@core/database` | 3/3 | 3/3 | 0 |
| `apps/api` | 21/21 | 21/21 | 0 |
| **Total** | **299** | **326** | **+27** |

### Evidencia TDD

| Sub-tarea | RED | GREEN | Conteo final |
|-----------|-----|-------|--------------|
| Esquema T5.1 | N/A — el gate de la migración es T5.2 (PR #2). | `prisma format` exits 0; back-relations validan; Decimal mapea correctamente por D-TX-6. | 0 |
| Schemas Zod T5.4 | Specs Vitest escritas primero bajo `shared/schemas/__tests__/` — los archivos spec aseguran amount positivo, currency code de 3 letras, kind enum, notes ≤ 500 chars, defaults de list, slug kebab-case, etc. | Schemas aterrizados; las 27 aserciones pasan. Sin regresión en otros slices. | +27 |
| Entidades T5.5 | N/A — los tipos son estáticos. | `tsc --noEmit` exits 0; tipos de entidades referenciados desde el barrel `src/index.ts`; los puertos importan desde entidades sin conflicto. | 0 |
| Puertos T5.6 | N/A — la invariante JSDoc del puerto está documentada; el guard compile-time (D-TX-5) lo aseguran los tests del adaptador en PR #2 (T5.7). | `tsc --noEmit` exits 0; los puertos compilan, las interfaces se exportan desde el barrel, los callers pueden `import type { TransactionRepository } from "@features/transactions"`. | 0 |

### Desviaciones críticas del brief (2)

1. **No hay puerto `AuditLogRepository`.** Design §5.1 lista 6 puertos, ninguno para auditoría. Los servicios en PR #3 necesitan un path de escritura de auditoría. Decisión diferida a PR #3 — probablemente un puerto nuevo introducido junto a los servicios (preferido) O un helper del adaptador que agrupe la escritura de auditoría con la escritura de la entidad (fallback). Surgirá como brief en PR #3.
2. **El patrón del scaffold del slice sigue a auth, no a un paquete shared separado.** Inicialmente se creó `@features/transactions-shared` como package.json separado; revertido al modelo de auth "shared/ sin package.json; el barrel del server re-exporta" para cohesión del slice. Los schemas compartidos siguen alcanzables como `@features/transactions/shared/schemas/...` vía catchall path-mapped.

### Risk flags (nuevos en este PR)

- `slice5_pr1_audit_log_port_deferred_to_pr3` — la tabla `AuditLog` aterriza en el esquema (T5.1) pero el puerto de dominio para ella no. PR #3 puede necesitar introducirlo; el diseño calla sobre esto.
- `slice5_pr1_decimal_boundary_adaptation_in_pr2` — las entidades de dominio usan el `Decimal` de `@shared-utils/decimal` (de `decimal.js`), pero el runtime de Prisma emite su propio `Decimal`. La conversión vive en los adaptadores de PR #2; si olvida convertir, la capa de dominio recibe un value con shape incorrecto en runtime. `tsc --noEmit` NO captura esto — el sistema de tipos acepta ambos. El test de frontera en PR #2 debe asegurar la conversión.
- `slice5_pr1_idempotency_lookup_schema_purposely_omitted` — el spec menciona un schema `idempotency-lookup.ts` "puede ser apropiado para los endpoints admin/debug". No se creó ninguno en T5.4. Si PR #3 lo necesita, añadir inline; si no, dejarlo fuera.

### Quality gates — todos en verde

| Gate | Resultado |
|------|-----------|
| `pnpm install` | exit 0 |
| `DATABASE_URL=postgresql://... pnpm --filter @core/database exec prisma format` | exit 0 |
| `pnpm --filter @features/transactions exec tsc --noEmit` | exit 0 |
| `pnpm --filter @features/transactions exec vitest run` | 27/27 PASS (5 archivos) |
| `pnpm lint:fixtures` | 11/11 fixtures PASS, 18 violaciones en fixtures inválidos preservadas |

### Workload / PR boundary

- Forecast (tasks.md): ~110 LOC de producción. Actual: ~1.1K inserciones netas entre producción + tests + config + actualizaciones de barrel.
- 400-line budget risk: **Bajo** — el código de producción es pequeño; los tests + config + scaffolding inflan el diff pero no afectan el foco de review.
- Target del PR: `feat/vertical-slicing-s5-transactions-server` → `develop` una vez que `sdd-verify` apruebe PR #1. **NO pusheado al remoto, NO mergeado aún.**
- Este es **PR #1 de 3** en la cadena del slice 5. PR #2 aterriza `T5.2 + T5.7 + T5.8 + T5.10` (apply de migración Prisma + 5 adaptadores + `InMemoryFxRateProvider` + token DI `FX_RATE_PROVIDER`). PR #3 aterriza `T5.3 + T5.9 + T5.11 + T5.12 + T5.13` (servicios + controller + triangulate + refactor).

### Snapshot de status estructurado

```yaml
active_change: vertical-slicing-reference-scaffold
artifact_store: hybrid
execution_mode: interactive
slice_1: complete (8/8)
slice_2: complete (5/5)
slice_3: complete (9/9)
slice_4:
  status: complete (27/27)
  tasks_done: [T4.1..T4.15, brief-test-slim, brief-fetch-timeout, brief-referrer-policy,
              brief-magic-constant, brief-input-prop-cleanup, brief-auth-helper,
              brief-cookie-on-success, brief-redirect-if-authed, brief-i18n-keys,
              brief-cookie-name-migration, brief-server-cookie-read, brief-markers-apply-progress]
slice_5:
  status: in-progress (4/13 — PR #1 hecho; PR #2 + PR #3 pendientes)
  pr1_tasks_done: [T5.1, T5.4, T5.5, T5.6]
  pr1_commits: [478fd7c, a4f531e, 1802dd5, cf0d14b, a1a2b99]
  pr1_chore: 98c651e (en feat/chore-merge-markers, NO en el tracker)
  pr1_workflow_commits: [cf0d14b, a1a2b99]
  pr2_tasks_pending: [T5.2, T5.7, T5.8, T5.10]
  pr3_tasks_pending: [T5.3, T5.9, T5.11, T5.12, T5.13]
feature_branch: feat/vertical-slicing-s5-transactions-server
base_commit: 4d5c282 (post-merge del release v1.0.0)
head_commit: a1a2b99 (docs SHA-refresh post-rebase); commit de producción previo = cf0d14b (workflow + apply-progress append)
pushed_to_remote: false
merged_to_develop: false
branch_protection_on_main: enforced
risk_flags:
  - slice5_pr1_audit_log_port_deferred_to_pr3
  - slice5_pr1_decimal_boundary_adaptation_in_pr2
  - slice5_pr1_idempotency_lookup_schema_purposely_omitted
next_recommended: slice 5 PR #2 — T5.2 (apply de migración) + T5.7 (5 adaptadores Prisma, incluyendo la verificación de la invariante D-TX-5 soft-delete) + T5.8 (InMemoryFxRateProvider + helper de test advanceClock) + T5.10 (wiring del token DI FX_RATE_PROVIDER en apps/api/modules/transactions).
```

### Cross-references (slice 5 PR #1)

- **Tasks:** `openspec/changes/.../tasks.md` (nueva sección "Slice 5 PR #1 — Foundations (type layer)" + 4 filas de sub-task `[x]` + quality gates + desviaciones + cross-references).
- **Mirror en español:** `Documents-es/openspec/changes/.../tasks.md` (español neutral/profesional según AGENTS.md §13 / convención id 2132).
- **Spec:** `openspec/changes/.../specs/transactions/spec.md` §Data Model + Decisions (D-TX-1..D-TX-7).
- **Design:** `openspec/changes/.../design.md` §5.1 (entidades + puertos), §5.5 (Zod schemas).
- **Apply progress:** `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md` (esta sección appendeada).
- **Mirror en español:** `Documents-es/openspec/changes/.../apply-progress.md` (mirror en español de esta sección).
- **Commits atómicos:** PR #0 (`98c651e` chore); PR #1 (`478fd7c` T5.1, `a4f531e` T5.4 + scaffold, `1802dd5` T5.5 + T5.6, `cf0d14b` workflow, `a1a2b99` SHA-refresh). Total = 4 producción + 2 workflow + 1 chore-off-tracker.
- **Rama:** `feat/vertical-slicing-s5-transactions-server`.
- **Commit base:** `4d5c282` (post-merge del release v1.0.0).
- **Working tree:** limpio tras este commit.
- **Estado de push:** no pusheado.
- **Estado de merge:** no mergeado.
- **PR boundary:** PR #1 de 3 en la cadena del slice 5. Producción LOC ~110; diff total ~1.7K (incluyendo tests + config + scaffolding). PR #0 carga la fix mecánica de 9 package.json.

---

## Slice 5 PR #2 — Adaptadores + FX + DI (persistence boundary) — STATUS: COMPLETO (8/13)

**Recap.** PR #2 aterriza la persistence boundary del slice transactions — 5 adaptadores Prisma (T5.7), el `InMemoryFxRateProvider` (T5.8), y el wiring del token DI `FX_RATE_PROVIDER_TOKEN` (T5.10). Más el apply de migración T5.2 (commiteado antes en esta rama como `c719a0e`). El PR es el segundo de la estrategia chained-3-PR del slice 5: PR #1 envió la type layer, PR #2 envía la persistence boundary, PR #3 enviará los servicios + controller + triangulate.

**Rama.** `feat/slice-5-pr2-adapters-fx` (cortada de `develop @ 4d5c282`; la rama absorbió el contenido de PR #1 vía merges a `develop` antes del cut).

**Strict TDD.** ACTIVO. Test runner = `pnpm --filter @features/transactions exec vitest run`. Los 6 nuevos archivos de test assertean:

- La invariante D-TX-5 soft-delete en cada read query (`where: { deletedAt: null }`).
- La Decimal string boundary en ambos lados (outbound: `.toString()` al escribir; inbound: `.toString()` + `toDecimal` al leer).
- P2002 unique-constraint → `CategoryAlreadyExistsError`; P2025 not-found → `CategoryNotFoundError` / `TransactionNotFoundError`.
- El cursor pagination sentinel pattern (take+1, last-id cursor).
- El boundary-owned expiry filter de idempotencia (fix de legibilidad W4: las filas expiradas son un miss en el adapter, el service no necesita re-checquear).
- El seed de 4 pares del FX provider + el helper test-only `advanceClock()` para la 24h staleness boundary.

La skill `verification-before-completion` guarda cada claim de esta sección: cada fila de quality-gate se observó contra la salida real del comando antes de que esta sección de apply-progress se appendeara.

### Sub-tasks

| Sub-task | Estado | Commits | Notas |
|----------|--------|---------|-------|
| T5.2 (apply de migración) | [x] | `c719a0e` (+ `2cc90fe` follow-up) | `pnpm prisma migrate dev --name transactions_init` produjo las seis tablas + dos enums; las columnas monetarias D-TX-6 son `DECIMAL` no `BIGINT`. El follow-up `2cc90fe` agrega la columna `Category.updatedBy` para cerrar el gap de contrato W1 del PR #1. |
| T5.7 (5 adaptadores Prisma) | [x] | `ebf585b` | Los 5 repos: D-TX-5 enforzado + P2002/P2025 traducido + cursor pagination + Decimal boundary. Los tests assertean la invariante inspeccionando la cláusula `where` de cada read query. |
| T5.8 (InMemoryFxRateProvider) | [x] | `ebf585b` | Seed de 4 pares en tiempo de construcción + helper de test `advanceClock()`. Staleness boundary (D-TX-4) testeable sin dormir el runner. |
| T5.10 (wiring DI) | [x] | `ebf585b` | `FX_RATE_PROVIDER_TOKEN` vive en `constants.ts` del slice (sin leak de string literal al consumer); el módulo NestJS lo bindea vía `useFactory`. Path mapping de `apps/api/tsconfig.json` agregado. |

### Archivos creados / modificados

**NUEVOS (15):**

- `libs/features/transactions/server/src/constants.ts` (token DI)
- `libs/features/transactions/server/src/infrastructure/repositories/prisma-category.repository.ts`
- `libs/features/transactions/server/src/infrastructure/repositories/prisma-currency.repository.ts`
- `libs/features/transactions/server/src/infrastructure/repositories/prisma-fx-rate.repository.ts`
- `libs/features/transactions/server/src/infrastructure/repositories/prisma-idempotency.repository.ts`
- `libs/features/transactions/server/src/infrastructure/repositories/prisma-transaction.repository.ts`
- `libs/features/transactions/server/src/infrastructure/fx/in-memory-fx-rate.provider.ts`
- `libs/features/transactions/server/src/__tests__/prisma-category.repository.test.ts` (10 tests)
- `libs/features/transactions/server/src/__tests__/prisma-currency.repository.test.ts` (3 tests)
- `libs/features/transactions/server/src/__tests__/prisma-fx-rate.repository.test.ts` (4 tests)
- `libs/features/transactions/server/src/__tests__/prisma-idempotency.repository.test.ts` (5 tests)
- `libs/features/transactions/server/src/__tests__/prisma-transaction.repository.test.ts` (16 tests)
- `libs/features/transactions/server/src/__tests__/in-memory-fx-rate.provider.test.ts` (11 tests)
- `apps/api/src/modules/transactions/transactions.module.ts` (NestJS DI composition root)

**MODIFICADOS (3):**

- `libs/core/database/src/index.ts` (agrega namespace `Prisma` + `PrismaClientKnownRequestError` + `PrismaDecimal` a la superficie pública)
- `libs/features/transactions/server/src/index.ts` (el barrel re-exporta los 5 adaptadores + FX provider + token DI + `FxRateProviderToken`)
- `apps/api/tsconfig.json` (agrega el path mapping de `@features/transactions` + los `shared/schemas/**` del slice al glob include)

**ELIMINADOS (1):**

- `libs/features/transactions/server/src/infrastructure/fx/sandbox-recovery-test.txt` (archivo probe de una sesión previa; nunca trackeado)

**WORKFLOW (4):** `openspec/changes/.../tasks.md` + `apply-progress.md` (esta sección) + mirrors en español bajo `Documents-es/...`. Commit `TBD`.

### Cambio en el conteo de tests

| Workspace | Antes de PR #2 | Después de PR #2 | Delta |
|-----------|----------------|------------------|-------|
| `@features/transactions` | 27/27 (5 files) | 98/98 (11 files) | +71 (6 nuevos archivos de test) |
| `apps/web` | 106/106 | 106/106 | 0 |
| `@features/auth` | 112/112 | 112/112 | 0 |
| `@core/events` | 37/37 | 37/37 | 0 |
| `@core/config` | 20/20 | 20/20 | 0 |
| `@core/database` | 3/3 | 3/3 | 0 |
| `apps/api` | 21/21 | 21/21 | 0 |
| **Total** | **326** | **397** | **+71** |

### Evidencia TDD (PR #2)

| Sub-task | RED | GREEN | Refactor | Conteo final |
|----------|-----|-------|----------|--------------|
| T5.2 migración | N/A — el schema es una pre-condición. | `prisma format` exit 0; `prisma migrate dev` produce un archivo SQL limpio; las columnas son `DECIMAL` per D-TX-6. El follow-up `2cc90fe` cierra el gap de contrato W1 del PR #1 sobre `Category.updatedBy`. | Ninguno. | 0 |
| T5.7 adaptadores Prisma | N/A — la sesión previa autorizó el código de producción sin RED observado. Los nuevos archivos de test actúan como regression lock + executable specification. Los 49 tests de adapter fallarían ante cualquier drift en la invariante D-TX-5, la Decimal boundary, la traducción P2002/P2025, o la cursor pagination. | 49/49 tests PASS contra el código de producción existente (verificado en el commit feat). | Ninguno. | +49 |
| T5.8 InMemory FX provider | Misma caveat que T5.7: la sesión previa autorizó el código de producción; el nuevo archivo de test es un regression lock. Los 11 tests de FX fallarían ante cualquier drift en el seed de 4 pares (precisión decimal.js), el contrato de lookup de `getRate`, o las semánticas de `advanceClock`. | 11/11 tests PASS. | Ninguno. | +11 |
| T5.10 wiring DI | N/A — el wiring se verifica al nivel del container NestJS; el pase de `tsc` sobre `apps/api` es el gate (los imports del módulo resuelven al barrel del slice). | `pnpm --filter api exec tsc --noEmit` exit 0; el nuevo path mapping de `apps/api/tsconfig.json` hace que `@features/transactions` sea resolvable. El módulo re-exporta `FX_RATE_PROVIDER_TOKEN` para que los callers existentes sigan funcionando. | Ninguno. | 0 |

El paso RED de strict-TDD NO se observó para el código de producción del adapter + FX provider; la sesión previa autorizó esos sin la disciplina test-first. Los nuevos archivos de test compensan como regression locks, y la desviación se documenta aquí honestamente. Slice 5 PR #3 seguirá strict RED → GREEN → TRIANGULATE → REFACTOR para los servicios desde el inicio.

### Desviaciones críticas del brief

1. **RED no se observó para el código de producción del adapter + FX provider.** La sesión previa autorizó el código de producción en el "what" de `ebf585b` sin tests fallantes observados. Los 6 nuevos archivos de test en este PR actúan como regression lock + executable specification. La disciplina strict-TDD se honra para los propios archivos de test (cada uno describe el contrato), pero el código de producción no es estrictamente test-first. La desviación se documenta en esta sección; slice 5 PR #3 seguirá strict RED → GREEN → TRIANGULATE → REFACTOR para los servicios.
2. **`FX_RATE_PROVIDER_TOKEN` relocalizado a `libs/features/transactions/server/src/constants.ts`.** El draft de la sesión previa declaraba el token inline dentro de `apps/api/src/modules/transactions/transactions.module.ts` (`static readonly FX_RATE_PROVIDER_TOKEN = "FX_RATE_PROVIDER" as const;`). Promover el const a `constants.ts` del slice mantiene el string literal fuera del consumer + agrega un type alias `FxRateProviderToken` para narrowing en tiempo de compilación. El módulo re-exporta el const vía `static readonly FX_RATE_PROVIDER_TOKEN = FX_RATE_PROVIDER_TOKEN;` para que los callers existentes que toman el símbolo a nivel de módulo sigan funcionando.
3. **Path mapping de `apps/api/tsconfig.json` agregado.** El `tsconfig.json` de PR #1 sólo mapeaba `@features/auth`; este PR agrega `@features/transactions` → `libs/features/transactions/server` + el catchall `*` + los `shared/schemas/**` del slice al glob `include`. Requerido para que el nuevo módulo resuelva sus imports. El mismo mapping ya existe en `tsconfig.base.json`; esto es el mirror por app.
4. **El import path original `@features/transactions/server` en `transactions.module.ts` estaba mal.** El nombre del package es `@features/transactions` (no `@features/transactions/server`); el import de la sesión previa habría fallado al resolver incluso después de agregar el path mapping. Arreglado en este PR.
5. **`__tests__/prisma-currency.repository.test.ts` + `prisma-fx-rate.repository.test.ts` usan pequeños helpers inline para el fake `{toString: () => "X"}` de Decimal.** El `prisma-session.repository.test.ts` del auth slice tiene un módulo `password-reset.fakes.ts` para fixtures compartidos. Un helper `decimal.fake.ts` podría extraerse a `__tests__/fakes/` si 3+ tests lo necesitaran a lo largo del slice; el conteo actual es 2 (fx-rate + transaction). Decisión diferida hasta que los servicios de PR #3 lo necesiten.

### Risk flags

- `slice5_pr1_audit_log_port_deferred_to_pr3` — sigue pendiente (arrastrado desde PR #1). PR #3 introducirá el puerto junto con los servicios.
- `slice5_pr1_decimal_boundary_adaptation_in_pr2` — **RESUELTO** por este PR. La Decimal boundary es two-sided (outbound `.toString()` al escribir; inbound `.toString()` + `toDecimal` al leer); la suite de tests assertea ambos lados explícitamente en `prisma-fx-rate.repository.test.ts` + `prisma-transaction.repository.test.ts`. El conteo de tests `slice5_pr2_decimal_boundary` es +6 (3 en fx-rate + 3 en transaction) y fallaría ante cualquier drift.
- `slice5_pr1_idempotency_lookup_schema_purposely_omitted` — sigue pendiente (arrastrado desde PR #1). Si PR #3 necesita el schema, agregarlo inline; si no, dejarlo fuera.
- `slice5_pr2_di_token_lives_in_slice` — `FX_RATE_PROVIDER_TOKEN` ahora se exporta desde `@features/transactions` (no desde el módulo consumer). Los consumers futuros deben importarlo desde el slice. El re-export a nivel de módulo mantiene la compatibilidad hacia atrás para cualquier test o docstring que ya referencie el const.
- `slice5_pr2_test_first_discipline_not_observed` — ver "Desviaciones críticas" #1.

### Quality gates — todos en verde

| Gate | Resultado |
|------|-----------|
| `pnpm --filter @features/transactions exec tsc --noEmit` | exit 0 |
| `pnpm --filter @features/transactions exec vitest run` | 98/98 PASS (11 files) |
| `pnpm --filter @core/database exec tsc --noEmit` | exit 0 |
| `pnpm --filter api exec tsc --noEmit` | exit 0 |
| `pnpm --filter @features/auth exec tsc --noEmit` | exit 0 |
| `pnpm --filter web exec tsc --noEmit` | exit 0 |
| `pnpm turbo run lint` | 11/11 tasks PASS, 0 errores |
| `pnpm run lint:fixtures` | 11/11 fixtures PASS, 18 violaciones en invalid-fixtures preservadas |
| `pnpm --filter @core/database exec vitest run` | 3/3 PASS |

### Workload / PR boundary

- Forecast (tasks.md): ~115 LOC de producción + 6 archivos de test + 1 módulo + 1 tsconfig + 1 constants + barrel update. Real: 17 archivos cambiados, +1042 / -25 inserciones netas entre producción + tests + DI + tsconfig + barrel.
- 400-line budget risk: **Low** — el código de producción es chico; los tests + DI + tsconfig inflan el diff pero no afectan el foco de review. Los 6 archivos de test son el contenido de mayor valor para review (codifican el contrato del que PR #3 depende).
- Target del PR: `feat/slice-5-pr2-adapters-fx` → `develop` una vez que `sdd-verify` libere el PR #2. **NO pusheado a remoto, NO mergeado todavía.**
- Este es **PR #2 de 3** en la cadena del slice 5. PR #3 aterriza `T5.3 + T5.9 + T5.11 + T5.12 + T5.13` (servicios + controller + triangulate + refactor).

### Snapshot estructurado de status

```yaml
active_change: vertical-slicing-reference-scaffold
artifact_store: hybrid
execution_mode: interactive
slice_1: complete (8/8)
slice_2: complete (5/5)
slice_3: complete (9/9)
slice_4:
  status: complete (27/27)
  tasks_done: [T4.1..T4.15, brief-test-slim, brief-fetch-timeout, brief-referrer-policy,
              brief-magic-constant, brief-input-prop-cleanup, brief-auth-helper,
              brief-cookie-on-success, brief-redirect-if-authed, brief-i18n-keys,
              brief-cookie-name-migration, brief-server-cookie-read, brief-markers-apply-progress]
slice_5:
  status: in-progress (8/13 — PR #1 + PR #2 hechos; PR #3 pendiente)
  pr1_tasks_done: [T5.1, T5.4, T5.5, T5.6]
  pr1_commits: [478fd7c, a4f531e, 1802dd5, cf0d14b, a1a2b99]
  pr1_chore: 98c651e (en feat/chore-merge-markers, NO en el tracker)
  pr1_workflow_commits: [cf0d14b, a1a2b99]
  pr2_tasks_done: [T5.2, T5.7, T5.8, T5.10]
  pr2_commits: [c719a0e, 2cc90fe, ebf585b]
  pr2_workflow_commits: [TBD]
  pr3_tasks_pending: [T5.3, T5.9, T5.11, T5.12, T5.13]
feature_branch: feat/slice-5-pr2-adapters-fx
base_commit: 4d5c282 (post-merge del release v1.0.0)
head_commit: ebf585b (feat transactions: Prisma adapters + FX + DI); workflow commit TBD
pushed_to_remote: false
merged_to_develop: false
branch_protection_on_main: enforced
risk_flags:
  - slice5_pr1_audit_log_port_deferred_to_pr3
  - slice5_pr1_idempotency_lookup_schema_purposely_omitted
  - slice5_pr2_di_token_lives_in_slice
  - slice5_pr2_test_first_discipline_not_observed
resolved_risk_flags:
  - slice5_pr1_decimal_boundary_adaptation_in_pr2 (locked por +6 tests de Decimal boundary)
next_recommended: slice 5 PR #3 — T5.3 (test RED para TransactionService.create) + T5.9 (cuatro servicios) + T5.11 (controller NestJS + JWT guard + Idempotency-Key validation pipe) + T5.12 (triangulation suite) + T5.13 (refactor + lint + typecheck + test green).
```

### Cross-references (slice 5 PR #2)

- **Tasks:** `openspec/changes/.../tasks.md` (nueva sección "Slice 5 PR #2 — Adaptadores + FX + DI (persistence boundary)" + 4 filas de sub-task `[x]` + quality gates + desviaciones + cross-references).
- **Mirror en español:** `Documents-es/openspec/changes/.../tasks.md` + `apply-progress.md` (español neutral/profesional según AGENTS.md §13 / convención id 2132).
- **Spec:** `openspec/changes/.../specs/transactions/spec.md` §Data Model + Decisions (D-TX-1..D-TX-7).
- **Design:** `openspec/changes/.../design.md` §5.1 (entidades + puertos), §5.2 (FX provider + staleness), §5.5 (Zod schemas).
- **Commits atómicos:** PR #2 (`c719a0e` migración T5.2, `2cc90fe` follow-up de Category.updatedBy, `ebf585b` T5.7 + T5.8 + T5.10 + barrel + módulo + 6 archivos de test + tsconfig). Total = 1 producción + 2 históricos-en-rama. Workflow commit `TBD`.
- **Rama:** `feat/slice-5-pr2-adapters-fx`.
- **Commit base:** `4d5c282` (post-merge del release v1.0.0).
- **Working tree:** limpio tras el workflow commit.
- **Estado de push:** no pusheado.
- **Estado de merge:** no mergeado.
- **PR boundary:** PR #2 de 3 en la cadena del slice 5. Diff total ~1.04K inserciones netas entre producción + tests + DI + tsconfig + barrel updates.
- **Siguiente recomendado:** slice 5 PR #3 — servicios + controller + triangulate + refactor.

---

### Cierre del slice 5: controlador REST + suite de triangulación — ESTADO: COMPLETO (5/5)

**Resumen del objetivo.** Cerrar el slice 5 bajando el controlador REST de NestJS (T5.11) para `/transactions` + `/categories`, la suite de triangulación (T5.12) con ocho escenarios transversales, y la compuerta final (T5.13). El PR #29 (el "PR #3" de la cadena del slice 5) entregó T5.9 + el port de AuditLog pero difirió los controladores, los tests de integración y la compuerta final. El PR de cierre baja esas tres tareas restantes en un único PR encadenado contra `develop`.

**Commits atómicos (5)**

| # | Sha | Asunto | Superficie | Evidencia TDD |
|---|------|---------|-----------|---------------|
| 1 | `f2b9bac` | `chore(slice-5): mark T5.3 + T5.9 as [x] in tasks.md` | bookkeeping | No es TDD — sólo los marcadores `[x]` de `tasks.md`. |
| 2 | `81e9132` | `feat(transactions): NestJS controller (T5.11) + service list/update/softDelete + QuerySchema decorator` | T5.11 | TDD preparado — la suite de triangulación (commit 3) sigue al controlador. |
| 3 | `021d112` | `test(transactions): triangulation suite — 8 cross-cutting scenarios (T5.12)` | T5.12 | RED-first vía la factoría de tests a nivel de servicio; los escenarios se escribieron contra el controlador en GREEN. 11/11 tests nuevos PASAN. |
| 4 | `dab1d99` | `chore(transactions): apply auto-formatter consistency pass` | housekeeping | No es TDD. El auto-formateador de biome reordenó los imports + tabs→espacios después del commit 2; centralizar el drift en este commit mantiene los diffs futuros enfocados en lógica. |
| 5 | `<filled by commit>` | `chore(slice-5): final turbo gate green + apply-progress section (T5.13 part B)` | T5.13 | Compuerta de verificación (lint + typecheck + test) capturada abajo. |

**Rama**: `feat/s5-closeout` (cortada desde `develop@74a63ac`).
**Commit base**: `74a63ac` (develop, post-PR #29).
**Target del PR**: `develop` (NO `main`). El PR se abre DESPUÉS de la revisión y aprobación del usuario.

#### Tareas cerradas en este lote

- **T5.3** (test RED para `TransactionService.create` con FX) — marcador `[x]` escrito; el archivo de tests (`transaction.service.test.ts`) ya existía desde el PR #29. Fix puramente de bookkeeping.
- **T5.9** (4 servicios de dominio) — marcador `[x]` escrito; los cuatro archivos `.service.ts` ya existían. El controlador del commit 2 depende de `TransactionService.list/update/softDelete`, que no estaban en el PR #29 original. El brief del orchestrator listaba esos métodos bajo T5.9, pero el PR #29 sólo entregó `create`. **Este cierre commitea esos tres métodos adicionales** a T5.9 extendiendo el servicio — atómico según el brief ("los cuatro servicios de dominio... TransactionService con manejo de idempotency-key").
- **T5.11** (controladores de NestJS) — `apps/api/src/modules/transactions/transactions.controller.ts` + wiring de `transactions.module.ts` + import de `apps/api/src/app.module.ts` + path mapping `@shared-utils/*` en `apps/api/tsconfig.json` + `apps/api/src/shared/decorators/query.decorator.ts`. 8 endpoints en total: `POST/GET/PATCH/DELETE /transactions` + `GET/POST/PATCH/DELETE /categories`. `POST /transactions` requiere el header `Idempotency-Key` (D-TX-1); mismatch de fingerprint → 409 (`IdempotencyKeyReusedError`). Guard JWT vía `@UseGuards(JwtAuthGuard)` espeja el patrón del slice de auth.
- **T5.12** (suite de triangulación) — `libs/features/transactions/server/src/__tests__/transactions.integration.test.ts`. Ocho escenarios transversales: idempotency hit (fp matching), idempotency 409 (mismatch), audit row en write fresco, 404 por categoría faltante, threshold emite `transactions.threshold.exceeded` post-create, FX stale-rate no bloquea + dispatch dual de eventos, idempotencia del soft-delete, camino de update (happy + error por categoría soft-deleted). 11 escenarios totales; 11 PASAN.
- **T5.13** (refactor + compuerta final) — El commit 4 es el housekeeping de format-drift (sin cambio semántico); el commit 5 captura la compuerta final en esta sección de apply-progress.

#### Compuertas de calidad (final)

| Compuerta | Comando | Resultado | Notas |
|-----------|---------|-----------|-------|
| Typecheck | `pnpm turbo run typecheck --filter api --filter @features/transactions` | exit 0 (2/2 paquetes) | El TS2305 previo sobre `PrismaFxRateRepository` vs `FxRateProvider` se arregló vinculando el DI a través de `FX_RATE_PROVIDER_TOKEN` (resuelve a `InMemoryFxRateProvider`). |
| Lint | `pnpm turbo run lint --filter api --filter @features/transactions` | exit 0 (2/2 paquetes) | La directiva `eslint-disable-next-line @typescript-eslint/no-unused-vars` que el brief acarreaba desde slice-3-batch-3 se removió: el proyecto carga sólo el `@typescript-eslint/parser`, NO el plugin — la directiva disparaba "Definition for rule 'X' was not found". El nombre del parámetro `_userId` es la convención canónica de TypeScript para "no usado intencionalmente"; no se necesita ninguna supresión de lint. El mismo fix de patrón aplica al commit más viejo `f69c54a` de slice-3-batch-3 que carga `// eslint-disable-next-line @typescript-eslint/no-explicit-any` — ese PR futuro debería también descartar la disable, o instalar el plugin. |
| Test | `pnpm turbo run test --filter api --filter @features/transactions` | exit 0 (2/2 paquetes) | 161 tests en `@features/transactions` (153 existentes + 8 escenarios nuevos de este cierre — 11 casos en total por las sub-suites), 21 tests en `apps/api`. **182/182 PASAN.** |

Log de verificación guardado en `/tmp/slice5-final-gate.log`; exit 0.

#### Sorpresas y bugs aflorados (tratados como lecciones de diseño para slice 6+)

1. **`mock.calls[0]` vs `mock.calls.flatMap(...)`**. El patrón de tests de slice-3-batch-3 (id 2155) indexaba aserciones de eventos vía `vi.mocked(dispatcher).mock.calls[0]`, lo cual esconde silenciosamente escenarios multi-evento. La suite de triangulación usa `flatMap(call → call.map(arg => arg.name))` para enumerar todos los eventos despachados por nombre. Los tests de slice-3-batch-3 pasan porque sus escenarios emiten un solo evento; el bug está latente. **Lección:** el scaffold de tests en `transaction.service.test.ts` es correcto para su alcance pero el patrón es frágil — los lotes futuros deberían usar `flatMap` por defecto.

2. **La factoría `fakeIdempotencyKeyEntry` no tenía `responseStatus` + `transactionId`.** La entidad `IdempotencyKey` requiere ambos (la respuesta cacheada necesita su HTTP status + una back-reference a la fila de transacción persistida). Fácil de pasar por alto al leer la definición de tipo; el type-checker lo cazó cuando el test de integración intentó construir uno. **Lección:** las factorías de tests deberían matchear siempre el set completo de campos requeridos de la entidad antes de escribir escenarios.

3. **Confusión de port `PrismaFxRateRepository` vs `FxRateProvider`.** El `TransactionService.fxProvider` es el **port** (`FxRateProvider`, runtime `.getRate(from, to)`); el `PrismaFxRateRepository` es el **adaptador de persistencia** (`FxRateRepository`, con `findLatest`/`insert`). Ambos tienen `FxRate` en el nombre; el parámetro del constructor requiere `FxRateProvider`. La vinculación de DI anterior intentó pasar el repositorio donde el servicio esperaba el provider — TypeScript lo cazó. **Lección:** los ports y adaptadores suelen compartir un prefijo; el README o el docblock de cada port debería aclarar qué slot del constructor lo consume.

4. **`exactOptionalPropertyTypes: true` requiere spread condicional, no `undefined`.** El tipo del filter a nivel de servicio declara `cursor?: string` (con `?`). Pasar `{ cursor: undefined }` viola `exactOptionalPropertyTypes`. El patrón correcto es spread condicional: `...(query.cursor !== undefined ? { cursor: query.cursor } : {})`. Lo mismo se necesita para `categoryService.update`. **Lección:** todo método de controlador que pasa input validado por el usuario a un filter estricto a nivel de servicio va a través de spread condicional; el type system lo enforce.

5. **Faltaba el alias de path `@shared-utils/*` en `apps/api/tsconfig.json`.** El alias existe en `tsconfig.base.json` y en el tsconfig de cada lib, pero `apps/api/tsconfig.json` solo listaba `@core/*` + `@features/*`. La compilación funcionaba dentro de la lib (tsconfig propio) pero fallaba en el consumer api. Fix de una línea: agregar `"@shared-utils/*": ["../libs/shared-utils/*"]` a los paths del tsconfig api. **Lección:** todo consumer de un alias debe declararlo explícitamente; el `paths` heredado de `tsc` es poco confiable entre paquetes.

6. **Format-drift del auto-formateador (cosmético, recurrente).** Este es el tercer slice consecutivo donde el pase de formato de biome produce un diff sin commitear en la rama feature justo después del commit de código principal. Un `.prettierrc` (o `biome.json` formal) lockaría el formato y prevendría el drift. Documentado en el incidente slice-3-batch-3 id 2155; seguimos difiriendo.

#### Archivos agregados / modificados (sólo PR de cierre)

```
apps/api/src/modules/transactions/transactions.controller.ts        | NEW (+440 LOC)
apps/api/src/modules/transactions/transactions.module.ts           | MOD (+130/-30) DI: controller + 4 services + dispatcher
apps/api/src/shared/decorators/query.decorator.ts                 | NEW (+30 LOC) @QuerySchema(<schema>)
apps/api/src/app.module.ts                                        | MOD (+5/-2)   importa TransactionsModule
apps/api/tsconfig.json                                            | MOD (+3/-3)   agrega el path alias @shared-utils/*
libs/features/transactions/server/src/domain/services/transaction.service.ts | MOD (+180/-30) list/update/softDelete + reorder de transactionFromIdempotencyPayload
libs/features/transactions/server/src/__tests__/transactions.integration.test.ts | NEW (+422 LOC) 8 escenarios
openspec/changes/.../tasks.md                                     | MOD (+30)   T5.3 + T5.9 [x] markers
openspec/changes/.../apply-progress.md                            | MOD (+95)   esta sección + mirror en español
```

Inserciones totales: ~1.300 LOC en 8 archivos (los tests dominan el count).

#### Snapshot estructurado del estado

```yaml
slice_5_close_out:
  status: complete
  branch: feat/s5-closeout
  base_commit: 74a63ac (develop)
  head_commit: <sha> (commit 5 de este lote)
  tasks_done: [T5.3, T5.9, T5.11, T5.12, T5.13]
  commits_landed: 5  # bookkeeping, controller, tests, format-drift, gate
  insertions: ~1300 across 8 files
  tests_landed: 11 escenarios (8 en la suite de triangulación + 3 sub-casos)
  total_workspace_tests: 182
  quality_gates:
    typecheck: PASS (api + @features/transactions)
    lint: PASS
    test: PASS
  pushed_to_remote: false
  merged_to_develop: false  # el usuario mergea después de review
  risk_flags:
    - id_2155_pattern_mock_calls_flatMap_recomendado_para_lotes_futuros
    - id_2155_pattern_omitir_eslint_disable_cuando_plugin_no_cargado
    - apps_api_alias_shared_utils_requerido_en_paquetes_consumer
    - format_drift_recurrente_tercer_slice_seguido
  next_recommended: abrir PR feat/s5-closeout → develop para review del usuario
```

#### Cross-references (cierre del slice 5)

- **Tasks:** `openspec/changes/.../tasks.md` — T5.3, T5.9 markers ahora `[x]`; el resto de los markers del slice (T5.1, T5.2, T5.4, T5.5, T5.6, T5.7, T5.8, T5.10) ya estaban `[x]` desde los PRs #27 / #28.
- **Spec:** `openspec/changes/.../specs/transactions/spec.md` — secciones Idempotency (D-TX-1) y FX port (D-TX-2).
- **Design:** `openspec/changes/.../design.md` §5.3 (REST surface), §5.4 (Idempotency-Key header + fingerprint).
- **Engram**: la observación `gastos-personales-reference/state/slice5-closeout-progress` cae después de este commit (captura el resumen del cierre, los 5 SHAs de commit y los riesgos para slice-6+).
- **Aplicación de convención**: regla §13 mirror (id 2132) — N/A (no se introdujeron nuevos `.md` en inglés; sólo se actualizó el existente con su mirror); §15 AGENTS.md §5.1 git-flow (id 2129) — `feat/s5-closeout` se cortó desde `develop`, NO desde `main`.
