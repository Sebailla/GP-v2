# Propuesta: Endurecimiento de producción del módulo 5

## Intención

M5 cierra las ocho advertencias de productionización diferidas al informe de verificación de M4 y conecta el objetivo de cobertura del 60 %, que permaneció como informativo durante M1–M4. La entrega es vertical: comportamiento del servidor de autenticación, concurrencia de RBAC, rendimiento de validación de sesiones, métricas, comportamiento de la UI de auditoría, documentación operativa, i18n, pruebas y el espejo obligatorio en español. Los encabezados de seguridad, la rotación de secretos y las demás exclusiones de §11 de AGENTS.md permanecen sin cambios.

## Alcance

### Incluido
- Elevar el costo de bcrypt de 10 a 12 con override configurable por entorno.
- Proteger la invariantes del último administrador en `changeRole` mediante escalamiento Serializable y pruebas.
- Optimizar el circuito de sesiones con memoización o procesamiento por lotes.
- Conectar y hacer cumplir los cuatro umbrales de cobertura del 60 % en Turbo; agregar contadores a `/metrics`.
- Limitar silenciosamente `limit` de auditoría a 200; corregir rutas/patrón grep del runbook; renombrar el encabezado de UI a “HMAC”.

### Excluido
- Encabezados de seguridad (HSTS, CSP), rotación/gestor de secretos y configuración CDN.
- Eliminación de cuentas, exportación de datos, UI de sesiones para no administradores, proveedores OAuth adicionales, i18n más allá de en/es y Sentry.

## Capacidades

### Capacidades nuevas
- `observability`: contadores estructurados de autenticación, administración y sesiones expuestos mediante `/metrics`.

### Capacidades modificadas
- `auth-server-surface`: contrato de costo bcrypt de producción y contadores de observabilidad.
- `rbac-admin`: protección Serializable para cambios de rol concurrentes.
- `audit-log-ui`: `limit > 200` se limita silenciosamente en lugar de rechazarse.

## Enfoque

Cinco PR encadenados, cada uno de ≤400 LOC: (1) configuración de bcrypt y pruebas; (2) corrección Serializable de la carrera F2 y pruebas concurrentes; (3) optimización del circuito y pruebas; (4) enforcement de cobertura en Turbo más métricas (riesgo de alcance señalado); (5) límite, runbook, renombre HMAC, gates finales y espejo español. Seguir RED → GREEN → TRIANGULATE → REFACTOR y mantener cada slice atómico.

## Áreas afectadas

| Área | Impacto |
|---|---|
| `libs/features/auth/server/src/{constants,rbac-service,session-service}.ts` | Endurecer autenticación, RBAC y sesiones |
| `turbo.json`, `libs/core/logging/` | Gate de cobertura y métricas |
| `apps/api/src/modules/auth/admin.controller.ts` | Limitar el límite de auditoría |
| `docs/operations/audit-retention-runbook.md`, `apps/web/messages/{en,es}.json` | Documentación y etiqueta HMAC |
| `openspec/specs/{auth-server-surface,rbac-admin,audit-log-ui,observability}/spec.md` | Actualizar contratos y crear una especificación completa |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Enforcement de cobertura cambia el contrato de AGENTS.md §10 | Alta | Confirmar antes de apply; desactivar el gate si se rechaza |
| Observabilidad contradice el fuera de alcance de §11 | Alta | Escalar la interpretación del alcance antes de apply |
| bcrypt 12 aumenta la latencia de login | Media | Medir en staging; usar variable override |
| Reintentos/errores Serializable bajo contención | Media | Probar concurrencia y documentar reintentos |
| Paquetes individuales bajo 60 % | Media | Usar umbrales por paquete en vez de un agregado artificial |

## Plan de rollback

Revertir cada PR encadenado de forma independiente. Reducir bcrypt mediante `BCRYPT_COST_FACTOR_OVERRIDE`; desactivar el gate con `coverage.disabled=true`; revertir el clamp a rechazo 400 y retirar el cableado de métricas sin tocar el comportamiento previo de M1–M4.

## Dependencias

`BCRYPT_COST_FACTOR_OVERRIDE`, `coverage.disabled` y los cuatro ajustes de umbral al 60 %; la configuración existente de autenticación/base de datos continúa siendo necesaria.

## Criterios de éxito

- `pnpm turbo run build lint typecheck test bdd` pasa; los informes cumplen ≥60 % en líneas, ramas, funciones y sentencias.
- Se verifican concurrencia de demociones, costo bcrypt, circuito, métricas, clamp y HMAC; la auditoría axe de administración no tiene hallazgos serious/critical.
- Los cinco PR permanecen dentro del presupuesto de revisión de 400 LOC y cada documento inglés tiene un espejo español limpio.
