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

## Procedencia

Introducido por: module-5-production-hardening, 2026-07-20; fundación desde el endpoint de métricas de M1 R-PF-9.
