# Especificación de Observabilidad

## Propósito

Define la superficie de observabilidad de la API: un endpoint `/metrics` compatible con Prometheus, los contadores de auth/admin/sesión expuestos a través de él, y el gate de cobertura de test-infrastructure que enforce los umbrales del 60% declarados en `openspec/config.yaml`.

## Requisitos

### Requirement: Endpoint de métricas Prometheus

El sistema DEBE exponer `GET /metrics` retornando métricas en formato text-compatible con Prometheus. El endpoint DEBE ser servido por el módulo de metrics existente (según M1 R-PF-9) y NO DEBE requerir autenticación (los operadores lo scrapean desde la infraestructura de monitoreo fuera de la superficie de auth de usuario). La respuesta DEBE incluir: métricas de proceso (defaults de Node.js — memoria, GC, lag del event-loop), métricas HTTP (request count, latencia, status codes), contadores de auth definidos en la spec `auth-server-surface` bajo "Métricas de observabilidad para operaciones de auth", y logs estructurados pino a nivel INFO con campos estructurados. Los valores de labels NO DEBEN llevar emails, userIds, IPs u otra PII.

#### Scenario: Scrape de métricas retorna 200

- GIVEN la API está corriendo
- WHEN un scraper ejecuta `GET /metrics`
- THEN retorna 200 con `text/plain` en formato de exposición Prometheus

#### Scenario: Counter de auth presente tras login

- GIVEN un admin completa un login exitoso
- WHEN un scraper de métricas lee `GET /metrics`
- THEN el body incluye la línea `auth_login_success_total{email_domain="<dominio>"} 1`

#### Scenario: Métricas de proceso presentes

- GIVEN la API está corriendo
- WHEN un scraper lee `GET /metrics`
- THEN el body incluye entradas `process_*` (memoria, GC, lag del event-loop)

#### Scenario: Privacidad — sin PII en valores de label

- GIVEN cualquier operación de auth o admin completa
- WHEN un scraper lee `GET /metrics`
- THEN ningún valor de label contiene `@`, ninguna label se llama `ip_address`, y ninguna label lleva un UUID de userId raw

### Requirement: Enforcement del coverage gate

El pipeline `pnpm turbo run test` DEBE enforce umbrales de cobertura por paquete: lines ≥ 60%, branches ≥ 60%, functions ≥ 60%, statements ≥ 60%. Los umbrales están declarados en `openspec/config.yaml` bajo `coverage_threshold`. Una caída de cobertura por debajo de cualquier umbral DEBE fallar la task `test` de turbo. El gate DEBE ser opt-out vía env var `coverage.disabled=true` (para branches experimentales donde la cobertura aún no alcanza el target). La cobertura DEBE medirse por paquete vía `@vitest/coverage-v8`.

#### Scenario: Cobertura por encima del umbral — gate pasa

- GIVEN un paquete con cobertura ≥ 60% en lines, branches, functions, statements
- WHEN corre `pnpm turbo run test`
- THEN la task `test` de turbo sale con código 0

#### Scenario: Cobertura por debajo del umbral — gate falla

- GIVEN un paquete con 50% de cobertura en lines (por debajo del 60%)
- WHEN corre `pnpm turbo run test`
- THEN la task `test` de turbo sale con código distinto de 0 y un reporte de cobertura que identifica al paquete bajo el umbral

#### Scenario: Opt-out de cobertura

- GIVEN `coverage.disabled=true` en el entorno
- WHEN corre `pnpm turbo run test` (incluso si la cobertura está bajo umbral)
- THEN la task `test` de turbo sale con código 0 y el paquete bajo umbral se reporta como warning, no como falla

### Requirement: Enforcement del exit code por umbral de cobertura (M5.1)

El sistema DEBE enforce umbrales de cobertura por paquete vía el exit code del proceso de Vitest. Cuando una corrida de `@vitest/coverage-v8` finaliza y la cobertura de cualquier paquete cae por debajo del 60% (lines, branches, functions, statements), la task turbo `test --coverage` DEBE salir con código distinto de 0 — incluso cuando todos los tests pasen. El enforcement funciona vía el threshold-vs-exit nativo de Vitest (v4.2+) o, como fallback, vía un script post-coverage (`tools/coverage-validator.ts`) que parsea `coverage/coverage-summary.json`. El método elegido DEBE estar documentado en el runbook. El escape hatch `coverage.disabled=true` DEBE bypassear el gate (contrato M5).

#### Scenario: Todos los paquetes ≥ 60% — la corrida de coverage pasa

- GIVEN todos los paquetes del workspace reportan ≥ 60% en lines, branches, functions, statements
- WHEN corre `pnpm turbo run test --coverage`
- THEN la task turbo sale con código 0 sin errores de cobertura

#### Scenario: Un paquete forzado bajo 60% — la corrida de coverage falla

- GIVEN un único paquete del workspace es forzado a 50% de cobertura en lines
- WHEN corre `pnpm turbo run test --coverage`
- THEN la task turbo sale con código distinto de 0 con un mensaje de error que nombra al paquete fallido y su porcentaje medido

#### Scenario: Bypass vía `coverage.disabled=true`

- GIVEN `coverage.disabled=true` está seteado en el entorno
- WHEN corre `pnpm turbo run test --coverage` (incluso con un paquete bajo umbral)
- THEN la task turbo sale con código 0 y el paquete bajo umbral se reporta como warning

#### Scenario: Paquete nuevo con cobertura cero — la corrida de coverage falla

- GIVEN se agrega un paquete nuevo al workspace sin archivos de test (0% de cobertura)
- WHEN corre `pnpm turbo run test --coverage`
- THEN la task turbo sale con código distinto de 0, forzando al equipo a agregar tests antes de mergear

#### Scenario: Vitest v4.1.x sin validador custom — degradación elegante

- GIVEN el proyecto está en Vitest v4.1.x AND `tools/coverage-validator.ts` no está presente
- WHEN corre `pnpm turbo run test --coverage`
- THEN se loguea un warning claro en la salida de CI y la task turbo sale con código 0 (gate no enforceado, gap visible)

### Requirement: Estabilidad de timing de bcrypt cost-12 (M5.1)

El sistema DEBE ejecutar el probe de timing de bcrypt cost-12 dentro de un budget de 1500 ms cuando el probe corre bajo instrumentación de coverage (carga de CPU + instrumentación de v8). El probe DEBE loguear el tiempo elapsed real a la salida del test runner para que los logs de CI expongan regresiones reales de performance. El budget de 1500 ms reemplaza al default M5 de 500 ms SOLO para el caso bajo coverage; el budget de 500 ms sigue siendo la spec para simulaciones de deploy a producción (sin overhead de instrumentación). El budget más ancho es un fix de estabilidad, no una relajación del estándar de seguridad.

#### Scenario: Bcrypt cost-12 completa dentro de 1500 ms bajo coverage

- GIVEN un usuario hace login con una contraseña hasheada con bcrypt a cost factor 12
- WHEN el test de auth-hash corre bajo instrumentación de coverage de Vitest
- THEN el login completa dentro de 1500 ms y el test pasa

#### Scenario: Tiempo elapsed expuesto a los logs de CI

- GIVEN el probe de timing de bcrypt cost-12 corre bajo instrumentación de coverage
- WHEN la suite de tests finaliza
- THEN los logs de CI incluyen una línea `bcrypt cost-12: <elapsed> ms` registrando el tiempo medido

#### Scenario: Simulación de producción mantiene el budget M5 de 500 ms

- GIVEN una corrida de tests separada que simula condiciones de producción (sin instrumentación de coverage)
- WHEN el probe de timing de bcrypt cost-12 se ejecuta
- THEN aplica el budget default M5 de 500 ms y una regresión a > 500 ms se marca como falla

#### Scenario: Override de cost-14 se mantiene dentro del budget ampliado

- GIVEN un usuario hace login con una contraseña hasheada con bcrypt al override de test cost-14
- WHEN el test de auth-hash corre bajo instrumentación de coverage
- THEN el login completa dentro de 1500 ms y el test pasa

## Procedencia

Introducido por: module-5-production-hardening, 2026-07-20; coverage gate wireado (umbral 60% por paquete). Extendido por: module-5.1-coverage-hardening, 2026-07-26 (2 requirements NUEVOS: Enforcement del exit code por umbral de cobertura + Estabilidad de timing de bcrypt).
