# Apply Progress — `vertical-slicing-reference-scaffold` (es)

> **Estado**: en curso · fase de apply
> **Proyecto**: `gastos-personales-reference`
> **Branch**: `develop` (trabajo) · `feat/vertical-slicing-s4-batch4a-t42-t43-t45` (slice 4 batch 4a, en revisión)
> **Artifact store**: hybrid (archivos `openspec/` + observaciones Engram)
> **Modo**: interactive. Strict TDD activo.
> **Autor**: SDD orchestrator → `sdd-apply` (executor) para slice 4 batch 4a
> **Fecha**: 2026-07-06

Este archivo es el espejo fiel en español neutro/profesional de
`openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md`
sección `## Slice 4 batch 4a: T4.2 + T4.3 + T4.5`, según la convención
`doc-mirror-spanish` (id 2132) documentada en AGENTS.md §13.

**Reglas del espejo** (AGENTS.md §13):

1. Mismo path relativo bajo `Documents-es/` que el original bajo
   `openspec/`.
2. Producido en el **mismo commit atómico** que el archivo fuente.
3. Sin caracteres CJK (verificación: `grep -P '[\x{4e00}-\x{9fff}]'
   Documents-es/.../apply-progress.md` debe devolver vacío).
4. Superficies técnicas preservadas verbatim: rutas de archivo,
   nombres de comandos, identificadores de task (T4.2, T4.3, T4.5),
   SHAs de commit, versiones de paquetes, gates (G17, G40, G41,
   etc.), claves de catálogo (`auth.signIn.title`).

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
