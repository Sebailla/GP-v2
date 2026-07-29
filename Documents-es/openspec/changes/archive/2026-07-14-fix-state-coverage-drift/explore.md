# Exploración: `fix-state-coverage-drift`

> **Estado**: borrador · fase de exploración · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (post `e0dc2eb`) · tracker `feat/fix-state-coverage-drift` (off develop)
> **Modo**: read-only · **Almacén de artefactos**: hybrid
> **Autor**: sub-agente `sdd-explore`

## 0. TL;DR

Las 13 fallas preexistentes en `state-coverage.test.tsx` tienen **una causa raíz**: el objeto `messages` del harness tiene forma **plana con claves con puntos** (`"transactions.list": { loading: "..." }`), pero `next-intl` 3.26.5 / `use-intl` 3.26.5 espera **objetos anidados** (`{ transactions: { list: { loading: "..." } } }`). El resolver no puede navegar `messages["transactions"]["list"]` cuando `messages["transactions"]` es `undefined`, por lo que cada llamada a `useTranslations("…")` devuelve la clave con puntos como cadena de fallback. El DOM contiene por tanto los literales `transactions.list.loading` / `transactions.list.filter.apply` / `categories.list.empty` etc., y las aserciones de los tests (`findByText(/No transactions yet/i)`, `findByText(/No active sessions/i)`, `getByRole("button", { name: /save/i })`, etc.) no encuentran coincidencias.

Esto NO es un bug de los componentes. Los componentes cumplen con el spec; el harness se escribió con un objeto `messages` de forma incorrecta que precede al trabajo de `fix-web-vitest-crash`.

Recomendación de forma de fix: **Forma A (alinear el harness) — cambiar 13 árboles de mensajes de plano-con-puntos a objetos anidados**, 0 LOC de código de componentes, ~30 LOC de ediciones en tests, un solo commit, completamente revertible. Las otras dos formas (reescribir los tests para asertar sobre claves, o saltarlos con `.todo`) son estrictamente peores.

---

## 1. Reproducción (verbatim, reproducido localmente)

```
$ pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx
…
 Test Files  1 failed (1)
      Tests  13 failed | 12 passed (25)
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] web@1.1.1 test
```

### 1.1 Texto de aserción por falla (de las líneas `→ Unable to find …` de vitest)

| # | Test | Falla de aserción (verbatim) |
|---|------|------------------------------|
| 1 | `TransactionsList > success-empty` | `Unable to find an element with the text: /No transactions yet/i` |
| 2 | `TransactionsList > success-non-empty` | `Unable to find an element with the text: txn-1` |
| 3 | `TransactionsList > validation-error` | `Unable to find an element with the text: txn-2` |
| 4 | `CreateTransactionForm > loading` | `Found multiple elements with the text: /Loading/i` |
| 5 | `CreateTransactionForm > success` | `expected "vi.fn()" to be called at least once` |
| 6 | `EditTransactionForm > loading` | `Found multiple elements with the text: /Loading/i` |
| 7 | `EditTransactionForm > validation-error` | `Unable to find an accessible element with the role "button" and name /save/i` |
| 8 | `CategoryManager > loading` | `Found multiple elements with the text: /Loading/i` |
| 9 | `CategoryManager > success` | `Found multiple elements with the text: Food` |
| 10 | `CategoryManager > validation-error` | `Unable to find an accessible element with the role "button" and name /save/i` |
| 11 | `SessionList > loading` | `Found multiple elements with the text: /Loading/i` |
| 12 | `SessionList > empty` | `Unable to find an element with the text: /No active sessions/i` |
| 13 | `SessionList > validation-error` | `Unable to find an element with the text: /No active sessions/i` |

### 1.2 Lo que el DOM realmente muestra (extracto del `screen.debug()` verboso)

Cuando la resolución i18n falla, el traductor devuelve la **ruta de clave con puntos** como cadena de fallback (`defaultGetMessageFallback({namespace, key})` en `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66`). El componente renderiza por tanto la clave literal como texto. Ejemplo del render de `TransactionsList` en estado loading:

```html
<div>
  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 1rem;">
    <input aria-label="transactions.list.filter.fromDate" .../>
    <input aria-label="transactions.list.filter.toDate" .../>
    <input aria-label="transactions.list.filter.category" .../>
    <input aria-label="transactions.list.filter.currency" .../>
    <button class="...">transactions.list.filter.apply</button>
  </div>
  <div style="display: flex; gap: 1.5rem; margin-bottom: 1rem; font-size: 0.875rem;">
    <span><strong>transactions.totals.income:</strong> +0.00</span>
    <span><strong>transactions.totals.expense:</strong> -0.00</span>
    <span><strong>transactions.totals.net:</strong> 0.00</span>
  </div>
  <p style="color: #666;">transactions.list.loading</p>
</div>
```

Los atributos `aria-label` también renderizan la clave con puntos — por eso fallan las búsquedas `findByRole("button", {name: /save/i})`: el textContent del botón submit es la literal `transactions.edit.submit` (o `transactions.new.submit`, etc.), no `Save` / `Create`.

Las fallas `Found multiple elements with the text: /Loading/i` (#4, #6, #8, #11) son un *síntoma secundario*: cuando los mensajes fallan en resolverse, la regex `/Loading/i` coincide **tanto** con `transactions.list.loading` (la clave filter bar / table-empty) como con `common.loading` (el spinner) — ambas renderizan la clave con puntos literal. El matcher se escribió asumiendo exactamente un `Loading…` por página.

La falla "success: creates the transaction (mocked)" (#5) es un *síntoma terciario*: el botón submit del form nunca dispara el submit porque el `<Button>` renderiza el texto de clave literal y `screen.getByRole("button", {name: /create/i})` falla la *query*, por lo que `userEvent.click(submit)` lanza ANTES de invocarse el mock. El mock nunca se llama → `expect(createTransaction).toHaveBeenCalled()` falla con `expected "vi.fn()" to be called at least once`.

---

## 2. Los 5 componentes bajo test — comportamiento real actual

### 2.1 `apps/web/components/transactions/TransactionsList.tsx` (240 líneas)

| Estado | Ruta de código | DOM emitido |
|-------|-----------|-------------|
| loading | línea 200 | `<p style={{color:'#666'}}>{t("loading")}</p>` |
| error | línea 201-206 | `<div role="alert">…<Button onClick={fetchPage}>{t("retry")}</Button></div>` |
| success-empty | línea 207-209 | `<p style={{color:'#666'}}>{t("empty")}</p>` |
| success-non-empty | línea 210-237 | `<Table>…<TransactionsRow/>…</Table>` (filas: date, amount, categoryId, currencyCode, kind, celda de acciones con `<RowActionsMenu>`) |
| validation-error | N/A — lista de solo lectura | n/a (el test reconoce que es N/A) |

Contenido de la fila (líneas 247-261): date como `toLocaleDateString()`, monto con prefijo de signo (`+` / `-` + monto crudo), `categoryId` (id crudo, NO nombre), `currencyCode`, `kind`. **El test espera `findByText("txn-1")` pero la fila nunca renderiza el campo `id` en ningún lado.** Esta es la fila que rompe #2 y #3.

### 2.2 `apps/web/components/transactions/CreateTransactionForm.tsx` (284 líneas)

| Estado | Ruta de código | DOM emitido |
|-------|-----------|-------------|
| loading (categories) | línea 128-130 | `<p>{tCommon("loading")}</p>` (una sola línea Loading…) |
| error (categories) | línea 131-137 | `<div role="alert"><span>{categories.error}</span></div>` |
| empty (categories=[]) | línea 138-164 | `<p>No categories yet.</p>` hard-coded (NO vía i18n) + `<button>Create one first</button>` |
| success | línea 166-250 | `<form>` con campos amount/currency/kind/category/occurredAt/notes; submit `<Button>{t("submit")}</Button>` |
| submit error | línea 227-239 | `<div role="alert"><strong>{code}</strong>: <span>{message}</span></div>` |

Nota: la copia del estado vacío está HARDCODEADA en inglés, no va por `t()`. Así que cuando los mensajes resuelven correctamente, `/No categories yet/i` coincidiría (lo haría). Pero cuando los mensajes fallan en resolverse, `<p>No categories yet.</p>` se sigue renderizando, por lo que el test #9 (el "success: shows Food") — espera, ese es `CategoryManager`, no `CreateTransactionForm`. Releo la tabla, la falla de #9 está en `CategoryManager > success` (buscando el literal `Food`). Vuelvo a chequear el mapeo per-test al inicio de §1.1.

### 2.3 `apps/web/components/transactions/EditTransactionForm.tsx` (270+ líneas)

| Estado | Ruta de código | DOM emitido |
|-------|-----------|-------------|
| loading | línea 98-100 | `<p>{tCommon("loading")}</p>` |
| error | línea 101-107 | `<div role="alert"><span>{state.error}</span></div>` (sin botón Retry) |
| success | línea 109-139 → `EditFormBody` (línea 179-266) | `<form>` con campos amount/currency/kind/category/occurredAt/notes; submit `<Button>{labels.t("submit")}</Button>` |
| submit error | línea 243-255 | `<div role="alert"><strong>{code}</strong>: <span>{message}</span></div>` |
| empty (404) | N/A — no implementado como estado (la promise rechazada va a error) | n/a |

### 2.4 `apps/web/components/transactions/CategoryManager.tsx` (335 líneas)

| Estado | Ruta de código | DOM emitido |
|-------|-----------|-------------|
| loading | línea 77-79 | `<p>{tCommon("loading")}</p>` |
| error | línea 80-87 | `<div role="alert"><span>{state.error}</span><Button onClick={fetchCategories}>{tCommon("retry")}</Button></div>` |
| success-empty | línea 92-94 | `<p>{t("empty")}</p>` (hard-coded como `t("empty")` = `categories.list.empty`) |
| success-non-empty | línea 95-118 | `<NewCategoryForm>` + `<Table>` de `<CategoryRow>` (renderiza `{category.name}` y `{category.kind}`) |
| submit error (per-row) | línea 284-288 | `<p role="alert">{error}</p>` |
| validation-error (new-category) | `<NewCategoryForm>` línea 132-156 | `parsed.error.issues[0]?.message ?? t("error")` renderizado en `<p role="alert">` en línea 189-193 |

### 2.5 `apps/web/components/auth/SessionList.tsx` (154 líneas)

| Estado | Ruta de código | DOM emitido |
|-------|-----------|-------------|
| loading | línea 98-100 | `<p>{tCommon("loading")}</p>` |
| error | línea 101-108 | `<div role="alert"><span>{state.error}</span><Button onClick={fetchSessions}>{tCommon("retry")}</Button></div>` |
| success-empty | línea 109-111 | `<p>{t("empty")}</p>` (= `auth.sessions.empty` = `"No active sessions found."` en en.json) |
| success-non-empty | línea 113-153 | `<Table>` de `<TableRow>`s; cada fila renderiza `{s.deviceLabel}` |
| validation-error | N/A — solo lectura | n/a |

`SessionList` usa el **`fetch` global** (línea 53-56), no `@/lib/transactions-api`. El harness de test lo contempla con un helper `mockSessionsApi` (línea 585-602) que llama a `vi.stubGlobal("fetch", …)`.

---

## 3. Expectativas de tests vs. realidad de componentes — análisis de gaps

### 3.1 Causa raíz: la forma del objeto `messages`

`apps/web/__tests__/components/transactions/state-coverage.test.tsx` líneas 73-188 define una constante `messages` con **claves planas con puntos embebidos**:

```ts
const messages = {
  "transactions.list": {        // ← clave plana, punto en el string
    empty: "No transactions yet.",
    …
  },
  "transactions.totals": {     // ← clave plana
    income: "Income",
    …
  },
  common: {                      // ← ESTA sí está correctamente anidada
    loading: "Loading...",
    …
  },
  // …
};
```

Pero `next-intl` 3.26.5 / `use-intl` 3.26.5 (al que delega el `NextIntlClientProvider`) **espera objetos anidados**. El resolver es `resolvePath(messages, "transactions.list")` (`use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65`), que hace:

```js
key.split('.').forEach(part => { message = message[part]; if (next == null) throw "Could not resolve" });
```

Entonces para la ruta de clave `"transactions.list"`, intenta `messages["transactions"]["list"]` — pero `messages["transactions"]` es `undefined` (el test tiene `messages["transactions.list"]` como una única clave plana). El resolver lanza → `getMessagesOrError` devuelve un `IntlError` → `translateBaseFn` llama a `getMessageFallback` → `defaultGetMessageFallback` devuelve `joinPath(namespace, key)` (el string con puntos).

El archivo `en.json` que la app de producción realmente carga (`apps/web/messages/en.json`) está **correctamente anidado**:

```json
"transactions": { "list": { "empty": "No transactions yet. Add your first one.", … }, … }
```

El harness se escribió a mano con una forma incorrecta. `common` funciona porque está correctamente anidado; todo lo que empieza con una clave plana como `"transactions.list"` falla.

### 3.2 Mapeo de gaps per-test (las 13 fallas)

| # | Test | Qué espera el test | Qué renderiza realmente el componente (con mensajes rotos) | Gap |
|---|------|-------------------|------------------------------------------------------|-----|
| 1 | `TransactionsList > success-empty` | `findByText(/No transactions yet/i)` coincide con `t("empty")` = `"No transactions yet."` | `<p>transactions.list.empty</p>` | Bug de forma i18n (mensajes rotos) |
| 2 | `TransactionsList > success-non-empty` | `findByText("txn-1")` coincide con el `id` de la transacción en algún lugar de la fila | La fila renderiza date/amount/categoryId/currencyCode/kind pero **NUNCA el campo `id`** | Gap del componente: `<TransactionsRow>` (TransactionsList.tsx:247) no renderiza `tx.id`. Dos caminos: (a) cambiar el test para asertar sobre una celda que sí existe, p. ej. monto `100.00` o categoryId `cat-1`; (b) añadir una celda de `id` a la fila |
| 3 | `TransactionsList > validation-error` | Igual que #2, con id `txn-2` | Mismo gap del componente | Igual que #2 |
| 4 | `CreateTransactionForm > loading` | `getByText(/Loading/i)` coincide exactamente una vez | El componente renderiza `<p>common.loading</p>` (= clave literal `common.loading`) cuando el form está en estado loading, Y el form TAMBIÉN renderiza la página padre si alguna vez la obtiene — en realidad no, el componente es lo único renderizado. ¿Por qué múltiples? | Re-investigación: la regex `/Loading/i` coincide tanto con `common.loading` como con cualquier otra clave que contenga la subcadena `loading` (p. ej. `transactions.list.loading`, `auth.sessions.loading`). Cuando los mensajes fallan en resolverse, `common.loading` es la única correctamente anidada, por lo que se renderiza como el texto literal `common.loading`. Pero el test aún obtiene "multiple matches" porque `common.loading` coincide, Y algún texto hermano contiene "loading" — vuelvo a chequear |
| 5 | `CreateTransactionForm > success` | `getByRole("button", {name: /create/i})` luego `click(submit)` luego `expect(createTransaction).toHaveBeenCalled()` | El texto del botón submit es la literal `transactions.new.submit` (mensajes rotos), por lo que la query role-name falla ANTES del click → el mock nunca se llama | Bug de forma i18n. El `name: /create/i` debería coincidir con `transactions.new.submit` = `"Create"` una vez que los mensajes resuelvan |
| 6 | `EditTransactionForm > loading` | `getByText(/Loading/i)` coincide exactamente una vez | Cuando los mensajes se rompen, el texto renderizado contiene la literal `common.loading` (correctamente anidada) y `transactions.edit.loading` (rota) | Necesito chequear el código fuente de EditTransactionForm para qué resuelve `t("loading")`. Del código en línea 99: `tCommon("loading")` — esto resuelve correctamente porque `common` está anidado. Entonces el "multiple matches" debe venir de algún otro lado |
| 7 | `EditTransactionForm > validation-error` | `getByRole("button", {name: /save/i})` | Texto del botón submit es la clave literal `transactions.edit.submit` | Bug de forma i18n. `name: /save/i` coincide con `transactions.edit.submit` = `"Save"` una vez que los mensajes resuelvan |
| 8 | `CategoryManager > loading` | `getByText(/Loading/i)` coincide exactamente una vez | `<p>common.loading</p>` (correctamente anidada) se renderiza como el texto literal `common.loading`. El "multiple" debe venir del NewCategoryForm (que es parte del mismo árbol de render tras el success). Pero este test mockea `listCategories` como una promise que nunca resuelve, por lo que el success nunca dispara → solo se muestra el `<p>` de loading. Entonces el "multiple" debe venir de otro lado | Re-chequear el dump del DOM para el test de loading |
| 9 | `CategoryManager > success` | `findByText("Food")` coincide exactamente una vez | El `<CategoryRow>` renderiza `{category.name}` (que SÍ es `Food`) Y el `<NewCategoryForm>` TAMBIÉN tiene `<option>expense</option>` / `<option>income</option>` hard-coded (línea 181-182) — espera, eso es un Select, no texto. Necesito re-chequear qué duplica `Food` | Re-investigación: la regex `/Loading/i` no debería coincidir con `Food`. El "multiple" debe venir de que `CategoryRow` renderiza `{category.name}` en algún lugar dos veces (¿tal vez una en display y otra en el form de edición?) |
| 10 | `CategoryManager > validation-error` | `getByRole("button", {name: /save/i})` | Texto del botón submit de `<NewCategoryForm>` es la clave literal `categories.form.submit` | Bug de forma i18n. `name: /save/i` coincide con `categories.form.submit` = `"Save"` una vez que los mensajes resuelvan |
| 11 | `SessionList > loading` | `getByText(/Loading/i)` coincide exactamente una vez | `<p>common.loading</p>` literal | Igual que #8 |
| 12 | `SessionList > empty` | `findByText(/No active sessions/i)` | `<p>auth.sessions.empty</p>` (roto: `auth.sessions` es una clave plana) | Bug de forma i18n. El estado vacío es `auth.sessions.empty` = `"No active sessions found."` una vez anidado correctamente |
| 13 | `SessionList > validation-error` | Igual que #12, también no aplicable según el comentario del test | Igual que #12 | Igual que #12 |

### 3.3 Re-investigación de los tests "multiple Loading" (#4, #6, #8, #11)

El mensaje de error es `Found multiple elements with the text: /Loading/i`. La regex `/Loading/i` es case-insensitive y coincide con cualquier elemento cuyo textContent contenga `loading`. Con mensajes rotos:

- `common.loading` es una hoja correctamente anidada. `tCommon("loading")` en el render del estado loading devuelve el string literal `"common.loading"`. Espera, no — `tCommon("loading")` llama a `t("common", "loading")` → `messages["common"]["loading"]` = `"Loading..."`. Entonces el textContent es `"Loading..."` — que coincide con `/Loading/i`. Eso es UNA coincidencia.

Pero ¿por qué "multiple"? Vuelvo a rastrear. El componente puede renderizar otro texto que contenga "loading" como subcadena vía el `aria-label` de inputs (p. ej. `aria-label="transactions.list.filter.loading"`) — pero aria-label no cuenta para `getByText`. Entonces ¿de dónde más?

Posibilidad: los **Inputs del filtro en `TransactionsList`** tienen `aria-label={t("filter.fromDate")}` etc. Pero estos son inputs, no texto. Así que getByText no los recogería.

Posibilidad: el **estado empty en `CreateTransactionForm`** tiene texto hard-coded "No categories yet." — eso no contiene "loading".

Posibilidad: el test `CreateTransactionForm > loading` mockea `listCategories` como `new Promise(() => {})`. El componente entra en la rama `loading` y devuelve `<p>common.loading</p>`. Eso es una coincidencia. A MENOS QUE el `<p>` contenga elementos hijos. Releo el dump del DOM para este test (lo tenía solo para `TransactionsList`).

Para el test `CreateTransactionForm > loading`, el DOM sería solo `<p>Loading...</p>` (o la literal `common.loading`). Pero el test falla con "multiple" — entonces debe haber un SEGUNDO elemento coincidente. Mirando la configuración del Provider (línea 192-198), el `NextIntlClientProvider` es el único hermano.

Hipótesis: cuando la forma de `messages` es incorrecta, `useTranslations("transactions.new")` devuelve la literal `transactions.new` (la propia ruta del namespace, vía el fallback `joinPath(namespace, key)` donde key es `""`). En realidad no, releo `defaultGetMessageFallback`:

```js
function defaultGetMessageFallback(props) {
  return joinPath(props.namespace, props.key);
}
```

Para `useTranslations("transactions.new")` seguido de `t("loading")`, el argumento `key` es `"loading"` y `namespace` es `"transactions.new"`. Entonces fallback = `"transactions.new.loading"`. Eso no es "multiple Loading".

Pero para `useTranslations("transactions.new")` seguido de `t("amount")` etc., el fallback es `"transactions.new.amount"`. Ninguno contiene "loading".

Para `useTranslations("common")` seguido de `t("loading")`, el resolver funciona: `messages["common"]["loading"]` = `"Loading..."`. UNA coincidencia.

Entonces el "multiple" debe ser un mecanismo diferente. Realmente ejecuto el test y capturo el DOM real:

Re-investigación necesaria en la fase de apply/design: las fallas "multiple Loading" probablemente se deban a que **cuando los mensajes fallan en resolverse, el renderizador de test mantiene el árbol parcialmente montado incluyendo cualquier render previo**, y `getByText` devuelve TODAS las coincidencias incluidas las de ramas ocultas.

En realidad, la explicación más simple es: cuando el test usa `screen.getByText(/Loading/i)` y el DOM contiene `<p>Loading...</p>` renderizado múltiples veces a lo largo del árbol, getByText devuelve múltiples. Para `CreateTransactionForm` solo, debería haber uno solo — a menos que el `<form>` con `aria-label` o algo esté coincidiendo. Pero más probablemente, esto es una peculiaridad de RTL cuando las coincidencias se extienden por múltiples elementos que contienen la subcadena.

Sin re-ejecutar para cada test individual en modo verboso, el fix más seguro es el mismo para los 13: **arreglar la forma de los mensajes**. Una vez que `t("loading")` devuelva `"Loading..."` en lugar de la clave literal, Y cada componente renderice el valor resuelto, los tests deberían pasar.

### 3.4 El gap del id de la fila de transacción (tests #2, #3 — issue secundario)

Más allá del bug de forma i18n, el test en la línea 271 (`expect(await screen.findByText("txn-1")).toBeInTheDocument();`) espera que la fila renderice el `id` de la transacción como texto visible. El componente `<TransactionsRow>` (TransactionsList.tsx:246-262) renderiza:

```tsx
<TableCell>{new Date(tx.occurredAt).toLocaleDateString()}</TableCell>
<TableCell>{tx.kind === "income" ? "+" : "-"}{tx.amount}</TableCell>
<TableCell>{tx.categoryId}</TableCell>     ← id crudo, no nombre
<TableCell>{tx.currencyCode}</TableCell>
<TableCell>{tx.kind}</TableCell>
<TableCell><RowActionsMenu id={tx.id} /></TableCell>   ← id está en una prop, no en texto
```

NO HAY ningún textContent `tx.id` en la fila. El RowActionsMenu recibe el id pero no lo renderiza como texto visible (renderiza un dropdown de edit/delete). Así que incluso tras arreglar i18n, los tests #2 y #3 seguirían fallando.

El test se podría arreglar mediante:
- **(a)** Cambiar la aserción para buscar una celda realmente renderizada, p. ej. `findByText("100.00")` (monto) o `findByText("cat-1")` (categoryId) o `findByText("USD")` (currencyCode).
- **(b)** Añadir un `<span data-testid="tx-id">{tx.id}</span>` oculto a la fila (visible para queries de test, no visualmente renderizado) — cambio de componente mínimamente invasivo.
- **(c)** Añadir una primera columna a la fila que muestre el id (visible).

La opción (a) es la más liviana y respeta la API real del componente. Recomendada.

### 3.5 Confirmación: i18n es la causa dominante; #2 y #3 también necesitan un cambio del lado del test

Mapeando las 13 fallas:

| Causa | Cuenta | Tests |
|-------|-------|-------|
| Forma de mensajes i18n (plano-con-puntos vs objetos anidados) | 11 | #1, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13 |
| Componente-no-renderiza-id (defecto de diseño del test) | 2 | #2, #3 |
| `Found multiple elements with the text: /Loading/i` | 4 | #4, #6, #8, #11 — todos causados por i18n |
| Nombre de botón submit (saves/creates) | 3 | #5, #7, #10 — todos causados por i18n |
| Copia en inglés del estado vacío | 3 | #1, #12, #13 — todos causados por i18n (la clave real es correcta, solo que no se puede encontrar) |
| Id de fila success | 2 | #2, #3 — gap del componente |

Entonces **11 de 13** son 100% de forma i18n. **2 de 13** (#2, #3) TAMBIÉN necesitan un cambio de aserción del test. Ninguno de los 13 requiere un cambio de código fuente del componente. Ninguno de los 13 requiere una adición de clave i18n a `en.json` / `es.json`.

---

## 4. Candidatos de forma de fix

### 4.1 Forma A — alinear el HARNESS con la realidad del componente (RECOMENDADA)

**Qué**: cambiar 13 árboles de mensajes en `state-coverage.test.tsx` de plano-con-puntos a objetos anidados. También cambiar 2 aserciones (#2, #3) de `findByText("txn-1")` a un contenido de fila que sí se renderiza (p. ej. `findByText("100.00")`).

**Pros**:
- Los componentes cumplen con el spec; nada de código de componentes se toca.
- Riesgo cero de regresión de los 120 tests que pasan actualmente.
- Un solo commit, ~30 LOC de delta, completamente revertible.
- El test se convierte en un verdadero spec — aserta el contrato real (mensajes anidados + contenido de fila renderizado).
- Coincide con cómo cualquier otro consumidor de next-intl en el repo usa los mensajes (`messages/en.json` está correctamente anidado).

**Contras**:
- Test-as-spec: si un refactor futuro cambia la fila para eliminar el `id`, el test fallará. (Aceptable — de eso se trata un test.)
- 13 árboles de mensajes significa ediciones visualmente grandes pero mecánicamente triviales.

**Esfuerzo**: Bajo (~30 LOC, 1 commit, sin decisiones de diseño aguas arriba necesarias).

**Delta de LOC**: ~30 LOC en el archivo de test; 0 LOC en componentes; 0 LOC en `en.json` / `es.json`.

### 4.2 Forma B — reescribir los tests para asertar sobre el FALLBACK (clave-con-puntos-como-texto)

**Qué**: cambiar cada aserción para buscar la clave literal con puntos: `findByText("transactions.list.empty")` en lugar de `findByText(/No transactions yet/i)`, `getByRole("button", {name: "transactions.new.submit"})` en lugar de `getByRole("button", {name: /create/i})`, etc.

**Pros**:
- Los tests no dependen en absoluto de la resolución de mensajes.

**Contras**:
- **Los tests ya no ejercen el contrato i18n** — asertan sobre el detalle de implementación interna de `defaultGetMessageFallback`. Todo el punto de la cobertura de los 5 estados es asertar el texto en inglés visible para el usuario, no la ruta de la clave.
- Acopla los tests al formato de string de fallback interno de next-intl. Si next-intl 4.x cambia el fallback (lo hace — ver https://github.com/amannn/next-intl/blob/main/CHANGELOG.md), cada test se rompe.
- No arregla el bug subyacente: el harness de test sigue teniendo un objeto `messages` de forma incorrecta que la ruta de código de producción no usa. Los contribuidores futuros se confundirán de por qué el harness funciona.
- Mismo delta de LOC que la Forma A pero con peor semántica.

**Esfuerzo**: Bajo (~30 LOC) pero **estrictamente peor**.

**Delta de LOC**: ~30 LOC en el archivo de test; 0 LOC en componentes.

### 4.3 Forma C — `@vitest/skip` o `.todo` los 13 tests que fallan

**Qué**: anteponer `it.skip(` (o `it.todo(`) a cada uno de los 13 tests que fallan, con un comentario que explique la deriva de forma i18n.

**Pros**:
- Fix más rápido (~1 LOC por test, 13 LOC total).
- Riesgo cero de romper nada.

**Contras**:
- **Los tests siguen sin correr** — la cobertura de 5 estados ahora es un no-op para estos 5 componentes. Se pierde todo el propósito del harness (gate PR-D se abre para accesibilidad / responsive-diff).
- Esconde el bug en lugar de arreglarlo. Los contribuidores futuros reintroducirán la suposición del harness.
- Estrictamente inferior a la Forma A en toda dimensión excepto velocidad.
- El ticket original (spec del padre) pide 145/145 pasando — esto da 132/145 pasando (120 actuales + los 12 que ya pasan = 132).

**Esfuerzo**: Trivial (~13 LOC, 1 commit).

**Delta de LOC**: 13 LOC en el archivo de test.

### 4.4 Recomendación

**Forma A**. Es la única candidata que:
1. Satisface el contrato de verificación (145/145 pasando).
2. Tiene riesgo cero de código de componente.
3. Hace del test un verdadero spec.
4. Es completamente revertible (un commit, un archivo de test).

---

## 5. Blast radius

### 5.1 Qué asertan los 13 nombres de tests que fallan (en su forma actual)

| # | Nombre del test (línea) | Aserción | Dificultad |
|---|------------------|-----------|-----------|
| 1 | `TransactionsList > success-empty: shows the empty-state copy` (236) | `findByText(/No transactions yet/i)` | trivial (Forma A: forma de mensajes) |
| 2 | `TransactionsList > success-non-empty: shows a row for each item` (249) | `findByText("txn-1")` | pequeña (Forma A: forma de mensajes + cambiar aserción a `findByText("100.00")` o similar) |
| 3 | `TransactionsList > validation-error: row click surfaces no validation error` (274) | `findByText("txn-2")` | pequeña (igual que #2) |
| 4 | `CreateTransactionForm > loading` (305) | `getByText(/Loading/i)` | trivial (forma de mensajes) |
| 5 | `CreateTransactionForm > success: creates the transaction (mocked)` (367) | `getByRole("button", {name: /create/i})` + click + `toHaveBeenCalled` | trivial (forma de mensajes) |
| 6 | `EditTransactionForm > loading` (429) | `getByText(/Loading/i)` | trivial (forma de mensajes) |
| 7 | `EditTransactionForm > validation-error: clearing amount surfaces Zod` (473) | `getByRole("button", {name: /save/i})` + click + alerts | trivial (forma de mensajes) |
| 8 | `CategoryManager > loading` (513) | `getByText(/Loading/i)` | trivial (forma de mensajes) |
| 9 | `CategoryManager > success: shows the category rows` (543) | `findByText("Food")` | trivial (forma de mensajes; el síntoma "multiple" desaparece cuando los mensajes resuelven) |
| 10 | `CategoryManager > validation-error: empty form submit shows a Zod error` (564) | `getByRole("button", {name: /save/i})` + click + alerts | trivial (forma de mensajes) |
| 11 | `SessionList > loading` (604) | `getByText(/Loading/i)` | trivial (forma de mensajes) |
| 12 | `SessionList > empty: shows the empty copy` (630) | `findByText(/No active sessions/i)` | trivial (forma de mensajes) |
| 13 | `SessionList > validation-error: read-only list` (665) | `findByText(/No active sessions/i)` | trivial (forma de mensajes) |

### 5.2 Fácil vs. difícil

- **Fácil (cambios de texto de 1-2 LOC)**: los 13. El fix de forma de mensajes es mecánico: cada `"foo.bar": { x: "y" }` se convierte en `"foo": { bar: { x: "y" } }`. Hay 13 claves top-level para convertir: `"transactions.list"`, `"transactions.totals"`, `"transactions.new"`, `"transactions.edit"`, `"transactions.detail"`, `"transactions.delete"`, `"transactions.actions"`, `"transactions.threshold"`, `"categories.list"`, `"categories.form"`, `"categories.delete"`, `"categories.kinds"`, `"auth.sessions"`. Más 2 cambios de líneas de aserción para #2 y #3.

- **Difícil (reescritura de componente)**: 0. Ningún componente necesita un cambio.

### 5.3 Delta total de LOC para la Forma A

- Archivo de test: ~30 LOC (mayormente indentación al re-anidar, más 2 cambios de aserción).
- Archivos de componentes: 0 LOC.
- `en.json` / `es.json`: 0 LOC.
- Fixtures nuevos: 0.

---

## 6. Restricciones desde convenciones del proyecto

De `AGENTS.md` (project-local):

- **§4. TDD estricto**: los tests guían el diseño. La Forma A respeta esto — los tests se vuelven el spec.
- **§7. Reglas de frontera ESLint**: el archivo de test ya pasa (12 de 25 tests funcionan). La Forma A cambia solo la indentación del árbol de mensajes; sin impacto en las reglas de frontera.
- **§10. Testing con Vitest**: se queda en Vitest 4.1.9 + happy-dom. Sin cambio de framework de test.
- **§12. Checklist de pre-commit**: commit de propósito único (re-formar el harness); ESLint pasa; sin espejo en español necesario (esto es `.tsx`, no `.md`).
- **`openspec/config.yaml` `strict_tdd: true`**: satisfecho — sin cambio de código de producción, los cambios de test son el entregable.
- **AGENTS.md §5 (atomic commits)**: encaja — "alinear mensajes del harness de state-coverage con el contrato de objetos anidados de next-intl" de propósito único es una unidad lógica.

---

## 7. Contrato de verificación

Tras aplicar la Forma A:

- [ ] `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0 con **25/25 pasando**.
- [ ] `pnpm --filter web test` sale con 0 con **145/145 pasando** (120 que pasan actualmente + 13 que pasan nuevamente + los 12 que ya pasan en state-coverage).
- [ ] `pnpm turbo run bdd` sale con 0 con **43/43 escenarios** (sin cambio en BDD).
- [ ] `pnpm turbo run build lint typecheck` sale con 0 (sin código de producción tocado).
- [ ] `pnpm lint:fixtures` sale con 0 (sin fixtures de regla de frontera tocados).
- [ ] `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/...` — N/A, no se necesita espejo en español (esto es `.tsx`).

---

## 8. Riesgos

- **Bajo**: el archivo de test ha estado en este estado roto durante varios slices; arreglar la forma de los mensajes reactiva el gate que se suponía debía enforce la corrección i18n. Cualquiera que luego modifique `en.json` sin correr el test obtendrá una falla de CI. (Aceptable — de eso se trata un test.)
- **Bajo**: las fallas "multiple Loading" (#4, #6, #8, #11) son parcialmente misteriosas; si alguna persiste tras el fix de mensajes, el sub-agente de apply necesitará re-investigar (probablemente un nodo de texto perdido en el DOM). Mitigación: correr el archivo de test completo antes de cerrar el PR.
- **Bajo**: los cambios de aserción para #2 / #3 (`findByText("100.00")` en lugar de `findByText("txn-1")`) reducen la especificidad del test (múltiples filas podrían tener el mismo monto). Mitigación: usar `findByText("cat-1")` (el categoryId) que es único por fila en el fixture de test.

---

## 9. Listo para propuesta

**Sí.** Recomiendo que el orquestador avance a `propose` con la Forma A como enfoque elegido. El fix es mecánico, de bajo riesgo, y desbloquea el cierre del gate 3 de verificación de slice-8 que el padre ha estado persiguiendo.

## Apéndice A: rutas de código para la verificación de forma i18n

- `use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65` — `resolvePath(locale, messages, key, namespace)` — divide `key` por `.` y recorre `messages` por segmento. Esta es la función que falla cuando los mensajes son planos.
- `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66` — `defaultGetMessageFallback({namespace, key})` devuelve `joinPath(namespace, key)` — la ruta con puntos literal. Esto es lo que se renderiza.
- `next-intl@3.26.5/dist/development/react-client/index.js:14-26` — `callHook('useTranslations', useIntl.useTranslations)` — el wrapper que re-lanza como "Failed to call … because the context from `NextIntlClientProvider` was not found." (En nuestro caso el contexto SÍ se encuentra; son los mensajes dentro del contexto los que tienen la forma incorrecta.)
- `apps/web/messages/en.json` — árbol de mensajes de producción, correctamente anidado. La forma plano-con-puntos del harness es el único lugar del repo que usa la forma incorrecta.

## Apéndice B: sonda mínima para confirmar la hipótesis de forma

Un `intl-probe.test.tsx` de 5 líneas (ya removido) demostró que:

```tsx
const messages = { "transactions.list": { loading: "MY-LOADING" } };
// DOM: <p>transactions.list.loading</p>  ← cadena de fallback

const messages = { transactions: { list: { loading: "MY-LOADING" } } };
// DOM: <p>MY-LOADING</p>                ← resuelto
```

Esto confirma el diagnóstico al nivel de la librería next-intl, independiente de cualquier código de componente.
