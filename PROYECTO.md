# GestAlquiler — Documento de proyecto

## Qué es

SaaS multi-tenant para inmobiliarias argentinas. Gestiona contratos de alquiler, pagos, actualizaciones por ICL/IPC, visitas a propiedades, tasaciones, cobranzas y ventas. El objetivo es comercializarlo.

**URL producción:** deploy automático en Vercel desde `main`.  
**Repo local:** `G:\Mi unidad\GestAlquiler\gestion-alquileres\`

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML + JS vanilla (sin framework) |
| Backend/DB | Supabase (PostgreSQL + Auth + RLS) |
| Deploy | Vercel (auto-deploy desde `main`) |
| Errores | Sentry (solo en producción) |
| Índices | BCRA (ICL) + INDEC (IPC) vía APIs públicas |
| Fuente tipográfica | Inter (Google Fonts) |

---

## Archivos principales

| Archivo | Rol |
|---|---|
| `shared.js` | IIFE `GestShared` — config, header, CSS compartido, WA, font size, Sentry |
| `supabase.js` | IIFE `SupabaseDB` — todas las operaciones con Supabase (auth + datos) |
| `script.js` | Lógica de contratos: cálculos ICL/IPC, UI, WhatsApp, persistencia |
| `style.css` | Estilos globales base |
| `vercel.json` | Headers de seguridad (CSP, HSTS, X-Frame, etc.) + rewrite `/` → `dashboard.html` |
| `supabase_grants_rls.sql` | SQL idempotente para permisos y políticas RLS |
| `logger.js` | Logger interno |
| `notif_email.js` | Notificaciones por email |

---

## Páginas

| Archivo | Sección | Descripción |
|---|---|---|
| `dashboard.html` | Inicio | Panel principal con alertas y resumen |
| `index.html` | Contratos | Alta/edición de contratos, cálculo de actualizaciones |
| `administracion.html` | Administración | Cobranzas, estado de inquilinos, pagos |
| `banco.html` | Banco | Conciliación bancaria |
| `visitas.html` | Visitas | Registro de visitas (vista día / semana / historial) |
| `tasaciones.html` | Tasaciones | Tasaciones de propiedades |
| `ventas.html` | Ventas/Propiedades | Gestión de propiedades en venta y compradores |
| `tareas.html` | Tareas | Lista de tareas internas |
| `configuracion.html` | Configuración | Ajustes de la inmobiliaria, apariencia, vendedores, alertas |
| `ayuda.html` | Ayuda | Guía de uso |
| `login.html` | Auth | Login de usuarios |
| `landing.html` | Público | Landing page para captación |
| `superadmin.html` | Superadmin | Panel de administración de organizaciones |
| `superadmin_login.html` | Superadmin | Login superadmin |
| `privacidad.html` | Legal | Política de privacidad |
| `terminos.html` | Legal | Términos y condiciones |

---

## Base de datos (Supabase)

### Tablas

| Tabla | Descripción |
|---|---|
| `contratos` | Contratos de alquiler activos e históricos |
| `pagos` | Pagos registrados por contrato |
| `propiedades` | Propiedades de la inmobiliaria |
| `compradores` | Compradores/interesados en propiedades |
| `tasaciones` | Tasaciones con alertas de vencimiento |
| `visitas` | Visitas agendadas a propiedades |
| `config` | Configuración por organización |
| `vendedores` | Lista de vendedores con asignación rotativa |
| `tareas` | Tareas internas |
| `user_roles` | Rol de cada usuario dentro de su org |
| `organizations` | Organizaciones (tenants) |

### Patrón de datos
Las tablas no-contratos usan JSONB: `{ id, org_id, data: { ... } }`.

### Multi-tenancy
RLS por `org_id` en todas las tablas. El `org_id` viene del JWT en `app_metadata` (lo escribe una Edge Function al crear la org). Los usuarios solo ven y modifican datos de su propia organización.

### Auth
- Token en `localStorage` bajo clave `ga_session`
- `getTokenAsync()` en `supabase.js` refresca el token si está por vencer (coalescido)
- `anon` key: sin acceso a ninguna tabla (la app siempre requiere login)

---

## shared.js — patrones clave

```js
const GestShared = (function() { ... return { ... }; })();
```

- Todo lo que deba ser accesible desde afuera **debe estar en el `return`**.
- `initHeader(activePage)` — inyecta el header en cada página. Crea el overlay y el menú mobile como hijos de `document.body` (NO dentro del header) porque `backdrop-filter` en el header rompería `position:fixed` de los hijos.
- `_injectCSS()` — inyecta todos los estilos del header y menú mobile una sola vez (`#gs-css`).
- `getConfig()` / `saveConfig()` — config en `localStorage` + sincroniza con Supabase.
- `syncConfigFromSupabase()` — carga config remota al iniciar.

### Config keys relevantes
| Key | Default | Descripción |
|---|---|---|
| `diasFinContrato` | 65 | Días para alertar contrato por vencer |
| `diasActualizacion` | 10 | Días para alertar actualización pendiente |
| `diasAlertaTasacion1/2` | 7/15 | Alertas de tasación |
| `moraRateDefault` | 2 | % mora por defecto |
| `adminFeeDefault` | 5 | % honorarios administración |
| `aliasInmo` | '' | Nombre de la inmobiliaria |
| `vendedores` | [] | Lista de vendedores |
| `brandName/Subtitle/Color/Logo` | — | Branding de la org |
| `theme` | 'dark' | Tema visual (preparado, no implementado aún) |

---

## Menú mobile (hamburger)

- Botón `#gs-hbg-btn` — visible solo en `max-width: 768px`
- Overlay `#gs-mob-overlay` y menú `#gs-mob-menu` — appended a `document.body`
- En desktop: `display:none !important` en `.gs-nav`, `.gs-font-ctrl`, `.gs-logout-area`
- En mobile: `display:flex` en `.gs-hbg`

---

## Seguridad

### Headers (vercel.json)
CSP estricta, HSTS, X-Frame: DENY, X-Content-Type-Options, Referrer-Policy.

### Pendientes de seguridad
- [ ] **URGENTE:** Revocar token Supabase personal que quedó expuesto (ver historial de sesiones anteriores)
- [ ] Verificación de rol server-side (hoy solo en cliente)
- [ ] Mover tokens de `localStorage` a `sessionStorage`
- [ ] Rate limiting en login superadmin
- [ ] Audit log superadmin

---

## Pendientes de producto

### UX / UI
- [ ] Tema claro/oscuro global — preparado en `configuracion.html` (campo `cfg.theme`), falta implementar `applyTheme()` en `shared.js` y las variables CSS `[data-theme="light"]` en cada página
- [ ] Revisar estilos de botones del header en tema claro (naranjas con texto blanco no contrastan sobre header blanco)

### Negocio / Onboarding
- [ ] Integración MercadoPago Subscriptions (billing)
- [ ] Self-service signup (hoy el alta de orgs es manual vía superadmin)
- [ ] Emails transaccionales (bienvenida, vencimientos, etc.)

---

## Gotchas técnicos

### backdrop-filter rompe position:fixed
Cualquier elemento con `backdrop-filter` o `transform` crea un nuevo containing block. El header tiene `backdrop-filter: blur(24px)`, por lo que overlay y menú mobile **no pueden ser hijos del header** — deben ir en `document.body`.

### CSS IIFE / orphan lines
Las limpiezas con PowerShell línea a línea pueden dejar propiedades CSS huérfanas sin selector. Un `}` sobrante hace que el navegador salga temprano de un `@media` block, haciendo que reglas mobile-only se apliquen globalmente. Siempre usar Edit directo para bloques complejos.

### Patrón JSONB
Las tablas nuevas guardan datos en `data: {}`. El mapper `fromApp()` en `supabase.js` convierte entre camelCase del cliente y snake_case de Supabase.

### inline style para nav buttons
Los botones de nav usan `el.setAttribute('style', ...)` para evitar que el CSS de la página los override. No alcanza con clases CSS.

### visitas.html — regex peligrosa
En junio 2026 un regex PowerShell `(?s)\r?\n<div id="gs-mob-menu">.*?</div>` consumió todo el contenido de la página (tabs, visitList, date nav). Se restauró desde git con `git show aa32543:visitas.html`. **Nunca usar regex multiline para limpiar HTML en PowerShell sobre este archivo.**
