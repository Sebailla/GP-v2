# Diseño: `module-2-public-auth`

Tracker `feat/public-authentication` desde `develop@cc74210`; 5 PRs encadenados, TDD estricto, ≤400 LOC/PR, objetivo de 37 archivos. Sin migración de BD.

## 1. Enfoque

Autenticación pública con locale, OAuth con Google, reset por Gmail, UI completa en/es, BDD, Playwright/axe, runbook. El reset usa Express solo para emitir la cookie HttpOnly. El env de Gmail (D7) falla rápido al arrancar si `MAIL_DSN` está sin definir, siguiendo M1.

## 2. Decisiones de Arquitectura

### D1 — Vinculación de cuenta Google
Auto-vinculación por email verificado vía PrismaAdapter. El email verificado habilita una vinculación sin fricción; la unicidad en BD evita colisiones.

### D2 — URL de reset
`${PUBLIC_WEB_URL}/{locale}/reset-password/{token}`. Next-intl enruta locales por path de forma determinista.

### D3 — Binding de Mail
`MAIL_DSN` → Console; si no, producción → Gmail; si no, Console. `MAIL_DSN=console://` es el kill-switch explícito.

### D4 — E2E OAuth
Provider Credentials `google-mock` solo fuera de producción con `GOOGLE_E2E_MOCK=1`. Ejerce NextAuth sin inestabilidad externa; Google real queda para M6.

### D5 — Cookie/redirect del reset
`resetPassword` usa `@Res({passthrough:true}) Response`, llama a `consumeReset`, acuña token compatible con NextAuth, asigna `authjs.session-token` vía `response.cookie(...)`, devuelve `{redirectTo}` bajo `@HttpCode(200)`. Passthrough preserva la serialización de NestJS + supertest mientras la plataforma emite HttpOnly. Acoplamiento a Express probado con supertest (§6).

### D6 — Traducción del email
`reset-password.json` indexado por `en|es`, renderizado junto al adaptador. Una sola fuente auditable evita copies dispersos.

### D7 — Contrato env Gmail
`GMAIL_USER` (email) y `GMAIL_APP_PASSWORD` (mín. 16) viven en `env.schema.ts`. Opcionales en dev/test; obligatorios cuando `NODE_ENV === "production"` Y `MAIL_DSN` está sin definir (`superRefine` en §5). Cortocircuita con `MAIL_DSN` (D3 gana). Alternativas: exigir Gmail siempre; validar al primer `send()`. Razonamiento: la primera bloquea el kill-switch; la segunda difiere errores. M1 R-PF-1 (`7335f11`) es el precedente.

## 3. Flujo de Datos

`POST forgot (Accept-Language) → requestReset(email,locale) → sha256 row → MailAdapter → /{locale}/reset-password/{raw}`.

`POST reset → consumeReset tx → acuña JWT de sesión → passthrough Response.cookie(HttpOnly, SameSite=Lax) + 200 {redirectTo:"/{locale}/(app)"} → router web`.

`SignInClient Google → signIn("google",{callbackUrl:"/{locale}/(app)"}) → NextAuth callback/link/JWT → ruta protegida`. `apps/web/auth.ts` mantiene el default o `pages.signIn:"/sign-in"` estático (nunca `"/[locale]/sign-in"`). El middleware corre next-intl y luego `auth()` sobre rutas protegidas `/{locale}/*`; el fallo redirige a `/{locale}/sign-in`. Arranque: env Gmail faltante con `NODE_ENV=production` + `MAIL_DSN` sin definir lanza `ZodError` (D7).

## 4. Cambios de Archivos (37)

| Grupo | Archivos / acción |
|---|---|
| Mail (7) | Modificar `gmail-mail.adapter.ts` + `mail.module.ts` (D3); crear `templates/reset-password.{json,ts}` + 3 tests unitarios. |
| API/config (8) | Modificar `auth.{controller,module}.ts` (forgot lee Accept-Language; reset usa `@Res({passthrough:true})` según D5), `auth.config.ts` (link solo), `env.schema.ts` (D7), `.env.example` (env Gmail); crear wiring dev-mailbox. |
| Auth dominio (3) | Modificar `password-reset.service.ts`; mantener schemas compartidos; crear test de locale. |
| Web (9) | Modificar `apps/web/{auth.ts,middleware.ts}` + páginas sign-in/forgot/reset/mailbox y 3 clientes. `SignInClient` llama Google con callback de locale. |
| Tests API (3) | Forgot (`overrideProvider(MAIL_ADAPTER)`), reset passthrough cookie+JSON, dev mailbox. |
| E2E Web (6) | sign-in, sign-up, forgot, reset, OAuth mock, axe; Playwright separado de Nest API. |
| Docs/BDD | Auth feature + feature ES, runbook + mirror `Documents-es`; mismos commits atómicos. |

Agregar a `apps/api/package.json`: `nodemailer@^6.9.16` (deps) + `@types/nodemailer@^6.4.17` + `nodemailer-mock@^1.5.11` (devDeps). El proposal aseguró erróneamente que estaban — Read confirma que no.

## 5. Contratos

```ts
requestReset(email: string, locale: "en"|"es"): Promise<void>

POST /auth/reset-password
  body: { token: string; newPassword: string }
  200 + Set-Cookie: authjs.session-token=...; HttpOnly; SameSite=Lax
       body: { redirectTo: "/en/(app)"|"/es/(app)" }
  400 token inválido genérico

// Adiciones D7 a libs/core/config/env.schema.ts
GMAIL_USER:         z.string().email().optional(),
GMAIL_APP_PASSWORD: z.string().min(16).optional(),
// productionEnvSchema.superRefine: NODE_ENV==prod AND !MAIL_DSN => ambos requeridos
```

Forgot devuelve 202 sin enumeración; fallo Gmail 502.

## 6. Testing

RED→GREEN: envelope/errores de mail + permutaciones de binding; plantilla/URL con locale; **env refine (D7)** — boundary Vitest sobre `env.schema.ts`, 4 permutaciones; **reset cookie+JSON** — supertest valida `Set-Cookie` + `{redirectTo:"/{locale}/(app)"}` (falla si se cambia Express sin actualizar `resetPassword`); account linking; redirect de locale del middleware; rechazo de callback ajeno; OAuth mock; 5 estados de UI, en/es, axe, BDD. Conservar notación bracket de pino, try/catch de JWT, alias de next-intl, override de provider, reglas de boundary, split de Playwright.

## 7. Matriz de Amenazas

| Frontera | Aplicabilidad | Respuesta / tests RED |
|---|---|---|
| Paths tipo doc | N/A — sin docs ejecutables | Ninguno |
| Selección repo Git | N/A — sin shell | Ninguno |
| Commit / Push / PR | N/A — sin automatización VCS | Ninguno |
| **Enrutamiento** | **Aplica** | Callback ajeno 401; state expirado/code forjado 401; reset malformado/replayed/expirado 400 genérico; 4º forgot 429; redirect de locale del middleware. |
| Shell/proceso | N/A — sin subprocess | Ninguno |
| **Configuración** | **Aplica** (D7) | Refine de env: 4 permutaciones `NODE_ENV × MAIL_DSN × env Gmail`; fail-fast al arrancar. |

## 8. Despliegue / Riesgos

Sin migración. Deshabilitar Gmail con `MAIL_DSN=console://`; deshabilitar Google dejando las credenciales sin definir.

**INFO:** Acoplamiento a plataforma de D5 probado vía supertest; un swap futuro de adaptador HTTP de NestJS (p. ej. Fastify) requiere revisar la emisión de cookie de `resetPassword` — aceptado en el alcance de M2.

**INFO:** Pinear `nodemailer@^6.9.16` para evitar cambios incompatibles de SMTP entre menores.