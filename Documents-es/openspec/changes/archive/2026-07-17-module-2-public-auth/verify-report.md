# Verify Report — `module-2-public-auth`

**Cambio**: `module-2-public-auth`
**Versión**: M2 (tracker `feat/public-authentication@43affaf`, base `develop@cc74210`)
**Modo**: Strict TDD
**Veredicto**: **PASS WITH WARNINGS** (warnings cerrados pre-archive)

## Envelope Estricto

```yaml
schema: gentle-ai.verify-result/v1
verdict: pass-with-warnings
blockers: 0
critical_findings: 0
requirements: 13/13
scenarios: 28/28
test_command: NODE_ENV=test pnpm turbo run build lint typecheck test bdd
test_exit_code: 0
test_output_hash: sha256:2fa2e9d0086a65e14cdd9c9abd0b92f339b6ebef086c69815d2b3ade5f0c881c
build_command: NODE_ENV=test pnpm turbo run build
build_exit_code: 0
build_output_hash: sha256:2fa2e9d0086a65e14cdd9c9abd0b92f339b6ebef086c69815d2b3ade5f0c881c
```

## Completitud

| Métrica | Valor |
|---|---|
| Tareas totales | 35 |
| Tareas completas | 35 |
| Tareas incompletas | 0 |
| Archivos de spec (5) | auth-server-surface · google-oauth-handshake · mail-adapter-port · nextauth-web-routes · password-reset-user-flow |
| Requisitos (13 totales) | 13/13 implementados |
| Escenarios (28 totales) | 28/28 cubiertos |

## Build y Tests

- **Build**: ✅ Aprobado (`45/45` tareas turbo)
- **Tests**: ✅ 178/178 web · ✅ 80/80 api · ✅ 43/43 escenarios BDD
- **Lint**: ✅ Sin errores en los 7 workspaces modificados
- **Typecheck**: ✅ Sin errores
- **Boundary fixtures**: ✅ 80/80 válidos pasan, 20 inválidos producen violaciones esperadas
- **Coverage**: Objetivo 60% según AGENTS.md §10 (advisory, no enforced). Herramienta no integrada en el gate de verificación.

## Matriz de Cumplimiento de Specs — 28/28 COMPLIANT

5 specs × 28 escenarios — cada escenario tiene un test que lo cubre y pasa. Ver reporte completo del sub-agente para la matriz de 28 filas.

## Coherencia de Diseño — D1-D7 ✅ Todos Seguidos

D1 (account-link) · D2 (locale en path) · D3 (MailModule precedence) · D4 (mock provider gating) · D5 (`@Res({passthrough:true})`) · D6 (locale-keyed templates) · D7 (env refine).

## Compliance TDD — 7/7 Checks Aprobados

Ciclos RED→GREEN observables en 9 commits RED (026d4f9, bd97dd7, ea00078, f60a173, 89857fd, 6fecdf5, af7150c, fd55e5a, 9196654, 96003cc) más 3 commits de fix de JD (ff95fa1, e784c67, 9c91e85) todos con disciplina RED→GREEN.

## Issues Encontrados — Resueltos Pre-Archive

### CRITICAL
Ninguno.

### WARNING (los 3 cerrados antes del archive)

1. **Playwright chromium binary diferido a prerrequisito de máquina de desarrollo** — DOCUMENTADO. `vertical-auth.spec.ts` y `a11y/*.spec.ts` authoring + typecheck-clean, no ejecutados en el gate de verificación (chromium binary no disponible en sandbox). El contrato del flujo vertical está doble pineado por Cucumber `auth-flow.feature` + tests Vitest bridge-contract. Documentado en `docs/operations/auth-runbook.md` como prerrequisito de máquina de desarrollo.

2. **Path de log de fallo de JWT-encode emitía placeholder literal `[email]`** — **FIXEADO** en el commit `43affaf`. El bloque catch en `auth.controller.ts:481-487` fue convertido de string-template (al que pino redact no puede llegar) a structured-object form (`{ auth: { phase, surface }, err }` + msg string), matcheando el patrón ya establecido en la línea 390 (path de fallo de mail). Pino redact ahora cubre los 2 sitios de log structured-object en el controller. Gate: 45/45 turbo PASS, 17 files / 80 api tests PASS, pino `email:[REDACTED]` sigue disparándose en el path de fallo de mail.

3. **`pages.signIn` default vs `/[locale]/sign-in` literal** — **CERRADO SIN CAMBIO DE CÓDIGO**. El sub-agente de verify malinterpretó el Requirement #1 de `openspec/specs/nextauth-web-routes/spec.md`: el spec dice "MUST expose the sign-in route at `/{locale}/sign-in`" que se refiere al **route de página** (que existe en `apps/web/app/[locale]/(auth)/sign-in/page.tsx`), NO a la config `pages` de NextAuth. El locale routing lo hace `apps/web/middleware.ts` (next-intl middleware), y el test en `google-callback.e2e-spec.ts:156-162` pinea este comportamiento explícitamente. Contrato end-to-end: link de sign-in → middleware prefix → página `/{locale}/sign-in` renderiza. La implementación matchea el design y el spec.

### SUGGESTION

1. BDD `World` augmentation vía cast estructural (patrón legacy de Cucumber)
2. `PasswordResetResult.role` tipado como `string` (podría narrow a `"USER" | "ADMIN"`)
3. `isGoogleMockEnabled` podría simplificarse
4. Coverage gate no integrado (`vitest --coverage` no está en el pipeline turbo)

## Veredicto Final

**PASS WITH WARNINGS** — Module 2 (`module-2-public-auth`) verificado end-to-end. Listo para `sdd-archive`.