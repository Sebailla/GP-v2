# Diseño — `fix-archive-mirrors`

## 1. Metas ↔ Enfoque técnico

| Meta | Enfoque técnico |
|---|---|
| G1–G7 | Siete PRs del más antiguo al más reciente, un archivo por PR; traducir manualmente solo los artefactos EN faltantes a español profesional neutro y preservar los dos archivos ES existentes. |
| G8 | `auto-chain`: PR N+1 arranca desde el `develop` actualizado solo después de que PR N haga squash-merge. |
| G9 | Ejecutar `perl -ne 'print if /\p{Han}/'` contra cada archivo ES en alcance; la salida debe estar vacía. |
| G10 | La auditoría final compara siete directorios EN/ES: 33 archivos ES equivalentes a EN en total (29 creados + 2 archivos parciales existentes, con dos archivos legítimamente teniendo cuatro archivos). |
| G11 | El diff por PR contiene solo paths `.md` en el subárbol ES de ese archivo. |
| G12 | Registrar las tres carpetas `-mirror/` extraviadas en Engram; no modificarlas. |

## 2. Inventario de archivos por PR

Los paths `EN` empiezan en `openspec/changes/archive/`; los paths `ES` reemplazan ese prefijo con `Documents-es/openspec/changes/archive/`. El LOC es el `wc -l` EN actual y es la estimación de revisión, no un conteo de líneas traducidas prometido.

| PR | Archivo | Archivo | Acción | LOC EN |
|---:|---|---|---|---:|
| 1 | `2026-07-13-fix-api-nestjs-di` | `proposal.md` | Crear ES | 211 |
| 1 | mismo | `spec.md` | Crear ES | 455 |
| 1 | mismo | `design.md` | Crear ES | 1,654 |
| 1 | mismo | `tasks.md` | Crear ES | 334 |
| 1 | mismo | `explore.md` | Crear ES | 375 |
| 2 | `2026-07-14-fix-bdd-tsx-node22` | `proposal.md` | Crear ES | 198 |
| 2 | mismo | `spec.md` | Crear ES | 428 |
| 2 | mismo | `design.md` | Crear ES | 519 |
| 2 | mismo | `tasks.md` | Crear ES | 288 |
| 2 | mismo | `explore.md` | Crear ES | 305 |
| 3 | `2026-07-14-fix-state-coverage-drift` | `proposal.md` | Crear ES | 59 |
| 3 | mismo | `spec.md` | Crear ES | 445 |
| 3 | mismo | `design.md` | Crear ES | 645 |
| 3 | mismo | `tasks.md` | Crear ES | 243 |
| 3 | mismo | `explore.md` | Crear ES | 431 |
| 4 | `2026-07-14-fix-vitest-4-deprecation` | `proposal.md` | Crear ES | 95 |
| 4 | mismo | `spec.md` | Crear ES | 150 |
| 4 | mismo | `design.md` | Crear ES | 456 |
| 4 | mismo | `tasks.md` | Crear ES | 261 |
| 5 | `2026-07-14-fix-web-vitest-crash` | `proposal.md` | Crear ES | 217 |
| 5 | mismo | `spec.md` | Crear ES | 419 |
| 5 | mismo | `design.md` | Crear ES | 423 |
| 5 | mismo | `tasks.md` | Crear ES | 240 |
| 5 | mismo | `explore.md` | Crear ES | 419 |
| 6 | `2026-07-14-fix-ci-env-propagation` | `proposal.md` | Crear ES | 253 |
| 6 | mismo | `spec.md` | Verificar ES existente sin cambios | 585 |
| 6 | mismo | `design.md` | Crear ES | 570 |
| 6 | mismo | `tasks.md` | Crear ES | 366 |
| 6 | mismo | `explore.md` | Crear ES | 239 |
| 7 | `2026-07-13-slice-8-closing-bdd-and-docs` | `proposal.md` | Crear ES | 136 |
| 7 | mismo | `spec.md` | Crear ES | 735 |
| 7 | mismo | `design.md` | Verificar ES existente sin cambios | 658 |
| 7 | mismo | `tasks.md` | Crear ES | 541 |

## 3. Plan de ejecución

Para cada PR N (1–7), usando el archivo de §2:

1. Después de que PR N−1 mergea, crear `feat/fix-archive-mirrors-pr-N` desde el `develop` actual.
2. Traducir manualmente solo las filas `Crear ES` directamente a sus paths ES correspondientes; nunca usar traducción automática.
3. Confirmar que el lote tiene los 3/4/5 archivos reales creados del archivo; no se necesita `git mv` porque los archivos se crean en los paths finales.
4. Verificar nombres EN/ES, archivo parcial preservado donde aplique, salida CJK vacía, `pnpm lint:fixtures`, y diff de solo-archivo.
5. Commit una vez: `docs(mirrors): <archive> — add ES mirror (PR N of 7)`.
6. Push con upstream explícito: `git push -u origin feat/fix-archive-mirrors-pr-N`.
7. Abrir con head/base explícitos: `gh pr create --base develop --head feat/fix-archive-mirrors-pr-N --title "docs(mirrors): <archive> — add ES mirror (PR N of 7)" --body "[mirror-batch]"`.
8. Esperar CI y review.
9. Squash-merge a `develop`.
10. Continuar solo después de que `develop` contenga el merge.

## 4. Commits atómicos

Siete PRs, un commit cada uno, un subárbol de archivo cada uno. Sin commits apilados dentro de un PR. Cualquier lote se puede revertir independientemente; el rollout completo revierte PR 7 → PR 1.

## 5. Plan de ejecución de pruebas

| Requerimiento/escenario | Comando / evidencia |
|---|---|
| Completitud R1–R7 | `diff <(find "openspec/changes/archive/<name>" -maxdepth 1 -name '*.md' -exec basename {} \; \| sort) <(find "Documents-es/openspec/changes/archive/<name>" -maxdepth 1 -name '*.md' -exec basename {} \; \| sort)` está vacío. |
| Atomicidad R8 | El PR contiene un commit y solo su subárbol de archivo. |
| Orden R9 | `gh pr list --state merged --limit 7` más timestamps de merge muestra los PRs 1–7 secuencialmente. |
| CJK R10 | `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<name>/*.md` retorna vacío. |
| Marcador R11 | El título del PR empieza con `docs(mirrors):`; el cuerpo contiene `[mirror-batch]`. |
| Alcance solo-docs R12 | `git diff --name-only <base>...HEAD` contiene solo `Documents-es/openspec/changes/archive/<name>/*.md`; `grep -E '\.(ts\|tsx\|json\|cjs\|sh\|yml\|yaml)$'` retorna vacío. |
| CI | `pnpm lint:fixtures` sale con 0 por PR. |
| Carpetas extraviadas | `ls Documents-es/openspec/changes/archive/ \| grep -E -- '-mirror$'` permanece sin cambios; Engram registra la limpieza diferida. |

## 6. Riesgos y mitigaciones

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | Fatiga del revisor / conflictos en cadena | Un archivo independiente por PR; merges ordenados; marcador consistente. |
| R2 | Drift de tono regional | Español profesional neutro; los espejos parciales existentes son referencias de tono. |
| R3 | Mala traducción técnica | EN permanece autoritativo; preservar paths, comandos, identificadores y versiones verbatim; revisión lado a lado. |
| R4 | Cambios activos se archivan a mitad de cadena | No expandir un PR iniciado; re-evaluar el alcance solo en el siguiente límite de PR bajo §13. |

## 7. Fuera de alcance

- Tres carpetas `-mirror/` extraviadas (observación de limpieza diferida solo en Engram).
- Tres cambios activos; sus espejos pertenecen a su operación de archivo.
- Seis ADRs ya espejados.
- Cambios en código fuente, tooling, CI, ESLint, o traducción automática.

## 8. Preguntas abiertas para la fase de tareas

Ninguna; las seis preguntas de spec están resueltas.

## 9. Criterios de validación para `sdd-verify`

Después de que PR 7 mergea: los siete inventarios de directorio EN/ES coinciden; los 29 archivos ES faltantes ahora existen; ambos archivos parciales preexistentes permanecen sin cambios; las siete ejecuciones de CI están en verde; las verificaciones CJK están vacías; la cadena agregada cambia solo Markdown en los siete subárboles ES de archivos; el cumplimiento de AGENTS.md §13 está restaurado para los archivos en alcance.

### Matriz de amenazas

| Frontera | Aplicabilidad | Respuesta de diseño |
|---|---|---|
| Paths tipo documentación | Aplicable: la clasificación `.md` es la frontera de alcance | Rechazar cualquier path que no sea `.md`; no se introducen docs tipo ejecutable. |
| Selección de repositorio git | Aplicable | Ejecutar en la raíz del proyecto; sin `git -C` ni cwd alternativo. |
| Estado del commit | Aplicable | Stage explícito de paths de archivo; rechazar índice vacío o archivos stageados no relacionados; sin `commit -a`. |
| Estado del push | Aplicable | Rama explícita y upstream de primer push; fallar en lugar de inferir otro destino. |
| Comandos de PR | Aplicable | `--base develop` y `--head` explícitos; título/cuerpo fijo con marcador; sin entrada de shell compuesta. |

Estas son fronteras operacionales de verificación para entrega de documentación; TDD estricto es N/A porque no hay cambios de código de automatización.

## 10. Trazabilidad

| Requerimiento de spec | Sección de diseño |
|---|---|
| R1–R7 | §2 inventario, §5 completitud |
| R8 | §4 |
| R9 | §3 pasos 8–10, §5 orden |
| R10 | §3 paso 4, §5 CJK |
| R11 | §3 pasos 5 y 7, §5 marcador |
| R12 | §3 pasos 2–4, §5 alcance |