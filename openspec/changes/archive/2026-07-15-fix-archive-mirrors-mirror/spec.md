# Especificación — `fix-archive-mirrors`

> **Proyecto**: `gastos-personales-reference` (`gp-v2`) · **Fecha**: 2026-07-14
> **Estado**: borrador · **Modo**: auto · **Almacén**: hybrid · **Forma**: A (solo documentación) · **Entrega**: 7 PRs encadenados, del más antiguo al más reciente

## 1. Encabezado

Esta especificación restaura los espejos en español para siete cambios archivados en OpenSpec. El Markdown en inglés es autoritativo; las traducciones DEBEN estar escritas a mano en español profesional neutro. No se cambia código fuente.

## 2. Intención

Restaurar el cumplimiento de AGENTS.md §13 para 29 espejos de archivos faltantes o parciales preservando commits atómicos por archivo, revisables e independientemente reversibles.

## 3. Metas

- **G1**: Espejar `fix-api-nestjs-di` en PR 1.
- **G2**: Espejar `fix-bdd-tsx-node22` en PR 2.
- **G3**: Espejar `fix-state-coverage-drift` en PR 3.
- **G4**: Espejar `fix-vitest-4-deprecation` en PR 4.
- **G5**: Espejar `fix-web-vitest-crash` en PR 5.
- **G6**: Completar y verificar `fix-ci-env-propagation` en PR 6.
- **G7**: Completar y verificar `slice-8-closing-bdd-and-docs` en PR 7.
- **G8**: Completar la cadena del más antiguo al más reciente con alcance limpio y sin drift CJK.

## 4. No-metas

Sin cambios en código fuente, tooling, CI, ESLint, espejos de cambios activos, ADR, ni carpetas `-mirror/` extraviadas. Los archivos parciales existentes NO DEBEN ser re-traducidos ni sobrescritos.

## 5. Requerimientos funcionales

- **R1 (DEBE)**: PR 1 DEBE contener los cinco archivos ES para `2026-07-13-fix-api-nestjs-di`: `proposal.md`, `spec.md`, `design.md`, `tasks.md`, `explore.md`.
- **R2 (DEBE)**: PR 2 DEBE contener los cinco archivos ES para `2026-07-14-fix-bdd-tsx-node22`.
- **R3 (DEBE)**: PR 3 DEBE contener los cinco archivos ES para `2026-07-14-fix-state-coverage-drift`.
- **R4 (DEBE)**: PR 4 DEBE contener los cuatro archivos ES equivalentes a EN para `2026-07-14-fix-vitest-4-deprecation`: `proposal.md`, `spec.md`, `design.md`, `tasks.md`.
- **R5 (DEBE)**: PR 5 DEBE contener los cinco archivos ES para `2026-07-14-fix-web-vitest-crash`.
- **R6 (DEBE)**: PR 6 DEBE añadir los cuatro archivos faltantes para `2026-07-14-fix-ci-env-propagation` y verificar que su `spec.md` existente esté intacto.
- **R7 (DEBE)**: PR 7 DEBE añadir los tres archivos faltantes para `2026-07-13-slice-8-closing-bdd-and-docs` y verificar que su `design.md` existente esté intacto.
- **R8 (DEBE)**: Cada PR DEBE usar un commit atómico de lote de cinco archivos (o el lote real de 3/4/5 archivos del archivo) y DEBE ser independientemente reversible.
- **R9 (DEBE)**: Los siete PRs DEBEN mergear en orden: PR 1 a PR 7.
- **R10 (DEBE)**: Cada archivo ES DEBE pasar `perl -ne 'print if /\p{Han}/'`; el comando DEBE producir ninguna salida.
- **R11 (DEBERÍA)**: Cada PR DEBERÍA usar el prefijo de título `docs(mirrors):` y la etiqueta `[mirror-batch]` o marcador de descripción.
- **R12 (DEBE)**: Cada PR DEBE tocar solo su propio subárbol `Documents-es/openspec/changes/archive/<archivo>/`; ningún archivo de código fuente PUEDE ser modificado.

## 6. Escenarios

```gherkin
Scenario: el archivo fix-api-nestjs-di tiene 5 archivos ES
  Given el archivo fix-api-nestjs-di aterrizó en develop
  When PR 1 aterriza con archivos ES traducidos manualmente
  Then su directorio ES DEBE contener proposal.md, spec.md, design.md, tasks.md, explore.md
  And cada archivo DEBE pasar la verificación de drift CJK

Scenario: el archivo fix-bdd-tsx-node22 tiene 5 archivos ES
  Given PR 1 está mergeado
  When PR 2 aterriza
  Then su directorio ES DEBE contener los cinco archivos equivalentes a EN
  And cada archivo DEBE pasar la verificación de drift CJK

Scenario: el archivo fix-state-coverage-drift tiene 5 archivos ES
  Given PRs 1 y 2 están mergeados
  When PR 3 aterriza
  Then su directorio ES DEBE contener los cinco archivos equivalentes a EN
  And cada archivo DEBE pasar la verificación de drift CJK

Scenario: el archivo fix-vitest-4-deprecation tiene 4 archivos ES
  Given PRs 1 a 3 están mergeados
  When PR 4 aterriza
  Then su directorio ES DEBE contener proposal.md, spec.md, design.md, tasks.md
  And cada archivo DEBE pasar la verificación de drift CJK

Scenario: el archivo fix-web-vitest-crash tiene 5 archivos ES
  Given PRs 1 a 4 están mergeados
  When PR 5 aterriza
  Then su directorio ES DEBE contener los cinco archivos equivalentes a EN
  And cada archivo DEBE pasar la verificación de drift CJK

Scenario: el espejo parcial de fix-ci-env-propagation está completado
  Given su spec.md ES existente está intacto
  When PR 6 aterriza
  Then design.md, explore.md, proposal.md y tasks.md DEBEN existir
  And el spec.md existente DEBE permanecer sin cambios

Scenario: el espejo parcial de slice-8-closing-bdd-and-docs está completado
  Given su design.md ES existente está intacto
  When PR 7 aterriza
  Then proposal.md, spec.md y tasks.md DEBEN existir
  And el design.md existente DEBE permanecer sin cambios

Scenario: los PRs mergean en orden de cadena
  Given los PRs 1-7 mergean en secuencia
  When la cadena se completa
  Then los siete PRs DEBEN estar mergeados
  And develop DEBE contener los 29 archivos ES

Scenario: todos los archivos ES pasan la verificación de drift CJK
  Given los siete PRs están mergeados
  When el comando archive-wide de codepoints Han se ejecuta
  Then ninguna salida DEBE ser producida

Scenario: el cumplimiento de AGENTS.md §13 está restaurado
  Given los siete PRs están mergeados
  When cada archivo EN en alcance se compara con su espejo ES
  Then 7 de 7 archivos DEBEN mostrar espejos completos

Scenario: la cadena toca solo documentación
  Given los siete PRs están mergeados
  When el diff de la cadena se lista
  Then cada path modificado DEBE terminar en .md
  And ningún path .ts, .tsx, .json, .cjs, .sh, .yml o yaml PUEDE aparecer

Scenario: las carpetas mirror extraviadas quedan diferidas
  Given las tres carpetas -mirror extraviadas existen
  When este cambio se completa
  Then DEBEN permanecer sin tocar
  And una nueva observación Engram DEBE documentarlas como limpieza diferida
```

## 7. Superficie de restricciones

Los archivos EN archivados son la fuente de verdad. La traducción DEBE preservar paths, identificadores de código, versiones, comandos y términos técnicos de la industria. Los PRs son solo documentación, traducidos manualmente, en español neutro, del más antiguo al más reciente, e independientemente reversibles. El presupuesto de revisión de 400 líneas fuerza el encadenamiento a pesar del tamaño agregado.

## 8. Plan de pruebas

| Verificación | Esperado |
|---|---|
| Comparación de nombres de archivo EN/ES por archivo | Sin archivos en alcance faltantes o extra |
| `perl -ne 'print if /\p{Han}/'` por archivo ES | Salida vacía |
| `pnpm lint:fixtures` por PR | Sale con 0 |
| `git diff --name-only` por PR | Solo el subárbol ES de ese archivo |
| Auditoría final del archivo | 7/7 espejos completos; 29 archivos |

## 9. Criterios de aceptación

R1–R7, R10 y R12 pasan; R8–R9 se evidencian por siete commits/PRs atómicos ordenados; R11 se aplica donde las etiquetas del repositorio lo permiten. Los archivos parciales existentes están intactos, las tres carpetas extraviadas están sin tocar, y la auditoría final reporta cero espejos en alcance faltantes.

## 10. Fuera de alcance

Las tres carpetas `-mirror/` extraviadas, los cambios activos, los espejos de ADR ya completos, el código fuente, CI, ESLint, configuración de paquetes y traducción automatizada están excluidos.

## 11. Preguntas abiertas — Resueltas

- **Q1**: 7 PRs encadenados, no un mega-PR.
- **Q2**: Orden del más antiguo al más reciente.
- **Q3**: Sí, marcar cada PR como un lote de espejos.
- **Q4**: Sí, verificar y completar ambos espejos parciales.
- **Q5**: No, las carpetas extraviadas quedan fuera de alcance y solo se documentan.
- **Q6**: Solo traducción manual.

## 12. Trazabilidad

| Requerimientos | Metas |
|---|---|
| R1–R7 | G1–G7 |
| R8–R9 | G1–G8 |
| R10 | G8 |
| R11 | G8 |
| R12 | G8 |

---

## Archivos relevantes

- `openspec/changes/fix-archive-mirrors/proposal.md` — alcance y decisión de entrega.
- `openspec/changes/fix-archive-mirrors/explore.md` — inventario de auditoría y baseline de verificación.
- `Documents-es/openspec/changes/archive/` — destino de los 29 espejos.