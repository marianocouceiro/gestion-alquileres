# GestAlquiler v5.4 — Resumen del proyecto

**Fecha:** 29 de abril de 2026  
**Desarrollador / Propietario:** Mariano Couceiro  
**URL producción:** https://gestion-alquileres-jet.vercel.app  
**Repositorio:** https://github.com/marianocouceiro/gestion-alquileres  
**Base de datos:** Supabase — ratkgsxlqjjhjcclpcee.supabase.co  

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML + JavaScript vanilla |
| Base de datos | Supabase (PostgreSQL + Auth) |
| Hosting | Vercel (deploy automático desde GitHub) |
| Deploy | Push a GitHub main → Vercel auto-deploy |

---

## Arquitectura multi-tenant

La app es un SaaS donde cada inmobiliaria es una "organización" (org) completamente aislada mediante:

- **RLS (Row Level Security):** cada tabla tiene política `org_id = current_org_id()` que filtra automáticamente
- **JWT app_metadata:** cada usuario tiene `org_id` y `role` en su token JWT
- **org_id en todos los escritos:** cada INSERT/UPDATE incluye el `org_id` del usuario logueado via `getOrgId()`

La función helper `current_org_id()` en PostgreSQL lee el `org_id` del JWT del usuario autenticado.

---

## Tablas en Supabase

| Tabla | PK | Descripción |
|---|---|---|
| `contratos` | `id TEXT` | Contratos de alquiler (columnas snake_case directas) |
| `pagos` | `id TEXT` | Pagos mensuales (patrón JSONB `data`) |
| `visitas` | `id TEXT` | Agenda de visitas (patrón JSONB `data`) |
| `tasaciones` | `id TEXT` | Tasaciones con seguimiento (patrón JSONB `data`) |
| `propiedades` | `id TEXT` | Cartera de propiedades (patrón JSONB `data`) |
| `compradores` | `id TEXT` | Banco de compradores (patrón JSONB `data`) |
| `vendedores` | `id TEXT` | Lista de vendedores de la inmobiliaria |
| `config` | `(clave, org_id)` | Configuración global por org (PK compuesto) |
| `user_roles` | `id UUID` | Roles de usuarios (admin/operador/readonly) |
| `audit_log` | `id BIGSERIAL` | Registro de cambios (triggers en contratos y pagos) |
| `organizations` | `id UUID` | Inmobiliarias clientes (con columna `active`) |
| `tareas` | `id TEXT` | Tareas pendientes por org (columnas directas: `texto`, `observaciones`, `fecha`, `prioridad`, `completada`) |

Todas las tablas tienen `org_id NOT NULL` y RLS habilitado.

---

## Archivos del proyecto

| Archivo | Rol |
|---|---|
| `login.html` | Autenticación Supabase |
| `dashboard.html` | Resumen general + alertas + gráficos + top 5 tareas |
| `index.html` | Contratos (usa `script.js`) |
| `administracion.html` | Pagos mensuales y honorarios |
| `banco.html` | Banco de compradores |
| `ventas.html` | Propiedades en venta/alquiler |
| `visitas.html` | Agenda de visitas día/semana |
| `tasaciones.html` | Registro y seguimiento de tasaciones |
| `tareas.html` | Gestión de tareas con prioridades *(nuevo v5.4)* |
| `configuracion.html` | Ajustes, índices IPC/ICL, backup, apariencia |
| `superadmin.html` | Panel exclusivo del dueño del SaaS |
| `shared.js` | Config, branding, header dinámico, vendedores, NAV |
| `supabase.js` | Cliente BD: auth, queries, upserts con org_id |
| `script.js` | Lógica de contratos (2.600+ líneas) |
| `logger.js` | Silencia console en producción |
| `style.css` | Estilos globales |
| `vercel.json` | Headers de seguridad (CSP, HSTS, X-Frame) |

---

## Módulos implementados

### Dashboard
- Resumen de contratos activos, por actualizar y por vencer
- Visitas del día, tasaciones recientes, compradores con matches
- Procesos de venta activos
- **Bloque de tareas pendientes** (top 5 por prioridad)
- Gráficos: honorarios últimos 6 meses, cobros vs pendientes del mes

### Contratos
- Alta, edición y baja de contratos de alquiler
- Actualización por **ICL** (ratio nivel BCRA), **IPC** (variación mensual INDEC serie 148.3) o **% fijo**
- Frecuencias: trimestral, cuatrimestral, semestral, anual
- Prórrogas, acuerdos de precio, mora, depósito actualizable
- Generación de mensajes WhatsApp para inquilino y dueño
- Hasta 4 alias MercadoPago por contrato
- Mapper camelCase ↔ snake_case para la BD

### Administración
- Registro de pagos mensuales por contrato
- Honorarios y mora con badges de estado
- Vista mensual por contrato

### Visitas
- Agenda con vista día / semana / historial
- Asignación de vendedor con rotación automática
- WhatsApp automático al vendedor asignado
- Tiempo de viaje con Google Maps Distance Matrix API
- Notificaciones push del navegador

### Tasaciones
- Registro con alertas de seguimiento a 7 y 15 días
- Asignación de vendedor responsable

### Propiedades
- Cartera de propiedades en venta o alquiler
- Estado y seguimiento de procesos de venta

### Banco de compradores
- Base de clientes buscando propiedades
- Matching automático con filtros en Argenprop y MercadoLibre
- Alerta de inactividad a los 120 días

### Tareas *(nuevo en v5.4)*
- Listado completo con filtros: todas / pendientes / completadas / alta / media / baja
- Prioridades: alta, media, baja (con colores)
- Completar, editar, reabrir y eliminar tareas
- Fecha límite con alerta visual si está vencida
- Modal de nueva/editar tarea
- Bloque resumen en el dashboard (top 5 por prioridad)

### Configuración
- Ajustes generales: días alerta contratos, mora, honorarios
- Vendedores con rotación automática
- Índices IPC/ICL con historial de 3 años
- Actualización automática desde BCRA e INDEC
- **Backup y restore** en JSON
- **Apariencia (white-labeling):** nombre, subtítulo, logo y color principal por org

### Superadmin *(Fase 3)*
- Panel exclusivo para `marianocouceiro@gmail.com`
- Crear nuevas inmobiliarias (orgs)
- Crear, ver, resetear contraseña y eliminar usuarios por org
- Activar / suspender orgs
- Edge Function `gestalquiler-admin` en Supabase (Deno) con service role key

---

## Seguridad implementada

- `logger.js`: silencia console en producción, captura errores en memoria
- `vercel.json`: CSP, X-Frame-Options, HSTS, X-Content-Type-Options
- `supabase.js`: JWT en todos los headers, auto-refresh, retry 401, redirect a login
- RLS con `org_id` en **todas** las tablas
- `WITH CHECK` en políticas: ningún usuario puede escribir datos de otra org
- `audit_log` con triggers de Postgres en contratos y pagos
- Roles: admin / operador / readonly por org
- Sesión en `localStorage` key `ga_session`

---

## Usuarios de la org actual (Cristian Sanchez Propiedades)

| Email | Rol |
|---|---|
| marianocouceiro@gmail.com | Admin + Superadmin |
| kiaracouceiro@gmail.com | Operador |
| hgriselpaola@gmail.com | Operador |
| elbolo1974@hotmail.com | Operador |

**Org ID:** `a1000000-0000-0000-0000-000000000001`

---

## Links de acceso

| Pantalla | URL |
|---|---|
| App principal | https://gestion-alquileres-jet.vercel.app/login.html |
| Superadmin | https://gestion-alquileres-jet.vercel.app/superadmin.html |
| Supabase | https://supabase.com/dashboard/project/ratkgsxlqjjhjcclpcee |
| Vercel | https://vercel.com/dashboard |
| GitHub | https://github.com/marianocouceiro/gestion-alquileres |

---

## Bugs conocidos / pendientes

| # | Descripción | Impacto |
|---|---|---|
| 1 | **Responsive celular:** header en grilla en lugar de menú hamburguesa | Visual — no afecta PC |
| 2 | **Configuración "Sin conexión":** puede pasar si la sesión expiró; solución: logout y login | Medio |
| 3 | **IPC "Cargar datos base":** si INDEC devuelve nivel acumulado en lugar de variación mensual, fix en prod pero no verificado 100% | Medio |

---

## Fixes aplicados en esta sesión (29/04/2026)

| Fix | Descripción |
|---|---|
| `getOrgId()` faltaba en `supabase.js` | Todos los upserts fallaban silenciosamente sin org_id |
| `fromApp()` sin `org_id` | Los contratos se guardaban sin org_id → desaparecían al recargar |
| `tareas` tabla JSONB → columnas directas | El caché de PostgREST del free tier no veía la columna `data`; se reemplazó con columnas directas `texto`, `observaciones`, `fecha` |
| `dashboard.html` SyntaxError | `var` en lugar inválido rompía todo el JS del dashboard |
| `tareas.html` creado desde cero | No existía en el proyecto |
| NAV actualizado en todos los HTML | Link a Tareas agregado en la barra de navegación |

---

## SQL pendiente de ejecutar en Supabase

Si todavía no lo corriste, ejecutar `MIGRATION_v54_tareas.sql` en **Supabase → SQL Editor**.  
Incluye la creación de la tabla + las columnas directas + RLS + recarga de caché.

---

## Roadmap para comercialización

### Prioridad 1 — Para poder vender hoy mismo

**1. Responsive para celular** — *1 sesión*
- Header hamburguesa en pantallas < 768px
- Tablas → cards en celular, modales fullscreen, botones táctiles

**2. Landing page** — *1 sesión*
- Página pública: hero, features, precios, contacto/demo
- HTML/CSS estático en Vercel

**3. Cambiar contraseña en superadmin** — *30 min*
- Modal "Cambiar mi contraseña" en `superadmin.html`

### Prioridad 2 — Para cobrar automáticamente

**4. Billing con MercadoPago Subscriptions** — *2-3 sesiones*
- Planes mensual / anual, webhook para activar/desactivar orgs

**5. Trial automático 30 días** — *1 sesión*
- Columna `trial_ends_at` en `organizations`, suspensión automática

### Prioridad 3 — Para escalar

**6. Email de bienvenida al crear cliente** — *1 sesión*  
**7. Panel de facturación en superadmin** — *1 sesión*  
**8. Notificaciones por email a usuarios** — *1 sesión*  
**9. Sistema de migraciones de BD** — *1 sesión*  
**10. Tests básicos + CI** — *1-2 sesiones*  
**11. Vite + TypeScript** — *3-5 sesiones (baja prioridad)*
