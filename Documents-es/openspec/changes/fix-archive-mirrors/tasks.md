# Tareas — fix-archive-mirrors — gastos-personales-reference

**Proyecto**: `gastos-personales-reference` (`gp-v2`)
**Rama**: `develop` (trabajo) · `main` (inmutable)
**Rama tracker**: `feat/fix-archive-mirrors-pr-N` (una por PR, 7 PRs en total)
**Modo**: auto · **Almacén de artefactos**: hybrid · **Estrategia de entrega**: auto-chain
**TDD estricto**: N/A (documentación pura; sin cambios en código fuente)
**Artefactos fuente**: proposal.md (Engram #2415), spec.md (#2417 — G1–G8, R1–R12, 12 escenarios), design.md (#2419 — 29 archivos ES, 7 PRs encadenados)
**Autor**: orquestador SDD → `sdd-tasks` (ejecutor)
**Estado**: planificación completa; el usuario pausa antes de `sdd-apply`

## Convenciones

- Commits de unidad de trabajo: cada PR toca una única subcarpeta de archivo bajo `Documents-es/openspec/changes/archive/<name>/`; revertir cualquier PR elimina SOLO los espejos ES de ese archivo (R8/R9).
- Sin trailers `Co-Authored-By` (AGENTS.md §6).
- Conventional Commits: `docs(mirrors): add retroactive ES mirrors for <archive>`, imperativo, ≤72 chars, sin punto final.
- Solo traducción manual — sin DeepL/OpenAI/Google Translate (R7/riesgo de drift CJK).
- Registro en español neutro y profesional; los términos de la industria quedan en inglés (`commit`, `merge`, `PR`, `ADR`, `BDD`, `Vitest`, `NestJS`, `package.json`, `tsconfig`, `paths`, `slice`, `chore`, `monorepo`, `Turborepo`, `pnpm`, `slice`).
- Los espejos parciales existentes se PRESERVAN, no se sobrescriben — PRs 6/7 verifican el archivo ES existente antes de añadir hermanos.
- RFC 2119 MAY/SHALL/MUST NOT para lenguaje vinculante en spec; aquí honramos SHALL (R1, R3, R8, R10, R12).

## §1. Grafo de dependencias

```
T1 (PR 1: fix-api-nestjs-di) — independiente (off develop)
 │
 ▼
T2 (PR 2: fix-bdd-tsx-node22) — depende de T1 mergeado
 │
 ▼
T3 (PR 3: fix-state-coverage-drift) — depende de T2 mergeado
 │
 ▼
T4 (PR 4: fix-vitest-4-deprecation) — depende de T3 mergeado
 │
 ▼
T5 (PR 5: fix-web-vitest-crash) — depende de T4 mergeado
 │
 ▼
T6 (PR 6: fix-ci-env-propagation) — depende de T5 mergeado (completar huecos en espejo parcial)
 │
 ▼
T7 (PR 7: slice-8-closing-bdd-and-docs) — depende de T6 mergeado (completar huecos en espejo parcial)
```

**Invariante de orden**: T1 → T2 → T3 → T4 → T5 → T6 → T7. Cada PR mergea independientemente antes de que la rama del siguiente PR se corte. PRs 1–5 son espejos completos (5/5/5/4/5 archivos faltantes); PRs 6–7 son completado de huecos sobre espejos parciales existentes (4 / 3 archivos faltantes). Ningún PR muta un archivo del cual su archivo no es responsable — frontera de regresión atómica por archivo (commits atómicos R8).

## §2. Tablas por tarea (7 tareas)

### T1 — PR 1: `2026-07-13-fix-api-nestjs-di` (5 archivos ES NUEVOS)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-api-nestjs-di (PR 1 of 7)`
- **Rama**: `feat/fix-archive-mirrors-pr-1` (cortada desde `develop`)
- **Archivos**: `Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/{proposal,spec,design,tasks,explore}.md` (5 NUEVOS)
- **Depende de**: —
- **LOC**: +~3,000 / 0
- **TDD**: N/A (commit solo de docs). Traducir manualmente cada archivo EN en `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/<name>.md` a español neutro/profesional en `Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/<name>.md`. Preservar paths, comandos, identificadores, versiones, fechas, estados. Mantener los términos de la industria en inglés establecidos (`commit`, `PR`, `ADR`, `BDD`, `Vitest`, `NestJS`, etc.) según los espejos slice-8/fix-ci-env-propagation como referencia de tono. Paridad de nombres de archivo (R12): cada archivo EN mapea 1:1 a un archivo ES con el mismo basename.
- **Verificar**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/` lista `proposal.md spec.md design.md tasks.md explore.md` (5 archivos, exactamente el conjunto de basenames EN).
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/*.md` retorna vacío (sin drift CJK en ninguno de los 5 archivos ES).
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-1` lista SOLO paths bajo `Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/` (sin toques en código fuente).
  - R5: `pnpm lint:fixtures` sale con 0.
  - R8: PR abre con título `docs(mirrors): add retroactive ES mirrors for fix-api-nestjs-di (PR 1 of 7)`, base `develop`, head `feat/fix-archive-mirrors-pr-1`.
  - CI del PR en verde; squash-merge; `git log --oneline -1` muestra que el commit de merge aterrizó.

### T2 — PR 2: `2026-07-14-fix-bdd-tsx-node22` (5 archivos ES NUEVOS)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-bdd-tsx-node22 (PR 2 of 7)`
- **Rama**: `feat/fix-archive-mirrors-pr-2` (cortada desde `develop` DESPUÉS de T1 mergeado)
- **Archivos**: `Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/{proposal,spec,design,tasks,explore}.md` (5 NUEVOS)
- **Depende de**: T1 mergeado
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Mismo contrato de traducción manual que T1. NOTA: la carpeta extraviada `2026-07-14-fix-bdd-tsx-node22-mirror/` en el directorio `archive/` EN está fuera de alcance (R4 — cambio de limpieza separado); NO espejar su contenido y NO eliminarla.
- **Verificar**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/` lista los 5 archivos ES.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/*.md` retorna vacío.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-2` lista SOLO paths bajo `Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/` (excluye `2026-07-14-fix-bdd-tsx-node22-mirror/`).
  - R5: `pnpm lint:fixtures` sale con 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-2`; CI en verde; squash-merge.

### T3 — PR 3: `2026-07-14-fix-state-coverage-drift` (5 archivos ES NUEVOS)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-state-coverage-drift (PR 3 of 7)`
- **Rama**: `feat/fix-archive-mirrors-pr-3` (cortada desde `develop` DESPUÉS de T2 mergeado)
- **Archivos**: `Documents-es/openspec/changes/archive/2026-07-14-fix-state-coverage-drift/{proposal,spec,design,tasks,explore}.md` (5 NUEVOS)
- **Depende de**: T2 mergeado
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Mismo contrato de traducción manual que T1/T2.
- **Verificar**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-state-coverage-drift/` lista los 5 archivos ES.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-state-coverage-drift/*.md` retorna vacío.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-3` lista SOLO paths bajo la subcarpeta del archivo.
  - R5: `pnpm lint:fixtures` sale con 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-3`; CI en verde; squash-merge.

### T4 — PR 4: `2026-07-14-fix-vitest-4-deprecation` (4 archivos ES NUEVOS)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-vitest-4-deprecation (PR 4 of 7)`
- **Rama**: `feat/fix-archive-mirrors-pr-4` (cortada desde `develop` DESPUÉS de T3 mergeado)
- **Archivos**: `Documents-es/openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/{proposal,spec,design,tasks}.md` (4 NUEVOS — este archivo legítimamente tiene solo 4 artefactos EN, sin `explore.md`)
- **Depende de**: T3 mergeado
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Mismo contrato de traducción manual. CONFIRMAR que el lado EN tiene solo 4 archivos (proposal/spec/design/tasks) antes de traducir — NO fabricar un `explore.md` que no existe en `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/` (Q5 en proposal: lote real de 4 archivos, no 5).
- **Verificar**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/` lista exactamente 4 archivos ES que coinciden con los basenames EN.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/*.md` retorna vacío.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-4` lista SOLO paths bajo la subcarpeta del archivo; no aparece un `explore.md` espurio.
  - R5: `pnpm lint:fixtures` sale con 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-4`; CI en verde; squash-merge.

### T5 — PR 5: `2026-07-14-fix-web-vitest-crash` (5 archivos ES NUEVOS)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-web-vitest-crash (PR 5 of 7)`
- **Rama**: `feat/fix-archive-mirrors-pr-5` (cortada desde `develop` DESPUÉS de T4 mergeado)
- **Archivos**: `Documents-es/openspec/changes/archive/2026-07-14-fix-web-vitest-crash/{proposal,spec,design,tasks,explore}.md` (5 NUEVOS)
- **Depende de**: T4 mergeado
- **LOC**: +~2,500 / 0
- **TDD**: N/A. Mismo contrato de traducción manual.
- **Verificar**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-web-vitest-crash/` lista los 5 archivos ES.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-web-vitest-crash/*.md` retorna vacío.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-5` lista SOLO paths bajo la subcarpeta del archivo.
  - R5: `pnpm lint:fixtures` sale con 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-5`; CI en verde; squash-merge.

### T6 — PR 6: `2026-07-14-fix-ci-env-propagation` (4 archivos ES NUEVOS, 1 PRESERVADO)

- **Commit**: `docs(mirrors): fill missing ES mirrors for fix-ci-env-propagation (PR 6 of 7)`
- **Rama**: `feat/fix-archive-mirrors-pr-6` (cortada desde `develop` DESPUÉS de T5 mergeado)
- **Archivos**: `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/{proposal,design,explore,tasks}.md` (4 NUEVOS) — `spec.md` ya espejado en el path existente; PRESERVAR (G6, contrato de verificación R5)
- **Depende de**: T5 mergeado
- **LOC**: +~1,500 / 0
- **TDD**: N/A. El contrato de traducción manual aplica solo a archivos NUEVOS. CONFIRMAR que `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` existe antes de cualquier commit; NO tocarlo (R5: el espejo parcial existente debe permanecer intacto).
- **Verificar**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/` lista 5 archivos en total (los 4 NUEVOS + `spec.md` preservado).
  - G6 (R5): `git diff --name-only develop..feat/fix-archive-mirrors-pr-6 -- Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` está vacío (archivo existente sin tocar).
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/*.md` retorna vacío (cubre tanto los NUEVOS como el preservado).
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-6` lista SOLO los 4 paths NUEVOS bajo la subcarpeta del archivo.
  - R5: `pnpm lint:fixtures` sale con 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-6`; CI en verde; squash-merge.

### T7 — PR 7: `2026-07-13-slice-8-closing-bdd-and-docs` (3 archivos ES NUEVOS, 1 PRESERVADO)

- **Commit**: `docs(mirrors): fill missing ES mirrors for slice-8-closing-bdd-and-docs (PR 7 of 7)`
- **Rama**: `feat/fix-archive-mirrors-pr-7` (cortada desde `develop` DESPUÉS de T6 mergeado)
- **Archivos**: `Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/{proposal,spec,tasks}.md` (3 NUEVOS) — `design.md` ya espejado en el path existente; PRESERVAR (G6, R5)
- **Depende de**: T6 mergeado
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Contrato de traducción manual. CONFIRMAR que `Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` existe antes de cualquier commit; NO tocarlo (R5). El `design.md` preservado es el tono de referencia del proyecto para español neutro/profesional.
- **Verificar**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/` lista 4 archivos en total (los 3 NUEVOS + `design.md` preservado).
  - G6 (R5): `git diff --name-only develop..feat/fix-archive-mirrors-pr-7 -- Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` está vacío.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/*.md` retorna vacío.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-7` lista SOLO los 3 paths NUEVOS bajo la subcarpeta del archivo.
  - R5: `pnpm lint:fixtures` sale con 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-7`; CI en verde; squash-merge.
  - **Verificación final de cadena**: reejecutar la tabla de auditoría de `explore.md §2.1` después de que PR 7 mergea; esperar 0 archivos ES faltantes para los 7 archivos en alcance.

## §3. Plan de PR (7 PRs encadenados)

**Patrón por PR**:

- Título: `docs(mirrors): add retroactive ES mirrors for <archive> (PR N of 7)`
- Base: `develop`
- Head: `feat/fix-archive-mirrors-pr-N`
- Archivos: archivos ES NUEVOS específicos del archivo (4 o 5 por PR; PR 6 añade 4 junto a 1 preservado; PR 7 añade 3 junto a 1 preservado)
- Merge: squash-merge después de CI en verde
- Cadena: PR N+1 apunta a `develop` DESPUÉS de que PR N mergea

| PR | Archivo | Rama | Head→Base | Archivos (crea) | Preservado |
|----|---------|------|-----------|-----------------|------------|
| 1 | `2026-07-13-fix-api-nestjs-di` | `feat/fix-archive-mirrors-pr-1` | …→`develop` | 5 | — |
| 2 | `2026-07-14-fix-bdd-tsx-node22` | `feat/fix-archive-mirrors-pr-2` | …→`develop` | 5 | — |
| 3 | `2026-07-14-fix-state-coverage-drift` | `feat/fix-archive-mirrors-pr-3` | …→`develop` | 5 | — |
| 4 | `2026-07-14-fix-vitest-4-deprecation` | `feat/fix-archive-mirrors-pr-4` | …→`develop` | 4 | — |
| 5 | `2026-07-14-fix-web-vitest-crash` | `feat/fix-archive-mirrors-pr-5` | …→`develop` | 5 | — |
| 6 | `2026-07-14-fix-ci-env-propagation` | `feat/fix-archive-mirrors-pr-6` | …→`develop` | 4 | `spec.md` |
| 7 | `2026-07-13-slice-8-closing-bdd-and-docs` | `feat/fix-archive-mirrors-pr-7` | …→`develop` | 3 | `design.md` |
| **Σ** | **7 archivos** | | | **29 creates + 2 preserves** | |

**El cuerpo del PR DEBE incluir**: sección "Context" que nombre el archivo que se está espejando, los archivos que se están creando, los espejos parciales existentes que se preservan (PRs 6 y 7), y los comandos de verificación ejecutados.

## §4. Estrategia de entrega

- **7 PRs en cadena** (del más antiguo al más reciente). Una rama tracker por PR (`feat/fix-archive-mirrors-pr-N`), cada una apuntando a `develop`.
- Envolvente de LOC por PR: ~1,500–3,000 adiciones netas (muy por encima del presupuesto de revisión de 400 líneas SIN encadenar). La estructura de PRs encadenados es el deliverable explícito (R12 + override `auto-chain` del pre-flight del orquestador sobre Approach A de explore.md).
- Estimación de líneas modificadas por PR (excluyendo golden): ~1,500–3,000 adiciones netas. La regresión cross-PR es imposible porque cada PR toca una subcarpeta de archivo distinta bajo `Documents-es/openspec/changes/archive/` (R6: conflictos de merge en cadena Muy Baja).
- Total: 29 archivos ES creados + 2 verificaciones de archivo preservado = **31 operaciones de archivo** a través de 7 PRs.
- Neto cross-chain: ~13,000 LOC ES. Código fuente: CERO cambios (G5).

## §5. Orden de apply

Para cada PR N (1 a 7, secuencialmente, del más antiguo al más reciente):

1. **Esperar a PR N-1 mergeado** (omitir esto para N=1).
2. **Verificar pre-estado** con `git log --oneline -1 develop` mostrando el commit de merge de PR N-1 Y `ls Documents-es/openspec/changes/archive/<prev-archive>/` reflejando sus archivos.
3. **Cortar rama** `feat/fix-archive-mirrors-pr-N` desde el `develop` actual (`git fetch origin && git switch -c feat/fix-archive-mirrors-pr-N origin/develop`).
4. **Verificar lista de archivos del lado EN** en `openspec/changes/archive/<archive>/` — confirmar 5 archivos (proposal/spec/design/tasks/explore) para espejos completos; confirmar 4 archivos para `fix-vitest-4-deprecation`; confirmar baseline de existencia ES para PRs 6 (`spec.md` presente) y 7 (`design.md` presente).
5. **Traducir manualmente** cada archivo EN a español neutro/profesional en `Documents-es/openspec/changes/archive/<archive>/<name>.md`. Preservar basename EN. Usar los espejos ES existentes `slice-8/design.md` y `fix-ci-env-propagation/spec.md` como referencia de tono.
6. **Verificar drift CJK** (G3, R7):
   `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<archive>/*.md`
   DEBE retornar vacío (sin drift de caracteres chinos, sin residuos de herramienta de traducción).
7. **Ejecutar lint fixtures** (R5): `pnpm lint:fixtures` DEBE salir con 0.
8. **Verificar alcance de solo Markdown del archivo** (G5, R12):
   `git diff --name-only develop..feat/fix-archive-mirrors-pr-N`
   DEBE listar SOLO paths bajo `Documents-es/openspec/changes/archive/<archive>/`. Para PRs 6 y 7 el archivo del espejo parcial existente se preserva, así que su path NO DEBE aparecer en `--name-only`.
9. **Stage + commit atómicamente**:
   `git add Documents-es/openspec/changes/archive/<archive>`
   `git commit -m "docs(mirrors): add retroactive ES mirrors for <archive> (PR N of 7)"`
   Según AGENTS.md §6: subject imperativo, ≤72 chars, sin punto final, sin trailer `Co-Authored-By`, sin atribución de IA.
10. **Push de rama**: `git push -u origin feat/fix-archive-mirrors-pr-N`.
11. **Abrir PR** vía `gh pr create --base develop --head feat/fix-archive-mirrors-pr-N --title "docs(mirrors): add retroactive ES mirrors for <archive> (PR N of 7)" --body "<Context section + comandos de verificación>"`.
12. **Esperar CI** (Static + Build + Unit + BDD + lint:fixtures todos en verde).
13. **Squash-merge** vía `gh pr merge --squash`.
14. **Verificar que el merge aterrizó**: `git fetch origin && git log --oneline -1 origin/develop` muestra el commit squash.
15. **Continuar** a PR N+1 (o parar después de PR 7; paso final: reejecutar la tabla de auditoría de `explore.md §2.1`).

## §6. Preguntas abiertas de diseño resueltas

- Q1 (7 PRs en cadena vs. 1 mega-PR): **7 PRs (cadena)** — override `auto-chain` del pre-flight del orquestador sobre Approach A de explore.md (locked).
- Q2 (orden de PRs por archivo): **MÁS ANTIGUO PRIMERO** — PR 1 = `fix-api-nestjs-di`, PR 7 = `slice-8-closing-bdd-and-docs`.
- Q3 (títulos de PR marcados como "mirror batch"): **SÍ** — prefijo consistente `docs(mirrors): add retroactive ES mirrors for <archive>` + sufijo `(PR N of 7)`.
- Q4 (verificar + completar huecos en 2 espejos parciales en la misma cadena): **SÍ** — T6 verifica `fix-ci-env-propagation/spec.md`; T7 verifica `slice-8/design.md`. Ambos preservados, nunca sobrescritos.
- Q5 (PR-8 final ejecutando auditoría completa): **OPCIONAL — omitir** — el comando de auditoría completo vive en T7 final-chain-check (incorporado en la verificación de PR 7).
- Q6 (verificación de scope de paths en `git diff` por PR): **SÍ** — parte del contrato de verificación G5/R12; ver §5 paso 8.

## §7. Fuera de alcance

- **3 carpetas `-mirror/` extraviadas** (`2026-07-14-fix-bdd-tsx-node22-mirror/`, `2026-07-14-fix-orphan-shared-directories-mirror/`, `2026-07-15-slice-9-housekeeping-mirror/`) — documentadas vía Engram; su limpieza pertenece a un cambio separado (R4 / proposal §Fuera de alcance).
- **3 cambios activos** (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) — sus espejos ES aterrizarán con su propio movimiento de archivo; no se manejan aquí.
- **6 ADRs** ya espejados en `slice-9-housekeeping`.
- **Código fuente** — cero cambios (verificación G5/R12).
- **Reglas ESLint** — `no-mojibake-in-docs` queda roadmap-deferred; sin wiring de regla en este cambio.
- **Herramientas de traducción automática** — prohibidas según diseño (riesgo de drift CJK).
- **Re-espejado de archivos parciales** — T6/T7 solo completan huecos; los archivos existentes se preservan.
- **Items de AGENTS.md §11** — i18n más allá de en+es, Sentry, rate-limiting de borde, múltiples proveedores OAuth, hardening de producción, observabilidad, gates de coverage, UI de audit log permanecen fuera de alcance.
- **Espejo en español de `tasks.md`** — los documentos de tareas son artefactos de coordinación SDD (según precedente de `fix-orphan-shared-directories/tasks.md`); solo se espejó el ADR previamente.

## §8. Riesgos

| ID | Riesgo | Probabilidad | Mitigación |
|----|--------|--------------|------------|
| R1 | Fatiga del revisor a través de 7 PRs encadenados (~13k LOC ES total) | Media | Cada PR ~1,500–3,000 LOC netas; prefijo `docs(mirrors):` consistente; auto-chain es la estrategia de entrega explícita para esta clase de carga. |
| R2 | Drift de tono regional en español (Rioplatense vs. neutro) | Media | Usar registro neutro/profesional; referenciar los espejos ES existentes `slice-8/design.md` y `fix-ci-env-propagation/spec.md` como benchmarks de tono; los términos de la industria quedan en inglés. |
| R3 | Errores de traducción introducen imprecisiones técnicas | Baja–Media | EN es autoritativo; el espejo es una traducción, no una reescritura de significado; verificación cruzada de referencias (nombres de archivo, fechas, R#, basenames de archivo) durante la verificación pre-commit. |
| R4 | Las carpetas `-mirror/` extraviadas se expanden/contraen a mitad de cadena | Baja | Documentadas pero sin tocar (R4 en proposal §Fuera de alcance); revisar solo en un PR de limpieza dedicado. |
| R5 | Espejos parciales existentes sobrescritos (PRs 6/7) | Baja | Verificación G6 por PR: `git diff --name-only …` NO DEBE listar el path del archivo preservado; aplicar antes del commit. |
| R6 | Conflictos de merge en cadena (mismo path padre) | Muy baja | Cada PR toca una subcarpeta de archivo distinta; lineage por defecto leído desde develop solamente. |
| R7 | Drift CJK se cuela de tooling de traducción automática (R7 en design) | Baja | Solo traducción manual (sin DeepL/OpenAI/Google); verificación CJK por PR vía `perl -ne 'print if /\p{Han}/'` es obligatoria (§5 paso 6). |
| R8 | Cambios activos archivados a mitad de cadena expanden alcance | Baja | Re-evaluar el alcance en el siguiente límite de PR; absorbido naturalmente por AGENTS.md §13 (los espejos aterrizan con el archivo). |

## §9. Forecast de carga de revisión

| Campo | Valor |
|-------|-------|
| Líneas estimadas modificadas | ~13,000 adiciones netas ES a través de 7 PRs (~1,500–3,000 por PR) |
| Riesgo de presupuesto de 400 líneas | **Alto** por PR (el neto authored de cada PR excede 400 líneas) |
| PRs encadenados recomendados | **Sí** — estrategia de entrega `auto-chain` lo resuelve explícitamente |
| Estrategia de entrega | `auto-chain` (pre-flight del orquestador locked) |
| Estrategia de cadena | `feature-branch-chain` adaptado a ramas tracker por PR (cada rama PR N off `develop`, apunta a `develop` después de que PR N-1 mergea) — nombre alternativo: una rama tracker por PR; efectivamente `stacked-to-main` contra `develop`. Documentar el lineage base elegido en §1 + §3. |
| Decisión necesaria antes de apply | **No** — el orquestador ya resolvió vía `auto-chain` |
| Estrategia efectiva | 7 PRs encadenados (del más antiguo al más reciente) |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: Sí
Estrategia de cadena: feature-branch-chain
Riesgo de presupuesto de 400 líneas: Alto

## Referencias cruzadas

- proposal.md (Engram #2415)
- spec.md (Engram #2417; G1–G8, R1–R12, 12 escenarios)
- design.md (Engram #2419; cadena de 7 PRs, 29 archivos ES, contrato de preservación para 2 espejos parciales)
- explore.md (Engram #2414; razonamiento de override de Approach A)
- Precedentes hermanos: fix-orphan-shared-directories/tasks.md (formato single-PR), fix-state-coverage-drift/tasks.md (2-tarea, hybrid+auto), fix-web-vitest-crash/tasks.md (PR #66, 2-tarea), fix-api-nestjs-di/tasks.md (8 tareas), fix-vitest-4-deprecation/tasks.md (chained-PR)
- AGENTS.md §1/§2/§6/§7/§11/§13
- openspec/config.yaml: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- Contexto de dominio: engram topic `sdd/fix-archive-mirrors/*` cubre proposal/spec/design/tasks; sdd-init almacenó proyecto `gp-v2`, modelo de rama (id 2129), doc-mirror-spanish (id 2132), ui-complete-not-scaffold (id 2133).

**Qué**: Escribió tasks.md para fix-archive-mirrors: 7 PRs en cadena (uno por archivo), del más antiguo al más reciente, ~13k LOC ES netas, cero cambios en código fuente, dos espejos parciales preservados.
**Por qué**: artefacto de fase sdd-tasks para handoff a sdd-apply; espeja el formato de fix-orphan-shared-directories/tasks.md adaptado a entrega auto-chain de PRs encadenados.
**Dónde**: `openspec/changes/fix-archive-mirrors/tasks.md` (Engram topic key `sdd/fix-archive-mirrors/tasks`).
**Aprendido**: El fan-out por archivo mantiene el rollback de cada PR acotado a una única subcarpeta `Documents-es/.../archive/<name>/`; la cadena de 7 PRs es el deliverable explícito que satisface el presupuesto de revisión de 400 líneas bajo la orquestación `auto-chain`. La verificación de drift CJK es obligatoria por PR vía `perl -ne 'print if /\p{Han}/'` (R7). PRs 6 y 7 verifican los espejos parciales preservados antes de añadir hermanos para honrar G6/R5.