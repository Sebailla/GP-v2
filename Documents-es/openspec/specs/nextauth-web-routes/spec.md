# Especificación de Rutas Web de NextAuth

## Propósito

Define el comportamiento observable de la superficie de sign-in con prefijo de locale y los handlers de NextAuth expuestos por la app web: dónde vive la página de sign-in, cómo se defaultea el locale ausente, cómo se redirige a los usuarios ya autenticados fuera de la superficie y cómo se rechazan los `callbackUrl` extranjeros.

## Requisitos

### Requirement: Ruta de sign-in con prefijo de locale

El sistema DEBE exponer la ruta de sign-in en `/{locale}/sign-in` para cada locale soportado (`en`, `es`). La página renderizada DEBE mostrar el `LoginForm` conteniendo tanto el botón de Google sign-in (cuando Google esté configurado) como el formulario de email y password. Cada string visible al usuario en esta superficie DEBE estar localizado.

#### Scenario: Sign-in se renderiza en el locale solicitado

- GIVEN el usuario navega a `/en/sign-in`
- WHEN la página se renderiza
- THEN los labels, el texto de los botones y los mensajes de validación se renderizan en inglés
- AND el `LoginForm` es el formulario canónico de auth para esa superficie

#### Scenario: Sign-in se renderiza en español

- GIVEN el usuario navega a `/es/sign-in`
- WHEN la página se renderiza
- THEN los labels, el texto de los botones y los mensajes de validación se renderizan en español

### Requirement: Default de locale y redirección de usuarios autenticados

El sistema DEBE redirigir a usuarios no autenticados con locale ausente a `/en/sign-in` (el default de locale). El sistema DEBE redirigir a usuarios ya autenticados fuera de la superficie de sign-in a `/{locale}/(app)` para el locale activo.

#### Scenario: Locale ausente defaultea a inglés

- GIVEN el usuario navega a `/sign-in` (sin segmento de locale)
- WHEN corre el middleware
- THEN la respuesta es una redirección a `/en/sign-in`

#### Scenario: Usuario autenticado es redirigido al app

- GIVEN hay una cookie de sesión autenticada presente
- WHEN el usuario navega a `/{locale}/sign-in`
- THEN la respuesta es una redirección a `/{locale}/(app)`

### Requirement: Validación del callback URL

El sistema DEBE validar el parámetro de query `callbackUrl` en la superficie de sign-in y rechazar valores que apunten a un origen externo. Los callback URLs inválidos DEBEN llevar al usuario a `pages.error` con copy localizado; la respuesta NO DEBE redirigir silenciosamente a un origen controlado por un atacante.

#### Scenario: Callback URL externo se rechaza

- GIVEN el usuario llega a la superficie de sign-in con `?callbackUrl=https://evil.example/`
- WHEN NextAuth procesa el callback URL
- THEN la respuesta redirige a `pages.error` con un mensaje localizado
- AND no se setea ninguna cookie

### Requirement: Guardia de rutas admin

Todas las rutas bajo `/[locale]/(app)/admin/*` DEBEN estar protegidas por `role=ADMIN`. Usuarios no-admin DEBEN ser redirigidos a `/{locale}/(app)` con un flash localizado ("Acceso denegado" / "Access denied"). La guardia corre server-side (render de página) y client-side (redirect de middleware).

#### Scenario: Admin visita /admin/users

- GIVEN un admin autenticado
- WHEN visita `/{locale}/admin/users`
- THEN se renderiza la página de admin users

#### Scenario: Admin visita /admin/sessions

- GIVEN un admin autenticado
- WHEN visita `/{locale}/admin/sessions`
- THEN se renderiza la página de admin sessions

#### Scenario: No-admin redirigido

- GIVEN un no-admin autenticado
- WHEN visita `/{locale}/admin/users`
- THEN se redirige a `/{locale}/(app)` con un flash localizado

#### Scenario: Sin sesión redirigido

- GIVEN sin sesión
- WHEN visita `/{locale}/admin/users`
- THEN se redirige a `/{locale}/sign-in`

#### Scenario: Admin visita detalle dinámico

- GIVEN un admin autenticado
- WHEN visita `/{locale}/admin/users/{id}` para un usuario existente
- THEN se renderiza la página de detalle

## Procedencia

Introducido por: module-2-public-auth, 2026-07-17 (comportamiento base de slice-3 / M1 T1.12).
Extendido por: module-3-superadmin, 2026-07-18 (guardia de rutas admin).
