# Runbook — `production-foundation`

**Fecha**: 2026-07-15
**Proyecto**: `gastos-personales-reference`
**Módulo**: 1 — Fundación de Producción

## 1. Suspensión del free tier

Las máquinas gratuitas de Fly.io pueden detenerse tras una inactividad prolongada. Para recuperar:

1. Abrir el dashboard de Fly.io.
2. Seleccionar la app `gastos-api`.
3. Pulsar "Start machine" en el proceso de la API.
4. Esperar a que `/healthz` devuelva 200.
5. Ejecutar el proyecto Playwright `smoke` contra la URL web de staging.

Para evitar futuras suspensiones, configurar un pinger externo de baja frecuencia
(el free tier de UptimeRobot) que consulte la URL pública cada 5 minutos.

## 2. Verificación diaria del backup

Cada mañana a las 09:00 UTC la persona operadora DEBE verificar el último backup:

```bash
curl -s https://<staging-api>/status | jq .lastBackupAt, .lastBackupStatus
```

Esperado:
- `lastBackupAt` dentro de las últimas 26 horas.
- `lastBackupStatus: "ok"`.

Si algo falla, ejecutar el backup manualmente:

```bash
pnpm backup
```

## 3. Restore drill

Ejecutar al menos una vez por mes:

```bash
pnpm restore-drill
```

El script:
1. Ejecuta el backup diario.
2. Crea `gastos_restore_drill_<random>`.
3. Restaura el dump.
4. Cuenta las filas de `User` (se espera >= 0).
5. Elimina la base de drill.

## 4. Migración a un dominio propio

1. Comprar el dominio.
2. Actualizar las variables de entorno `PUBLIC_WEB_URL` y `PUBLIC_API_URL`.
3. Agregar el dominio en Vercel.
4. Actualizar las redirect URIs de Google OAuth (Módulo 2).
5. Volver a ejecutar el proyecto Playwright `smoke`.

No se requieren cambios de código.

## 5. Migración a proveedores pagos

Cada pieza externa vive detrás de una interfaz o variable de entorno:

- Web → cambiar el proyecto Vercel por cualquier host para Next.js.
- API → mover la imagen Docker a Render / Fly pago / AWS / GCP.
- Postgres → cambiar `DATABASE_URL`.
- Rate limit → reemplazar `@upstash/ratelimit` por un limiter respaldado por Postgres.
- Almacenamiento de objetos → cambiar `BACKUP_DSN`.
- Email → reemplazar `MailAdapter` por Resend / SES.
- Monitor de uptime → migrar de UptimeRobot a BetterStack / autoalojado.

## 6. Rotación de credenciales de Gmail

1. Iniciar sesión en la cuenta Gmail dedicada.
2. Visitar https://myaccount.google.com/apppasswords.
3. Revocar el App Password anterior.
4. Generar uno nuevo.
5. Actualizar `MAIL_DSN` en el host de la API.
6. Reiniciar el proceso de la API.

## 7. Reconfiguración del store de rate limit

Al migrar desde Upstash:
1. Aprovisionar el nuevo store (por ejemplo, un token bucket sobre Postgres).
2. Implementar un nuevo adaptador en `libs/core/rate-limit/src/`.
3. Actualizar los bindings de DI en `apps/api/src/modules/auth/auth.module.ts` y `apps/api/src/modules/transactions/transactions.module.ts`.
4. Eliminar las variables de entorno de Upstash.
5. Ejecutar `pnpm --filter api test rate-limit.e2e-spec.ts`.

## 8. Recuperación ante desastre

Si staging y el destino de backup quedan inaccesibles:
1. Adquirir un nuevo proveedor Postgres (un free tier es suficiente).
2. Restaurar desde el dump más reciente guardado en cualquier copia local del bucket R2 que tenga una persona operadora.
3. Repuntear `DATABASE_URL`.
4. Ejecutar migraciones contra el esquema restaurado.
5. Repetir la suite Playwright `smoke`.

## 9. Secretos de staging (entorno `staging` de GitHub Actions)

El workflow de deploy lee estos secretos del entorno `staging`:
- `STAGING_DATABASE_URL`
- `STAGING_NEXTAUTH_URL`
- `STAGING_NEXTAUTH_SECRET`
- `STAGING_API_URL`
- `STAGING_WEB_ORIGIN`
- `STAGING_PUBLIC_WEB_URL`
- `STAGING_PUBLIC_API_URL`
- `STAGING_JWT_SECRET`
- `STAGING_COOKIE_SECRET`
- `STAGING_METRICS_TOKEN`
- `STAGING_STATUS_DETAIL_TOKEN`
- `STAGING_UPSTASH_URL`
- `STAGING_UPSTASH_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `FLY_API_TOKEN`
