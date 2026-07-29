# Propuesta — `fix-state-coverage-drift`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Modo**: auto · **Almacén de artefactos**: hybrid · **Forma del fix**: A

## 1. Intención

Tras `fix-web-vitest-crash` cerrar el OOM, 13 de 25 tests de cobertura de estados de transacciones siguen fallando. El harness entrega claves de mensaje planas con puntos, pero `resolvePath()` de next-intl/use-intl 3.26.5 requiere objetos anidados. La resolución lanza, y el fallback renderiza la ruta literal con puntos. El fix verificado consiste en anidar `messages` y reemplazar dos aserciones para IDs de transacciones que `TransactionsRow` nunca renderiza. Blast radius: un archivo de harness de test y dos aserciones; sin código de producción.

## 2. Alcance

### En alcance
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` — anidar `messages`; cambiar las aserciones de `txn-1`/`txn-2` al contenido de fila renderizado.

### Fuera de alcance
- Cambios en componentes: `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager` o `SessionList`.
- Cambios de versión de next-intl/use-intl.
- Cambios en mock API o en la infraestructura de tests.
- Tests nuevos o anotaciones `.skip`/`.todo`.

## 3. Enfoque

Usar **Forma A**: alinear el harness con el contrato de mensajes anidados de next-intl. Los componentes ya entregan comportamiento funcional y quedan sin cambios. Reemplazar las dos aserciones de ID con texto único de fixture renderizado, preferentemente `cat-1`, porque la fila expone categoría, monto, fecha, moneda y kind — pero no `tx.id`.

## 4. Inventario de archivos afectados

| Archivo | Cambio | Delta de LOC |
|------|--------|-----------|
| `apps/web/__tests__/components/transactions/state-coverage.test.tsx` | Editar: anidar `messages`; ajustar dos aserciones | +25 / -15 |

**Total estimado: ~10 LOC netas.** PR único; no se dispara auto-chain.

## 5. Objetivos

- **G1**: El comando focalizado de cobertura de estados sale con 0 con 25/25 pasando.
- **G2**: Los 13 tests que fallaban anteriormente pasan.
- **G3**: Los 12 tests que pasaban anteriormente siguen verdes.
- **G4**: La suite completa de apps/web sale con 0 con 145/145 pasando.
- **G5**: BDD sigue verde con 43/43 escenarios.
- **G6**: Sin cambios en archivos fuente de componentes.

## 6. No-objetivos

Sin cambios en componentes, versiones de dependencias, mock API, ni infraestructura de tests; sin tests nuevos; sin tests salteados o marcados como todo.

## 7. Riesgos

| ID | Riesgo | Mitigación |
|----|------|------------|
| R1 | Un test que pasa puede depender de un fallback literal con puntos. | Ejecutar los 25 tests de cobertura de estados e investigar cualquier regresión. |
| R2 | Las aserciones de fila pueden volverse menos específicas. | Asertar el valor único de fixture `cat-1`, no un monto potencialmente repetido. |
| R3 | Las colisiones de múltiples `Loading` pueden persistir por un nodo de texto perdido. | Reinvestigar durante apply si alguna queda tras anidar los mensajes. |

## 8. Preguntas abiertas para la fase de Spec

- **Q1**: ¿Añadir un ADR para el contrato de forma i18n? **Recomendación: no**; basta con un comentario JSDoc en el harness.
- **Q2**: ¿Exportar `messages` para reuso? **Recomendación: no**; diferir como fuera de alcance.
- **Q3**: ¿Usar `cat-1` o `100.00` para las aserciones de fila? **Recomendación: `cat-1`**, que es más específico y menos propenso a colisiones.
