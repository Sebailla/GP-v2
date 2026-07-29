# Diseño Técnico — `fix-state-coverage-drift`

> **Estado**: borrador · fase de diseño
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `e0dc2eb`) → tracker `feat/fix-state-coverage-drift` (off develop)
> **Almacén de artefactos**: hybrid · **Modo**: auto · **Entrega**: `auto-chain` NO disparada (~10 LOC netas se quedan en PR único) · **Presupuesto de revisión**: 400 líneas
> **TDD estricto**: activo (AGENTS.md §4) · **PR único**: 1 archivo editado (+25 / -15), 2 commits atómicos
> **Forma del fix**: A (decisión auto capturada en propuesta §3)
> **Autor**: Orquestador SDD → ejecutor `sdd-design` (modelo `MiniMax-M3`)
> **Fecha**: 2026-07-14
> **Entradas leídas**: `proposal.md` (Engram `#2373`, 59 LOC), `spec.md` (Engram `#2374`, 446 LOC, 6 objetivos, 9 requisitos, 6 escenarios, 20 ACs), `explore.md` (Engram `#2372`, 431 LOC), `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (precedente de formato, 14 secciones), `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, constante `messages` en L73-188), `apps/web/messages/en.json` (191 líneas, árbol de producción anidado), `apps/web/__tests__/setup.ts` (superficie de mock post-#66, PRESERVADA).
> **Resolución de preguntas abiertas del spec**: Q1 (JSDoc, sin ADR), Q2 (`messages` local al archivo, sin export), Q3 (`cat-1` para aserciones de fila) — TODAS resueltas en el spec; este diseño no las re-litiga.

---

## 1. Mapeo objetivos ↔ enfoque técnico

| Objetivo | Anclaje en spec | Enfoque técnico |
|------|-------------|--------------------|
| **G1** — el comando focalizado de state-coverage sale con 0 con 25/25 pasando | §3 G1, R1, R3, R4 | Reformar la constante `messages` del harness en `state-coverage.test.tsx:73-188` de plano-con-puntos (`"transactions.list": { … }`) a objetos-anidados (`transactions: { list: { … } }`) para que el `resolvePath()` de next-intl 3.26.5 (`use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65`) pueda recorrer los segmentos. Las 11 fallas de forma i18n se cierran. Las 2 fallas de aserción de id de fila (`#2`, `#3`) se cierran con ediciones `txn-1`/`txn-2` → `cat-1`/`cat-1`. |
| **G2** — los 13 tests que fallaban anteriormente pasan | §3 G2, R1, R2, R3 | Misma reforma + 2 ediciones de aserción. Las 11 fallas i18n se voltean vía anidado de mensajes (R1+R2); las 2 fallas de id de fila se voltean vía ediciones de aserción (R3). Cero decoradores `.skip` / `.todo` añadidos. |
| **G3** — los 12 tests que pasaban anteriormente siguen verdes | §3 G3 | Los 12 escenarios ya pasando son los que (a) asertan sobre strings en inglés provenientes del namespace `common` ya correctamente anidado (p. ej. `/Retry/i` en línea 233), o (b) asertan sobre errores lanzados por mocks que nunca pasan por `t()` (p. ej. `/net fail/i` en línea 232). La reforma es puramente aditiva sobre el árbol; sin cambios de hojas de string. Los 12 siguen verdes. |
| **G4** — la suite completa de apps/web sale con 0 con 145/145 pasando | §3 G4, R4, R5 | Misma reforma + 2 ediciones de aserción. Los 18 archivos de test restantes bajo `apps/web/__tests__/` no se ven afectados — tienen sus propias constantes `messages` por archivo o no renderizan componentes de next-intl en absoluto. El mock global `vi.mock("next/navigation", …)` del PR #66 se queda. El workaround `pool: "forks"` de slice-7 en `apps/web/vitest.config.ts:54-63` se queda. Sin regresión de OOM. |
| **G5** — el gate BDD no regresa (43/43) | §3 G5, R6 | Implícito. Ningún archivo de feature Cucumber, step definition, world file o workspace-port se toca. El harness de BDD estaba VERDE en `develop@e0dc2eb` según el reporte de verificación de slice-8 Engram `#2278`; este fix es solo de apps/web-vitest. |
| **G6** — ningún archivo fuente de componente modificado | §3 G6, R7 | La reforma + ediciones de aserción viven enteramente dentro del harness de test. El diff filtrado por `apps/web/components/\|apps/web/lib/\|apps/web/app/\|apps/api/\|libs/` está vacío. El `apps/web/messages/en.json` de producción queda sin cambios. |

---

## 2. Diffs archivo por archivo

### Archivo 1 — `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (EDITAR, +25 / -15)

Este es el ÚNICO archivo editado por este cambio. El diff consiste en tres partes lógicas:

**(A)** Un bloque de comentario JSDoc insertado inmediatamente encima de la constante `messages` (según R8), explicando el contrato de objetos-anidados para next-intl 3.26.5.

**(B)** Una reforma de la constante `messages` (líneas 73-188) de plano-con-puntos a objetos-anidados (según R1). Las hojas de string se preservan exactamente. El árbol se fusiona bajo 4 padres (`transactions`, `categories`, `auth`, `common`); el namespace `common` queda sin cambios.

**(C)** Dos ediciones de aserción en línea 271 y línea 296 (según R3, resolución Q3): reemplazar `findByText("txn-1")` y `findByText("txn-2")` con `findByText("cat-1")`, con un comentario inline que explique por qué.

#### Parte A — Párrafo JSDoc (NUEVO, insertado antes de la línea 73 `const messages = {`)

```typescript
/**
 * Harness `messages` for the `NextIntlClientProvider` (slice 8 — fix-state-coverage-drift).
 *
 * `next-intl` 3.26.5 `resolvePath()`
 * (`use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65`)
 * walks `messages` by splitting the requested key on `.` and stepping
 * through nested objects per segment. Flat keys with embedded dots
 * (e.g. `"transactions.list": { … }`) cause `messages["transactions"]`
 * to be `undefined`; the resolver throws and `defaultGetMessageFallback`
 * (`use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66`)
 * returns the literal dotted path, which the component renders as visible
 * text (e.g. `<p>transactions.list.loading</p>`).
 *
 * This harness's `messages` tree MUST mirror the production
 * `apps/web/messages/en.json` nesting: every leaf string AND every
 * intermediate level must match. `common` was correctly nested on
 * `develop@e0dc2eb`; the 13 `transactions.*` / `categories.*` /
 * `auth.*` flat-dotted keys are reshaped into the
 * `transactions: { list, totals, new, edit, detail, delete, actions, threshold }`,
 * `categories: { list, form, delete, kinds }`, and
 * `auth: { sessions }` parents.
 *
 * Adding a new top-level message namespace in `en.json` requires this
 * harness's `messages` to be updated with the same nested-object
 * structure, or the corresponding test scenarios will silently fall
 * back to literal key rendering. See
 * `openspec/changes/fix-state-coverage-drift/{proposal,spec,design}.md`.
 */
```

#### Parte B — Reforma de la constante `messages` (líneas 73-188 → +25 / -15)

La forma plano-con-puntos en `develop@e0dc2eb` pasa a objetos-anidados. Los 13 padres planos (`transactions.list`, `transactions.totals`, `transactions.new`, `transactions.edit`, `transactions.detail`, `transactions.delete`, `transactions.actions`, `transactions.threshold`, `categories.list`, `categories.form`, `categories.delete`, `categories.kinds`, `auth.sessions`) se fusionan todos bajo sus respectivos namespaces top-level. `common` ya está anidado y se queda en su sitio.

**Hunk de diff (abreviado — la misma forma se aplica a los 13 árboles):**

```diff
 const messages = {
-  "transactions.list": {
-    title: "Transactions",
-    subtitle: "Browse.",
-    empty: "No transactions yet.",
-    error: { load: "load fail", network: "net fail" },
-    columns: {
-      date: "Date",
-      amount: "Amount",
-      category: "Category",
-      currency: "Currency",
-      kind: "Kind",
-      actions: "Actions",
-    },
-    filter: {
-      fromDate: "From",
-      toDate: "To",
-      category: "Category",
-      currency: "Currency",
-      apply: "Apply",
-      reset: "Reset",
-    },
-    loadMore: "Load more",
-    loading: "Loading...",
-    retry: "Retry",
-  },
-  "transactions.totals": {
-    income: "Income",
-    expense: "Expense",
-    net: "Net",
-  },
-  "transactions.new": {
-    title: "New",
-    submit: "Create",
-    success: "Created",
-    error: {
-      invalidData: "Invalid",
-      duplicate: "Dup",
-      server: "Server",
-    },
-    amount: "Amount",
-    currency: "Currency",
-    kind: { income: "Income", expense: "Expense" },
-    category: "Category",
-    notes: "Notes",
-    occurredAt: "Date",
-  },
-  "transactions.edit": {
-    title: "Edit",
-    submit: "Save",
-    success: "Saved",
-    error: {
-      load: "load fail",
-      update: "save fail",
-    },
-  },
-  "transactions.detail": {
-    delete: "Delete",
-    deleteConfirm: "Delete?",
-  },
-  "transactions.delete": {
-    success: "Deleted",
-    error: "delete fail",
-  },
-  "transactions.actions": {
-    edit: "Edit",
-    delete: "Delete",
-    view: "View",
-  },
-  "transactions.threshold": {
-    title: "Threshold",
-    dismissed: "Dismissed",
-  },
-  "categories.list": {
-    title: "Categories",
-    subtitle: "Org",
-    empty: "No categories yet.",
-    new: "New category",
-  },
-  "categories.form": {
-    name: "Name",
-    kind: { income: "Income", expense: "Expense" },
-    submit: "Save",
-    success: "Saved",
-    error: "save fail",
-    slug: "Slug",
-    slugHint: "lower only",
-  },
-  "categories.delete": {
-    confirm: "Delete?",
-    success: "Deleted",
-    error: "delete fail",
-  },
-  "categories.kinds": { income: "Income", expense: "Expense" },
-  "auth.sessions": {
-    title: "Sessions",
-    list: "Devices",
-    revokeButton: "Revoke",
-    empty: "No active sessions.",
-  },
+  transactions: {
+    list: {
+      title: "Transactions",
+      subtitle: "Browse.",
+      empty: "No transactions yet.",
+      error: { load: "load fail", network: "net fail" },
+      columns: {
+        date: "Date",
+        amount: "Amount",
+        category: "Category",
+        currency: "Currency",
+        kind: "Kind",
+        actions: "Actions",
+      },
+      filter: {
+        fromDate: "From",
+        toDate: "To",
+        category: "Category",
+        currency: "Currency",
+        apply: "Apply",
+        reset: "Reset",
+      },
+      loadMore: "Load more",
+      loading: "Loading...",
+      retry: "Retry",
+    },
+    totals: {
+      income: "Income",
+      expense: "Expense",
+      net: "Net",
+    },
+    new: {
+      title: "New",
+      submit: "Create",
+      success: "Created",
+      error: {
+        invalidData: "Invalid",
+        duplicate: "Dup",
+        server: "Server",
+      },
+      amount: "Amount",
+      currency: "Currency",
+      kind: { income: "Income", expense: "Expense" },
+      category: "Category",
+      notes: "Notes",
+      occurredAt: "Date",
+    },
+    edit: {
+      title: "Edit",
+      submit: "Save",
+      success: "Saved",
+      error: {
+        load: "load fail",
+        update: "save fail",
+      },
+    },
+    detail: {
+      delete: "Delete",
+      deleteConfirm: "Delete?",
+    },
+    delete: {
+      success: "Deleted",
+      error: "delete fail",
+    },
+    actions: {
+      edit: "Edit",
+      delete: "Delete",
+      view: "View",
+    },
+    threshold: {
+      title: "Threshold",
+      dismissed: "Dismissed",
+    },
+  },
+  categories: {
+    list: {
+      title: "Categories",
+      subtitle: "Org",
+      empty: "No categories yet.",
+      new: "New category",
+    },
+    form: {
+      name: "Name",
+      kind: { income: "Income", expense: "Expense" },
+      submit: "Save",
+      success: "Saved",
+      error: "save fail",
+      slug: "Slug",
+      slugHint: "lower only",
+    },
+    delete: {
+      confirm: "Delete?",
+      success: "Deleted",
+      error: "delete fail",
+    },
+    kinds: { income: "Income", expense: "Expense" },
+  },
+  auth: {
+    sessions: {
+      title: "Sessions",
+      list: "Devices",
+      revokeButton: "Revoke",
+      empty: "No active sessions.",
+    },
+  },
   common: {
     loading: "Loading...",
     genericError: "Generic error.",
     cancel: "Cancel",
     save: "Save",
     delete: "Delete",
     edit: "Edit",
     add: "Add",
     back: "Back",
     submit: "Submit",
     yes: "Yes",
     no: "No",
     close: "Close",
     retry: "Retry",
   },
 };
```

**Invariante clave — cada hoja de string se preserva verbatim.** La reforma solo cambia la jerarquía envolvente. Esto garantiza AC3 (hojas de string sin cambios) y G3 (los 12 escenarios ya pasando que coinciden con strings `common.*` siguen verdes porque esas hojas no se mueven).

#### Parte C — 2 ediciones de aserción de fila (líneas 271 y 296)

```diff
   it("success-non-empty: shows a row for each item", async () => {
     vi.mocked(listTransactions).mockResolvedValue({
       items: [
         {
           id: "txn-1",
           amount: "100.00",
           currencyCode: "USD",
           kind: "expense",
           reportingAmount: null,
           reportingCurrencyCode: null,
           fxRateId: null,
           categoryId: "cat-1",
           occurredAt: "2026-06-01T12:00:00.000Z",
         },
       ],
       nextCursor: null,
     });
     render(
       <Providers>
         <TransactionsList />
       </Providers>,
     );
-    expect(await screen.findByText("txn-1")).toBeInTheDocument();
+    // TransactionsRow renders categoryId/currencyCode/kind/amount/date but
+    // not tx.id; assert on the rendered categoryId (unique per row).
+    expect(await screen.findByText("cat-1")).toBeInTheDocument();
   });

   it("validation-error: row click surfaces no validation error (it's a read-only list)", async () => {
     vi.mocked(listTransactions).mockResolvedValue({
       items: [
         {
           id: "txn-2",
           amount: "12.34",
           currencyCode: "USD",
           kind: "expense",
           reportingAmount: null,
           reportingCurrencyCode: null,
           fxRateId: null,
           categoryId: "cat-1",
           occurredAt: "2026-06-01T12:00:00.000Z",
         },
       ],
       nextCursor: null,
     });
     render(
       <Providers>
         <TransactionsList />
       </Providers>,
     );
-    expect(await screen.findByText("txn-2")).toBeInTheDocument();
+    // TransactionsRow renders categoryId/currencyCode/kind/amount/date but
+    // not tx.id; assert on the rendered categoryId (unique per row).
+    expect(await screen.findByText("cat-1")).toBeInTheDocument();
     // No form fields exist in the list component, so the
     // "validation-error" state is a non-applicable for the read-only
     // list. The harness asserts the 5 applicable states for
     // the list; the 4 read-only-state pass on every render.
   });
```

Los datos del fixture (los campos `id`, `amount`, `currencyCode`, `kind`, `categoryId`, `occurredAt` en los objetos de transacción de test en las líneas 250-264 y 275-288) quedan sin cambios — solo cambia el texto de la aserción (según R3).

#### Resumen del diff

- **+25 / -15** LOC netas (según estimación de la propuesta §4).
- LOC del archivo: 681 → ~691.
- Ninguna otra declaración en el archivo cambia.
- El bloque de mock (L39-54), el helper Providers (L192-198), beforeEach/afterEach (L200-212) y los 5 bloques describe (L214-680) se quedan verbatim excepto por las 2 líneas de aserción en la Parte C.

#### Verificación (gates que correrá el sub-agente de apply)

| Gate | Comando | Esperado |
|------|---------|----------|
| AC1: no quedan claves plano-con-puntos | `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | cero coincidencias |
| AC2: padres anidados presentes | `grep -nE '^  (transactions\|categories\|auth\|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | ≥4 coincidencias |
| AC3: hojas de string sin cambios | `grep -E 'empty: "No transactions yet\.\|empty: "No active sessions\.\|submit: "Create"\|submit: "Save"\|loading: "Loading\.\.\."\|name: "Food"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | mismas coincidencias que en `develop@e0dc2eb` |
| AC4: sin aserciones de id de fila `txn-` | `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | cero coincidencias |
| AC5: párrafo JSDoc presente | `grep -nE 'next-intl.*resolvePath\|resolvePath.*next-intl' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | ≥1 coincidencia |
| AC6: archivo state-coverage sale con 0 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASS / 0 FAIL |
| AC14: sin nuevos `.skip`/`.todo` | `grep -cE '\.(skip\|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | iguala el conteo en `develop@e0dc2eb` |

### Archivo 2 — `apps/web/__tests__/setup.ts` (VERIFICAR SOLAMENTE, sin edición)

Este archivo **no** se modifica por este cambio. Solo verificamos que el mock global `vi.mock("next/navigation", …)` del PR #66 se preserva sin cambios (según R7 + AC12 del spec).

**Verificación** (durante apply):

- `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` devuelve ≥1 coincidencia (la ización del PR #66).
- `grep -n 'useRouter' apps/web/__tests__/setup.ts` devuelve ≥1 coincidencia (factory presente).
- LOC del archivo coincide con `develop@e0dc2eb` (sin deriva introducida).

### Archivo 3 — `apps/web/vitest.config.ts` (VERIFICAR SOLAMENTE, sin edición)

El workaround `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` de slice-7 en las líneas 54-63 se **preserva** (según R8). El `setupFiles: ["./__tests__/setup.ts"]` en la línea 39 sigue cableando el mock del PR #66.

**Verificación** (durante apply):

- `grep -n 'setupFiles' apps/web/vitest.config.ts` muestra `["./__tests__/setup.ts"]` (AC5).
- `grep -n 'pool' apps/web/vitest.config.ts` sigue mostrando `pool: "forks"` Y `singleFork: true` (AC6).
- `git log --oneline | grep 36386e1` devuelve 1 coincidencia (commit de slice-7 intacto, sin force-push).

### Archivo 4 — `apps/web/messages/en.json` (VERIFICAR SOLAMENTE, sin edición)

El árbol de mensajes de producción ya está **correctamente anidado** según §1 del brief de exploración. La forma plano-con-puntos del harness era el único `messages` con forma incorrecta en el repo. Este archivo queda sin cambios.

**Verificación** (durante apply):

- `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/messages/'` está vacío.
- El archivo se queda en 191 líneas, 4 padres top-level (`auth`, `transactions`, `categories`, `common`).

---

## 3. Plan de ejecución (TDD estricto)

Según AGENTS.md §4, el TDD estricto requiere orden RED → GREEN → TRIANGULATE → REFACTOR. El RED ya está capturado por el exit-1 actual de `pnpm --filter web test` (13/25 fallando en `state-coverage.test.tsx`). No se necesita un nuevo archivo de test; `state-coverage.test.tsx` ES la superficie de regresión.

1. **RED ya observado** (registrado en el brief de exploración Engram `#2372` §1 + propuesta §3). `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` actualmente sale con 1 con 13 failed / 12 passed (25). Las 13 fallas se distribuyen: 11 son de forma i18n (#1, #4–#13 según §1.1 del brief de exploración) + 2 son de aserciones de id de fila (#2, #3). No se requiere un nuevo archivo de test (la excepción de AGENTS.md §4 para RED preexistente es explícita).

2. **Editar Archivo 1**: reformar la constante `messages` + ajustar las 2 aserciones de fila + añadir el comentario JSDoc (según §2 Archivo 1 Partes A/B/C). Ningún otro archivo se toca.

3. **Verificar Archivo 2** (`setup.ts`): confirmar que el mock global `vi.mock("next/navigation", …)` del PR #66 está intacto. No se necesita edición.

4. **Verificar Archivo 3** (`vitest.config.ts`): confirmar que `setupFiles: ["./__tests__/setup.ts"]` en la línea 39 sigue cableando el mock del PR #66 Y que el workaround `pool: "forks"` de slice-7 en las líneas 54-63 se preserva. No se necesita edición.

5. **GREEN: state-coverage aislado**: `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx`. DEBE salir con 0 con 25/25 PASS. Las 11 fallas de forma i18n se cierran vía R1+R2; las 2 fallas de id de fila se cierran vía R3.

6. **GREEN: suite completa de apps/web**: `pnpm --filter web test`. DEBE salir con 0 con `Tests 145 passed (145)`. Los 18 archivos de test restantes (120 tests) que ya pasaban siguen pasando — la reforma de mensajes es local al harness. Sin `Worker exited unexpectedly`. Sin `FATAL ERROR`. Sin cascada de OOM.

7. **Verificar BDD no regresa**: `pnpm turbo run bdd`. DEBE salir con 0 con 43/43.

8. **Verificar que ningún archivo fuente se tocó**: `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` DEBE estar vacío.

9. **Commit atómicamente**: 2 commits según §4 abajo.

---

## 4. Atomic commits

PR único, 2 commits atómicos (alineados con unidades de trabajo; según AGENTS.md §5 cada commit se revierte limpiamente con `git revert <sha>`):

1. **`test(web): state-coverage.test.tsx — nest messages object + adjust 2 assertions (R1, R3)`** — el cambio de código de producción: reformar la constante `messages` a objetos-anidados, ajustar las 2 aserciones de fila (`txn-1`/`txn-2` → `cat-1`), y añadir el párrafo JSDoc encima de la constante (según R8). Nota el tipo `test:` según el vocabulario de AGENTS.md §6 (el cambio ES un cambio de harness de test, no una feature).

2. **`chore(web): verify pnpm --filter web test exits 0 with 145/145 + turbo bdd preserved (R4 marker)`** — log de verificación: la salida de exit-0 de `pnpm --filter web test` capturada en el cuerpo del commit, más la salida de exit-0 de `pnpm turbo run bdd`. Opcional pero le da al cierre de slice-8 un rastro documental. Se puede plegar en el commit 1 si el revisor prefiere menos commits — pero separarlos hace que la observación GREEN sea distinta del cambio que causa el GREEN.

**Higiene de commits** (AGENTS.md §6):

- Sin `Co-Authored-By` / sin atribución de IA en ningún mensaje de commit.
- Asuntos ≤72 chars, imperativos, sin punto final.
- Vocabulario de tipos de §6: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
- Los cuerpos explican el POR QUÉ (`resolvePath` de next-intl 3.26.5 requiere objetos anidados; las 13 fallas eran todas de deriva de forma i18n + 2 fallas de aserción de id de fila), no el QUÉ (el diff ya muestra el qué).
- El cuerpo del commit 1 cita los IDs de requisito del spec (R1, R3) y la sección del brief de exploración que prueba el diagnóstico.
- El cuerpo del commit 2 cita los comandos de verificación corridos (marcadores R4, R5, R6).

---

## 5. Plan de ejecución de tests

| Escenario del spec | Comando de test | Resultado esperado |
|---------------|--------------|---------------|
| **G1.1** (state-coverage 25/25) | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS; sin `.skip`/`.todo` añadidos (AC6, AC11, AC14) |
| **G2.1** (los 13 que fallaban anteriormente se cierran) | igual que G1.1 + `grep` para los 13 nombres de test específicos | exit 0; los 13 nombres de escenario aparecen con marcadores `✓` |
| **G3.1** (los 12 que pasaban se quedan verdes) | igual que G1.1 | exit 0; 12 escenarios originalmente pasando siguen `✓` |
| **G4.1** (suite completa de apps/web) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; sin OOM (AC7, AC8, AC9) |
| **G5.1** (BDD no regresa) | `pnpm turbo run bdd` | exit 0; 43/43 escenarios siguen pasando (AC12) |
| **G6.1** (sin fuente tocada) | `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` | vacío (AC10, AC11) |

### Pasos de verificación manuales / no-CI

- `pnpm --filter web test --reporter=verbose apps/web/__tests__/components/transactions/state-coverage.test.tsx` para enumerar cada uno de los 25 escenarios y confirmar que no hay decoración `.skip` / `.todo`.
- `grep -cE '\.(skip\|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — DEBE ser igual al conteo en `develop@e0dc2eb` (sin nuevas decoraciones; AC14).
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR|invariant expected"` para confirmar que la firma de OOM + el invariante `useRouter()` están ausentes de stderr.
- `time pnpm --filter web test` para capturar el wall time (sin regresión esperada; debería ser ~10-30s).
- `git log --oneline develop..feat/fix-state-coverage-drift` para confirmar los 2 commits de unidad de trabajo (asuntos ≤72 chars, sin "Co-Authored-By", según AC15 + AC16).
- `git show feat/fix-state-coverage-drift -- apps/web/components apps/web/lib apps/web/app apps/api libs apps/web/messages` para confirmar que no hay modificaciones de archivos fuente (AC10, AC11).
- `pnpm lint:fixtures` para confirmar que el plugin de boundary sigue pasando (sin nueva regla añadida según spec §7.1; el contrato de objetos-anidados se enforce por el test mismo, no por una regla de lint).
- `pnpm turbo run lint typecheck` para confirmar que ESLint y TypeScript siguen pasando (sin código de producción fuente tocado, así que trivial).

---

## 6. Riesgos + mitigaciones (concretos)

| ID | Riesgo | Mitigación |
|----|------|------------|
| **R1** (propuesta §7) | Un test que pasa puede depender de un fallback literal con puntos — es decir, algún test podría estar pasando hoy precisamente porque `t("transactions.list.loading")` devuelve la clave literal, que entonces coincide con alguna aserción laxa en algún lado. | Tras R1 el árbol de `messages` está completamente anidado. Si algún test que pasa se rompe, la falla apunta a la aserción (no al resolver); el sub-agente de apply inspecciona la aserción rota y o bien la reescribe para coincidir con la copia en inglés resuelta, o bien la marca para seguimiento. Los 12 escenarios actualmente pasando están enumerados en §1.1 del brief de exploración (`TransactionsList > loading`, `TransactionsList > error`, `TransactionsList > success-non-empty` → row-id roto, `CreateTransactionForm > error`, `CreateTransactionForm > empty`, `EditTransactionForm > error`, `EditTransactionForm > success`, `EditTransactionForm > empty`, `CategoryManager > error`, `CategoryManager > empty`, `SessionList > success`); ninguno de ellos aserta sobre una clave con puntos literal (todos asertan sobre strings `common.*`, mensajes de error lanzados por mocks, o texto en inglés hard-codeado que no pasa por `t()`). Verificación: G1.1 captura cualquier regresión. |
| **R2** (propuesta §7) | Las aserciones de fila pueden volverse menos específicas — es decir, `cat-1` podría aparecer en múltiples nodos de texto si `cat-1` también es un `<option>` value, una entrada de `<datalist>`, o un target `aria-describedby`. | `cat-1` se usa como el `categoryId` en la transacción del fixture (línea 260). `<TransactionsRow>` renderiza `{tx.categoryId}` como un nodo de texto plano de `TableCell` en `TransactionsList.tsx:241`. `cat-1` no aparece en ningún otro `<option>` (el form usa `<option>expense</option>` / `<option>income</option>` como labels de kind, no como ids de categoría). `cat-1` es único por fila en el fixture de test. Verificación: G2.1 (los 13 se cierran, incluidos los 2 tests de fila). Según la resolución Q3 del spec, `cat-1` se eligió sobre `100.00` / `USD` / `expense` por exactamente esta razón. |
| **R3** (propuesta §7) | Las colisiones de múltiples `Loading` pueden persistir por un nodo de texto perdido (p. ej. un `aria-label` que contenga "loading" que se filtra a `getByText`). | Según §3.3 del brief de exploración, las fallas "multiple Loading" se deben al bug de forma i18n: cuando `t("loading")` devolvía la literal `transactions.list.loading` (porque el resolver hacía fallback a `joinPath(namespace, key)`), esa literal contenía la subcadena "Loading" y coincidía con la regex `/Loading/i` en múltiples lugares. Tras R1, `t("loading")` devuelve el string resuelto `"Loading..."` exactamente una vez. Ningún nodo de texto perdido añade una segunda coincidencia (verificado por el `apps/web/messages/en.json` de producción — solo `common.loading`, `auth.common.loading`, y `transactions.list.loading` (si alguno) portan la subcadena; todos resuelven a la misma hoja `"Loading…"`). Si algún síntoma "multiple Loading" persiste tras R1+R2, el sub-agente de apply re-investiga según paso §3.3 del brief de exploración. Verificación: G1.1 captura cualquier colisión restante. |

---

## 7. Fuera de alcance

Reiterado de la propuesta §2 + spec §10 + AGENTS.md §11. Lo siguiente está explícitamente NO tocado por este PR:

1. Código fuente de componentes (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager`, `SessionList`) — los componentes cumplen con el spec; el harness tenía la forma incorrecta.
2. Añadir un `<span data-testid="tx-id">` oculto o columna de id visible a `<TransactionsRow>` — el test aserta sobre contenido renderizado por la fila, no sobre un gancho DOM oculto (según R3, según resolución Q3).
3. Cambiar `apps/web/messages/en.json` o `apps/web/messages/es.json` — los mensajes de producción ya están correctamente anidados; solo el harness estaba mal.
4. Subir o bajar la versión de next-intl / use-intl — la versión se queda en 3.26.5.
5. Reestructurar `vi.mock("@/lib/transactions-api", …)` en `state-coverage.test.tsx:39-54` — el mock por archivo es sólido.
6. Añadir tests nuevos o decoraciones `.skip` / `.todo` / `.xfail` a ninguno de los 25 escenarios.
7. Añadir una nueva regla ESLint a `tools/eslint-plugin-boundary/` (p. ej. para la forma de objetos-anidados) — el plugin de boundary NO gana una nueva regla según spec §7.1; el contrato de objetos-anidados se enforce por el test mismo.
8. Exportar `messages` para reuso entre archivos de test — diferido según resolución Q2; el harness es local al archivo.
9. Redactar un ADR bajo `docs/architecture/decisions/` para el contrato de objetos-anidados — el comentario JSDoc en el harness es suficiente según resolución Q1.
10. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/` — el fix es solo de apps/web.
11. Cualquier cosa en AGENTS.md §11 (i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log, enforzamiento del gate de cobertura, migración de `gastos-personales/`, etc.).
12. Tocar `apps/web/__tests__/setup.ts` (el mock izado del PR #66 se queda como fuente única de verdad para `next/navigation`; AC12 del spec).
13. Tocar `apps/web/vitest.config.ts` (el workaround `pool: "forks"` de slice-7 queda sin cambios; AC13 del spec).
14. Amendar, rebasear o eliminar los commits `36386e1` (workaround del PR-7 de slice-7), `2e05fc5` (split de auth del PR-2 de slice-8), o cualquier commit de `fix-web-vitest-crash` (PR #66).
15. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
16. Un espejo en español de cualquier archivo bajo `openspec/changes/fix-state-coverage-drift/` (ningún `.md` de fuente de verdad se entrega en este cambio; por instrucción del orquestador + precedentes `fix-web-vitest-crash` + `fix-api-nestjs-di` — los specs/design/propuesta de carpeta de cambio son artefactos de coordinación, no docs de cara al usuario).

---

## 8. Preguntas abiertas para la fase de tasks

**Ninguna.** Las 3 preguntas diferidas de la propuesta están resueltas en el spec:

- Q1 (documentación del contrato de objetos-anidados) → resuelta: bloque de comentario JSDoc encima de la constante `messages` (NO nuevo ADR). Spec §11.
- Q2 (export de `messages` para reuso) → resuelta: local al archivo, NO export. Spec §11.
- Q3 (texto de aserción de fila) → resuelta: `cat-1` (la celda `categoryId`, más única por fila). Spec §11.

---

## 9. Criterios de validación para `sdd-verify`

`sdd-verify` comprobará tras el merge:

| # | Criterio | Condición de pasa |
|---|-----------|------------------|
| 1 | `pnpm --filter web test` sale con 0 | exit 0; `Tests 145 passed (145)` (AC7) |
| 2 | Sin firma de OOM en stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` sale con 1 (AC8) |
| 3 | El archivo state-coverage sale con 0 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0; 25 PASS / 0 FAIL (AC6) |
| 4 | Sin decoración `.skip` / `.todo` añadida | `grep -cE '\.(skip\|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` iguala el conteo en `develop@e0dc2eb` (AC14) |
| 5 | `messages` es objetos-anidados | `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve cero coincidencias (AC1) |
| 6 | 4 padres anidados presentes | `grep -nE '^  (transactions\|categories\|auth\|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve ≥4 coincidencias (AC2) |
| 7 | Hojas de string sin cambios | `grep -E 'empty: "No transactions yet\.\|empty: "No active sessions\.\|submit: "Create"\|submit: "Save"\|loading: "Loading\.\.\."\|name: "Food"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve las mismas coincidencias que en `develop@e0dc2eb` (AC3) |
| 8 | Aserciones de id de fila reemplazadas | `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve cero coincidencias (AC4) |
| 9 | Párrafo JSDoc presente | el archivo contiene prosa que explica el requisito de `resolvePath` de next-intl y el modo de falla de las claves plano-con-puntos (AC5) |
| 10 | El gate BDD sigue pasando | `pnpm turbo run bdd` sale con 0; 43/43 escenarios siguen pasando (AC9) |
| 11 | Ningún archivo fuente tocado | `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` devuelve vacío (AC10) |
| 12 | Solo `state-coverage.test.tsx` se edita bajo `apps/web/` | `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` devuelve exactamente un `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (AC11) |
| 13 | El mock de `setup.ts` del PR #66 se preserva | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` devuelve ≥1 coincidencia (AC12) |
| 14 | El workaround `pool: "forks"` se preserva | `grep -n 'pool: "forks"' apps/web/vitest.config.ts` devuelve 1 coincidencia (AC13) |
| 15 | Sin "Co-Authored-By" en ningún commit | `git log feat/fix-state-coverage-drift --pretty=format:"%B" \| grep -i "co-authored-by"` devuelve vacío (AC15) |
| 16 | Los asuntos de commit son Conventional + ≤72 chars | `git log -1 feat/fix-state-coverage-drift --pretty=format:"%s"` coincide con `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` y es ≤72 chars (AC16) |
| 17 | La rama base del PR es `develop` | el ref `base` del PR es `develop` (NO `main`) (AC17) |
| 18 | PR único, sin force-push | el merge es un único squash o merge commit; `git log develop..feat/fix-state-coverage-drift --merges` devuelve ≤1 commit; sin reescritura de historial (AC18) |
| 19 | La descripción del PR referencia al PR #66 | el cuerpo del PR DEBE contener una sección "Context" que nombre explícitamente a `fix-web-vitest-crash` como el predecesor inmediato (AC19) |
| 20 | Delta de LOC neto acotado | `git diff --shortstat develop..feat/fix-state-coverage-drift -- 'apps/web/__tests__/components/transactions/state-coverage.test.tsx'` muestra ≤+30 / ≤-20 líneas (coincide con la estimación de ~10 netas de la §4 de la propuesta) (AC20) |

---

## 10. Trazabilidad

### Requisito del spec → Sección del diseño

| Requisito del spec | Sección del diseño |
|------------------|------------------|
| R1 (reforma de mensajes a objetos-anidados) | §2 Archivo 1 Parte B (el hunk de diff) |
| R2 (las 11 fallas de forma i18n se cierran) | §2 Archivo 1 Parte B (implícito — el fix de mensajes cierra 11/13) + §3 paso 5 (observación GREEN) |
| R3 (2 aserciones de fila ajustadas a `cat-1`) | §2 Archivo 1 Parte C (los 2 diffs de aserción) |
| R4 (archivo state-coverage sale con 0, 25/25) | §3 paso 5 + §5 G1.1 + §9 fila 3 |
| R5 (suite completa de apps/web sale con 0, 145/145) | §3 paso 6 + §5 G4.1 + §9 fila 1 |
| R6 (gate BDD no regresa, 43/43) | §3 paso 7 + §5 G5.1 + §9 fila 10 |
| R7 (ningún componente fuente tocado) | §2 (solo Archivo 1 editado; Archivos 2/3/4 son verify-only) + §5 G6.1 + §9 filas 11-12 |
| R8 (JSDoc explica el contrato de objetos-anidados) | §2 Archivo 1 Parte A (el bloque JSDoc) + §9 fila 9 |
| R9 (descripción del PR referencia al PR #66) | §4 cuerpo del commit 1 / descripción del PR (operativo; cubierto por §9 fila 19) |

### Objetivo → Escenario del spec → Sección del diseño

| Objetivo | Escenario del spec | Sección del diseño |
|------|---------------|------------------|
| G1 (state-coverage 25/25) | G1.1 | §3 paso 5, §5 G1.1 |
| G2 (los 13 que fallaban anteriormente se cierran) | G2.1 | §2 Archivo 1 Partes B + C, §5 G2.1 |
| G3 (los 12 que pasaban anteriormente siguen verdes) | G3.1 | §1 G3, §5 G3.1 |
| G4 (suite completa de apps/web) | G4.1 | §3 paso 6, §5 G4.1 |
| G5 (BDD no regresa) | G5.1 | §3 paso 7, §5 G5.1 |
| G6 (ningún componente fuente tocado) | G6.1 | §1 G6, §2 (solo Archivo 1 editado), §5 G6.1 |

### Mitigación riesgo ↔ requisito

| Riesgo (propuesta §7) | Mitigado por |
|--------------------|---------------|
| R1 (un test que pasa puede depender de un fallback literal con puntos) | R1 + R2 + AC1 + AC2 + AC6 (no quedan claves plano-con-puntos; los 11 tests i18n se cierran) |
| R2 (las aserciones de fila se vuelven menos específicas) | R3 + AC4 + resolución Q3 (usar `cat-1`, el valor de fixture más único por fila) + comentario inline en el sitio de la aserción |
| R3 (las colisiones de múltiples `Loading` pueden persistir por un nodo de texto perdido) | R2 + AC6 + AC8 (tras anidar, la regex `/Loading/i` coincide con el único `<p>Loading...</p>` exactamente una vez; si alguna queda, el sub-agente de apply re-investiga según §3.3 del brief de exploración) |

---

## 11. Matriz de amenazas

> Según `sdd-design/SKILL.md` §2a: dirigida por aplicabilidad. Si el diseño cambia routing, comandos de shell, subprocesos, automatización de VCS/PR, clasificación de archivos ejecutables, o integración de procesos, cargar `references/threat-matrix.md` e incluir su matriz.

**N/A** — este diseño NO cambia routing, comandos de shell, subprocesos, automatización de VCS/PR, clasificación de archivos ejecutables, ni integración de procesos. El fix es una reforma de forma de mensajes del harness de test + 2 ediciones de aserción puramente del lado del harness dentro de un único archivo `.tsx`. No introduce nuevas invocaciones de shell, subprocesos, file watchers o forks de runtime. El workaround `pool: "forks"` de slice-7 es la frontera de integración de procesos existente, y se preserva sin cambios — este diseño NO lo modifica.

Clasificación de frontera: **configuración pura de harness de test**, sin cambio de comportamiento de producción, sin cambio de clasificación de archivos ejecutables, sin automatización de VCS más allá de un único PR de commit convencional (cubierto por AGENTS.md §6, no por la matriz de amenazas).

---

## 12. Migración / Rollout

**No se requiere migración.** Este es un fix de harness de test con cero cambio de comportamiento de producción. El rollout es el flujo estándar de PR único:

1. Cortar `feat/fix-state-coverage-drift` de `develop@e0dc2eb`.
2. Aterrizar los 2 commits atómicos según §4.
3. Abrir un único PR contra `develop`.
4. Tras revisión + CI verde, merge (squash o merge commit; `git log develop..feat/fix-state-coverage-drift --merges` ≤1 según AC18).
5. Sin feature flag, sin rollout en fases, sin migración de base de datos, sin shim de retrocompatibilidad.

**Plan de rollback** (espejo de la propuesta §8):

- **Todo el cambio**: `git revert <merge-sha>` en `develop`. La edición de `state-coverage.test.tsx` revierte a su línea base de 681 líneas plano-con-puntos. `setup.ts` y `vitest.config.ts` quedan sin cambios (no se necesita revert). Los 13 escenarios en `state-coverage.test.tsx` vuelven a su estado previamente fallido (aceptable porque los mismos tests ya estaban rotos en `develop@e0dc2eb` — reporte de verificación de slice-8 Gate 3 / observación F1 de la deuda de herencia de slice-7).
- **Rollback por paso**:
  - Commit 1 (la reforma de mensajes + ediciones de aserción) — `git revert <sha>`. Los tests fallan de nuevo como antes. El archivo de setup no se toca, así que no se necesita revert de config.
  - Commit 2 (marcador de verificación) — revert opcional; no acarrea cambio de código ejecutable.
- **NO se hará**: force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`, o amendar el commit `36386e1` (workaround de slice-7), `2e05fc5` (split de auth del PR-2 de slice-8), o cualquier commit de `fix-web-vitest-crash` (PR #66).

---

## 13. Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`, 59 LOC)
- **Spec**: `openspec/changes/fix-state-coverage-drift/spec.md` (Engram `#2374`, 446 LOC; G1-G6, R1-R9, 20 ACs)
- **Brief de exploración**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`, 431 LOC; reproducción smoking-gun en §1.1)
- **PR predecesor**: PR #66 (`fix-web-vitest-crash`) — izó `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts`; cerró la cascada de OOM de V8. **PRESERVADO sin cambios por este PR.**
- **Ruta de código smoking-gun**: `use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65` (`resolvePath` recorre los mensajes por segmento separado por puntos) y `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66` (`defaultGetMessageFallback` devuelve la ruta con puntos literal)
- **Referencia de producción (correctamente anidada, fuente de verdad)**: `apps/web/messages/en.json` (191 líneas; 4 padres top-level: `auth`, `transactions`, `categories`, `common`). La forma plano-con-puntos del harness es el único lugar del repo que usa la forma incorrecta.
- **Componentes afectados (NO modificados)**: `apps/web/components/transactions/TransactionsList.tsx:247-261` (`<TransactionsRow>` renderiza date/amount/categoryId/currencyCode/kind pero nunca `id`); `apps/web/components/transactions/CreateTransactionForm.tsx:166-250`; `apps/web/components/transactions/EditTransactionForm.tsx:179-266`; `apps/web/components/transactions/CategoryManager.tsx:95-118`; `apps/web/components/auth/SessionList.tsx:113-153`
- **Superficie de regresión (el archivo que se edita)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios a través de 5 bloques describe; constante `messages` en L73-188)
- **Mock de setup (preservado del PR #66)**: `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`)
- **Config de Vitest (preservado del PR-7 de slice-7)**: `apps/web/vitest.config.ts` líneas 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`, commit `36386e1`)
- **Convenciones del proyecto**: AGENTS.md §1 (identidad, stack), §2 (modelo de ramas — `main` inmutable, cortado de `develop`), §4 (TDD estricto — RED es el exit-1 existente, sin nuevo archivo de test), §5 (atomic commits), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — sin nueva regla de frontera), §8 (fuente única de verdad — contrato de objetos-anidados enforcado en el sitio canónico vía JSDoc), §9 (UI completa no scaffold — N/A, solo test), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (lista de fuera-de-alcance), §13 (espejo en español — N/A para design de carpeta de cambio por instrucción del orquestador + precedentes `fix-web-vitest-crash` + `fix-api-nestjs-di`)
- **Precedentes de formato**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (estructura de 14 secciones), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (igual)
- **Reporte de verificación de slice-8 (contexto del gate)**: Engram `#2278` (confirmó gate BDD VERDE; OOM era Gate 3 / solo unit-tests en `develop@d9fdfec`)

---

**Siguiente fase**: `tasks` (`sdd-tasks` descompondrá los 2 commits atómicos en sub-tareas ordenados RED-first con gates de checkpoint según AGENTS.md §4 + §5).
