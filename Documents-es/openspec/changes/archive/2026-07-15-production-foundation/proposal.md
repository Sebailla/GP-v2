# Propuesta — `production-foundation`

**Proyecto**: `gastos-personales-reference`
**Branch**: `develop` (trabajo) · `main` (inmutable)
**Tracker branch**: `feat/production-foundation`
**Modo**: interactivo · **Artifact store**: hybrid
**Delivery strategy**: `single-pr` (un módulo, ≤ 400 LOC de review budget)
**Chain strategy**: n/a (un solo PR dentro del módulo)
**Review budget**: 400 líneas modificadas
**Fecha**: 2026-07-15

---

## Intención

Transformar `gastos-personales-reference` de un spike funcional solo local a una aplicación lista para público mediante el **Módulo 1: Fundación de Producción** entregado como una rebanada vertical completa. El módulo incluye deploy de staging en servicios administrados free-tier, API/web observable, backups automatizados externos con restore probado, rate limiting base, cookies seguras, logging estructurado sin datos financieros y una superficie de status verificable desde navegador.

Este es el primero de seis módulos verticales requeridos para abrir la aplicación al público:

1. **Fundación de Producción** ← este cambio.
2. Autenticación pública (email + contraseña + Google OAuth + reset con Gmail).
3. Panel superadmin + gestión de usuarios + auditoría.
4. Privacidad, exportación y eliminación de cuenta.
5. Proveedor FX multidivisa + resiliencia.
6. Hardening final, pruebas de carga y lanzamiento público.

Cada módulo subsiguiente depende de este. El Módulo 1 se cierra cuando la aplicación está **operativa de punta a punta en un entorno staging free-tier, observable, recuperable y verificable desde navegador**, aunque en esta rebanada no se entregue funcionalidad de usuario final.

## Alcance

### Dentro de alcance

- Deploy de staging free-tier de `apps/web` (Vercel) y `apps/api` (Railway o alternativa tras comparación).
- Postgres administrado free-tier con migraciones Prisma reproducibles aplicadas en cada deploy.
- Configuración por entorno con Zod para `local`, `staging`, `production`.
- Cookies seguras (`Secure`, `HttpOnly`, `SameSite=Lax`), CORS restringido al dominio público del web, headers de seguridad base (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- Logging estructurado JSON con `pino` (API) y `pino-browser` (web), redacción automática de campos sensibles, IDs de correlación por request.
- Endpoints de salud: `GET /healthz`, `GET /readyz`, `GET /status` (con versión, commit, entorno, último backup, uptime y URL pública).
- Métricas básicas: tasa de requests, tasa de errores 5xx, latencia p95/p99, accesibles vía endpoint público protegido por token interno.
- Uptime monitor free-tier con alertas por email hacia la cuenta Gmail dedicada.
- Backup diario externo de Postgres (cron o scheduled job) con retención de 7 días, verificación de integridad y restore probado sobre base aislada.
- Rate limiting por IP y por usuario autenticado, con store compartido compatible con free-tier, sobre auth, reset y endpoints de transacción/FX. Respuestas 429 con `Retry-After`.
- Página de status en `apps/web` que renderiza el payload de `/status` y la marca de tiempo del último backup.
- Smoke e2e en Playwright que cubren status, health y rate-limit 429.
- Runbook para suspensión free-tier, restore drill y migración a servicios pagos.
- Informe de arquitectura (inglés + espejo español) describiendo stack, bibliotecas, decisiones de por qué/cómo/dónde/cuándo.

### Fuera de alcance

- Funcionalidades de usuario final más allá de la superficie de status.
- Google OAuth y email transaccional Gmail (se entregan en el Módulo 2).
- Panel superadmin y extensión RBAC (se entregan en el Módulo 3).
- Privacidad / Exportación / Eliminación de cuenta (se entregan en el Módulo 4).
- Proveedor FX real (se entrega en el Módulo 5).
- Gate de hardening de producción, pruebas de carga y cutover público final (se entregan en el Módulo 6).
- Dominio propio (se usa un subdominio gratuito del proveedor para el lanzamiento).
- Garantías de SLA ni compromisos con proveedores pagos (se aceptan límites y suspensión del free tier).

## Decisiones locked al momento de la propuesta

- **D-PF-1 (plataforma objetivo)**: Vercel para `apps/web` y Railway (o equivalente free-tier Node) para `apps/api`. La comparación de alternativas viables antes de la implementación es obligatoria durante el diseño; si surge una mejor combinación, se documenta el swap.
- **D-PF-2 (email)**: cuenta Gmail dedicada vía SMTP/App Password, aislada detrás de una interfaz `MailAdapter`, nunca llamadas `nodemailer` directas en código de negocio. El Módulo 2 cablea el flujo de reset; el Módulo 1 entrega el esqueleto del adaptador y un endpoint `/mail/test` que postea a Gmail desde staging (gated para admins no productivos).
- **D-PF-3 (logging)**: `pino` (API) + `pino-browser` (web). Redacción de `password`, `token`, `cookie`, `authorization`, `idempotency-key`, `*.amount`, `*.reportingAmount`, `email`, `*.email`. Los campos de dinero NUNCA se loguean, ni siquiera a nivel del adaptador.
- **D-PF-4 (rate limit)**: store compartido compatible con free-tier (`Upstash Ratelimit` free tier o token bucket sobre Postgres). La semántica ante falla del limiter debe ser configurable; por defecto fail-closed para endpoints de auth, fail-open para endpoints de lectura.
- **D-PF-5 (backup)**: `pg_dump` diario a almacenamiento externo free-tier (R2/B2/S3 free tier o el bucket de artefactos del mismo proveedor). Retención de 7 días. Drill de restore ejecutado al menos una vez antes del lanzamiento.
- **D-PF-6 (métricas)**: contadores en proceso expuestos en `/metrics` (texto Prometheus) protegidos por un env var `METRICS_TOKEN`. Sin SaaS externo.
- **D-PF-7 (UI de status)**: vive en `apps/web/app/[locale]/status/page.tsx`. Server-rendered. Localizada en inglés y español. Polea cada 60 s. Refleja el payload de `/status`, no una UI optimista.

## Riesgos

- **R-PF-1 — suspensión free-tier**: los servicios gratuitos pueden dormir o suspender por inactividad. Mitigado documentando estrategia de ping y runbook de migración a proveedores pagos.
- **R-PF-2 — disponibilidad del destino de backup**: las cuotas del storage gratuito pueden cambiar. Mitigado definiendo formato portable de dump (`pg_dump -Fc`) y un destino configurable vía env vars.
- **R-PF-3 — pérdida de estado de rate limit entre instancias**: los limiters free-tier pueden no ser globalmente consistentes. Mitigado prefiriendo stores distribuidos soportados por el proveedor y agregando un log de modo degradado cuando el store no responde.
- **R-PF-4 — mismatch cookie/dominio**: el subdominio gratuito del proveedor puede cambiar. Mitigado centralizando la URL pública en env vars y documentando el paso de migración a dominio propio.
- **R-PF-5 — rotación del App Password de Gmail**: Gmail puede invalidar App Passwords. Mitigado aislando credenciales en env vars y documentando la rotación.
- **R-PF-6 — churn de dependencias externas**: los proveedores (Vercel, Railway, Gmail) pueden cambiar sus términos free-tier. Mitigado por las decisiones D-PF-1, D-PF-2 y D-PF-5 — todos los puntos de elección están aislados detrás de interfaces.

## Preguntas abiertas derivadas al diseño

- Q-PF-A: comparación concreta de hosts free-tier (Vercel vs Netlify para web; Railway vs Render vs Fly vs Koyeb para API) incluyendo cuota, región y adyacencia con Postgres. Resultado: lock a un primario + documentar fallback.
- Q-PF-B: si el store de rate limit usa `Upstash Ratelimit` (Redis) o un token bucket sobre Postgres. Resultado: elegir según disponibilidad free-tier y cuota.
- Q-PF-C: cómo se expone `/status` sin filtrar información interna. Resultado: `/status?detail=full` opcional para admins vía token; el `/status` público devuelve solo uptime, versión, último backup y entorno.
- Q-PF-D: cómo probar el restore de backup sin una segunda base paga. Resultado: restaurar en un esquema temporal sobre la misma instancia Postgres free y limpiar tras el drill.