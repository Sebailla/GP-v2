# Módulo 1 — Guía de Smoke en Browser

Walkthrough end-to-end para validar `production-foundation` (PR #78)
en el browser localmente. Esta guía NO es un test automatizado — es
una verificación manual que ejercita cada superficie desplegable
del Módulo 1 contra tu propio laptop.

> **Lo que está implementado y qué vas a ver**
>
> - API NestJS con `/healthz`, `/readyz`, `/status`.
> - Web Next.js con página `/status` pública (sin auth) que muestra el
>   snapshot del endpoint.
> - Logging estructurado con redacción (idempotency-key bracket,
>   password, token, etc.).
> - Request-id + rate limit + metrics + backup + MailAdapter port.
> - Web con security headers (X-Content-Type-Options, Referrer-Policy,
>   X-Frame-Options, HSTS en producción).

> **Lo que NO está implementado todavía** (viene en Módulo 2)
>
> - No hay signup/login pages todavía. La página `/status` es la única
>   superficie visible en browser para Módulo 1.
> - No hay cookie de sesión. La página `/status` no requiere login.

## Prerrequisitos

Verifica lo siguiente antes de empezar:

```bash
node --version    # debe ser >= 22.13.0
pnpm --version    # debe ser >= 11.10.0
docker --version  # debe estar disponible
```

Si falta alguno, instalalo:

```bash
# macOS con Homebrew
brew install node@22 pnpm docker
```

## Paso 1 — Clonar y cambiar a develop

```bash
cd /ruta/a/gastos-personales-reference
git checkout develop
git pull origin develop
git status   # debe estar limpio
```

`develop` ahora debe estar en `58324fd` (PR #78 mergeado).

## Paso 2 — Instalar dependencias

```bash
pnpm install --frozen-lockfile
```

Tiempo estimado: 1-3 minutos.

## Paso 3 — Levantar Postgres local

```bash
pnpm db:up
docker ps
```

Debe listar el container `gpr-postgres` corriendo en `localhost:5432`,
imagen `postgres:16-alpine`. Verifica con:

```bash
docker exec gpr-postgres pg_isready -U postgres -d gastos_reference
# espera: "accepting connections"
```

## Paso 4 — Generar cliente Prisma + correr migraciones

```bash
pnpm --filter @core/database exec prisma migrate deploy
```

Debe aplicar dos migraciones:
- `20260708185300_transactions_initial` (tablas auth + transactions).
- `20260715000000_backup_status` (tabla `BackupRun`).

Para verificar:

```bash
docker exec gpr-postgres psql -U postgres -d gastos_reference -c "\dt"
```

Debe listar 12 tablas: `User`, `Account`, `Session`, `VerificationToken`,
`PasswordResetToken`, `Currency`, `FxRate`, `Category`, `Transaction`,
`IdempotencyKey`, `AuditLog`, `BackupRun`.

## Paso 5 — Setear las env vars locales

El módulo requiere 11 env vars nuevas (R-PF-1). Las más importantes
para probar localmente:

```bash
cat > /tmp/.gpr-env.sh <<'EOF'
export NODE_ENV=development
export PORT=3001
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference
export NEXTAUTH_URL=http://localhost:3000
export NEXTAUTH_SECRET=local-only-test-secret-with-at-least-thirty-two-chars
export API_URL=http://localhost:3001
export WEB_ORIGIN=http://localhost:3000
export PUBLIC_WEB_URL=http://localhost:3000
export PUBLIC_API_URL=http://localhost:3001
export JWT_SECRET=local-only-jwt-secret-with-at-least-thirty-two-characters
export COOKIE_SECRET=local-only-cookie-secret-with-at-least-thirty-two-characters
export METRICS_TOKEN=local-only-metrics-token-at-least-sixteen-chars
export STATUS_DETAIL_TOKEN=local-only-status-detail-token-at-least-sixteen
export UPSTASH_REDIS_REST_URL=https://example.upstash.io
export UPSTASH_REDIS_REST_TOKEN=local-only-upstash-token-at-least-sixteen-chars
export LOG_LEVEL=info
export GOOGLE_CLIENT_ID=local-test-google-client-id
export GOOGLE_CLIENT_SECRET=local-test-google-client-secret
EOF
source /tmp/.gpr-env.sh
```

> **Nota sobre Upstash**: setear `UPSTASH_REDIS_REST_URL` con un valor
> falso (`https://example.upstash.io`) hace que la API instancie
> `UpstashRateLimiter`. Esto es correcto para `development` porque la
> API factory decide based en NODE_ENV:
>
> - `NODE_ENV=development` → `ConsoleMailAdapter`
> - `NODE_ENV !== development && UPSTASH_REDIS_REST_URL set` → `GmailMailAdapter`
>
> Para el rate limiter es al revés: si NO está seteado, usa
> `InMemoryRateLimiter`. Como acá SÍ está seteado, la API usará
> `UpstashRateLimiter`. Esto NO afecta el status page; solo afecta
> los endpoints de auth (que aún no existen en M1).

## Paso 6 — Levantar la API

En una terminal:

```bash
source /tmp/.gpr-env.sh
pnpm --filter api dev
```

La API compila (~20s en Mac M-series) y arranca en
`http://localhost:3001`. Esperá este log:

```
Nest application successfully started on :3001
```

Si ves un error de Zod sobre env vars faltantes, volvé al Paso 5 y
verificá que todas las variables estén exportadas.

### Sanity check con curl

```bash
curl -s http://localhost:3001/healthz | python3 -m json.tool
```

Debe responder:

```json
{ "status": "ok" }
```

Probá también:

```bash
curl -s -o /dev/null -w "readyz: %{http_code}\n" http://localhost:3001/readyz
# espera: "readyz: 200"

curl -s http://localhost:3001/status | python3 -m json.tool
```

Debe mostrar el JSON con `environment: "development"`, `commit: "local"`,
`lastBackupAt: null`, `lastBackupStatus: "never"`, etc.

## Paso 7 — Levantar la web

En otra terminal (deja la API corriendo):

```bash
source /tmp/.gpr-env.sh
pnpm --filter web dev
```

La web compila y arranca en `http://localhost:3000`. Esperá este log:

```
▲ Next.js 16.2.10 (webpack)
- Local:         http://localhost:3000
✓ Ready in ...
```

## Paso 8 — Abrir el browser

En Chrome (o el browser que prefieras), abrí:

```
http://localhost:3000/en/status
```

Deberías ver la página de status con tres badges:

| Badge | Estado esperado |
| --- | --- |
| Environment | `development` (badge azul) |
| API commit | `local` (badge inline code) |
| Last backup | `Never` (badge amarillo) |

Además:
- Dos enlaces a URLs públicas (API + Web).
- Un footer "Snapshot taken at ..." con el timestamp de `startedAt`.

Probá también la versión en español:

```
http://localhost:3000/es/status
```

Debería traducir todos los labels.

## Paso 9 — Verificar los security headers

En la misma página de status, abrí las DevTools del browser
(Cmd+Opt+I en Chrome), andá a la pestaña "Network", recargá la
página y mirá el response de `/en/status`:

Deberías ver estos headers en la respuesta:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
```

`Strict-Transport-Security` NO debería estar presente porque
`NODE_ENV=development`. Para verlo, levantá la web con
`NODE_ENV=production`.

## Paso 10 — Verificar el rate limit (R-PF-8)

El endpoint `/api/healthz` no está rate-limited (público). El endpoint
`/api/auth/login` SÍ está rate-limited, pero no existe UI en M1
porque el módulo no entrega auth pages todavía.

Para ejercitar el rate limit manualmente:

```bash
# 11 POSTs consecutivos al login (mock auth → bcrypt.compare → 401)
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "req $i: %{http_code}\n" \
    -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"smoke-$i@example.com\",\"password\":\"StrongP@ss123\"}"
done
```

El primer request retorna 401 (credenciales inválidas — el mock bcrypt
devuelve false). A partir del #11 debería retornar **429** con
`Retry-After`.

Si ves 429, ¡el rate-limit funciona end-to-end! Si no, tu
`UPSTASH_REDIS_REST_URL` no está siendo leída y el módulo está usando
`InMemoryRateLimiter` (que también debería bloquear en el #11 — el
test unitario `apps/api/test/rate-limit.e2e-spec.ts` lo prueba).

## Paso 11 — Verificar /metrics (R-PF-9)

El endpoint `/metrics` requiere token:

```bash
curl -s -H "Authorization: Bearer $METRICS_TOKEN" \
  http://localhost:3001/metrics | head -30
```

Deberías ver (entre otras):

```
# HELP http_requests_total Total HTTP requests handled.
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/healthz",status="200"} ...

# HELP rate_limit_blocked_total HTTP requests blocked by the rate limiter.
# TYPE rate_limit_blocked_total counter
rate_limit_blocked_total{endpoint="auth:login"} 1
```

La segunda línea debería incrementarse después de que el Paso 10
bloquee un request con 429.

## Paso 12 — Inspeccionar logs estructurados

En la terminal donde corre la API, deberías ver líneas JSON como:

```json
{"level":30,"time":...,"service":"gastos-personales-reference","env":"development","method":"GET","path":"/healthz","status":200,"latencyMs":2,"requestId":"...","userAgent":"curl/8.x","msg":"http.request"}
```

Verificá:

- El campo `password` NUNCA aparece en logs (redactado).
- El campo `token` NUNCA aparece en logs (redactado).
- El campo `email` NUNCA aparece en logs (redactado).
- El campo `requestId` está presente y matchea el header `x-request-id`
  de la response.

```bash
curl -s -i http://localhost:3001/healthz | grep -i x-request-id
# espera: x-request-id: <some-nanoid>
```

## Paso 13 — Verificar backup (R-PF-7)

El script de backup vive en `scripts/operations/backup.ts` y requiere
un R2/S3 configurado. Para verificar el **restore drill** localmente:

```bash
docker run --rm -d --name gpr-backup-test -p 5433:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  postgres:18-alpine

sleep 10  # esperar a que Postgres arranque

BACKUP_E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres \
  pnpm exec vitest run operations/__tests__/backup-e2e.test.ts
```

Esperá ver "2 passed". El test verifica que `pg_dump -Fc` produce
un dump válido y que `pg_restore --list` valida la TOC.

```bash
docker stop gpr-backup-test
```

## Paso 14 — Verificar el deploy workflow (R-PF-6)

El workflow vive en `.github/workflows/deploy-staging.yml`. NO se
puede ejecutar localmente, pero podés verificar la sintaxis:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-staging.yml')); print('YAML valid')"
```

Y revisar manualmente las 5 steps de smoke (líneas 83-125):

- `Smoke /healthz` — curl con retry 5x.
- `Smoke /readyz` — curl con retry 5x.
- `Smoke /status` — curl con retry 5x (R-PF-11 flow 2).
- `Smoke /status page` — curl con retry 5x.

## Paso 15 — Cleanup

```bash
# Detener dev servers (Ctrl+C en cada terminal)
docker compose down   # si querés parar Postgres
docker rm gpr-backup-test  # si lo arrancaste en Paso 13
```

## Resumen de validaciones

| Surface | Cómo verificar | Resultado esperado |
| --- | --- | --- |
| API `/healthz` | `curl /healthz` | 200 + `{"status":"ok"}` |
| API `/readyz` | `curl /readyz` | 200 (requiere Postgres up) |
| API `/status` | `curl /status` | JSON con snapshot completo |
| API `/metrics` | `curl -H "Authorization: Bearer $METRICS_TOKEN" /metrics` | Prometheus text con `http_requests_total`, `rate_limit_blocked_total` |
| API rate limit | 11 POSTs a `/auth/login` | últimos = 429 + `Retry-After` |
| API logs | tail la terminal de la API | JSON estructurado con redacción |
| Web `/en/status` | browser | página con 3 badges + polling 60s |
| Web `/es/status` | browser | página traducida |
| Security headers | DevTools > Network | X-Content-Type-Options, Referrer-Policy, X-Frame-Options |
| Backup e2e | vitest contra Postgres real | 2/2 passing |

## Troubleshooting

**"ZodError: JWT_SECRET is required"** — volvé al Paso 5 y verificá que
`source /tmp/.gpr-env.sh` haya corrido en la misma terminal donde
arrancás la API.

**"ECONNREFUSED 5432"** — Postgres no está corriendo. `pnpm db:up`
y esperá `accepting connections`.

**"Could not find next-intl config file"** en la web — verificá que
estés en la última versión de `develop` con el fix de Next.js 16
incluido (PR #78). El branch debe estar en `58324fd` o superior.

**El rate-limit NO bloquea después de 11 requests** — verificá que
`UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` estén seteados.
Si NO están, la API usa `InMemoryRateLimiter` (que también debería
bloquear — el límite por ventana de 600s es por proceso, así que 11
POSTs seguidos en la misma ventana SÍ deben bloquear).

**El status page muestra "Never" para Last Backup** — esto es
correcto en desarrollo: el `BackupRun` solo se llena cuando corres
el script `pnpm backup` (que requiere R2). En staging, el deploy
workflow programa el backup diario a las 03:00 UTC.

## Siguiente paso

Una vez validado manualmente todo lo anterior, podés iniciar el
**Módulo 2 — Public Authentication**:

- Email/password signup + login.
- Google OAuth.
- Gmail password reset (vía el `MailAdapter` seam que dejó M1).
- Wire `MailAdapter` con `nodemailer` (la `GmailMailAdapter` skeleton
  actual tira "not yet wired").

El `/sdd-new` workflow arranca con un pref-light + brainstorming +
planning + execute cycle, igual que Módulo 1.
