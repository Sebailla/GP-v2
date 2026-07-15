# Tareas — `fix-api-nestjs-di` — `gastos-personales-reference`

> **Estado**: borrador · fase de tareas · **Fecha**: 2026-07-13
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `6cd56a2`) · tracker `feat/fix-api-nestjs-di` (off develop)
> **Modo**: interactivo · **Almacén de artefactos**: hybrid · **Entrega**: `auto-chain` (>400 LOC) · **irrelevante este cambio** (245 LOC ≤ presupuesto)
> **TDD estricto**: ACTIVO (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Entradas de aprobación**: `proposal.md` (Engram `#2287`), `spec.md` (Engram `#2289`), `design.md` (Engram `#2291`)
> **Fuente de la regresión**: commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
> **PR único**: 10 archivos, ~245 LOC netas, bien bajo el presupuesto de revisión de 400 líneas
> **Autor**: Orquestador SDD → `sdd-tasks` (ejecutor)
> **Siguiente fase**: el usuario pausa antes de `sdd-apply` (verificación interina según protocolo del orquestador)

---

## Convenciones usadas en este archivo

- **Commits de unidad de trabajo**: cada commit DEBE ser independientemente reversible. Los tests aterrizan en el mismo commit que el comportamiento que verifican. La ADR EN + espejo `Documents-es/` ES aterrizan en el MISMO commit atómico (regla dura de AGENTS.md §13).
- **Sin trailers "Co-Authored-By"** (AGENTS.md §6 / regla del proyecto).
- **Conventional Commits**: `type(scope): subject` — imperativo, ≤72 chars, sin punto final.
- **RED antes que GREEN**: el primer commit de cada par TDD DEBE ser un test fallando observado antes de que se escriba cualquier código de producción. Para docs (commit #7) no hay Vitest RED; la verificación es `wc -l`, `grep`, `grep -P '[\x{4e00}-\x{9fff}]'`.
- **`MUST / SHALL / MUST NOT`** son RFC 2119; cualquier cosa más débil (should, may) no es vinculante.
- Las 8 tareas abajo mapean 1:1 a los 8 commits atómicos en `design.md` §4. **Sin noveno commit. Sin mergeo.**

---

## §1. Grafo de dependencias

```
T1 (RED test — transactions.e2e-spec)
    │
    ├──────────────────────┐
    ▼                      ▼
T2 (GREEN transactions    T4 (RED cableado de regla:
controller — quitar            stub del cuerpo + plugin +
type + añadir ancla)           runner + fixture inválida;
                              sin valid.ts aún — el runner
T3 (GREEN auth               espera RED)
controller — mismo               │
tratamiento + reescribir          ▼
comentario auto-formatter)     T5 (GREEN cuerpo de regla
    │                       implementación — reemplaza
    │                       el stub. invalid.ts ahora
    ▼                       reporta ≥1; valid.ts todavía
T6 (TRIANGULATE fixture      faltante → el runner todavía
válida — también re-asssere   se queja de un archivo
4 + 1 + lint:fixtures        valid.* faltante)
en verde)                        │
    │                              ▼
    └────────────┐         T6 ↘ (valid.ts añade la
                 ▼         triangulación; ambas fixtures
                 T7 (ADR    pasan concurrentemente)
                 0008 EN +    │
                 ES espejo   │
                 commit      │
                 atómico)    │
                 │           │
                 └────┬──────┘
                      ▼
                     T8 (chore — turbo verify; sin cambios de archivo)
```

**Invariante de orden de ejecución**: `T1 → { T2, T4 } → T3 → T5 → T6 → T7 → T8`. T2 y T4 son paralelizables (archivos diferentes); el orquestador los secuencia como `T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8` porque T3 observa el flip de 21 tests a verde que prueba que el RED de T2 era real, y T6 necesita el cuerpo de regla de T5.

---

## §2. Tablas por tarea (8 tareas)

### T1 — Test e2e RED-first de transactions

| Campo | Valor |
|-------|-------|
| Commit | `test(api): RED — add transactions.e2e-spec proving latent DI bug` |
| Archivos | `apps/api/test/transactions.e2e-spec.ts` (NUEVO, ~50 LOC) |
| Depende de | — (primera tarea; nada de lo que depender) |
| LOC | +50 / 0 |
| TDD | RED-first. Escribir el test, ejecutarlo, CONFIRMAR que falla con `Nest can't resolve dependencies of the TransactionsController (?, ?, ?)`. NO tocar ningún código de producción en este commit. |
| Verificar | `pnpm --filter api test transactions.e2e-spec` DEBE salir non-zero (Vitest FAIL); stdout DEBE contener la frase literal `Nest can't resolve dependencies of the TransactionsController`. |

---

### T2 — GREEN del fix del transactions controller

| Campo | Valor |
|-------|-------|
| Commit | `fix(api): transactions.controller.ts — drop type kw + add _ServiceAnchor` |
| Archivos | `apps/api/src/modules/transactions/transactions.controller.ts` (EDITAR, +5 / -3 netas) |
| Depende de | T1 |
| LOC | +5 / -3 |
| TDD | GREEN. El test RED de T1 ya falla; este commit quita `type` de los 3 imports en L23/L25/L27 (`CategoryService`, `ThresholdService`, `TransactionService`); añade `_ServiceAnchor = [CategoryService, ThresholdService, TransactionService] as const;` como el ÚLTIMO campo de la clase; actualiza el comentario "AUTO-FORMATTER NOTE" en L87-90 para referenciar ADR 0008 + la regla ESLint. `type CurrentUser` en L46 SE QUEDA (referencia DTO, NO parámetro de constructor). Todas las otras anotaciones `type DTO` (L34-42) SE QUEDAN sin cambios. |
| Verificar | `pnpm --filter api test transactions.e2e-spec` DEBE salir 0 con `1/1 PASANDO`. AC3 (`grep -E "type (CategoryService\|ThresholdService\|TransactionService)" …/transactions.controller.ts` sin matches) DEBE cumplirse. AC4 (`grep -n "_ServiceAnchor" …/transactions.controller.ts` muestra exactamente un match, con número de línea > constructor) DEBE cumplirse. |

---

### T3 — GREEN del fix del auth controller (cierra la línea base RED de 21 tests)

| Campo | Valor |
|-------|-------|
| Commit | `fix(api): auth.controller.ts — drop type kw + restore _ServiceAnchor` |
| Archivos | `apps/api/src/modules/auth/auth.controller.ts` (EDITAR, +5 / -3 netas) |
| Depende de | T2 (T3 reusa el mismo patrón TDD; la secuenciación asegura que el flip de 21 tests se observa DESPUÉS del GREEN estrecho de transactions de T2, aislando cualquier señal de regresión) |
| LOC | +5 / -3 |
| TDD | GREEN. Quitar `type` de los 4 imports de servicios en L16-19 (`AuthService`, `PasswordResetService`, `RbacService`, `SessionService`); restaurar `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService] as const;` como el ÚLTIMO miembro de clase (coincide con el comentario en L112-118 que ya referencia el ancla). Reescribir el comentario L112-118 para referenciar ADR 0008 + la regla ESLint. `type CurrentUser` en L22 SE QUEDA (referencia DTO, NO parámetro de constructor). |
| Verificar | `pnpm --filter api test auth.e2e-spec jwt-auth-guard.e2e-spec session-expiry.e2e-spec transactions.e2e-spec` DEBE salir 0; el reporter DEBE mostrar `22/22 PASANDO` (14 + 4 + 3 + 1). AC1 (`grep -E "type (AuthService\|PasswordResetService\|RbacService\|SessionService)" …/auth.controller.ts` sin matches) DEBE cumplirse. AC2 (`grep -n "_ServiceAnchor" …/auth.controller.ts` muestra el campo DESPUÉS del constructor) DEBE cumplirse. |

---

### T4 — Scaffold de regla ESLint + cableado de plugin + fixture RED inválida

| Campo | Valor |
|-------|-------|
| Commit | `feat(eslint): wire no-import-type-injectable rule scaffolding + invalid fixture` |
| Archivos | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (NUEVO STUB VACÍO, +5 líneas), `tools/eslint-plugin-boundary/index.cjs` (EDITAR, +3 LOC: `require` + entrada `plugin.rules` + entrada `configs.recommended.rules`), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (EDITAR, +1 LOC en array `RULES`), `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (NUEVO, ~30 LOC) |
| Depende de | T1 (provee la rationale de "fuente de regresión" para la regla); independiente de T2/T3 (la regla guarda el futuro, los controllers son el fix presente) |
| LOC | +39 / 0 |
| TDD | RED scaffold. Crear el archivo de regla como un STUB VACÍO INTENCIONAL (`module.exports = { meta: { ... }, create: () => ({}) }`) que no reporta errores. Crear `invalid.ts` con el patrón roto exacto (`import { type AuthService } from "@features/auth"; @Controller("/auth") export class BadController { constructor(private readonly auth: AuthService) {} }`). Cablear el registro en `index.cjs` y `run-fixtures.mjs`. Ejecutar `pnpm lint:fixtures`; ESPERAR FALLO — el runner espera que `invalid.ts` reporte ≥1 error pero el stub vacío reporta 0. **`valid.ts` está INTENCIONALMENTE AUSENTE en este commit** para que el runner salga temprano en el invariante de "fixture válida faltante" antes de llegar a la aserción de cuerpo de regla vacío; esto fuerza el modo de fallo a ser predecible. El path de fixture espeja la forma del path de producción (sin anidamiento `libs/...` — la nueva regla es agnóstica al path; solo le importa el decorador `@Controller` en el mismo archivo). |
| Verificar | `pnpm lint:fixtures` DEBE salir non-zero con `FAIL  no-import-type-injectable (invalid.ts): expected >=1 errors, got 0` (o error equivalente del runner). Las fixtures de las 4 reglas existentes se quedan en verde (sin regresión). |

---

### T5 — GREEN del cuerpo de la regla (reemplazar stub con implementación completa)

| Campo | Valor |
|-------|-------|
| Commit | `feat(eslint): implement no-import-type-injectable rule body` |
| Archivos | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (EDITAR: +85 / -5, la implementación completa reemplaza el stub) |
| Depende de | T4 |
| LOC | +85 / -5 |
| TDD | GREEN. Reemplazar el cuerpo del stub vacío con la lógica completa de `collectLocalControllerConstructors` + `collectReferencedNames` + visitor de `ImportDeclaration` según `design.md` §2 Archivo 4. Predicado: `(specifier.importKind === 'type' || node.importKind === 'type')` Y `localName ∈ anchorsByLocalName`. Tie-breaker conservador: si el símbolo importado NO se usa como parámetro de constructor en una clase `@Controller`/`@Injectable` en el mismo archivo, OMITIR silenciosamente. Ejecutar `pnpm lint:fixtures`. ESPERAR: invalid.ts ahora reporta ≥1 error (la regla dispara sobre el patrón roto); el runner todavía se queja de la valid.ts faltante (esto es por diseño — valid.ts aterriza en T6). |
| Verificar | `pnpm lint:fixtures` DEBE salir non-zero (todavía esperando valid.ts), PERO el modo de fallo DEBE ser `FAIL  no-import-type-injectable: missing valid fixture` (NO "invalid.ts reported 0 errors"). Las fixtures de las 4 reglas existentes se quedan en verde. La verificación de patrón `pnpm eslint --no-config-lookup --rulesdir tools/eslint-plugin-boundary/rules --rule '{"no-import-type-injectable":"error"}' tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` DEBE reportar ≥1 diagnóstico (round-trip manual; esta es la AC6 + AC10 binaria). |

---

### T6 — TRIANGULATE: añadir fixture valid.ts (la regla ahora está lista para producción)

| Campo | Valor |
|-------|-------|
| Commit | `feat(eslint): add valid.ts triangulation fixture for no-import-type-injectable` |
| Archivos | `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (NUEVO, ~30 LOC) |
| Depende de | T5 |
| LOC | +30 / 0 |
| TDD | TRIANGULATE. Añadir la valid.ts según `design.md` §2 Archivo 5: un controller que (a) importa servicios como valores de runtime (permitido), Y (b) importa un DTO `import type { CreateUserInput }` para un parámetro de cuerpo de método (permitido; NO un parámetro de constructor). Ejecutar `pnpm lint:fixtures`. ESPERAR: valid=0 errores, invalid≥1 error, sale 0 en general. Este commit también confirma el caso de pasada de DTO del predicado conservador de la regla (escenario G3.2 de spec). |
| Verificar | `pnpm lint:fixtures` DEBE salir 0 con stdout conteniendo `PASS  no-import-type-injectable/valid.ts (errors=0)` Y `PASS  no-import-type-injectable/invalid.ts (errors>=1)`. AC6 + AC9 + AC10 se cumplen todas. |

---

### T7 — ADR 0008 (EN + espejo ES en el mismo commit atómico)

| Campo | Valor |
|-------|-------|
| Commit | `docs(adr): ADR 0008 — forbid import type for NestJS injectables in controllers (EN + ES mirror)` |
| Archivos | `docs/architecture/decisions/0008-no-import-type-injectable.md` (NUEVO EN, ~70 LOC), `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (NUEVO espejo ES, ~75 LOC) |
| Depende de | T6 (la regla está completamente cableada antes de que la rationale se entregue; la regla dura de AGENTS.md §13 agrupa EN + ES en el mismo commit atómico) |
| LOC | +145 / 0 |
| TDD | Commit de documentación (no existe Vitest RED). El cuerpo debe incluir un pequeño anti-ejemplo según resolución de Q2 de `spec.md` (un bloque TypeScript fenced mostrando el patrón roto `import { type Service }`). La ADR EN debe citar el commit `3db761f` en la sección References según spec R11. El espejo ES se traduce manualmente desde el EN (nunca auto-traducido); según AGENTS.md §13 + design §2 Archivo 10, la prosa es español técnico, los fences de código se quedan verbatim. |
| Verificar | `wc -l docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE reportar ≥50 (artefacto real, no stub). `grep -c "^## Anti-example" docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE ser ≥1 (AC16). `grep -c "3db761f" docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE ser ≥1 (AC17). `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE retornar stdout vacío (AC15 — exit 1 significa sin match; verificamos stdout directamente para ser portables entre grep/perl). `ls Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE tener éxito. |

---

### T8 — REFACTOR / verify (pipeline turbo completo en verde)

| Campo | Valor |
|-------|-------|
| Commit | `chore(api): verify turbo test+bdd+lint+typecheck exits 0 on feat/fix-api-nestjs-di` |
| Archivos | (sin cambios de archivo — solo puerta de verificación; el orquestador PUEDE omitir este commit si la verificación corre sobre el árbol del commit anterior en su lugar) |
| Depende de | T7 |
| LOC | 0 / 0 |
| TDD | Puerta de REFACTOR. Re-ejecutar el pipeline turbo completo y confirmar salida 0 en cada tarea. Esta es la aceptación binaria para AC11 + AC12 + el seguimiento F1 de ADR 0007 del slice-8. La suite de tests de `apps/api` DEBE reportar 22/22 PASANDO (14 + 4 + 3 + 1). `pnpm lint:fixtures` DEBE salir 0 con las fixtures de la nueva regla en verde. |
| Verificar | `pnpm turbo run test bdd lint typecheck` DEBE salir 0 en las 4 tareas turbo. `pnpm --filter api test` DEBE mostrar `22/22 PASANDO`. `pnpm lint:fixtures` DEBE salir 0. `git log feat/fix-api-nestjs-di --pretty=format:"%B" \| grep -i "co-authored-by"` DEBE retornar vacío (AC19). |

---

## §3. Plan de PR (PR único)

**Título del PR**: `fix(api): close Gate 3 (NestJS DI) + blind with no-import-type-injectable rule`

**Rama**: `feat/fix-api-nestjs-di` (cortada desde `develop` en HEAD `6cd56a2`)

**Rama base**: `develop` (NO `main` — AGENTS.md §2; AC20)

**Estrategia de merge**: squash-merge al final del PR (estándar para fixes de PR único; preserva la historia de 8 commits en la descripción del PR mientras colapsa a un único cambio reversible en `develop`).

**Checklist pre-PR**:

- [ ] Los 8 commits aterrizan en orden en `feat/fix-api-nestjs-di`.
- [ ] Cada mensaje de commit es `type(scope): <subject>`, imperativo presente, subject ≤72 chars, sin punto final.
- [ ] Sin trailers `Co-Authored-By` en ningún commit (AC19).
- [ ] Ningún commit modifica `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` (las sombrillas de slice-1 + slice-8 son inmutables).
- [ ] Ningún commit hace amend o rebase de la evidencia de la cadena del slice-7 (`3db761f`, `a9b550d`, `bb25aab`).
- [ ] `pnpm turbo run test bdd lint typecheck` sale 0 en la rama (verificación T8).
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` retorna stdout vacío (verificación T7; AC15).
- [ ] `git diff --stat develop..feat/fix-api-nestjs-di` muestra ≤10 archivos y ≤+250 / -16 delta de LOC (según total final de `design.md` §4).
- [ ] Las fronteras ESLint (`pnpm lint:fixtures`) siguen pasando para las 4 reglas existentes (`no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`).

---

## §4. Estrategia de entrega

- **Estrategia de entrega** (de `openspec/config.yaml`): `auto-chain` (auto-slices en >400 LOC).
- **Estrategia efectiva de este cambio**: PR único. 245 LOC netas se asientan bien bajo el presupuesto de 400 líneas; ningún trigger de auto-chain se dispara.
- **No se recomiendan PRs encadenados** para `fix-api-nestjs-di`.
- **Rama**: `feat/fix-api-nestjs-di` cortada desde `develop` después de la señal "go" del usuario.
- **Revisor**: mantenedor (Sebastián Illa). Ejecutar `gentle-ai review start` después de que los 8 commits aterricen en la rama.
- **Perfil de riesgo**: 6 riesgos catalogados en `proposal.md` §7 + `design.md` §6 (R1-R6); todos tienen mitigaciones concretas ya en el diseño.

---

## §5. Orden de apply

1. **Crear rama** `feat/fix-api-nestjs-di` off `develop@6cd56a2`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-api-nestjs-di
   ```
2. **Aplicar los 8 commits** en orden TDD estricto según §2 arriba (T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8). Cada commit aterriza ATÓMICAMENTE — nunca dividir, nunca squash a mitad de camino.
3. **Ejecutar la verificación turbo completa**:
   ```bash
   pnpm install
   pnpm turbo run test bdd lint typecheck   # DEBE salir 0
   pnpm --filter api test                   # DEBE salir 0; 22/22 PASANDO
   pnpm lint:fixtures                      # DEBE salir 0
   ```
4. **Push de la rama**:
   ```bash
   git push -u origin feat/fix-api-nestjs-di
   ```
5. **Abrir el PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-api-nestjs-di \
     --title "fix(api): close Gate 3 (NestJS DI) + blind with no-import-type-injectable rule" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
6. **Esperar CI** (turbo + lint:fixtures + fixtures del plugin de boundary).
7. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-api-nestjs-di   # tras aprobación del mantenedor
   ```
8. **`sdd-verify` corre en `develop` post-merge** para confirmar que Gate 3 se cierra (el flip de 21 tests + el nuevo spec e2e de transactions + las fixtures de la regla ESLint todas PASAN independientemente del historial del lado del PR).
9. **`sdd-archive` mueve** `openspec/changes/fix-api-nestjs-di/{explore,proposal,spec,design,tasks}.md` a `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/` según el protocolo de archivo del orquestador.

---

## §6. Preguntas abiertas de diseño resueltas

- **Q1 (nombre de regla ESLint)**: `no-import-type-injectable` — resuelto en `spec.md` §11.
- **Q2 (ejemplos de ADR)**: incluir un pequeño anti-ejemplo en la ADR EN (bloque de código fenced mostrando el patrón roto `import { type Service }`) — resuelto en `spec.md` §11.
- **Q3 (alcance del test e2e de transactions)**: 1 escenario enfocado (único bloque `it`, solo bootstrap) — resuelto en `spec.md` §11.
- **Q4 (forma de `_ServiceAnchor`, surgido en `design.md` Apéndice A)**: `_ServiceAnchor` canónico (NO nombrado por-controller como `_AuthServiceAnchor`) con `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [...services...] as const;` como ÚLTIMO campo de la clase — resuelto en `design.md` §14.

**No quedan preguntas abiertas en la fase de tareas.** `sdd-apply` procede directamente con las 8 tareas de arriba.

---

## §7. Fuera de alcance (cambio completo)

(Forzado por el orquestador; espeja `spec.md` §4 + `proposal.md` §2.2 + AGENTS.md §11.)

1. Refactorizar los internos de `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService`.
2. Añadir decoradores `@Injectable()` a los 7 servicios (violaría el diseño hexagonal §2: "el código de dominio es libre de framework").
3. Migración del patrón de scaffold de referencia del slice-1 a un mecanismo de DI diferente (`useClass`, `useFactory: ... inject[]`, o un ancla de runtime persistida con una forma diferente).
4. Tocar los arrays de providers de `AuthModule` / `TransactionsModule` — el cableado es sólido (verificado en referencias de Archivo 1 + Archivo 2 de `design.md`); el bug está aguas arriba de la resolución de providers.
5. Nuevos escenarios BDD más allá del 1 test e2e RED mínimo para transactions (según resolución de Q3).
6. Cualquier cambio en `apps/web` / `libs/features/*/client/*` (el fix es solo de API).
7. Cualquier cambio en `tsconfig.base.json` (`isolatedModules: true` es correcto; el bug está en la elección del import, no en la config).
8. Cualquier cambio en el cableado del cliente Prisma, env config, o `@core/database`.
9. Enforzamiento del gate de cobertura en CI (AGENTS.md §11).
10. Migración de `gastos-personales/` al modelo de vertical-slicing (AGENTS.md §11; el playbook se entrega por separado en slice-8 8.4).
11. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log (AGENTS.md §11).
12. Refactorizar `tools/eslint-plugin-boundary` a TypeScript (las reglas son `.cjs`; convertirlas es su propio cambio).
13. Reemplazar el manejo de errores de los controllers, la forma de logging, la proyección de respuesta, o el mapeo de HTTP status.
14. Reemplazar la resolución de barrel export de `@features/auth` / `@features/transactions` (no se necesita — el fix está en el sitio del import, no en el layout del paquete).
15. Añadir `_ServiceAnchor` a cualquier otro controller aparte de `AuthController` y `TransactionsController` (según `spec.md` §4 no-meta #15; estos son los únicos dos controllers de NestJS en `apps/api/` que cargan la clase del bug).
16. Generar sub-tareas para mejoras V2 de la regla ESLint (resolución cross-file de símbolos vía `tsconfig.paths` + grafo del proyecto) — diferido (ver `design.md` §2 Archivo 4 "Casos de falsos NEGATIVOS conocidos").

---

## §8. Riesgos

(Espejo de `proposal.md` §7 + `design.md` §6 R1-R6 con mitigaciones concretas a nivel de tarea.)

- **R1 (el fix del auth controller rompe un factory de `*Service`)** — Baja. Mitigado por la verificación T3 (`22/22 PASANDO` después de la edición del controller). Cualquier regresión de cableado de provider surfaceará como `Nest can't resolve dependencies of the …Service` (problema de provider, distinto de `?` (problema de controller)).
- **R2 (la regla ESLint da falsos positivos en `import { type X }` legítimos para DTOs / interfaces)** — Media. Mitigado por el predicado estrecho (resolución local al archivo, requiere referencia como parámetro de constructor en el MISMO archivo) Y la fixture de triangulación valid.ts de T6 (usa `import type { CreateUserInput }` en un parámetro de cuerpo de método — prueba que la regla NO dispara).
- **R3 (Biome u otro auto-formatter re-introduce `type` en los 4+3 imports)** — Baja. Defensa en profundidad: (a) la regla ESLint (T4-T6) corre en `pnpm turbo run lint` vía `boundary.configs.recommended`; (b) los campos estáticos `_ServiceAnchor` (T2 + T3) mantienen los símbolos vivos en runtime incluso si el formateador vence la línea de import.
- **R4 (decoradores `skip` / `todo` silenciosos enmascaran fallos)** — Baja. La enumeración del reporter verbose de T8 (`22/22 PASANDO`) captura esto; AC11 es la puerta binaria. Los 21 archivos e2e previamente fallando no tienen decoradores `.skip` / `.todo` según verificación del slice-8 (observación F1 de `develop@ea7732f`).
- **R5 (la regla se dispara erróneamente en argumentos de tipo genéricos `Param<T>`)** — Baja. La regla camina nodos `Identifier` en posiciones de tipo y cualquier match contra el nombre local dispara — este es el comportamiento correcto (los genéricos con tipo borrado rompen DI igual que las clases con tipo borrado). T6 valid.ts triangula el caso donde el símbolo importado con tipo NO se usa como parámetro de constructor.
- **R6 (el espejo en español se entrega con drift CJK)** — Baja. El espejo ES se traduce manualmente desde la ADR EN (nunca auto-traducido; AGENTS.md §13 prohíbe el pipeline de auto-traducción). La verificación T7 `perl -ne 'print if /\p{Han}/'` retorna stdout vacío por construcción.

---

## §9. Forecast de carga de revisión

| Campo | Valor |
|-------|-------|
| **Líneas estimadas modificadas** | 245 LOC netas (`+250 / -16` según footer de `design.md` §4) |
| **Riesgo de presupuesto de 400 líneas** | Bajo (245 << 400; 61% del presupuesto sin usar) |
| **PRs encadenados recomendados** | No |
| **Estrategia de entrega** | `auto-chain` (default del proyecto); trigger de auto-chain NO disparado (245 < 400) |
| **Estrategia efectiva** | single-pr |
| **Rationale de PR único** | 245 LOC netas bien bajo 400; un PR mantiene la historia coherente (test RED → GREEN transactions → GREEN auth → RED scaffold de regla → GREEN cuerpo de regla → TRIANGULATE fixture válida → ADR + espejo ES → verificar) |
| **Decisión necesaria antes de apply** | No (sin trigger `ask-on-risk`; los 6 riesgos tienen mitigaciones concretas ya ingenierizadas en las 8 tareas) |
| **Estrategia de cadena** | n/a (camino de PR único) |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: No
Estrategia de cadena: n/a
Riesgo de presupuesto de 400 líneas: Bajo

---

## §10. Estado

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1-R6 (mitigaciones concretas integradas en las 8 tareas arriba)

`next_recommended`: **`apply`** — el orquestador crea `feat/fix-api-nestjs-di` off `develop@6cd56a2` y aplica las 8 tareas en §2 secuencialmente.

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- **Spec**: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`; 6 metas, 12 requerimientos, 11 escenarios, 20 criterios de aceptación)
- **Diseño**: `openspec/changes/fix-api-nestjs-di/design.md` (Engram `#2291`; 10 diffs de archivo, 8 commits atómicos, 8 pasos de ejecución)
- **Brief de exploración**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
- **Commit de causa raíz**: `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
- **`tsconfig.base.json`** línea 10 (`isolatedModules: true`) — el predicado en tiempo de compilación que borra `import type`
- **Plugin de boundary**: `tools/eslint-plugin-boundary/` (5 reglas existentes + 1 nueva `no-import-type-injectable`)
- **Precedente de ADR**: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` (referencia de formato; NO invocado — este cambio se asienta bien bajo cualquier tope de tamaño)
- **Seguimiento del slice-8**: ADR 0007 §F1 (Gate 3 de la verificación del slice-8) — este cambio lo cierra
- **Formato de tareas del slice-8**: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/tasks.md`
- **Convenciones del proyecto**: AGENTS.md §2 (rama), §4 (TDD estricto), §5 (commits atómicos), §6 (Conventional Commits), §7 (plugin de boundary), §8 (única fuente de verdad), §11 (fuera de alcance), §13 (regla dura del espejo en español)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`