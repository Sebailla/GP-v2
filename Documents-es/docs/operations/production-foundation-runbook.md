# Runbook — `production-foundation`

**Fecha**: 2026-07-15
**Proyecto**: `gastos-personales-reference`
**Módulo**: 1 — Fundación de Producción

Espejo en inglés: `docs/operations/production-foundation-runbook.md`.

---

## 1. Suspensión del free tier

Las máquinas gratuitas de Fly.io pueden detenerse tras inactividad prolongada. Para recuperar:

1. Abrir el dashboard de Fly.io.
2. Seleccionar la app `gastos-api`.
3. Pulsar "Start machine" en el proceso de la API.
4. Esperar a que `/healthz` devuelva 200.
5. Correr el proyecto Playwright `smoke` para confirmar la funcionalidad completa.

Para evitar suspensiones futuras, configurar un pinger externo de baja frecuencia (UptimeRobot free tier ya lo incluye) que pegue contra la URL pública cada 5 minutos.

## 2. Verificación diaria del backup

Cada mañana a las 09:00 UTC la persona operadora DEBE verificar el último backup:

```bash
curl -s https://<staging-api>/status | jq .lastBackupAt, .lastBackupStatus
```

Esperado:

- `lastBackupAt` dentro de las últimas 26 horas.
- `lastBackupStatus: "ok"`.

Si algo falla, correr el backup manualmente:

```bash
pnpm turbo run backup --filter=@core/database
```

## 3. Restore drill

Correr al menos una vez por mes:

```bash
pnpm turbo run restore-drill --filter=@core/database
```

El script:

1. Crea la base `gastos_restore_drill`.
2. Restaura el dump más reciente desde R2.
3. Cuenta usuarios, transacciones y categorías.
4. Elimina la base de drill.

Un exit code distinto de cero indica falla; revisar los logs en `apps/api/logs/restore-drill.log`.

## 4. Migración a un dominio propio

1. Comprar el dominio.
2. Actualizar `PUBLIC_WEB_URL` y `PUBLIC_API_URL`.
3. Agregar el dominio en Vercel.
4. Actualizar las redirect URIs de Google OAuth (Módulo 2).
5. Actualizar los remitentes permitidos del App Password de Gmail si corresponde.
6. Re-correr los smoke tests.

No hace falta tocar código; la URL está centralizada.

## 5. Migración a proveedores pagos

Cada pieza externa vive detrás de una interfaz o variable de entorno:

- Web → cambiar el proyecto Vercel por cualquier host Next.js.
- API → mover la imagen Docker a Render / Fly pago / AWS / GCP.
- Postgres → cambiar `DATABASE_URL`.
- Rate limit → reemplazar `@upstash/ratelimit` por un limiter sobre Postgres.
- Almacenamiento de objetos → cambiar `BACKUP_DSN`.
- Email → reemplazar `MailAdapter` por Resend / SES.
- Uptime monitor → migrar de UptimeRobot a BetterStack o autoalojado.

## 6. Rotación de credenciales de Gmail

1. Iniciar sesión en la cuenta Gmail dedicada.
2. Visitar <https://myaccount.google.com/apppasswords>.
3. Revocar el App Password anterior.
4. Generar uno nuevo.
5. Actualizar `MAIL_DSN` en el host de la API.
6. Reiniciar el proceso de la API.
7. Verificar con `pnpm turbo run mail:test`.

## 7. Reconfiguración del store de rate limit

Al migrar desde Upstash:

1. Aprovisionar el nuevo store (por ejemplo token bucket sobre Postgres).
2. Implementar un nuevo adaptador en `libs/core/rate-limit/src/`.
3. Actualizar los bindings de DI en `apps/api/src/modules/auth/auth.module.ts` y `apps/api/src/modules/transactions/transactions.module.ts`.
4. Eliminar las variables de entorno de Upstash.
5. Correr la suite e2e de rate limit para verificar el comportamiento.

## 8. Recuperación ante desastre

Si staging y el destino de backup quedan inaccesibles:

1. Adquirir un nuevo proveedor Postgres (un free tier alcanza).
2. Restaurar desde el dump más reciente disponible en cualquier copia local del bucket R2 que tenga la operadora.
3. Repuntear `DATABASE_URL`.
4. Correr migraciones contra el esquema restaurado.
5. Repetir la suite Playwright `smoke`.

Si no hay backup disponible, la aplicación se reconstruye desde cero y el evento se registra como incidente de seguridad en el audit log (Módulo 3).