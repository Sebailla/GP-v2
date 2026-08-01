# Propuesta: Módulo 4 Privacidad

## Intención

M4 entrega la superficie de privacidad diferida desde M3: visualización administrativa del registro de auditoría y su retención, además de `Session.lastActiveAt` para reemplazar el ordenamiento aproximado por `expires`. La entrega es vertical y completa: API, UI localizada y accesible, pruebas, especificaciones y runbook.

## Alcance

### Incluido
- API de auditoría filtrada y paginada, y UI en `/[locale]/(app)/admin/audit/`.
- Purga de retención con dry-run inicial, controlada por `AUDIT_RETENTION_DAYS` (90 por defecto; `0` deshabilita).
- `Session.lastActiveAt` nullable, actualización al validar y proyección completa de sesión.

### Excluido
- Eliminación de cuenta, exportación de datos, UI de sesiones para no administradores y E2E real contra Google OAuth.
- Migración del costo de bcrypt, observabilidad y hardening general de producción.

## Capacidades

### Capacidades nuevas
- `audit-log-ui`: los administradores leen filas de `AdminAuditEvent` filtradas por actor, objetivo, acción, rango de fechas y paginación; la retención admite dry-run y purga; la UI vive en `/[locale]/(app)/admin/audit/`.

### Capacidades modificadas
- `auth-server-surface`: `Session List by User` devuelve `id`, `userId`, `createdAt`, `lastActiveAt`, `userAgent`, `ipAddress`; la validación de sesión actualiza `lastActiveAt` y los listados se ordenan de forma descendente por ese campo.

## Enfoque

| PR | Unidad vertical de trabajo (≤400 LOC) |
|---|---|
| 1 | Agregar `lastActiveAt` nullable e índice; actualizar y limitar escrituras de validación (60 s), proyección y ordenamiento del listado, pruebas y especificación. |
| 2 | Agregar schemas compartidos de consulta/cuerpo, `GET /admin/audit` protegido y limitado, `POST /admin/audit/purge` con dry-run inicial, consultas de auditoría y server component de página. |
| 3 | Agregar `AuditLogTable`, cinco estados de UI, mensajes EN/ES, BDD, Playwright y controles axe. |
| 4 | Agregar runbook de retención y espejo en español; ejecutar gates finales y recorrido en staging. |

## Áreas afectadas

| Área | Impacto |
|---|---|
| `libs/core/database/prisma/schema.prisma` | Columna/índice de sesión; migración aditiva |
| `libs/features/auth/{server,shared,docs}` | Servicios de sesión/auditoría, schemas y errores tipados, BDD |
| `apps/api/src/modules/auth/admin.controller.ts` | Endpoints de auditoría protegidos |
| `apps/web/{app/[locale]/(app)/admin/audit,components/admin,messages,e2e}` | Superficie de auditoría localizada y accesible |
| `openspec/specs/{auth-server-surface,audit-log-ui}/spec.md` | Capacidad modificada/nueva |
| `docs/operations/audit-retention-runbook.md` | Operaciones; todos los documentos se reflejan en `Documents-es/` |

## Riesgos

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Eliminación de filas recientes | Alto | Dry-run por defecto; `0` deshabilita; corte indexado; revisión del operador |
| Escritura en ruta crítica de validación | Medio | Límite de escritura por sesión de 60 s; backfill opcional por lotes |
| Escaneo amplio de auditoría | Medio | Límites/paginación obligatorios; índice `createdAt` existente |
| Pendientes de bcrypt, navegador y rotación HMAC | Bajo | Diferir bcrypt; E2E por operador; documentar impacto de rotación |

## Plan de rollback

Revertir cada PR de forma independiente. Deshabilitar la purga con `AUDIT_RETENTION_DAYS=0`. `lastActiveAt` nullable no requiere backfill ni rollback destructivo.

## Dependencias

- Migración Prisma aditiva; `JWT_SECRET` existente.
- Nueva variable numérica `AUDIT_RETENTION_DAYS`, 90 por defecto.

## Criterios de éxito

- `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` y `NODE_ENV=test pnpm lint:fixtures` pasan después de cada PR.
- BDD cubre filtros por actor/fecha, dry-run y purga; Playwright EN/ES cubre renderizado/filtro; axe informa cero problemas serios/críticos.
- El runbook en staging demuestra conteo dry-run, eliminación real y visualización administrativa de una fila `REVOKE_SESSION` filtrada.
