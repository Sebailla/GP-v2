# Tasks — `fix-state-coverage-drift` — `gastos-personales-reference`

> **Estado**: borrador · fase de tasks · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `e0dc2eb`) · tracker `feat/fix-state-coverage-drift` (off develop)
> **Modo**: `auto` · **Almacén de artefactos**: hybrid · **Entrega**: `auto-chain` (>400 LOC) — **N/A para este cambio** (~10 LOC netas)
> **TDD estricto**: ACTIVO (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Inputs de aprobación**: `proposal.md` (Engram `#2373`), `spec.md` (Engram `#2374`, G1–G6, R1–R9, 6 escenarios, 20 ACs), `design.md` (Engram `#2375`, 1 edición de archivo, 2 commits atómicos, 9 secciones)
> **PR único**: 1 archivo editado (`apps/web/__tests__/components/transactions/state-coverage.test.tsx`, +25 / -15), 2 commits atómicos
> **Autor**: Orquestador SDD → `sdd-tasks` (ejecutor)
> **Siguiente fase**: el usuario pausa antes de `sdd-apply` (según protocolo del orquestador — chequeo intermedio sobre seguimiento pequeño-pero-impactante de 10 LOC al PR #66)

---

## Convenciones usadas en este archivo

- **Atomic commits de unidad de trabajo**: cada commit DEBE ser independientemente revertible. El cambio aterriza como una única edición de harness de test; el comportamiento de producción de cualquier componente queda sin cambios.
- **Sin trailers de "Co-Authored-By"** (AGENTS.md §6 / regla del proyecto).
- **Conventional Commits**: `type(scope): subject` — imperativo, ≤72 chars, sin punto final.
- **RED antes de GREEN**: el RED es el exit-1 EXISTENTE de `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` (13/25 fallando porque el `resolvePath` de next-intl 3.26.5 recorre `messages` por segmento separado por puntos y las claves plano-con-puntos del harness fallan). No se necesita un nuevo archivo de test; `state-coverage.test.tsx` ES la superficie de regresión según AGENTS.md §4 ("un test fallido que reproduzca la falla debe existir ANTES del cambio de producción" — el archivo existente ya existe, el cambio lo hace pasar).
- **`MUST / SHALL / MUST NOT`** son RFC 2119; cualquier cosa más débil (should, may) es no vinculante.
- Las 2 tasks de abajo mapean 1:1 con los 2 commits atómicos en `design.md` §4. **Ningún 3er commit. Ningún merge a mitad de camino.**

---

## §1. Grafo de dependencias

```
T1 (reforma de messages + 2 ediciones de aserción + JSDoc en state-coverage.test.tsx)
    │
    ▼
T2 (chore verify marker — pipeline turbo completo, sin cambios de archivos)
```

**Invariante de orden de ejecución**: `T1 → T2`. T1 es la única edición de archivo (el cambio que causa GREEN, según R1 + R2 + R3 + R8); T2 es el gate de verificación que prueba que la observación GREEN es real y que el workaround `pool: "forks"` del PR-7 de slice-7 coexiste limpiamente con la ización del `vi.mock("next/navigation", …)` del PR #66.

---

## §2. Tablas por task (2 tasks)

### T1 — Reformar la constante `messages` del harness + ajustar 2 aserciones de fila + añadir párrafo JSDoc

| Campo | Valor |
|-------|-------|
| Commit | `test(web): state-coverage.test.tsx — nest messages object + adjust 2 assertions (R1, R3)` |
| Archivos | `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (EDIT, +25 / -15) |
| Depende de | — (RED ya observado: `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 1 con 13/25 fallando — 11 fallas de forma i18n porque `resolvePath` recorre `messages["transactions"]["list"]["loading"]` y obtiene `undefined`, más 2 fallas de aserción de id de fila porque `<TransactionsRow>` nunca renderiza `tx.id`) |
| LOC | +25 / -15 (según estimación de la propuesta §4; coincide con el footer de §2 Archivo 1 del diseño) |
| TDD | RED → GREEN. El RED es el exit-1 existente de `state-coverage.test.tsx` (no se necesita un nuevo archivo de test según la excepción de AGENTS.md §4). Este commit aterriza el GREEN. Editar `apps/web/__tests__/components/transactions/state-coverage.test.tsx` para (a) INSERTAR un bloque de comentario JSDoc INMEDIATAMENTE POR ENCIMA del `const messages = {` existente en L73 explicando el contrato `resolvePath` de next-intl 3.26.5, el modo de falla de las claves plano-con-puntos, el requisito de espejado con la producción `apps/web/messages/en.json`, y el rastro `openspec/changes/fix-state-coverage-drift/{proposal,spec,design}.md` (texto verbatim según §2 Archivo 1 Parte A del diseño); (b) REFORMAR la constante `messages` en L73-188 de plano-con-puntos (`"transactions.list": { … }`) a objetos-anidados (`transactions: { list: { … } }`), fusionando los 8 padres `transactions.*` bajo un único padre `transactions`, los 4 padres `categories.*` bajo un único padre `categories`, y el único padre `auth.sessions` bajo `auth` (según el hunk de diff de §2 Archivo 1 Parte B del diseño — las hojas de string quedan idénticas; solo cambia la jerarquía envolvente; `common` ya estaba correctamente anidado y se queda en su sitio); (c) EDITAR las 2 líneas de aserción de fila (L271, L296) reemplazando `findByText("txn-1")` y `findByText("txn-2")` con `findByText("cat-1")`, más un comentario inline de 2 líneas según §2 Archivo 1 Parte C del diseño (`// TransactionsRow renders categoryId/currencyCode/kind/amount/date but not tx.id; assert on the rendered categoryId (unique per row).`). Los datos del fixture en los objetos de transacción de test en L250-264 y L275-288 quedan sin cambios (solo cambia el texto de la aserción según R3). |
| Verify | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` DEBE salir con 0 con `Tests 25 passed (25)`. Las 11 fallas de forma i18n se cierran vía R1+R2 (next-intl resuelve los segmentos de clave anidados); las 2 fallas de id de fila se cierran vía R3 (las aserciones buscan `cat-1` que `<TransactionsRow>` renderiza como `{tx.categoryId}`). Sin decoración `.skip` / `.todo` añadida (según AC14). `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` DEBE devolver cero coincidencias (AC1). `grep -nE '^  (transactions\|categories\|auth\|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` DEBE devolver ≥4 coincidencias (AC2). `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` DEBE devolver cero coincidencias (AC4). `grep -nE 'next-intl.*resolvePath\|resolvePath.*next-intl' apps/web/__tests__/components/transactions/state-coverage.test.tsx` DEBE devolver ≥1 coincidencia (AC5 — párrafo JSDoc presente). |

---

### T2 — Chore verify marker (pipeline turbo completo, sin cambios de archivos)

| Campo | Valor |
|-------|-------|
| Commit | `chore(web): verify pnpm --filter web test exits 0 with 145/145 + turbo bdd preserved (R4 marker)` |
| Archivos | (sin cambios de archivos — solo gate de verificación; el orquestador PUEDE omitir este commit si la verificación corre sobre el árbol del commit previo en su lugar) |
| Depende de | T1 |
| LOC | 0 / 0 |
| TDD | Gate de REFACTOR. Re-correr el pipeline turbo completo para confirmar (a) la suite de tests unitarios de apps/web sale con 0 en 145/145 (la edición de 1 archivo es local al harness; los otros 18 archivos de test / 120 tests siguen VERDES), (b) el gate BDD no regresa (estaba en 43/43 en `develop@e0dc2eb` según Engram `#2278`), (c) sin cascada de OOM (la ización del `vi.mock("next/navigation", …)` del PR #66 en `apps/web/__tests__/setup.ts` se preserva; el workaround `pool: "forks"` del PR-7 de slice-7 en `apps/web/vitest.config.ts:54-63` se preserva), (d) las fixtures de ESLint boundary siguen pasando (no se necesita una nueva regla; el contrato de objetos-anidados se enforce por el test mismo, no por una regla de lint según spec §7.1), (e) TypeScript sigue compilando limpiamente. Este commit existe para darle al cierre de slice-8 un rastro documental que distinga la observación GREEN (este commit) del cambio que causa el GREEN (T1). Separa el POR QUÉ del QUÉ en el log de commits. |
| Verify | `pnpm turbo run test bdd lint typecheck` DEBE salir con 0 en las 4 tareas turbo. `pnpm --filter web test` DEBE mostrar `Tests 145 passed (145)`. `pnpm turbo run bdd` DEBE mostrar 43/43 PASS. `pnpm lint:fixtures` DEBE salir con 0 (las 5 reglas activas de boundary — `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs` — siguen verdes; no se añade ninguna regla nueva según spec §7.1). `git log feat/fix-state-coverage-drift --pretty=format:"%B" \| grep -i "co-authored-by"` DEBE devolver vacío (AC16). El workaround del PR-7 de slice-7 en `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) DEBE quedar sin cambios (AC6, AC15). La ización del PR #66 en `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`) DEBE quedar sin cambios (AC12). `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` DEBE devolver exactamente `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (AC11 — solo el archivo state-coverage se edita bajo apps/web). `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` DEBE estar vacío (AC10 — ningún archivo fuente tocado). |

---

## §3. Plan de PR (PR único)

**Título del PR**: `test(web): state-coverage.test.tsx — nest messages + fix 2 row assertions (closes 13 i18n resolution failures)`

**Rama**: `feat/fix-state-coverage-drift` (cortada de `develop` en HEAD `e0dc2eb`)

**Rama base**: `develop` (NO `main` — AGENTS.md §2; AC17)

**Estrategia de merge**: squash-merge al final del PR (estándar para fixes de PR único; preserva la historia de 2 commits en la descripción del PR mientras colapsa a un único cambio revertible en `develop`). El cuerpo del PR DEBE incluir una sección "Context" según R9 del spec que nombre al PR #66 (`fix-web-vitest-crash`) como el predecesor inmediato y explique por qué importa este seguimiento: el PR #66 cerró la cascada de OOM y trajo el runner vitest de apps/web de vuelta online, pero 13 escenarios en este único archivo de test siguen fallando porque el harness se escribió con la forma de mensaje incorrecta. Este fix completa el gate de tests unitarios de apps/web (Gate 3 de verificación de slice-8) para que el slice finalmente se cierre.

**Checklist pre-PR**:

- [ ] Los 2 commits aterrizan en orden en `feat/fix-state-coverage-drift` (T1 → T2).
- [ ] Cada mensaje de commit es `type(scope): <subject>`, imperativo presente, asunto ≤72 chars, sin punto final.
- [ ] Sin trailers `Co-Authored-By` en ningún commit (AC15).
- [ ] `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0 con `Tests 25 passed (25)` (AC6 — archivo state-coverage VERDE).
- [ ] `pnpm --filter web test` sale con 0 con `Tests 145 passed (145)` (AC7 — suite completa de apps/web VERDE).
- [ ] `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR"` sale con 1 — sin firma de OOM en stderr (AC8 — ización del PR #66 sigue funcionando).
- [ ] `pnpm turbo run bdd` sale con 0 con 43/43 (AC9, sin regresión de BDD).
- [ ] `pnpm lint:fixtures` sale con 0 (el plugin de boundary sigue pasando; sin regla nueva añadida según spec §7.1).
- [ ] `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve cero coincidencias (AC1 — no quedan claves plano-con-puntos).
- [ ] `grep -nE '^  (transactions|categories|auth|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve ≥4 coincidencias (AC2 — 4 padres anidados presentes).
- [ ] `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve cero coincidencias (AC4 — aserciones de id de fila reemplazadas).
- [ ] `grep -nE 'next-intl.*resolvePath|resolvePath.*next-intl' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve ≥1 coincidencia (AC5 — párrafo JSDoc presente).
- [ ] `grep -cE '\.(skip|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` iguala el conteo en `develop@e0dc2eb` (AC14 — sin nuevas decoraciones).
- [ ] `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` devuelve exactamente `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (AC11 — solo el archivo state-coverage se edita bajo apps/web).
- [ ] `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` está vacío (AC10 — ningún archivo fuente tocado).
- [ ] `git diff --shortstat develop..feat/fix-state-coverage-drift -- 'apps/web/__tests__/components/transactions/state-coverage.test.tsx'` muestra ≤+30 / ≤-20 líneas (AC20 — coincide con la estimación de ~10 netas de la propuesta §4).
- [ ] `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` devuelve ≥1 coincidencia (AC12 — ización del PR #66 preservada).
- [ ] `grep -n 'pool: "forks"' apps/web/vitest.config.ts` devuelve 1 coincidencia (AC13 — workaround de slice-7 preservado).
- [ ] El ref `base` del PR es `develop` (NO `main`) (AC17).
- [ ] `git log feat/fix-state-coverage-drift --pretty=format:"%B" | grep -i "co-authored-by"` devuelve vacío (AC15).
- [ ] El cuerpo del PR incluye una sección "Context" que nombre explícitamente a `fix-web-vitest-crash` (PR #66) como el predecesor inmediato (AC19).
- [ ] El job de CI de tests apps/web de GitHub Actions reporta `pass` (este job estaba VERDE en `develop@e0dc2eb` solo a nivel del runner, pero 13/25 fallando en el archivo state-coverage; será la primera vez que esté 145/145 completamente verde desde `fix-web-vitest-crash`).

---

## §4. Estrategia de entrega

- **Estrategia de entrega** (de `openspec/config.yaml`): `auto-chain` (auto-slicea en >400 LOC).
- **Estrategia efectiva de este cambio**: PR único. ~10 LOC netas se quedan bien por debajo del presupuesto de 400 líneas; no se dispara ningún trigger de auto-chain.
- **No se recomiendan PRs encadenados** para `fix-state-coverage-drift`.
- **Rama**: `feat/fix-state-coverage-drift` cortada de `develop@e0dc2eb` tras la señal de "go" del usuario.
- **Revisor**: mantenedor (Sebastián Illa). Correr `gentle-ai review start` tras aterrizar los 2 commits en la rama.
- **Perfil de riesgo**: 3 riesgos catalogados en `proposal.md` §7 + `design.md` §6 (R1–R3); todos tienen mitigaciones concretas ya ingenieradas en las 2 tasks.

---

## §5. Orden de apply

1. **Crear rama** `feat/fix-state-coverage-drift` off `develop@e0dc2eb`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-state-coverage-drift
   ```
2. **Aplicar los 2 commits** en orden TDD estricto según §2 arriba (T1 → T2). Cada commit aterriza ATÓMICAMENTE — nunca se divide, nunca se squashea a mitad de camino.
3. **Correr la verificación turbo completa**:
   ```bash
   pnpm install
   pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx   # DEBE salir con 0; 25/25 PASS
   pnpm --filter web test                                                         # DEBE salir con 0; 145/145 PASS
   pnpm turbo run bdd                                                             # DEBE salir con 0; 43/43 PASS
   pnpm lint:fixtures                                                             # DEBE salir con 0
   pnpm turbo run lint typecheck                                                  # DEBE salir con 0
   ```
4. **Push de la rama**:
   ```bash
   git push -u origin feat/fix-state-coverage-drift
   ```
5. **Abrir el PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-state-coverage-drift \
     --title "test(web): state-coverage.test.tsx — nest messages + fix 2 row assertions (closes 13 i18n resolution failures)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   El cuerpo del PR DEBE incluir una sección "Context" (según R9 del spec) que nombre a `fix-web-vitest-crash` (PR #66) como el predecesor inmediato y explique por qué importa este seguimiento.
6. **Esperar al CI** (turbo + lint:fixtures + fixtures del plugin de boundary + job de tests apps/web de GitHub Actions). El job de tests apps/web DEBE reportar `pass` — esta es la señal primaria (primera vez que estará 145/145 desde `fix-web-vitest-crash`).
7. **Revisión + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-state-coverage-drift   # tras aprobación del mantenedor
   ```
8. **`sdd-verify` corre en `develop` post-merge** para confirmar que el Gate 3 de slice-8 se cierra (el flip a 145/145 + la ización del PR #66 preservada + el workaround de slice-7 preservado + el gate BDD aún verde + el diff de 1 archivo según AC10/AC11).
9. **`sdd-archive` mueve** `openspec/changes/fix-state-coverage-drift/{explore,proposal,spec,design,tasks}.md` a `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/` según el protocolo de archivo del orquestador.

---

## §6. Preguntas abiertas del diseño resueltas

- **Q1 (documentación del contrato de objetos-anidados — JSDoc vs nuevo ADR)**: **Bloque de comentario JSDoc encima de la constante `messages` (NO nuevo ADR)**. Resuelta en `spec.md` §11 / `design.md` §2 Archivo 1 Parte A.
- **Q2 (export de `messages` para reuso entre archivos de test)**: **NO. Mantenerlo local al archivo.** Resuelta en `spec.md` §11.
- **Q3 (texto de aserción de fila — `cat-1` vs `100.00`)**: **`cat-1`** (la celda `categoryId`, única por fila en el fixture de test, menor riesgo de colisión que amount/currency/kind). Resuelta en `spec.md` §11 / `design.md` §2 Archivo 1 Parte C.

**No quedan preguntas abiertas en la fase de tasks.** `sdd-apply` procede directamente con las 2 tasks de arriba.

---

## §7. Fuera de alcance (cambio completo)

(Enforzado por el orquestador; espejado de `spec.md` §4 + §10 + `proposal.md` §2 + AGENTS.md §11.)

1. Modificar el código fuente de `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager` o `SessionList` — los componentes cumplen con el spec; el harness tenía la forma incorrecta.
2. Añadir un `<span data-testid="tx-id">` oculto o columna de id visible a `<TransactionsRow>` — el test aserta sobre contenido renderizado por la fila, no sobre un gancho DOM oculto (según R3, según resolución Q3).
3. Cambiar `apps/web/messages/en.json` o `apps/web/messages/es.json` — los mensajes de producción ya están correctamente anidados; solo el harness estaba mal.
4. Subir o bajar la versión de next-intl / use-intl — la versión se queda en 3.26.5.
5. Reestructurar `vi.mock("@/lib/transactions-api", …)` en `state-coverage.test.tsx:39-54` — el mock por archivo es sólido.
6. Añadir tests nuevos o decoraciones `.skip` / `.todo` / `.xfail` a ninguno de los 25 escenarios (AC14).
7. Añadir una nueva regla ESLint a `tools/eslint-plugin-boundary/` para la forma de objetos-anidados — el plugin de boundary NO gana una nueva regla según spec §7.1; el contrato de objetos-anidados se enforce por el test mismo.
8. Exportar `messages` para reuso entre archivos de test — diferido según resolución Q2; el harness es local al archivo.
9. Redactar un ADR bajo `docs/architecture/decisions/` para el contrato de objetos-anidados — el comentario JSDoc en el harness es suficiente según resolución Q1.
10. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/` — el fix es solo de apps/web (AC10).
11. Tocar `apps/web/__tests__/setup.ts` (la ización del PR #66 se queda como fuente única de verdad para `next/navigation`; AC12).
12. Tocar `apps/web/vitest.config.ts` (el workaround `pool: "forks"` de slice-7 queda sin cambios; AC13).
13. Amendar, rebasear o eliminar los commits `36386e1` (workaround del PR-7 de slice-7), `2e05fc5` (split de auth del PR-2 de slice-8), o cualquier commit de `fix-web-vitest-crash` (PR #66).
14. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
15. Un espejo en español de cualquier archivo bajo `openspec/changes/fix-state-coverage-drift/` (ningún `.md` de fuente de verdad se entrega en este cambio; los spec/design/propuesta de carpeta de cambio son artefactos de coordinación entre fases SDD, no docs de cara al usuario, según los precedentes de `fix-web-vitest-crash` + `fix-api-nestjs-di` y la excepción de AGENTS.md §13).
16. Cualquier cosa en AGENTS.md §11 (i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log, enforzamiento del gate de cobertura, migración de `gastos-personales/`, etc.).

---

## §8. Riesgos

(Espejado de `proposal.md` §7 + `design.md` §6 R1–R3 con mitigaciones concretas a nivel de task.)

- **R1 (un test que pasa puede depender de un fallback literal con puntos)** — Bajo. Mitigado por la verificación de T1 (el comando focalizado de state-coverage sale con 0 con 25/25 PASS; si alguno de los 12 escenarios originalmente pasando se rompe, la falla apunta a la aserción, no al resolver — el sub-agente de apply inspecciona y o bien reescribe la aserción o la marca para seguimiento). Los 12 escenarios actualmente pasando están enumerados en §1.1 del brief de exploración; ninguno de ellos aserta sobre una clave con puntos literal (asertan sobre strings `common.*`, errores lanzados por mocks, o copia en inglés hard-codeada que no pasa por `t()`). Verificación: G1 (AC6) captura cualquier regresión.
- **R2 (las aserciones de fila pueden volverse menos específicas — `cat-1` podría aparecer en un `<option>` de `<select>` o `aria-describedby`)** — Bajo. Mitigado por la resolución Q3: `cat-1` es el `categoryId` de la transacción del fixture, renderizado como un nodo de texto plano de `TableCell` en `TransactionsList.tsx:241`; `cat-1` no aparece en ningún `<option>` (el form usa `<option>expense</option>` / `<option>income</option>` como labels de kind, no como ids de categoría). `cat-1` es único por fila en el fixture de test. Verificación: G2 (AC6 — 25/25 PASS) y AC4 (cero coincidencias de `findByText("txn-")`).
- **R3 (las colisiones de múltiples `Loading` pueden persistir por un nodo de texto perdido)** — Bajo. Según §3.3 del brief de exploración, las fallas "multiple Loading" se deben al bug de forma i18n: cuando `t("loading")` devolvía la literal `transactions.list.loading` (porque el resolver hacía fallback a `joinPath(namespace, key)`), esa literal contenía la subcadena "Loading" y coincidía con la regex `/Loading/i` en múltiples lugares. Tras R1+T1, `t("loading")` devuelve el string resuelto `"Loading..."` exactamente una vez. Verificación: G1 (AC6) captura cualquier colisión restante; si alguna persiste, el sub-agente de apply re-investiga según §3.3 del brief de exploración.

---

## §9. Pronóstico de carga de revisión

| Campo | Valor |
|-------|-------|
| **Líneas estimadas cambiadas** | ~10 LOC netas (`+25 / -15` según el footer de §2 Archivo 1 del diseño; tope superior de `+30 / -20` según AC20) |
| **Riesgo de presupuesto de 400 líneas** | Bajo (~10 << 400; ~2.5% del presupuesto usado) |
| **PRs encadenados recomendados** | No |
| **Estrategia de entrega** | `auto-chain` (default del proyecto); trigger de auto-chain NO disparado (~10 < 400) |
| **Estrategia efectiva** | single-pr |
| **Racional de PR único** | ~10 LOC netas bien por debajo de 400; un PR mantiene la historia coherente (RED → GREEN vía reforma de harness de state-coverage → chore verify) y coincide con la invariante de 1 archivo, 1 PR del diseño §4 |
| **Decisión necesaria antes de apply** | No (sin trigger `ask-on-risk`; los 3 riesgos tienen mitigaciones concretas ya ingenieradas en las 2 tasks) |
| **Estrategia de cadena** | n/a (camino de PR único) |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: No
Estrategia de cadena: n/a
Riesgo de presupuesto de 400 líneas: Bajo

---

## §10. Estado

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1–R3 (mitigaciones concretas integradas en las 2 tasks de arriba)

`next_recommended`: **`apply`** — el orquestador crea `feat/fix-state-coverage-drift` off `develop@e0dc2eb` y aplica las 2 tasks de §2 secuencialmente.

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`)
- **Spec**: `openspec/changes/fix-state-coverage-drift/spec.md` (Engram `#2374`; 6 objetivos, 9 requisitos, 6 escenarios, 20 criterios de aceptación)
- **Diseño**: `openspec/changes/fix-state-coverage-drift/design.md` (Engram `#2375`; 1 edición de archivo, 2 commits atómicos, 9 secciones, +25/-15 LOC)
- **Brief de exploración**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`; reproducción smoking-gun en §1.1, enumeración de fallas 13/25)
- **PR predecesor**: PR #66 (`fix-web-vitest-crash`, mergeado en `develop@e0dc2eb`) — izó `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts`; cerró la cascada de OOM de V8. **PRESERVADO sin cambios por este PR.**
- **Ruta de código smoking-gun**: `use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65` (`resolvePath` recorre los mensajes por segmento separado por puntos) y `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66` (`defaultGetMessageFallback` devuelve la ruta con puntos literal)
- **Referencia de producción (correctamente anidada, fuente de verdad)**: `apps/web/messages/en.json` (191 líneas; 4 padres top-level: `auth`, `transactions`, `categories`, `common`). La forma plano-con-puntos del harness es el único lugar del repo que usa la forma incorrecta.
- **Componentes afectados (NO modificados)**: `apps/web/components/transactions/TransactionsList.tsx:247-261` (`<TransactionsRow>` renderiza date/amount/categoryId/currencyCode/kind pero nunca `id`); `apps/web/components/transactions/CreateTransactionForm.tsx:166-250`; `apps/web/components/transactions/EditTransactionForm.tsx:179-266`; `apps/web/components/transactions/CategoryManager.tsx:95-118`; `apps/web/components/auth/SessionList.tsx:113-153`
- **Superficie de regresión**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas → ~691 tras este PR; 25 escenarios a través de 5 bloques describe; constante `messages` en L73-188)
- **Mock del PR #66 setup (PRESERVADO)**: `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`)
- **Workaround de slice-7 (PRESERVADO, commit `36386e1`)**: `apps/web/vitest.config.ts` líneas 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **Convenciones del proyecto**: AGENTS.md §1 (stack), §2 (modelo de ramas — `main` inmutable, cortado de `develop`), §4 (TDD estricto — RED es el exit-1 existente, sin nuevo archivo de test), §5 (atomic commits), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — sin nueva regla de frontera), §8 (fuente única de verdad — contrato de objetos-anidados enforcado en el sitio canónico vía JSDoc), §9 (UI completa no scaffold — N/A, solo test), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (lista de fuera-de-alcance), §13 (espejo en español — N/A para tasks de carpeta de cambio por instrucción del orquestador + precedentes `fix-web-vitest-crash` + `fix-api-nestjs-di`)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- **Precedentes de formato**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/tasks.md` (PR predecesor; misma forma de 2 tasks), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (8 tasks, 10 secciones)
- **Reporte de verificación de slice-8 (contexto del gate)**: Engram `#2278` (confirmó gate BDD VERDE; 13/25 fallas de tests unitarios eran Gate 3 en `develop@e0dc2eb`)
