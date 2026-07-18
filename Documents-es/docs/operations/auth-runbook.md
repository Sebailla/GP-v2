# Runbook — `module-2-public-auth`

**Fecha**: 2026-07-17
**Proyecto**: `gastos-personales-reference`
**Módulo**: 2 — Autenticación pública (sign-in con prefijo de locale, Google OAuth, reset de contraseña vía Gmail)

Este runbook cubre la superficie operativa del módulo de auth pública:
variables de entorno, rotación de credenciales de terceros, kill-switches y
los atajos de dev local que mantienen e2e verde sin tocar secretos con
forma de producción. Es la pieza compañera de `production-foundation-runbook.md`
(Módulo 1) — todo sign-in, OAuth y email de reset que envíe la plataforma
pasa por alguna de las variables listadas abajo.

Todos los valores de secretos viven en el entorno `staging` de GitHub
Actions (según `production-foundation-runbook.md` §9) y en el entorno de
producción. Las personas que desarrollan en local editan
`apps/web/.env.test` (commiteado, con gate de runtime) y
`apps/api/.env.test`; NUNCA commitear un App-Password real de Gmail ni un
client-secret de Google en ninguno de estos dos archivos.

## 1. Rotación del App-Password de Gmail

El adaptador de Gmail
(`apps/api/src/modules/auth/infrastructure/gmail-mail.adapter.ts`,
según diseño D3) se autentica con un App-Password de Gmail, NO con la
contraseña primaria de la cuenta. El valor de `GMAIL_APP_PASSWORD` DEBE
tener ≥16 caracteres (chequeo Zod de env.schema). Rotar la credencial
nunca requiere un cambio de código.

1. Iniciar sesión en la cuenta de Gmail dedicada usada para resets transaccionales.
2. Visitar <https://myaccount.google.com/apppasswords>.
3. Revocar el App Password existente.
4. Generar uno nuevo. Copiar el string de 16 caracteres (Google lo muestra
   con espacios — quitarlos antes de pegar).
5. Actualizar `GMAIL_APP_PASSWORD` en:
   - El secreto del entorno `staging` de GitHub.
   - El store de secretos del proveedor de hosting de producción (Fly.io
     secrets, Render env, etc.).
6. Actualizar `GMAIL_USER` si cambió la dirección de la cuenta.
7. Reiniciar el proceso de la API para que tome el nuevo env (Next.js /
   NestJS leen env al boot — no hay hot-reload de secretos).
8. Disparar un reset manual desde una cuenta no personal y confirmar que
   el email llegue (ver §6 troubleshooting).

> **Alternativa kill-switch:** si la rotación lleva más tiempo del
> esperado, setear `MAIL_DSN=console://` (ver §3). El adaptador console
> escribe la URL de reset a stdout en vez de despachar vía Gmail. La
> plataforma sigue funcional; solo se degrada la entrega real.

## 2. Rotación del client-secret de Google OAuth

El provider de Google (`apps/web/auth.ts`, registrado en forma condicional
según `isGoogleConfigured()` en `apps/web/lib/google-enabled.ts`) se
autentica con el par `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. La
rotación del client-secret es un baile de secretos por proyecto; el flujo
de cara al usuario nunca se rompe mientras ambos valores se mantengan en
lock-step.

1. Abrir el proyecto de Google Cloud Console del entorno de deploy.
2. Navegar a **APIs & Services → Credentials**.
3. Click en el OAuth 2.0 Client ID usado para el origin web de producción
   (o staging).
4. Click en **Reset secret**. El secret viejo se invalida inmediatamente.
5. Copiar el nuevo valor del secret.
6. Actualizar `GOOGLE_CLIENT_SECRET` (y `GOOGLE_CLIENT_ID` si también
   cambió el id del cliente) en el store de secretos del proveedor de
   hosting.
7. Actualizar las Authorized redirect URIs para mantenerlas alineadas con
   el `PUBLIC_WEB_URL` actual:
   - `${PUBLIC_WEB_URL}/api/auth/callback/google` (la ruta catch-all de
     NextAuth montada bajo
     `apps/web/app/api/auth/[...nextauth]/route.ts`).
   - El path `/[locale]/sign-in` en sí MISMO no necesita estar registrado
     (el locale manejado por el middleware envuelve la URL de `/sign-in`
     vía `pages.signIn` default — ningún prefijo de locale toca la
     allowlist de redirect de Google).
8. Reiniciar el proceso web para que cargue el nuevo secret.
9. Disparar un sign-in de prueba desde el entorno de staging para
   confirmar que el handshake completa (debería aterrizar en
   `/{locale}/(app)`).

> **Defense in depth:** la plataforma vuelve a chequear
> `isGoogleConfigured()` en cada call site, así que una rotación rota que
> deje un `GOOGLE_CLIENT_SECRET` vacío simplemente ESCONDE el botón de
> Google — no tira en runtime.

## 3. Kill-switch de `MAIL_DSN`

La variable de entorno `MAIL_DSN` es la ruta de mail de mayor prioridad
(según diseño D3). Seteándola en `console://` se cambia la plataforma de
entrega SMTP real a un adaptador console en memoria que loguea el email
renderizado — incluida la URL de reset — al stdout del proceso de la API.
Este es el kill-switch canónico cuando Gmail está roto, en rotación o
rate-limited.

| Valor de `MAIL_DSN` | Adaptador seleccionado | Caso de uso |
| --- | --- | --- |
| `console://` | `ConsoleMailAdapter` (loguea a stdout) | Dev local + kill-switch de emergencia |
| `smtps://user:pass@host:port` | `SmtpMailAdapter` (nodemailer SMTP) | Producción con proveedor SMTP transaccional |
| _(unset)_ + env de Gmail presente | `GmailMailAdapter` | Producción con Gmail directo |
| _(unset)_ + sin env de Gmail | `ConsoleMailAdapter` (default) | Dev — solo `NODE_ENV !== production`; producción sin env de Gmail falla rápido al boot según diseño D7 |

### Activar el kill-switch

```bash
# Fly.io
flyctl secrets set MAIL_DSN=console:// -a gastos-api

# Render
render env set MAIL_DSN=console:// --service gastos-api

# Local (apps/api/.env.local — NO se commitea)
echo 'MAIL_DSN=console://' >> apps/api/.env.local
```

Una vez seteado, la plataforma sigue minteando tokens de reset y
escribiendo el evento de auditoría (`auth.password-reset.requested`);
solo la llamada a `MailAdapter.send(...)` aterriza en stdout en vez de
cruzar la red.

### Desactivar

Des-setear la variable (settear a string vacío) y reiniciar la API. El
schema Zod trata `MAIL_DSN` vacío como "unset" — el siguiente paso de
precedencia del adaptador toma el control.

## 4. `GOOGLE_E2E_MOCK` — atajo de CI / e2e local

Según diseño D4, el Google OAuth real no se puede cablear dentro del
sandbox de CI. La variable de entorno `GOOGLE_E2E_MOCK=1` hace que
`apps/web/auth.ts` registre un provider Credentials `google-mock`
junto a (o en lugar de) el provider `Google` real. El mock intercambia
perfiles sintéticos con `next-auth` sin tocar los servers de Google, así
que la suite e2e en `apps/web/e2e/auth/oauth-mock.spec.ts` corre en forma
hermética.

### Reglas duras

- `GOOGLE_E2E_MOCK=1` DEBE ser no-op cuando `NODE_ENV === "production"`.
  El predicado `isGoogleMockEnabled()` (en
  `apps/web/lib/google-enabled.ts`) lo enforce como defense in depth —
  ni siquiera un flag leaked en producción puede habilitar el mock.
- El spec de Playwright (`apps/web/e2e/auth/oauth-mock.spec.ts`) setea
  el flag en su propio entorno y assertea que el botón se renderiza.
- Solo local: `apps/web/.env.test` setea `GOOGLE_E2E_MOCK=1` para que el
  dev server web lo levante durante el desarrollo. Nunca setear esto en
  ningún `.env` que no sea de test.

### Cuándo usarlo

- Correr la suite de Playwright e2e en local (`pnpm --filter web e2e`).
- Probar manualmente el botón de sign-in sin ir a Google.
- Demostrar el handshake de OAuth en una máquina de desarrollo que no
  tiene acceso al Google Cloud Console del proyecto.

### Cuándo NO usarlo

- Cualquier entorno donde el sign-in real de Google es la superficie
  deseada.
- Deploys de staging o producción — `NODE_ENV=production` deshabilita el
  mock a nivel del predicado; la persona operadora NO debe override.

## 5. Prerrequisitos de dev local

Los archivos `apps/web/.env.test` y `apps/api/.env.test` del repo
(commiteados) contienen un set completo de fixtures para que
`NODE_ENV=test pnpm dev` boote out of the box. Las variables siguientes
manejan el comportamiento de feature en el límite entre dev y producción:

| Variable | Default dev | Requerida en producción | Notas |
| --- | --- | --- | --- |
| `NODE_ENV` | `test` (fixtures) o `development` | `production` | `superRefine` de env-refine en `libs/core/config/env.schema.ts` |
| `MAIL_DSN` | _(unset)_ | opcional, sobrescribe Gmail | D3 |
| `GMAIL_USER` | _(unset)_ | requerida si `NODE_ENV=production && !MAIL_DSN` | D7 |
| `GMAIL_APP_PASSWORD` | _(unset)_ | requerida si `NODE_ENV=production && !MAIL_DSN`, ≥16 chars | D7 |
| `GOOGLE_CLIENT_ID` | opcional | opcional | Esconde el botón de Google cuando está vacío |
| `GOOGLE_CLIENT_SECRET` | opcional | opcional | Esconde el botón de Google cuando está vacío |
| `GOOGLE_E2E_MOCK` | `"1"` (`.env.test`) | DEBE estar unset (regla dura) | D4 |
| `NEXTAUTH_URL` | `http://localhost:3000` | `${PUBLIC_WEB_URL}` | NextAuth |
| `NEXTAUTH_SECRET` | fixture de test | desde el store de secretos | Firma del JWT de NextAuth |
| `API_URL` | `http://localhost:3001` | `${PUBLIC_API_URL}` | Web → API |
| `WEB_ORIGIN` | `http://localhost:3000` | `${PUBLIC_WEB_URL}` | Allowlist de CORS |

> **Correr siempre los comandos de turbo con `NODE_ENV=test` en el gate
> de apply:** `apps/web#build` crashea cuando `API_URL` / `WEB_ORIGIN`
> están vacíos (el fixture de test los provee). Usar
> `NODE_ENV=test pnpm turbo run build` y compañía.

## 6. Troubleshooting

### Síntoma: el email de reset de contraseña nunca llega

1. Confirmar que la API booteó. Chequear `/healthz`.
2. Inspeccionar el evento `auth.password-reset.requested` en el log de
   auditoría — si está ausente, el controller nunca corrió (probablemente
   un rate-limit 429; ver el override `RATE_LIMITER_TOKEN` en
   `apps/api/src/modules/auth/auth.module.ts`).
3. Si el evento SÍ está presente pero no llegó el email: chequear el
   binding de `MailAdapter` en
   `apps/api/src/modules/auth/infrastructure/mail.module.ts` — el orden
   de precedencia (D3) es `MAIL_DSN > env de Gmail > Console`.
4. Con `MAIL_DSN=console://` activo, el email se loguea a stdout — la
   URL de reset está en la línea de log. Extraer la URL de ahí para la
   reproducción local.

### Síntoma: el sign-in de Google tira "OAuthSignin" / "OAuthCallback"

1. Verificar que `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` no estén
   vacíos en el env corriendo. Si están vacíos, el botón está escondido;
   si están presentes, el provider está registrado.
2. Confirmar que la Authorized redirect URI en Google Cloud Console
   coincide EXACTAMENTE con
   `${PUBLIC_WEB_URL}/api/auth/callback/google` (case-sensitive, sin
   slash final).
3. Inspeccionar el evento de auditoría `auth.account.linked` — si se
   disparó, el round-trip del callback fue exitoso y la página de error
   `OAuthCallback` es el destino equivocado (mirar los query params
   reales de la URL en su lugar).

### Síntoma: la validación de env tira al boot (`ZodError` en logs)

El `superRefine` de Zod en `libs/core/config/env.schema.ts` enforce el
contrato D7: cuando `NODE_ENV=production` Y `MAIL_DSN` está unset,
AMBAS `GMAIL_USER` y `GMAIL_APP_PASSWORD` deben estar presentes y ser
válidas. Setear ambas, O setear `MAIL_DSN` para bypassear el
requerimiento de Gmail.

### Síntoma: rate-limit hits (429) en `auth:forgot`

La 4ª llamada dentro de la ventana del bucket devuelve 429 con
`Retry-After`. El spec e2e de reset-password
(`apps/api/test/forgot-password.e2e-spec.ts`) ejercita este contrato.
Para repro local, setear `RATE_LIMITER_TOKEN` al override del token
in-memory (ver `apps/api/src/modules/auth/auth.module.ts`) para que el
`InMemoryRateLimiter` short-circuite el bucket.

## 7. Artefactos relacionados

- `production-foundation-runbook.md` — línea base de Módulo 1 (free-tier,
  backups, lista de secretos).
- `apps/web/auth.ts` — `handlers` + `signIn`/`signOut` de NextAuth. La
  factory `buildProviders()` lee `isGoogleConfigured()` +
  `isGoogleMockEnabled()` al boot.
- `apps/web/lib/google-enabled.ts` — predicados de fuente única de verdad.
- `apps/api/src/modules/auth/infrastructure/gmail-mail.adapter.ts` —
  adaptador D3, `nodemailer.createTransport({service:"gmail"})`.
- `apps/api/src/modules/auth/infrastructure/mail.module.ts` — selección
  de precedencia D3.
- `apps/api/src/modules/auth/infrastructure/templates/reset-password.json`
  — copy con clave de locale D6 (en + es).
- `libs/core/config/env.schema.ts` — `superRefine` de env D7 (4
  permutaciones).
- `apps/web/app/api/auth/[...nextauth]/route.ts` — ruta catch-all de
  NextAuth montada bajo el prefijo canónico `/api/auth/*`.
- `apps/web/app/api/dev/mailbox/route.ts` — bridge DEV-only del mailbox
  para los e2e de Playwright.
