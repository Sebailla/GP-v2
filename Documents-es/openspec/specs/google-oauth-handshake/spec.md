# Especificación de Handshake de Google OAuth

## Propósito

Define el comportamiento observable del inicio de sesión (o la vinculación de cuenta) mediante el handshake de Google OAuth de extremo a extremo: desde el callback `/api/auth/callback/google` hasta el seteo de la cookie de sesión, incluyendo el gating por configuración de runtime de Google y el reporte de errores en la superficie.

## Requisitos

### Requirement: Handshake de Google OAuth (camino feliz)

El sistema DEBE completar el handshake de Google OAuth cuando `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` estén presentes en runtime y el callback transporte un authorization code válido. Un handshake exitoso DEBE vincular el email verificado de Google a un registro de usuario existente o crear un nuevo registro para ese email, mintear una sesión JWT, setear la cookie de sesión y redirigir al usuario a `/{locale}/(app)` para el locale activo.

#### Scenario: Usuario nuevo inicia sesión con Google

- GIVEN no existe un registro de usuario para el email verificado de Google
- AND `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` están configurados
- WHEN Google redirige a `/api/auth/callback/google` con `code` y `state` válidos
- THEN el sistema crea un nuevo registro de usuario con ese email
- AND se mintea una sesión JWT y se setea la cookie de sesión
- AND el usuario es redirigido a `/{locale}/(app)` para el locale activo

#### Scenario: Usuario existente vincula Google al mismo email

- GIVEN existe un registro de usuario cuyo email coincide con el email verificado de Google
- WHEN el callback de Google se completa exitosamente
- THEN no se crea un nuevo registro de usuario
- AND la fila `Account` del usuario existente se vincula al provider `google`
- AND el usuario es redirigido a `/{locale}/(app)` con una cookie de sesión fresca

### Requirement: Gating del provider Google por configuración de runtime

El sistema DEBE exponer el botón de Google sign-in solo cuando `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` sean no vacíos. Cuando alguno falte, el sistema DEBE omitir el provider Google del array de providers y el `LoginForm` DEBE ocultar el botón de Google. Ninguna llamada al endpoint de Google OAuth DEBE ocurrir en ese caso.

#### Scenario: Faltan credenciales de Google y el botón se oculta

- GIVEN `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` no están definidos
- WHEN el usuario renderiza el formulario de sign-in
- THEN el `LoginForm` NO DEBE renderizar el botón de Google
- AND la lista de providers devuelta por el runtime de auth NO DEBE contener `google`

### Requirement: Errores del callback de Google

El sistema DEBE mostrar los fallos del callback de Google con un copy localizado de error en `pages.error`. El copy NO DEBE enumerar qué lado del handshake falló.

#### Scenario: Google devuelve access_denied

- GIVEN el usuario inicia el sign-in con Google
- WHEN Google redirige de vuelta con `error=access_denied`
- THEN el usuario es redirigido a `pages.error` con copy localizado en el locale activo
- AND no se setea ninguna cookie de sesión

#### Scenario: Cookie de state malformada o expirada

- GIVEN el usuario inicia el sign-in con Google
- WHEN el request de callback llega a `/api/auth/callback/google` con una cookie de state expirada o malformada
- THEN la respuesta es 401
- AND el usuario es redirigido a `pages.error` con un mensaje genérico, sin enumeración

## Procedencia

Introducido por: module-2-public-auth, 2026-07-17; comportamiento base de slice-3 / M1 T1.12.
