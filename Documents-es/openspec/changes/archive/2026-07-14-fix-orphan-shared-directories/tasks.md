# Tasks — `fix-orphan-shared-directories` — `gastos-personales-reference`

> **Estado**: borrador · fase de tasks · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Branch**: `develop` (HEAD `efb9967`) · tracker `feat/fix-orphan-shared-directories` (off develop)
> **Modo**: `auto` · **Almacén de artefactos**: hybrid · **Entrega**: `auto-chain` (>400 LOC) — **N/A este cambio** (~40 LOC netas)
> **Strict TDD**: ACTIVO (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Inputs de aprobación**: `proposal.md` (Engram `#2384`), `spec.md` (Engram `#2385`, G1–G7, R1–R11, 7 escenarios), `design.md` (Engram `#2386`, 10 archivos tocados, 3 commits atómicos, 10 secciones, threat matrix N/A)
> **PR único**: 10 archivos tocados (6 NUEVOS + 2 EDITAR + 2 ADR), 3 commits atómicos; ~40 LOC netas
> **Autor**: orquestador SDD → `sdd-tasks` (executor)
> **Próxima fase**: el usuario pausa antes de `sdd-apply` (según protocolo del orquestador — chequeo interino sobre limpieza de metadata del workspace)

---

## Convenciones usadas en este archivo

- **Commits por unidad de trabajo**: cada commit MUST ser revertible de forma independiente. El cambio aterriza como 3 commits atómicos en una sola branch; cada commit tiene un estado inicial claro, un estado final claro, verificación, y rollback que no remueve trabajo no relacionado (según la skill `work-unit-commits`).
- **Sin trailers "Co-Authored-By"** (AGENTS.md §6 / regla del proyecto).
- **Conventional Commits**: `type(scope): subject` — imperativo, ≤72 caracteres, sin punto final.
- **RED antes de GREEN**: el RED es el **EXISTENTE** TS2307 ("Cannot find module 'zod'") que aparece una vez que se quita el workaround del tsconfig antes de que el paquete esté en su lugar — prueba de que el workaround estaba cargando con la responsabilidad. Según AGENTS.md §4, la falla debe observarse antes de que el cambio de producción/config salga; T1 aterriza el paquete del workspace (el prerrequisito estructural), T2 quita el workaround y observa el GREEN (sin TS2307, pipeline Turbo completo exit 0). No se crea ningún archivo de test nuevo — los conteos existentes 22/22 + 145/145 + 43/43 SON la superficie de regresión.
- **TRIANGULATE por importador (T2)**: con el workaround fuera, cada importador resuelve mediante la resolución normal de paquetes. Si alguno falla, el `pnpm turbo run build` (o `pnpm turbo run typecheck`) focalizado señala cuál de los 11 importadores regresionó.
- **REFACTOR (T2 verify + T3 docs)**: el ADR documenta el porqué; el gate de verify prueba que el cambio es observable por tests.
- **`MUST / SHALL / MUST NOT`** son RFC 2119; cualquier cosa más débil (should, may) es no vinculante.
- Las 3 tasks de abajo mapean 1:1 a los 3 commits atómicos en `design.md` §4. **Sin 4° commit. Sin merge mid-stream.**

---

## §1. Grafo de dependencias

```
T1 (6 archivos NUEVOS: 2 package.json + 2 README + 2 barrels src/index.ts)
 │
 ▼
T2 (QUITAR paths.zod + JSDoc de apps/api/tsconfig.json Y apps/web/tsconfig.json)
 │
 ▼
T3 (2 archivos ADR NUEVOS: EN + ES espejo en docs/architecture/decisions/0011-shared-as-workspace-packages.md)
```

**Invariante de orden de ejecución**: `T1 → T2 → T3`. T1 debe aterrizar primero porque la metadata del paquete del workspace es el prerrequisito estructural para la resolución normal; quitar el workaround antes de que el paquete exista reintroduciría el TS2307 contra los 11 importadores. T2 luego colapsa el mapping `paths.zod` del tsconfig que ahora es redundante en ambas apps. T3 es solo documentación — técnicamente podría aterrizar en cualquier commit, pero según la historia de unidades de trabajo del diseño se empareja con la decisión arquitectónica (la eliminación real del workaround) y mejor le cuenta al revisor el WHY.

**Paralelo Strict-TDD**: T1 = el cambio estructural que causa el GREEN (el nodo que hace posible la resolución directa de `zod` mediante la resolución normal de paquetes). T2 = el paso de OBSERVACIÓN DEL RESULTADO (la observación del RED sería: reintroducir temporalmente la falla re-apuntando el tsconfig a un path inexistente; aquí observamos quitando el workaround y confirmando que no queda TS2307). El pipeline completo en T2 verify es el gate de REFACTOR.

---

## §2. Tablas por task (3 tasks)

### T1 — Crear 6 archivos NUEVOS (manifiestos, READMEs, barrels de auth/shared + transactions/shared)

| Campo | Valor |
|-------|-------|
| Commit | `feat(workspace): add shared feature packages (R1–R4, R11)` |
| Archivos | `libs/features/auth/shared/package.json` (NUEVO, ~15 LOC), `libs/features/auth/shared/README.md` (NUEVO, 5 líneas), `libs/features/auth/shared/src/index.ts` (NUEVO, ~7 líneas), `libs/features/transactions/shared/package.json` (NUEVO, ~15 LOC), `libs/features/transactions/shared/README.md` (NUEVO, 5 líneas), `libs/features/transactions/shared/src/index.ts` (NUEVO, ~7 líneas) |
| Depende de | — (T1 es el prerrequisito estructural; aterriza primero para que la eliminación del workaround de T2 tenga un paquete real al que resolver) |
| LOC | +~50 / 0 (6 archivos NUEVOS solamente; sin ediciones) |
| TDD | Cambio estructural que causa el GREEN. Crear cada manifiesto según la forma de `design.md` §2 Archivo 1 / Archivos 4–6 textualmente: `{ "name": "@features/auth/shared", "version": "0.0.0", "private": true, "main": "./src/index.ts", "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }, "dependencies": { "zod": "4.4.3" } }` (equivalente de transactions con `name: "@features/transactions/shared"`). READMEs según `design.md` §2 Archivo 2 textualmente (racional arquitectónico de 5 líneas nombrando "shared Zod contracts" + propiedad de dependencia + guía del barrel). Barrels según `design.md` §2 Archivo 3 / Archivos 4–6 textualmente — barrel de auth `export * from "./schemas/forgot-password"; export * from "./schemas/login"; export * from "./schemas/register"; export * from "./schemas/reset-password"; export * from "./schemas/session-list";` (matchea los 5 esquemas de auth existentes), barrel de transactions `export * from "./schemas/category-create"; export * from "./schemas/category-update"; export * from "./schemas/create"; export * from "./schemas/list"; export * from "./schemas/update";` (matchea los 5 esquemas de transactions existentes). Cada barrel lleva el comentario de 2 líneas `// @features/<x>/shared — barrel re-export for the shared schema package. // See ADR 0011 (shared-as-workspace-packages).`. Verificar ANTES de commitear que `pnpm install` corra hasta completarse (materializa los symlinks del workspace); si el glob `libs/*/*/*` de `pnpm-workspace.yaml` NO matchea (según R3 / Q5 condicional), agregar las entradas explícitas `libs/features/auth/shared` + `libs/features/transactions/shared` primero y commitear esa edición del workspace en T1 (no en T2 — es un prerrequisito para que los manifiestos sean reconocidos). |
| Verificar | `pnpm install` MUST salir con 0 (sin conflictos de peer-dep; ambos paquetes nuevos aparecen en la salida de `pnpm list -r`). `pnpm --filter @features/auth/shared typecheck` MUST salir con 0. `pnpm --filter @features/transactions/shared typecheck` MUST salir con 0. `test -f libs/features/auth/shared/package.json && test -f libs/features/auth/shared/README.md && test -f libs/features/auth/shared/src/index.ts && test -f libs/features/transactions/shared/package.json && test -f libs/features/transactions/shared/README.md && test -f libs/features/transactions/shared/src/index.ts` MUST salir con 0 (G1.1). `grep -n 'name' libs/features/auth/shared/package.json libs/features/transactions/shared/package.json` MUST mostrar los dos nombres distintos (`@features/auth/shared`, `@features/transactions/shared`). `grep -nE 'zod' libs/features/auth/shared/package.json libs/features/transactions/shared/package.json` MUST mostrar `zod: 4.4.3` declarado bajo `dependencies` en cada uno (NO `devDependencies` según la mitigación de R2). El barrel de auth MUST exportar exactamente 5 módulos de esquema y el barrel de transactions MUST exportar exactamente 5 módulos de esquema (R3); cross-verify con `grep -cE '^export \* from' libs/features/auth/shared/src/index.ts` → `5` y lo mismo para transactions. |

---

### T2 — QUITAR el workaround `paths.zod` de AMBOS tsconfig de las apps + capturar el GREEN

| Campo | Valor |
|-------|-------|
| Commit | `fix(tsconfig): remove zod resolution workarounds (R5–R7)` |
| Archivos | `apps/api/tsconfig.json` (EDITAR, QUITAR entrada de 3 líneas de `paths.zod` + JSDoc de 4 líneas + limpieza de coma en el alias precedente), `apps/web/tsconfig.json` (EDITAR, QUITAR entrada de 1 línea de `paths.zod` + JSDoc de 11 líneas + limpieza de coma en el alias precedente) |
| Depende de | T1 (los paquetes del workspace deben existir antes de quitar el workaround, o los 11 importadores regresionan con TS2307) |
| LOC | ~0 / -9 en `apps/api/tsconfig.json`; ~0 / -12 en `apps/web/tsconfig.json` (neto -21 borrados, +0 agregados en los tsconfig) |
| TDD | Paso de OBSERVACIÓN DEL RESULTADO + gate de REFACTOR. La prueba-de-existencia del RED es estructural: con el workaround cargando con la responsabilidad, quitarlo era la única forma de saber que el `zod` directo realmente resuelve a través de los paquetes nuevos. Según AGENTS.md §4 la falla debe observarse; aquí la OBSERVACIÓN es el CRITERIO-DE-ÉXITO mismo — después de este commit, NINGUNO de los 11 importadores reporta TS2307 porque el `node_modules/zod` propio del paquete nuevo satisface el ancestor-walk. Editar `apps/api/tsconfig.json` para: (a) BORRAR el bloque de comentario JSDoc de 4 líneas inmediatamente arriba de `paths.zod` (la explicación de que `Node10 ancestor-walk cannot reach zod` porque el directorio shared huérfano no tiene package.json — líneas según el hunk de diff de `design.md` §2 Archivo 7), (b) BORRAR la entrada `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` dentro del bloque `paths`, (c) BORRAR la coma final después del alias `@shared-utils/*` precedente para que el JSON siga siendo válido. Editar `apps/web/tsconfig.json` análogamente según `design.md` §2 Archivo 8 (el JSDoc aquí es la variante más larga de 11 líneas — mismo contenido, prefijado con el comentario de decoración de imports). NO tocar ninguno de los 11 importadores (Q1 resolución: MANTENER relativo). NO tocar ninguna otra entrada de `paths`. NO agregar ni quitar otros aliases. |
| Verificar | `grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json` MUST retornar vacío (G3.1; análogo AC — ningún tsconfig puede retener ninguna referencia a `zod` después de este commit). `pnpm turbo run typecheck` MUST salir con 0 en todos los workspaces (sin TS2307 de ninguno de los 11 importadores — los 4 importadores de slice + los 2 archivos de test + las 5 forms; cubre R7). `pnpm turbo run build` MUST salir con 0 en todos los workspaces. `pnpm turbo run test bdd lint typecheck build` MUST salir con 0 (G5.1 / R8). `pnpm --filter api test` MUST mostrar `Tests 22 passed (22)` (baseline R9 preservado). `pnpm --filter web test` MUST mostrar `Tests 145 passed (145)` (baseline R9 preservado). `pnpm turbo run bdd` MUST mostrar `43/43` PASS (baseline R9 preservado). `pnpm lint:fixtures` MUST salir con 0 (G7.1; las fixtures del plugin de frontera se mantienen verdes según R5). El barrel en `libs/features/auth/shared/src/index.ts` MUST seguir resolviendo desde cada importador existente de path relativo (ningún path de importador fue reescrito). El workaround `pool: "forks"` del slice-7 PR-7 en `apps/web/vitest.config.ts:54-63` MUST quedar sin cambios. El hoist `vi.mock("next/navigation", …)` del PR #66 en `apps/web/__tests__/setup.ts` MUST quedar sin cambios. `git log feat/fix-orphan-shared-directories --pretty=format:"%B" \| grep -i "co-authored-by"` MUST retornar vacío (sin atribución de IA). |

---

### T3 — Crear ADR 0011 (EN + ES espejo) documentando la decisión arquitectónica

| Campo | Valor |
|-------|-------|
| Commit | `docs(adr): record shared workspace package boundary (R10)` |
| Archivos | `docs/architecture/decisions/0011-shared-as-workspace-packages.md` (NUEVO, EN, ~60–80 líneas), `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` (NUEVO, espejo ES, misma estructura — **según AGENTS.md §13 + precedente de `fix-web-vitest-crash` + `fix-api-nestjs-di`, el tasks.md NO se espeja; solo se espeja el ADR porque es documentación user-facing**) |
| Depende de | T2 (la decisión arquitectónica es la eliminación del workaround + el establecimiento de la frontera del paquete; le dice al lector POR QUÉ T2 fue correcto). T3 es independiente de T1 en términos de código pero acoplado a T2 en términos narrativos — aterrizarlo en su propio commit es la unidad de trabajo más limpia. |
| LOC | +~60-80 / 0 por ADR (×2 = ~120-160 neto) |
| TDD | N/A (commit solo de docs; no gate ninguna señal de test). El commit existe para que un futuro maintainer que abre el repositorio vea POR QUÉ `libs/features/<x>/shared/` es su propio paquete, POR QUÉ el `paths.zod` interno de pnpm se borró, y POR QUÉ se eligió la Forma A por sobre las Formas B y C de `explore.md`. Autorizar el ADR EN según el template de `docs/architecture/decisions/0008…`: title, Status (`Accepted · 2026-07-14`), Date (`2026-07-14`), Deciders (Sebastián Illa + executor de `sdd-tasks`), Context (la falla de resolución del `zod` directo dentro de los archivos de esquema, el workaround `paths.zod` duplicado en ambos tsconfig de las apps apuntando a internos de pnpm, la violación del principio de que el hoisting de pnpm es un detalle de implementación), Decision (Forma A: promover cada `shared/` a un paquete de primera clase del workspace con `package.json` declarando `zod@4.4.3` como `dependencies`; MANTENER los imports relativos según Q1; SIN tsconfig por paquete según Q2; AGREGAR un barrel `src/index.ts` según Q3; VERIFICAR primero que el glob `libs/*/*/*` de `pnpm-workspace.yaml` ya cubra ambos según Q5), Consequences (positivo: futuros directorios shared/ reciben el mismo tratamiento por default; el `zod` directo resuelve mediante el ancestor-walk normal de Node10; el tsconfig ya no depende del layout de hoisting de pnpm; negativo: cada árbol shared ahora carga con el costo de un paquete entero — un `package.json` extra; alternativas rechazadas: Shape B barrel shared por feature (introduce riesgo de import cross-slice) y Shape C fusión en server/ (viola la costura client/server)). Cross-link a `proposal.md`, `spec.md`, `design.md` en la sección References. Autorizar el espejo ES según AGENTS.md §13: traducción técnica literal al español en el mismo nombre de archivo exacto bajo `Documents-es/docs/architecture/decisions/`. Mismas secciones Status/Date/Deciders/Context/Decision/Consequences; los términos establecidos en inglés (ADR, package, barrel, workaround, `paths.zod`, `pnpm install`, `TypeScript`, `tsconfig`, Next.js, NestJS) quedan en inglés; vocabulario técnico traducido de forma neutra/profesional. |
| Verificar | `test -f docs/architecture/decisions/0011-shared-as-workspace-packages.md && test -f Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` MUST salir con 0 (R10). `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` MUST retornar vacío (AGENTS.md §13 — sin caracteres CJK en el espejo ES; chequeo de drift por auto-traducción). El ADR EN MUST contener el substring literal `Shape A` referenciando el enfoque elegido, el substring literal `paths.zod` referenciando el workaround eliminado, y el substring literal `0011` matcheando el número del ADR. El espejo ES MUST llevar el mismo literal `0011`, las mismas 6 secciones en wording equivalente en español (Estado, Fecha, Decisores, Contexto, Decisión, Consecuencias), y la misma lista de 6 archivos afectados al final (sin CJK). `git log feat/fix-orphan-shared-directories --pretty=format:"%B" \| grep -i "co-authored-by"` MUST retornar vacío (sin atribución de IA). `git diff --name-only develop..feat/fix-orphan-shared-directories` MUST ser exactamente los 10 archivos del inventario de `design.md` §2 (6 NUEVOS por T1 + 2 EDITADOS por T2 + 2 NUEVOS por T3) — sin extras, sin omisiones. |

---

## §3. Plan de PR (PR único)

**Título del PR**: `feat(workspace): convert libs/features/*/shared to proper workspace packages + remove tsconfig workaround`

**Branch**: `feat/fix-orphan-shared-directories` (cortado de `develop` en HEAD `efb9967`)

**Branch base**: `develop` (NO `main` — AGENTS.md §2)

**Estrategia de merge**: squash-merge al final del PR (estándar para fixes de PR único; preserva la historia de 3 commits en la descripción del PR mientras colapsa a un solo cambio revertible en `develop`). El cuerpo del PR MUST incluir una sección "Context" que nombre los dos directorios `shared/` huérfanos (`auth/shared` y `transactions/shared`), el workaround `paths.zod` duplicado en `apps/api/tsconfig.json` + `apps/web/tsconfig.json`, los comandos de verificación corridos, y las satisfy-conditions por R1–R11.

**Checklist pre-PR**:

- [ ] Los 3 commits aterrizan en orden en `feat/fix-orphan-shared-directories` (T1 → T2 → T3).
- [ ] Cada mensaje de commit es `type(scope): <subject>`, imperativo en presente, subject ≤72 chars, sin punto final.
- [ ] Sin trailers `Co-Authored-By` en ningún commit (AGENTS.md §6).
- [ ] `test -f libs/features/auth/shared/package.json && test -f libs/features/transactions/shared/package.json` sale con 0 (G1.1 — manifiestos existen).
- [ ] `grep -nE 'zod' libs/features/auth/shared/package.json libs/features/transactions/shared/package.json` muestra `zod: 4.4.3` bajo `dependencies` (NO `devDependencies`) en ambos (R1, R2).
- [ ] `pnpm install` sale con 0 (symlinks del workspace materializados; ambos paquetes reconocidos por pnpm — G2).
- [ ] `pnpm list -r | grep @features/auth/shared` y `pnpm list -r | grep @features/transactions/shared` muestran 1 hit cada uno (G2.1 / R4).
- [ ] `grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json` retorna cero hits (G3.1 / R5, R6 — ninguna referencia a `zod` queda en los tsconfig de las apps).
- [ ] Cada barrel re-exporta exactamente los esquemas existentes en ese directorio (5 + 5 = 10 re-exportaciones totales entre los 2 barrels; R3).
- [ ] `pnpm turbo run typecheck` sale con 0 — sin TS2307 de ninguno de los 11 importadores (R7).
- [ ] `pnpm turbo run test bdd lint typecheck build` sale con 0 (R8 / G5, G7).
- [ ] `pnpm --filter api test` muestra `Tests 22 passed (22)` (baseline R9 preservado).
- [ ] `pnpm --filter web test` muestra `Tests 145 passed (145)` (baseline R9 preservado).
- [ ] `pnpm turbo run bdd` sale con 0 con 43/43 PASS (baseline R9 preservado).
- [ ] `pnpm lint:fixtures` sale con 0 (R5 / G7 — las fixtures del plugin de frontera se mantienen verdes; no se requirió cambio de regla o fixture).
- [ ] `test -f docs/architecture/decisions/0011-shared-as-workspace-packages.md && test -f Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` sale con 0 (R10 — ADR existe en EN + ES).
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` retorna vacío (AGENTS.md §13 — sin CJK en el espejo ES).
- [ ] `git diff --stat develop..feat/fix-orphan-shared-directories` muestra ≤+50 / ≤-21 a través de los 10 archivos (matchea la estimación de ~30–50 LOC netas de proposal §4).
- [ ] `git diff --name-only develop..feat/fix-orphan-shared-directories -- 'apps/' 'libs/'` lista exactamente: `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `libs/features/auth/shared/package.json`, `libs/features/auth/shared/README.md`, `libs/features/auth/shared/src/index.ts`, `libs/features/transactions/shared/package.json`, `libs/features/transactions/shared/README.md`, `libs/features/transactions/shared/src/index.ts` (ningún archivo fuente en `apps/web/components/`, `apps/web/app/`, `apps/web/lib/`, `apps/api/src/`, o `libs/features/*/server/` fue editado — según la lista OOS de §7).
- [ ] `git log feat/fix-orphan-shared-directories --pretty=format:"%B" | grep -i "co-authored-by"` retorna vacío (sin atribución de IA).
- [ ] El `base` ref del PR es `develop` (NO `main`) — AGENTS.md §2.
- [ ] El cuerpo del PR incluye una sección "Context" que nombra los directorios `shared/` huérfanos y el workaround `paths.zod` eliminado.
- [ ] Los jobs de CI de GitHub Actions para tests de apps/web + tests de apps/api + BDD reportan `pass`.

---

## §4. Estrategia de entrega

- **Estrategia de entrega** (de `openspec/config.yaml`): `auto-chain` (auto-slicea en >400 LOC).
- **Estrategia efectiva de este cambio**: PR único. ~40 LOC netas (10 archivos tocados con ~30 agregadas + ~21 borradas en los tsconfig) queda muy por debajo del budget de 400; el trigger `auto-chain` NO se dispara.
- **No se recomiendan PRs encadenados** para `fix-orphan-shared-directories`.
- **Branch**: `feat/fix-orphan-shared-directories` cortado de `develop@efb9967` tras la señal "go" del usuario.
- **Revisor**: maintainer (Sebastián Illa). Correr `gentle-ai review start` después de que los 3 commits aterricen en la branch.
- **Perfil de riesgo**: 6 riesgos catalogados en `proposal.md` §7 + `design.md` §6 (R1–R6); todos tienen mitigaciones concretas ya ingenierizadas en las 3 tasks.

---

## §5. Orden de apply

1. **Crear branch** `feat/fix-orphan-shared-directories` off `develop@efb9967`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-orphan-shared-directories
   ```
2. **Aplicar los 3 commits** en orden strict-TDD según §2 arriba (T1 → T2 → T3). Cada commit aterriza ATÓMICAMENTE — nunca se parte, nunca se squashea mid-stream. Antes de que T1 commitee, doble-checkear que el glob existente de `pnpm-workspace.yaml` cubra los paquetes nuevos; si no, la edición del workspace va DENTRO del commit de T1 (es un prerrequisito estructural para que los manifiestos sean reconocidos).
3. **Correr la verificación turbo completa**:
   ```bash
   pnpm install                                                # materializa los symlinks del workspace
   pnpm list -r | grep -E '@features/(auth|transactions)/shared'   # MUST mostrar ambos paquetes nuevos
   pnpm --filter @features/auth/shared typecheck               # MUST salir con 0
   pnpm --filter @features/transactions/shared typecheck       # MUST salir con 0
   grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json # MUST estar vacío
   pnpm turbo run typecheck build                              # MUST salir con 0 (sin TS2307)
   pnpm turbo run test bdd lint typecheck build                # MUST salir con 0
   pnpm --filter api test                                      # MUST mostrar 22/22 PASS
   pnpm --filter web test                                      # MUST mostrar 145/145 PASS
   pnpm turbo run bdd                                          # MUST mostrar 43/43 PASS
   pnpm lint:fixtures                                          # MUST salir con 0
   ```
4. **Chequeo del ADR**:
   ```bash
   test -f docs/architecture/decisions/0011-shared-as-workspace-packages.md
   test -f Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md
   perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md   # MUST estar vacío
   ```
5. **Push de la branch**:
   ```bash
   git push -u origin feat/fix-orphan-shared-directories
   ```
6. **Abrir el PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-orphan-shared-directories \
     --title "feat(workspace): convert libs/features/*/shared to proper workspace packages + remove tsconfig workaround" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   El cuerpo del PR MUST incluir una sección "Context" según el checklist pre-PR de §3 que nombre los directorios `shared/` huérfanos y el workaround `paths.zod` eliminado.
7. **Esperar CI** (turbo + lint:fixtures + fixtures del boundary-plugin + jobs de GitHub Actions para tests de apps/web + tests de apps/api + BDD). Todos los jobs MUST reportar `pass`.
8. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-orphan-shared-directories   # tras aprobación del maintainer
   ```
9. **`sdd-verify` corre en `develop` post-merge** para confirmar que los directorios `shared/` empaquetados como workspace se mantienen estables, que el workaround `paths.zod` del tsconfig permanece eliminado, y que las baselines 22/22 + 145/145 + 43/43 se mantienen.
10. **`sdd-archive` mueve** `openspec/changes/fix-orphan-shared-directories/{proposal,spec,design,tasks,explore}.md` a `openspec/changes/archive/2026-07-14-fix-orphan-shared-directories/` según el protocolo de archive del orquestador.

---

## §6. Preguntas abiertas de diseño resueltas

- **Q1 (reescritura de importadores vs mantener relativo)**: **MANTENER relativo + aliases**. Resuelto en `proposal.md` §8 + `spec.md` §11. Ningún archivo en `apps/` o `libs/features/<x>/server/` se toca para paths de import.
- **Q2 (`tsconfig.json` por paquete)**: **SIN tsconfigs por paquete**. Resuelto en `proposal.md` §8 + `spec.md` §11 + `design.md` §7. El tsconfig base del monorepo cubre los paquetes nuevos; si un directorio shared futuro agrega código que no sea esquema o exports cross-paquete, el tsconfig por paquete puede agregarse ENTONCES.
- **Q3 (barrel `src/index.ts` extra)**: **SÍ, agregar el barrel**. Resuelto en `proposal.md` §8 + `spec.md` §11. El barrel re-exporta los 5 esquemas de auth o los 5 esquemas de transactions y le da al paquete un entrypoint canónico en `./src/index.ts`.
- **Q4 (ADR + espejo ES)**: **SÍ, agregar ADR 0011 EN + ES**. Resuelto en `proposal.md` §8 + `spec.md` §11 + `design.md` §8.
- **Q5 (edición de `pnpm-workspace.yaml`)**: **VERIFICAR PRIMERO; editar solo si el glob `libs/*/*/*` existente NO matchea**. Resuelto en `proposal.md` §8 + `spec.md` §11. La edición condicional del workspace va DENTRO de T1 si es necesaria.

**No quedan preguntas abiertas en la fase de tasks.** `sdd-apply` procede directamente con las 3 tasks de arriba.

---

## §7. Fuera de alcance (cambio completo)

(Espeja `spec.md` §4 + §10 + `proposal.md` §2 + AGENTS.md §11.)

1. Editar cualquiera de los 10 archivos fuente de esquemas (`libs/features/auth/shared/schemas/*.ts`, `libs/features/transactions/shared/schemas/*.ts`) — los schemas quedan byte-idénticos; solo cambia la frontera de paquete alrededor de ellos.
2. Modificar `libs/features/auth/server/package.json` o `libs/features/transactions/server/package.json` — la Forma A mantiene intactos los paquetes `server` existentes; la Forma C queda explícitamente rechazada.
3. Fusionar esquemas en los paquetes `server` (Forma C — rechazada por `explore.md` §6).
4. Modificar el esquema de env de `@core/config` o cualquier otro paquete de core.
5. Editar cualquiera de los 11 importadores de producción (Q1 resolución: MANTENER imports relativos y aliases existentes; sin churn de imports en el código fuente).
6. Agregar o quitar reglas de ESLint en `tools/eslint-plugin-boundary/` — las 5 reglas activas de frontera (`no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs`) quedan todas sin cambios.
7. Agregar `tsconfig.json` por paquete a cada nuevo paquete `shared/` (Q2 resolución: NO).
8. Agregar un barrel re-export a nivel de la capa `server` (`libs/features/<x>/server/src/index.ts`) — los barrels existentes apuntando a `../../shared/schemas/index.js` siguen funcionando.
9. Modificar la config de Vitest o cualquier harness de tests — los aliases existentes para `@features/auth/*` y `@features/transactions/shared/*` siguen resolviendo.
10. Agregar tests nuevos o decoraciones `.skip` / `.todo` / `.xfail` a la baseline 22 + 145 + 43.
11. Tocar `apps/web/__tests__/setup.ts` (el hoist del mock del PR #66 se queda como single source of truth para `next/navigation`).
12. Tocar `apps/web/vitest.config.ts` (el workaround `pool: "forks"` del slice-7 queda sin cambios).
13. Tocar `pnpm-workspace.yaml` SALVO que el glob `libs/*/*/*` existente falle en reconocer los paquetes nuevos (Q5 condicional).
14. Upgradear / downgradear cualquier dependencia de Next.js o NestJS.
15. Tocar cualquier commit de `fix-web-vitest-crash` (PR #66), `fix-api-nestjs-di` (PR #63), `fix-state-coverage-drift` (PR-pending), o `slice-8 closing BDD + docs` (slice-8 PR-2 auth split).
16. Tocar `openspec/changes/{fix-state-coverage-drift,slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
17. Un espejo en español de `tasks.md`, `proposal.md`, `spec.md`, `design.md`, o `explore.md` (según instrucción del orquestador + precedente de `fix-web-vitest-crash` + `fix-api-nestjs-di` — los spec/design/proposal del change folder son artefactos de coordinación entre fases SDD, no docs user-facing; solo el ADR user-facing se espeja según AGENTS.md §13).
18. Cualquier cosa de AGENTS.md §11 (i18n más allá de `en` + `es`, Sentry, rate-limiting de API, providers OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log, enforcement del gate de cobertura, migración de `gastos-personales/`, etc.).

---

## §8. Riesgos

(Espeja `proposal.md` §7 + `design.md` §6 R1–R6 con mitigaciones concretas a nivel de task.)

- **R1 (la forma `main`/`exports` del nuevo `package.json` no coincide con la ruta de resolución que esperan las apps)** — Medio. Mitigado por el mirror de T1: cada `main` es `./src/index.ts` y cada barrel re-exporta los módulos de esquema exactos. Verificación: `pnpm --filter @features/<x>/shared typecheck` focalizado sale con 0 + el `pnpm turbo run typecheck` completo sale con 0 sin TS2307.
- **R2 (pnpm hoisted `zod` de forma diferente a la esperada y una app se rompe)** — Bajo–Medio. Mitigado por T1: `zod@4.4.3` declarado como `dependencies` (NO `devDependencies`) para que aterrice en el `node_modules` propio del paquete y el ancestor-walk de Node10 lo resuelva directamente. Verificación: `pnpm turbo run test bdd lint typecheck build` completo sale con 0 (G5.1).
- **R3 (el glob del workspace no levanta los paquetes nuevos, dejando pnpm fuera de sync)** — Bajo. Mitigado por la condicional de T1: `pnpm list -r | grep @features/<x>/shared` prueba el reconocimiento; si el glob `libs/*/*/*` existente falla, la edición explícita de `pnpm-workspace.yaml` va dentro de T1 como commit prerrequisito (no T2). Verificación: G2.1 / R4.
- **R4 (drift de tsconfig por paquete)** — Bajo. Mitigado por la resolución de Q2: NO se agrega ningún tsconfig por paquete en este PR. Verificación: `find libs/features/auth/shared libs/features/transactions/shared -name tsconfig.json` retorna cero hits.
- **R5 (las fixtures de las reglas de frontera regresionan porque referencian el mapping viejo de `paths.zod`)** — Bajo. Mitigado por la verificación de T2: `pnpm lint:fixtures` sale con 0; no se planea ninguna edición de fixture. Verificación: G7.1.
- **R6 (aparece un issue de resolución latente cuando se quita el workaround)** — Bajo. Mitigado por T2: `pnpm turbo run typecheck build` focalizado señala qué importador (si alguno) regresionó; los paths de importadores quedan sin cambios, así que una regresión se triaguaría en el mismo PR o se separaría según la política de PRs. Verificación: T2 verify.

---

## §9. Pronóstico de carga de revisión

| Campo | Valor |
|-------|-------|
| **Líneas estimadas cambiadas** | ~40 LOC netas (10 archivos tocados; 6 NUEVOS + 2 EDITAR + 2 NUEVOS ADR) |
| **Riesgo de budget de 400 líneas** | Bajo (~40 << 400; ~10% del budget usado) |
| **PRs encadenados recomendados** | No |
| **Estrategia de entrega** | `auto-chain` (default del proyecto); trigger de auto-chain NO disparado (~40 < 400) |
| **Estrategia efectiva** | single-pr |
| **Racional del PR único** | ~40 LOC netas bien por debajo de 400; un PR mantiene la historia coherente (paquetes del workspace primero → eliminación del workaround segundo → ADR tercero) y matchea la invariante de 3 commits atómicos del design §4 |
| **Decisión necesaria antes de apply** | No (sin trigger de `ask-on-risk`; los 6 riesgos tienen mitigaciones concretas ya ingenierizadas en las 3 tasks) |
| **Estrategia de chain** | n/a (camino de PR único) |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: No
Estrategia de chain: n/a
Riesgo de budget de 400 líneas: Bajo

---

## §10. Estado

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1–R6 (mitigaciones concretas embebidas en las 3 tasks de arriba)

`next_recommended`: **`apply`** — el orquestador crea `feat/fix-orphan-shared-directories` off `develop@efb9967` y aplica las 3 tasks de §2 secuencialmente.

---

## Cross-references

- **Propuesta**: `openspec/changes/fix-orphan-shared-directories/proposal.md` (Engram `#2384`)
- **Spec**: `openspec/changes/fix-orphan-shared-directories/spec.md` (Engram `#2385`; 7 objetivos, 11 requerimientos, 7 escenarios)
- **Diseño**: `openspec/changes/fix-orphan-shared-directories/design.md` (Engram `#2386`; 10 archivos tocados, 3 commits atómicos, 10 secciones, threat matrix N/A — sin cambios de routing/subprocess/automatización-VCS/clasificación-de-ejecutables/integración-de-procesos)
- **Explore brief**: `openspec/changes/fix-orphan-shared-directories/explore.md` (Engram `#2382`; 3 formas comparadas, Forma A seleccionada)
- **Precedentes hermanos**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/tasks.md` (PR #66, forma de 2 tasks), `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/tasks.md` (forma de 2 tasks, mismo hybrid-store + auto-mode), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (8 tasks, 10 secciones)
- **Convenciones del proyecto**: AGENTS.md §1 (stack), §2 (modelo de branch — `main` inmutable, cortar de `develop`), §4 (strict TDD — RED es el TS2307 que aparecería si el workaround se quita antes de que el paquete exista, sin archivo de test nuevo), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — `no-schemas-outside-shared` queda sin modificar; los esquemas siguen bajo `libs/features/<x>/shared/schemas/`), §8 (fuente única de verdad — la metadata del paquete del workspace es la nueva SoT para la propiedad de `zod`), §9 (UI completa, no scaffold — N/A, sin UI), §10 (testing — vitest colocado, baseline 22/22 + 145/145 + 43/43 PRESERVADO sin cambios según R9), §11 (lista out-of-scope), §13 (espejo en español — solo se espeja el ADR, NO el tasks.md; según instrucción del orquestador + precedente hermano)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- **Paquetes workspace hermanos (forma de referencia para `main`/`scripts`/`dependencies`)**: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json` — NO modificados por este cambio según OOS #2
- **Baseline (PRESERVADO sin cambios)**:
  - `apps/web/__tests__/setup.ts` (hoist `vi.mock("next/navigation", …)` del PR #66)
  - `apps/web/vitest.config.ts:54-63` (`pool: "forks"` del slice-7 + `poolOptions: { forks: { singleFork: true } }`)
  - `apps/web/messages/en.json` y `apps/web/messages/es.json` (ya correctamente anidados)
  - `tools/eslint-plugin-boundary/` (5 reglas activas se quedan; no se agrega ninguna regla nueva)
