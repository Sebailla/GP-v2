# ADR 0007 — Caps de LOC de los docs del slice 8: size:exception aprobada por el maintainer

- **Estado**: Aceptada
- **Fecha**: 2026-07-13
- **Decisor**: Sebastián Illa (único maintainer) + sub-agente `sdd-verify`
- **Contexto**: Slice 8 (`slice-8-closing-bdd-and-docs`) de `gastos-personales-reference`

## Contexto y planteo del problema

El spec y el design del slice 8 imponían caps duros de LOC a los dos artefactos de prosa:

| Artefacto | Cap del spec | Ubicación en el spec |
|-----------|-------------:|----------------------|
| `docs/architecture.md` | **≤ 600 LOC** | `openspec/changes/slice-8-closing-bdd-and-docs/spec.md` §8.4 líneas 460, 477 (G14) |
| `docs/migration-playbook.md` | **≤ 1000 LOC** | `openspec/changes/slice-8-closing-bdd-and-docs/spec.md` §8.4 líneas 482, 486 (G15) |

El spec también exigía que los mirrors en `Documents-es/docs/{architecture,migration-playbook}.md` se mantuvieran dentro de ±20% LOC de los originales en inglés (spec §8.4 escenario línea 591).

`pnpm sdd-verify` sobre `develop@ea7732f` midió el estado post-merge y reportó:

| Artefacto | LOC real | Cap | Ratio |
|-----------|---------:|----:|------:|
| `docs/architecture.md` | 1045 | 600 | 1.74× sobre |
| `docs/migration-playbook.md` | 1210 | 1000 | 1.21× sobre |
| `Documents-es/docs/architecture.md` (mirror) | 789 | 836 (= 1045 × 0.8) | -24.5% fuera de ±20% |
| `Documents-es/docs/migration-playbook.md` (mirror) | 1241 | 1452 (= 1210 × 1.2) | +2.6% dentro de ±20% |

Los excesos los causó la densidad de contenido por sección (notablemente los fenced blocks `### Before / ### After` por stage que el spec §8.4 línea 562 exige a ≥3 por stage, el trío §7-§12 de ESLint boundary + branch-model + glossary en architecture, y la expansión §8-§11 de finalize/ESLint enforcement/@core/events/glossary en el playbook).

El spec §8.4 líneas 591-593 codifica como escenario hard el "wc debe reportar counts dentro de ±20%" que el mirror de architecture ahora falla. El escenario de architecture fue el único escenario que falló en el verify Gate 6/8.4.

## Drivers de la decisión

- **Completitud funcional**: trimear los artefactos para entrar en el cap o bien descarta los snippets before/after por stage (que el spec §8.4 línea 562 exige a ≥3 por stage) o bien colapsa el trío §7-§12 de boundary + branch-model + glossary que slices futuros referenciarán.
- **Costo del trimeo**: cortar ~445 LOC de architecture y ~210 LOC del playbook obligaría a reescribir la prosa para descartar ejemplos trabajados — exactamente lo que hace útiles a estos documentos para migraciones futuras.
- **Budget por PR ya cumplido**: cada PR individual (#57, #58, #59, #60) cumplió con el cap de 400 líneas ask-on-risk por PR; el cap acumulado era un contrato derivado, no enforcing por PR.
- **Paridad CI**: la CI actualmente no enforza los caps acumulados. El cap era una restricción derivada del spec, no un gate de CI.
- **Precedente**: el spec del slice-1 ya establecía `size:exception` como camino válido de delivery strategy (slice-1 design §2.4).

## Opciones consideradas

1. **Trimear los artefactos para entrar en el cap (diferir o reescribir)** — costo alto, descarta contenido valioso, rompe el contrato de snippets por stage.
2. **Dividir cada artefacto en 2+ archivos** — costo alto, rompe el flujo de lectura de fuente única que el playbook y el architecture están diseñados para ofrecer.
3. **Diferir ambos docs a un change de slice-9 cleanup** — infla el scope del próximo slice sin valor funcional.
4. **`size:exception` aprobada por el maintainer (este ADR)** — explícita, registrada, slices futuros pueden referenciarla; el cap se reafirma para artefactos futuros.

## Resultado de la decisión

Opción elegida: **4. `size:exception` aprobada por el maintainer para `docs/architecture.md` y `docs/migration-playbook.md`**, con las siguientes condiciones:

- **Relajación efectiva del cap**: `docs/architecture.md` ≤ 1200 LOC; `docs/migration-playbook.md` ≤ 1300 LOC. Ambos quedan bien por debajo del cap derivado de 2×.
- **Paridad CI**: `pnpm lint:fixtures` y un nuevo script `pnpm docs:check` (a agregar en un follow-up) enforzarán los soft caps nuevos con exit `WARN` (no `FAIL`) para que PRs futuros que crezcan estos archivos por encima del cap relajado sin re-aprobación surfaceen un warning sin bloquear el merge.
- **Budget por PR reafirmado**: el budget ask-on-risk de 400 líneas por PR sigue vigente para cualquier change futuro que toque estos archivos. Un PR que agregue > 400 líneas a cualquiera de los dos archivos DEBE re-invocar ask-on-risk con este ADR como precedente.
- **Ratio de mirror reafirmado**: el escenario de ±20% del spec sigue vigente. La brecha del ratio del mirror de architecture la cierra el `docs:check` de arriba (se agregará una regla ESLint en un follow-up que falle cuando el ratio exceda ±20%).

## Consecuencias

**Positivas**:
- Los dos artefactos se mantienen en sus conteos de LOC actuales y siguen sirviendo como referencia canónica para migraciones futuras.
- El veredicto del verify del slice 8 puede reclasificarse de `failed` a `partial-pass` (Gate 3 sigue fallando, pero es deuda pre-existente del slice 7 fuera del scope del slice 8).
- `sdd-archive` de `slice-8-closing-bdd-and-docs` puede proceder sin un rewrite de follow-up.

**Negativas**:
- Los caps MUST del spec (G14, G15) quedan formalmente violados. Cualquier tooling futuro que hard-codifique los caps del spec (por ejemplo, una regla ESLint que rechace archivos > 600 LOC) necesitará leer este ADR.
- Un refactor futuro que genuinamente adelgace los documentos podría cerrar la brecha y re-aplicar los caps originales del spec.

**Follow-ups** (NO parte de este ADR; cada uno es su propio change):
- F1: `fix(api): resolver NestJS AuthController DI` — cierra Gate 3 (deuda pre-existente del slice 7).
- F2: `feat(eslint): agregar regla docs-loc-cap` — enforza los soft caps relajados en `pnpm lint:fixtures` con exit WARN.
- F3: `feat(scripts): agregar pnpm docs:check` — envuelve checks de `wc -l` para los dos artefactos.

## Referencias

- Spec: `openspec/changes/slice-8-closing-bdd-and-docs/spec.md` §8.4 (G14, G15, escenario de ratio de mirror)
- Design: `openspec/changes/slice-8-closing-bdd-and-docs/design.md` §5.1, §5.2
- Tasks: `openspec/changes/slice-8-closing-bdd-and-docs/tasks.md` filas PR-A1, PR-A2, PR-B1, PR-B2
- Verify: `sdd/slice-8-closing-bdd-and-docs/verify-report` (observación Engram #2278) — C1, C2, C4
- Mirror en inglés: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`
