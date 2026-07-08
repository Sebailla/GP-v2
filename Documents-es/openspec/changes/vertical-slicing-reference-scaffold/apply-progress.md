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

### Commits atómicos (4)

1. `98c651e chore(repo): remove spurious merge markers from package.json files` — 9 archivos cambiados, 36 deletions, 0 insertions. Mecánico. Desbloquea `pnpm install` de completarse limpiamente.
2. `478fd7c feat(database): add transactions tables (slice 5 foundations)` — 1 archivo, 156 inserciones netas. Extensión del esquema Prisma. Apply de migración diferido a PR #2 (T5.2).
3. `a4f531e feat(transactions): scaffold slice 5 + add canonical Zod schemas` — 16 archivos, 523 inserciones netas. Scaffolding (package.json, tsconfig, vitest.config, barrel público) + 5 schemas + 5 specs Vitest + barrel.
4. `1802dd5 feat(transactions): add domain entities and ports (T5.5 + T5.6)` — 14 archivos, 593 inserciones netas. 5 interfaces de entidades + 6 interfaces de puertos + 2 barrels + actualización del barrel en `src/index.ts`.

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
  pr1_commits: [478fd7c, a4f531e, 1802dd5]
  pr1_chore: 98c651e
  pr1_workflow_commit: TBD
  pr2_tasks_pending: [T5.2, T5.7, T5.8, T5.10]
  pr3_tasks_pending: [T5.3, T5.9, T5.11, T5.12, T5.13]
feature_branch: feat/vertical-slicing-s5-transactions-server
base_commit: 4d5c282 (post-merge del release v1.0.0)
head_commit: TBD (commit de workflow); commit previo = 1802dd5
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
- **Commits atómicos:** `98c651e` (chore), `478fd7c` (T5.1), `a4f531e` (T5.4 + scaffold), `1802dd5` (T5.5 + T5.6).
- **Commit de workflow:** `TBD` (este commit).
- **Rama:** `feat/vertical-slicing-s5-transactions-server`.
- **Commit base:** `4d5c282` (post-merge del release v1.0.0).
- **Working tree:** limpio tras este commit.
- **Estado de push:** no pusheado.
- **Estado de merge:** no mergeado.
- **PR boundary:** PR #1 de 3 en la cadena del slice 5. Producción LOC ~110; diff total ~1.1K (incluyendo tests + config + scaffolding).
