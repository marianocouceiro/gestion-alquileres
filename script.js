/* ═══════════════════════════════════════════════════════════════
   script.js — GestAlquiler · Cristian Sanchez Propiedades
   Lógica completa: cálculos, API, UI, WhatsApp, persistencia.
   Versión refactorizada — Abril 2026
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════════
   0. CONFIG GLOBAL
══════════════════════════════════════════════════════════════ */


const SHEETS_API_URL  = ''; // GAS eliminado v5 // solo para calcularIndice
// RapidAPI key movida al servidor (code.gs) — nunca en el cliente

// Sanitización XSS — escapar datos de usuario antes de insertar en HTML
const esc = (typeof GestShared !== 'undefined') ? GestShared.esc : (v => String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));

// Umbrales dinámicos — leen de GestShared.getConfig() si disponible
function getAlertDays()    { return (typeof GestShared!=='undefined') ? GestShared.getConfig().diasActualizacion : 10; }
function getExpiringDays() { return (typeof GestShared!=='undefined') ? GestShared.getConfig().diasFinContrato   : 65; }
Object.defineProperty(window,'ALERT_DAYS',    {get:getAlertDays,configurable:true});
Object.defineProperty(window,'EXPIRING_DAYS', {get:getExpiringDays,configurable:true});
const ALIAS_INMOB_DEFAULT = 'cristian.912.sapa.mp';

/* ══════════════════════════════════════════════════════════════
   1. DATOS DE ÍNDICES — ICL (BCRA) e IPC (INDEC)
      Se cargan desde Supabase (actualizados via API del BCRA/INDEC).
      Los valores hardcodeados son el último respaldo conocido.
══════════════════════════════════════════════════════════════ */

// Datos base (último respaldo conocido — se sobreescriben al cargar desde Supabase)
const ICL_BASE = {
    "2020-07-01":  1.02, "2020-08-01":  1.04, "2020-09-01":  1.06,
    "2020-10-01":  1.09, "2020-11-01":  1.12, "2020-12-01":  1.15,
    "2021-01-01":  1.19, "2021-02-01":  1.23, "2021-03-01":  1.27,
    "2021-04-01":  1.32, "2021-05-01":  1.37, "2021-06-01":  1.43,
    "2021-07-01":  1.50, "2021-08-01":  1.57, "2021-09-01":  1.64,
    "2021-10-01":  1.72, "2021-11-01":  1.80, "2021-12-01":  1.90,
    "2022-01-01":  2.01, "2022-02-01":  2.12, "2022-03-01":  2.24,
    "2022-04-01":  2.37, "2022-05-01":  2.51, "2022-06-01":  2.65,
    "2022-07-01":  2.81, "2022-08-01":  3.00, "2022-09-01":  3.20,
    "2022-10-01":  3.43, "2022-11-01":  3.66, "2022-12-01":  3.93,
    "2023-01-01":  4.24, "2023-02-01":  4.59, "2023-03-01":  4.95,
    "2023-04-01":  5.38, "2023-05-01":  5.83, "2023-06-01":  6.33,
    "2023-07-01":  6.90, "2023-08-01":  7.56, "2023-09-01":  8.38,
    "2023-10-01":  9.19, "2023-11-01":  9.93, "2023-12-01": 11.15,
    "2024-01-01": 11.85, "2024-02-01": 12.74, "2024-03-01": 13.27,
    "2024-04-01": 13.73, "2024-05-01": 13.83, "2024-06-01": 13.95,
    "2024-07-01": 15.10, "2024-08-01": 16.42, "2024-09-01": 18.05,
    "2024-10-01": 18.92, "2024-11-01": 19.74, "2024-12-01": 20.65,
    "2025-01-01": 21.44, "2025-02-01": 22.11, "2025-03-01": 22.84,
    "2025-04-01": 23.59, "2025-05-01": 24.34, "2025-06-01": 25.20,
    "2025-07-01": 25.93, "2025-08-01": 26.58, "2025-09-01": 27.14,
    "2025-10-01": 27.72, "2025-11-01": 28.23, "2025-12-01": 28.77,
    "2026-01-01": 29.36, "2026-02-01": 29.98, "2026-03-01": 30.58,
    "2026-04-01": 31.20, "2026-05-01": 31.81,
};

// IPC Nacional — fuente: INDEC oficial (datos.gob.ar, serie 148.3_INIVELNAL_DICI_M_26)
// Variación % mensual respecto al mes anterior. Último respaldo conocido.
const IPC_BASE = {
    "2024-01": 20.6, "2024-02": 13.2, "2024-03": 11.0,
    "2024-04":  8.8, "2024-05":  4.2, "2024-06":  4.6,
    "2024-07":  4.0, "2024-08":  4.2, "2024-09":  3.5,
    "2024-10":  2.4, "2024-11":  2.4, "2024-12":  2.7,
    "2025-01":  2.2, "2025-02":  2.4, "2025-03":  3.7,
    "2025-04":  3.2, "2025-05":  3.3, "2025-06":  2.7,
    "2025-07":  3.0, "2025-08":  3.5, "2025-09":  2.9,
    "2025-10":  2.4, "2025-11":  2.4, "2025-12":  2.7,
    "2026-01":  2.9, "2026-02":  2.9, "2026-03":  3.4,
};

// Tablas activas — se reemplazan con datos de Supabase al iniciar
let ICL_FALLBACK = { ...ICL_BASE };
let IPC_MONTHLY  = { ...IPC_BASE };

/* ══════════════════════════════════════════════════════════════
   1b. CARGA DE ÍNDICES DESDE SUPABASE / BCRA
══════════════════════════════════════════════════════════════ */

/**
 * Intenta obtener ICL actualizado desde la API oficial del BCRA.
 * Endpoint: https://api.estadisticasbcra.com/icl
 * Devuelve objeto { "YYYY-MM-DD": valor } o null si falla.
 */
async function fetchICLFromBCRA() {
    // Intentar con proxy CORS (para file:// que tiene null origin)
    const endpoints = [
        'https://api.estadisticasbcra.com/icl',
        'https://corsproxy.io/?url=' + encodeURIComponent('https://api.estadisticasbcra.com/icl'),
        'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://api.estadisticasbcra.com/icl'),
    ];
    for (const url of endpoints) {
        try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const data = await r.json();
            if (!Array.isArray(data) || !data.length) continue;
            const result = {};
            for (const item of data) {
                if (item.d && item.v != null) {
                    const parts = item.d.split('-');
                    const key = `${parts[0]}-${parts[1]}-01`;
                    result[key] = parseFloat(item.v);
                }
            }
            if (Object.keys(result).length > 10) return result;
        } catch(e) { /* probar siguiente */ }
    }
    console.warn('[Índices] fetchICLFromBCRA: todos los endpoints fallaron');
    return null;
}

/**
 * Obtiene IPC Nacional mensual directamente desde la API oficial del INDEC
 * (via datos.gob.ar — sin intermediarios).
 * Serie: 148.3_INIVELNAL_DICI_M_26 — Variación % mensual respecto al mes anterior.
 * Devuelve objeto { "YYYY-MM": tasa% } o null si falla.
 */
async function fetchIPCFromArgly() {
    // Serie oficial INDEC: IPC Nacional — variación mensual
    const SERIE_ID = '148.3_INIVELNAL_DICI_M_26';
    const BASE_URL = `https://apis.datos.gob.ar/series/api/series/?ids=${SERIE_ID}&limit=60&sort=desc&format=json`;
    const endpoints = [
        BASE_URL,
        'https://corsproxy.io/?url='    + encodeURIComponent(BASE_URL),
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(BASE_URL),
    ];
    for (const url of endpoints) {
        try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const json = await r.json();
            // La API devuelve { data: [["YYYY-MM-DD", valor], ...], meta: [...] }
            if (!json.data || !Array.isArray(json.data) || json.data.length < 5) continue;
            const result = {};
            for (const [fecha, valor] of json.data) {
                if (!fecha || valor == null) continue;
                // Clave "YYYY-MM" — la API devuelve "YYYY-MM-DD"
                const key = String(fecha).substring(0, 7);
                result[key] = parseFloat(valor);
            }
            if (Object.keys(result).length > 10) {
                console.log('[Índices] IPC INDEC oficial OK:', Object.keys(result).length, 'entradas');
                return result;
            }
        } catch(e) { /* probar siguiente endpoint */ }
    }
    console.warn('[Índices] fetchIPCFromArgly (INDEC): todos los endpoints fallaron');
    return null;
}

/**
 * Intenta obtener IPC mensual desde la API del BCRA (series de tiempo).
 * Variable 27 = IPC Nacional mensual (datos desde el BCRA vía datos.gob.ar).
 * Fallback si Argly no responde.
 */
async function fetchIPCFromBCRA() {
    try {
        // IPC Nacional — API pública de estadísticasbcra.com (sin token)
        const r = await fetch('https://api.estadisticasbcra.com/ipc');
        if (!r.ok) return null;
        const data = await r.json(); // [{d: "YYYY-MM-DD", v: number (acumulado)}, ...]
        if (!Array.isArray(data) || data.length < 2) return null;
        // El IPC de esta API viene como índice acumulado, necesitamos calcular variación mensual
        const result = {};
        for (let i = 1; i < data.length; i++) {
            const prev = data[i - 1];
            const curr = data[i];
            if (!prev.v || !curr.v) continue;
            const variacion = ((curr.v / prev.v) - 1) * 100;
            const parts = curr.d.split('-');
            const key = `${parts[0]}-${parts[1]}`;
            result[key] = parseFloat(variacion.toFixed(2));
        }
        return Object.keys(result).length ? result : null;
    } catch(e) {
        console.warn('[Índices] fetchIPCFromBCRA falló:', e.message);
        return null;
    }
}

/**
 * Carga los índices desde Supabase (config keys: 'icl_data', 'ipc_data').
 * Si no hay datos en Supabase o son viejos (>5 días), intenta bajar de BCRA/Argly.
 * Siempre actualiza ICL_FALLBACK e IPC_MONTHLY en memoria.
 */
async function loadIndicesFromSupabase() {
    try {
        const cfg = await SupabaseDB.getConfig();

        // Cargar ICL
        if (cfg.icl_data && typeof cfg.icl_data === 'object' && Object.keys(cfg.icl_data).length > 10) {
            ICL_FALLBACK = { ...ICL_BASE, ...cfg.icl_data };
            console.log('[Índices] ICL cargado desde Supabase:', Object.keys(ICL_FALLBACK).length, 'entradas');
        }

        // Cargar IPC
        if (cfg.ipc_data && typeof cfg.ipc_data === 'object' && Object.keys(cfg.ipc_data).length > 10) {
            IPC_MONTHLY = { ...IPC_BASE, ...cfg.ipc_data };
            console.log('[Índices] IPC cargado desde Supabase:', Object.keys(IPC_MONTHLY).length, 'entradas');
        }

        // Verificar antigüedad — si los datos tienen más de 5 días, refrescar en background
        const lastUpdate = cfg.indices_updated_at ? new Date(cfg.indices_updated_at) : null;
        const daysSinceUpdate = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 86400000 : 999;

        if (daysSinceUpdate > 5) {
            console.log('[Índices] Datos tienen', Math.round(daysSinceUpdate), 'días — actualizando en background…');
            // No await — que corra sin bloquear la UI
            refreshIndicesFromAPI().catch(e => console.warn('[Índices] refresh background falló:', e));
        }
    } catch(e) {
        console.warn('[Índices] loadIndicesFromSupabase falló:', e.message);
    }
}

/**
 * Descarga índices desde BCRA/Argly, guarda en Supabase y actualiza memoria.
 * Llamada explícita desde configuración o automática en background.
 * Devuelve { ok, icl_entries, ipc_entries, message }
 */
async function refreshIndicesFromAPI() {
    const result = { ok: false, icl_entries: 0, ipc_entries: 0, message: '' };
    const updates = {};

    // ── ICL desde estadisticasbcra.com ──────────────────────
    console.log('[Índices] Descargando ICL desde BCRA…');
    const iclData = await fetchICLFromBCRA();
    if (iclData && Object.keys(iclData).length > 10) {
        ICL_FALLBACK = { ...ICL_BASE, ...iclData };
        updates.icl_data = iclData;
        result.icl_entries = Object.keys(iclData).length;
        console.log('[Índices] ICL OK:', result.icl_entries, 'entradas');
    } else {
        result.message += 'ICL: no se pudo obtener del BCRA. ';
        console.warn('[Índices] ICL falló o datos insuficientes');
    }

    // ── IPC: primero Argly, fallback BCRA ───────────────────
    console.log('[Índices] Descargando IPC desde Argly…');
    let ipcData = await fetchIPCFromArgly();
    if (!ipcData || Object.keys(ipcData).length < 10) {
        console.warn('[Índices] Argly falló, intentando BCRA para IPC…');
        ipcData = await fetchIPCFromBCRA();
    }
    if (ipcData && Object.keys(ipcData).length > 10) {
        IPC_MONTHLY = { ...IPC_BASE, ...ipcData };
        updates.ipc_data = ipcData;
        result.ipc_entries = Object.keys(ipcData).length;
        console.log('[Índices] IPC OK:', result.ipc_entries, 'entradas');
    } else {
        result.message += 'IPC: no se pudo obtener. ';
        console.warn('[Índices] IPC falló o datos insuficientes');
    }

    // ── Guardar en Supabase si hay algo nuevo ───────────────
    if (Object.keys(updates).length) {
        updates.indices_updated_at = new Date().toISOString();
        // Calcular último mes real de ICL e IPC para mostrarlo en la UI
        if (updates.icl_data) {
            const lastICL = Object.keys(updates.icl_data).sort().pop();
            updates.icl_ultimo_mes = lastICL || '';
        }
        if (updates.ipc_data) {
            const lastIPC = Object.keys(updates.ipc_data).sort().pop();
            updates.ipc_ultimo_mes = lastIPC || '';
        }
        try {
            await SupabaseDB.saveConfig(updates);
            console.log('[Índices] Guardado en Supabase OK');
            result.ok = true;
            // Invalidar cache de cronogramas para que recalculen con datos nuevos
            scheduleCache.clear();
        } catch(e) {
            console.warn('[Índices] Error guardando en Supabase:', e.message);
            result.message += 'Error al guardar en Supabase. ';
        }
    }

    if (!result.message) result.message = `ICL: ${result.icl_entries} entradas. IPC: ${result.ipc_entries} entradas.`;
    return result;
}

/* ══════════════════════════════════════════════════════════════
   2. (eliminado — IPC_MONTHLY ahora es dinámico, definido arriba)
══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   3. UTILIDADES GENERALES
══════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/** ARS con separadores argentinos */
function formatCurrency(n) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency', currency: 'ARS',
        minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(n);
}

/** DD/MM/YYYY */
function formatDate(d) {
    if (!d) return '—';
    if (typeof d === 'string') d = new Date(d + 'T00:00:00');
    if (!(d instanceof Date) || isNaN(d)) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "15 de abril de 2026" */
function formatDateLong(d) {
    if (!d) return '—';
    if (typeof d === 'string') d = new Date(d + 'T00:00:00');
    if (!(d instanceof Date) || isNaN(d)) return '—';
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

/* ══════════════════════════════════════════════════════════════
   4. CÁLCULO ICL / IPC — fallback local
══════════════════════════════════════════════════════════════ */

/** Devuelve la última tasa IPC conocida (dinámico) */
function getIpcLastKnownRate() {
    const keys = Object.keys(IPC_MONTHLY).sort();
    return keys.length ? IPC_MONTHLY[keys[keys.length - 1]] : 2.4;
}

function getICLFallbackValue(date) {
    const targetStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;
    if (ICL_FALLBACK[targetStr]) return ICL_FALLBACK[targetStr];
    const keys = Object.keys(ICL_FALLBACK).sort();
    let best = null;
    for (const k of keys) { if (k <= targetStr) best = ICL_FALLBACK[k]; else break; }
    return best || ICL_FALLBACK[keys[0]];
}

/** Acumula tasas mensuales IPC para `freq` meses a partir de `fromDate` */
function getIpcAccumulatedRate(fromDate, freq) {
    let factor = 1;
    for (let i = 0; i < freq; i++) {
        const d = new Date(fromDate);
        d.setMonth(d.getMonth() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const rate = IPC_MONTHLY[key] !== undefined ? IPC_MONTHLY[key] : getIpcLastKnownRate();
        factor *= (1 + rate / 100);
    }
    return factor - 1;
}

/* ══════════════════════════════════════════════════════════════
   5. FECHAS DE CONTRATO
══════════════════════════════════════════════════════════════ */

/** Normaliza al día 1 del mes de inicio (contratos siempre cobran del 1 al 10) */
function normalizeStart(c) {
    const d = new Date(c.startDate + 'T00:00:00');
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Duración total incluyendo prórrogas */
function getTotalDuration(c) {
    const extra = (c.prorrogas || []).reduce((sum, p) => sum + parseInt(p.months || 0), 0);
    return parseInt(c.duration) + extra;
}

/** Fecha de vencimiento del contrato (incluye prórrogas) */
function getEndDate(c) {
    const s = new Date(c.startDate + 'T00:00:00');
    const e = new Date(s);
    e.setMonth(e.getMonth() + getTotalDuration(c));
    e.setDate(e.getDate() - 1);
    return e;
}

/**
 * Primer día del mes en que inicia la PRÓXIMA prórroga
 * (= día 1 del mes siguiente al vencimiento actual SIN la nueva prórroga).
 */
function getNextProrrogaStart(c) {
    const s = new Date(c.startDate + 'T00:00:00');
    const e = new Date(s);
    e.setMonth(e.getMonth() + getTotalDuration(c));
    // e apunta al día 1 del mes siguiente al fin (sin el -1 de getEndDate)
    return `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-01`;
}

/** Array de { date, periodNumber } — todos los períodos de actualización */
function getUpdateDates(c) {
    const start = normalizeStart(c);
    const dur   = getTotalDuration(c);
    const freq  = parseInt(c.updateFrequency);
    const endDate = getEndDate(c);
    const dates = [];
    for (let m = freq; m <= dur; m += freq) {
        const d = new Date(start);
        d.setMonth(d.getMonth() + m);
        // No mostrar actualización si el vencimiento cae en ese mismo mes y ya pasó el día 10
        const mismoMes = d.getFullYear() === endDate.getFullYear() && d.getMonth() === endDate.getMonth();
        if (mismoMes && endDate.getDate() <= 10) continue;
        dates.push({ date: d, periodNumber: m / freq + 1 });
    }
    return dates;
}

/**
 * Devuelve el PRIMER período sin confirmar (sin límite de días al pasado).
 * Un período se considera "hecho" solo si está marcado en updatesHistory.
 */
function getNextUpdate(c) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const history = c.updatesHistory || [];
    for (const u of getUpdateDates(c)) {
        const marked = history.some(h => h.periodNumber === u.periodNumber);
        if (!marked) {
            const ud = new Date(u.date); ud.setHours(0, 0, 0, 0);
            return { ...u, daysUntil: Math.ceil((ud - now) / 864e5) };
        }
    }
    return null;
}

/** ¿El contrato necesita actualización? (pendiente ≤ ALERT_DAYS días) */
function hasAlert(c) {
    const n = getNextUpdate(c);
    return n ? n.daysUntil >= 0 && n.daysUntil <= ALERT_DAYS : false;
}

/** ¿El contrato está vencido? (considera prórrogas) */
function isExpired(c) {
    const s = new Date(c.startDate + 'T00:00:00');
    const e = new Date(s);
    e.setMonth(e.getMonth() + getTotalDuration(c));
    return new Date() > e;
}

/** ¿Hay actualización pendiente que ya pasó el día 10 del mes? */
function isOverduePast10(nu) {
    if (!nu) return false;
    const ud = nu.date instanceof Date ? nu.date : new Date(nu.date);
    const threshold = new Date(ud.getFullYear(), ud.getMonth(), 10);
    threshold.setHours(23, 59, 59, 0);
    return new Date() > threshold && nu.daysUntil < 0;
}

/** ¿Actualiza en el mes indicado? */
function updatesInMonth(c, month, year) {
    return getUpdateDates(c).some(u => u.date.getMonth() === month && u.date.getFullYear() === year);
}

/* ══════════════════════════════════════════════════════════════
   6. MOTOR DE CÁLCULO — CRONOGRAMA DE PERÍODOS
      Prioridad: ARquiler API → fallback local ICL/IPC
══════════════════════════════════════════════════════════════ */

// Cache de cronogramas: cacheKey → { sched, ts }
// TTL: 30 minutos — evita datos desactualizados si la página queda abierta
const scheduleCache = new Map();
const SCHEDULE_CACHE_TTL = 30 * 60 * 1000;

function contractCacheKey(c) {
    return `${c.id}|${c.startDate}|${c.updateFrequency}|${c.indexType}|${c.initialAmount}|${c.fixedPercent||''}|${c.acuerdoMonto||''}|${c.acuerdoFecha||''}`;
}

function invalidateScheduleCache(c) {
    scheduleCache.delete(contractCacheKey(c));
}

// ── 6a. Cálculo FIJO (no requiere API) ────────────────────────
function buildFijoSchedule(c) {
    const start = normalizeStart(c);
    const freq  = parseInt(c.updateFrequency);
    const dur   = getTotalDuration(c);          // ← incluye prórrogas
    const fp    = parseFloat(c.fixedPercent) || 0;
    const base  = parseFloat(c.initialAmount);
    const sched = [{ periodNumber: 1, date: new Date(start), amount: base, dif: 0, estimated: false }];
    let amt = base;
    for (let m = freq; m <= dur; m += freq) {
        amt = Math.round(amt * (1 + fp / 100));
        const d = new Date(start); d.setMonth(d.getMonth() + m);
        sched.push({ periodNumber: m / freq + 1, date: d, amount: amt, dif: fp, estimated: false });
    }
    applyAcuerdo(sched, c);
    applyProrrogas(sched, c);                   // ← aplica nuevos montos de prórroga
    return sched;
}

// ── 6b. Cálculo fallback ICL/IPC local ────────────────────────
// Se calcula el cronograma puro (sin acuerdo/prórroga) y luego
// applyAcuerdo() y applyProrrogas() ajustan montos.
function buildFallbackSchedule(c) {
    const start    = normalizeStart(c);
    const freq     = parseInt(c.updateFrequency);
    const dur      = getTotalDuration(c);       // ← incluye prórrogas
    const base     = parseFloat(c.initialAmount);
    const iclStart = c.indexType === 'ICL' ? getICLFallbackValue(start) : null;
    const sched    = [{ periodNumber: 1, date: new Date(start), amount: base, dif: 0, estimated: false }];

    for (let m = freq; m <= dur; m += freq) {
        const d = new Date(start); d.setMonth(d.getMonth() + m);
        let periodRate, newAmt;

        if (c.indexType === 'IPC') {
            const periodStart = new Date(start); periodStart.setMonth(periodStart.getMonth() + m - freq);
            periodRate = getIpcAccumulatedRate(periodStart, freq);
            newAmt = Math.round(sched[sched.length - 1].amount * (1 + periodRate));
        } else if (c.indexType === 'ICL') {
            const iclUpdate = getICLFallbackValue(d);
            const factor = iclStart && iclUpdate ? iclUpdate / iclStart : 1;
            newAmt = Math.round(base * factor);
            periodRate = factor - 1;
        } else {
            periodRate = 0; newAmt = base;
        }
        sched.push({ periodNumber: m / freq + 1, date: d, amount: newAmt,
                     dif: parseFloat((periodRate * 100).toFixed(2)), estimated: true });
    }

    applyAcuerdo(sched, c);
    applyProrrogas(sched, c);                   // ← aplica nuevos montos de prórroga
    return sched;
}

/**
 * Aplica el acuerdo de nuevo valor al cronograma ya calculado.
 *
 * Regla:
 *  - Períodos ANTERIORES al acuerdo  : intactos
 *  - Período DEL acuerdo             : queda en EXACTAMENTE acuerdoMonto
 *  - Períodos SIGUIENTES al acuerdo  : escalan proporcionalmente
 *    (factor = acuerdoMonto / monto_calculado_del_propio_período)
 *
 * Esto garantiza que cuando el usuario pone $550.000 a mano para el
 * período 3, la columna "Monto Actual" muestra $550.000 exacto.
 */
function applyAcuerdo(sched, c) {
    if (!c.acuerdoMonto || !c.acuerdoFecha) return;
    const acuerdoMonto = parseFloat(c.acuerdoMonto);
    const acuerdoFecha = new Date(c.acuerdoFecha + 'T00:00:00');
    acuerdoFecha.setHours(0, 0, 0, 0);

    const idxAcuerdo = sched.findIndex(p => {
        const pd = new Date(p.date); pd.setHours(0, 0, 0, 0);
        return pd >= acuerdoFecha;
    });
    if (idxAcuerdo < 0) return;

    // Factor basado en el PROPIO período del acuerdo (no en el anterior)
    const originalAtAcuerdo = sched[idxAcuerdo].amount;
    const factor = originalAtAcuerdo > 0 ? acuerdoMonto / originalAtAcuerdo : 1;

    // Período del acuerdo: monto exacto ingresado por el usuario
    sched[idxAcuerdo].amount = acuerdoMonto;
    sched[idxAcuerdo].acuerdo = true;

    // Períodos siguientes: misma escala proporcional
    for (let i = idxAcuerdo + 1; i < sched.length; i++) {
        sched[i].amount = Math.round(sched[i].amount * factor);
    }
}

/**
 * Aplica los montos acordados de cada prórroga al cronograma.
 * Se llama DESPUÉS de applyAcuerdo; las prórrogas se aplican en orden cronológico.
 *
 * Para cada prórroga:
 *  - El período cuya fecha >= prorrogaStart queda en EXACTAMENTE p.newAmount
 *  - Los períodos siguientes escalan proporcionalmente
 */
function applyProrrogas(sched, c) {
    const prorrogas = (c.prorrogas || [])
        .filter(p => p.newAmount && p.startDate)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const p of prorrogas) {
        const pFecha = new Date(p.startDate + 'T00:00:00');
        pFecha.setHours(0, 0, 0, 0);

        const idx = sched.findIndex(entry => {
            const ed = new Date(entry.date); ed.setHours(0, 0, 0, 0);
            return ed >= pFecha;
        });
        if (idx < 0) continue;

        const originalAtP = sched[idx].amount;
        const newAmt      = parseFloat(p.newAmount);
        const factor      = originalAtP > 0 ? newAmt / originalAtP : 1;

        sched[idx].amount   = newAmt;
        sched[idx].prorroga = true;

        for (let i = idx + 1; i < sched.length; i++) {
            sched[i].amount = Math.round(sched[i].amount * factor);
        }
    }
}

/**
 * Carga el cronograma completo para un contrato.
 * Siempre usa fallback local (ICL/IPC hardcodeado).
 * RapidAPI queda disponible SOLO para llamada explícita desde el detalle del contrato.
 */
async function fetchContractSchedule(c) {
    const key = contractCacheKey(c);
    const cached = scheduleCache.get(key);
    if (cached && (Date.now() - cached.ts) < SCHEDULE_CACHE_TTL) return cached.sched;
    const sched = c.indexType === 'FIJO' ? buildFijoSchedule(c) : buildFallbackSchedule(c);
    scheduleCache.set(key, { sched, ts: Date.now() });
    return sched;
}

/**
 * Llama a RapidAPI via GAS para obtener el cronograma oficial.
 * Solo se llama explícitamente desde el detalle del contrato (botón "Actualizar índice").
 */
async function fetchScheduleFromAPI(c) {
    try {
        const start = normalizeStart(c);
        const dateStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-01`;
        const _token = localStorage.getItem('gest_api_token') || '';
        const resp = await fetch(SHEETS_API_URL + '?' + new URLSearchParams({
            action: 'calcularIndice',
            amount: String(parseFloat(c.initialAmount)),
            date:   dateStr,
            months: String(parseInt(c.updateFrequency)),
            rate:   c.indexType.toLowerCase(),
            token:  _token
        }).toString());
        if (!resp.ok) return null;
        const json = await resp.json();
        if (!json.success || !Array.isArray(json.data) || !json.data.length) return null;
        const base = parseFloat(c.initialAmount);
        const sched = [{ periodNumber: 1, date: start, amount: base, dif: 0, estimated: false }];
        json.data.forEach((item, idx) => {
            sched.push({
                periodNumber: idx + 2,
                date:       new Date(item.date + 'T00:00:00'),
                amount:     Math.round(item.amount),
                dif:        item.dif || 0,
                estimated:  item.estimated || false
            });
        });
        const totalDur = getTotalDuration(c);
        const origDur  = parseInt(c.duration);
        if (totalDur > origDur) {
            const freq     = parseInt(c.updateFrequency);
            const iclStart = c.indexType === 'ICL' ? getICLFallbackValue(start) : null;
            for (let m = origDur + freq; m <= totalDur; m += freq) {
                const d = new Date(start); d.setMonth(d.getMonth() + m);
                let newAmt, periodRate;
                if (c.indexType === 'IPC') {
                    const ps = new Date(start); ps.setMonth(ps.getMonth() + m - freq);
                    periodRate = getIpcAccumulatedRate(ps, freq);
                    newAmt = Math.round(sched[sched.length - 1].amount * (1 + periodRate));
                } else if (c.indexType === 'ICL') {
                    const iclU = getICLFallbackValue(d);
                    const factor = iclStart && iclU ? iclU / iclStart : 1;
                    newAmt = Math.round(base * factor);
                    periodRate = factor - 1;
                } else {
                    periodRate = 0; newAmt = sched[sched.length - 1].amount;
                }
                sched.push({ periodNumber: m / freq + 1, date: d, amount: newAmt,
                             dif: parseFloat((periodRate * 100).toFixed(2)), estimated: true });
            }
        }
        applyAcuerdo(sched, c);
        applyProrrogas(sched, c);
        const key = contractCacheKey(c);
        scheduleCache.set(key, { sched, ts: Date.now() });
        return sched;
    } catch (err) {
        console.warn(`⚠️ ARquiler API (${c.address}):`, err.message);
        return null;
    }
}

/** Pre-carga cronogramas de todos los contratos en paralelo */
async function preloadAllSchedules() {
    const contracts = getContracts();
    if (!contracts.length) return;
    const banner = $('#loadingBanner');
    banner.style.display = 'block';
    try {
        await Promise.allSettled(contracts.map(c => fetchContractSchedule(c)));
    } finally {
        banner.style.display = 'none';
    }
}

// ── Helpers síncronos post-preload ─────────────────────────────

function getCurrentAmountFromCache(c) {
    const _cached = scheduleCache.get(contractCacheKey(c));
    const sched = _cached ? _cached.sched : undefined;
    if (!sched || !sched.length) return { amount: parseFloat(c.initialAmount), dif: 0, periodNumber: 1, estimated: false };
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let current = sched[0];
    for (const entry of sched) {
        const ed = new Date(entry.date); ed.setHours(0, 0, 0, 0);
        if (ed <= now) current = entry; else break;
    }
    return current;
}

function getPeriodAmountFromCache(c, periodNumber) {
    const _cached = scheduleCache.get(contractCacheKey(c));
    const sched = _cached ? _cached.sched : undefined;
    if (!sched) return { amount: parseFloat(c.initialAmount), dif: 0, estimated: false };
    return sched.find(e => e.periodNumber === periodNumber) || sched[sched.length - 1];
}

async function calcCurrentAmount(c) {
    await fetchContractSchedule(c);
    const e = getCurrentAmountFromCache(c);
    return { amount: e.amount, variation: e.dif, source: e.estimated ? `${c.indexType} (est.)` : c.indexType };
}

async function calcPeriodAmount(c, pn) {
    await fetchContractSchedule(c);
    const e = getPeriodAmountFromCache(c, pn);
    return { amount: e.amount, variation: e.dif, source: e.estimated ? `${c.indexType} (est.)` : c.indexType };
}

/* ══════════════════════════════════════════════════════════════
   7. HISTORIAL DE ACTUALIZACIONES
══════════════════════════════════════════════════════════════ */

function getUpdHistory(c) {
    return (c.updatesHistory || []).slice().sort((a, b) => a.periodNumber - b.periodNumber);
}

function isMarkedUpdated(c, nu) {
    if (!nu) return false;
    return (c.updatesHistory || []).some(h => h.periodNumber === nu.periodNumber);
}

/** Devuelve el monto congelado de un período confirmado, o null */
function getStoredAmount(c, periodNumber) {
    if (!periodNumber) return null;
    const h = (c.updatesHistory || []).find(h => h.periodNumber === periodNumber);
    if (!h || !h.amount) return null;
    if (c.acuerdoMonto && c.acuerdoFecha) {
        const _cached = scheduleCache.get(contractCacheKey(c));
    const sched = _cached ? _cached.sched : undefined;
        if (sched) {
            const entry = sched.find(p => p.periodNumber === periodNumber);
            if (entry && entry.acuerdo) return null;
        }
    }
    return h.amount;
}

async function unmarkUpdated(c, periodNumber) {
    if (!periodNumber) return;
    const history = c.updatesHistory || [];
    const entry = history.find(h => h.periodNumber === periodNumber);
    lastUndoneEntry = entry ? { contractId: c.id, entry } : null;
    await updateContract(c.id, { updatesHistory: history.filter(h => h.periodNumber !== periodNumber) });
}

async function reDoUpdated() {
    if (!lastUndoneEntry) return false;
    const { contractId, entry } = lastUndoneEntry;
    const c = getContractById(contractId);
    if (!c) return false;
    const history = (c.updatesHistory || []).filter(h => h.periodNumber !== entry.periodNumber);
    history.push(entry);
    await updateContract(contractId, { updatesHistory: history });
    lastUndoneEntry = null;
    return true;
}

/* ══════════════════════════════════════════════════════════════
   8. PERSISTENCIA — GOOGLE SHEETS
══════════════════════════════════════════════════════════════ */

let contractsCache = [];

// ── Cache localStorage para carga instantánea ─────────────────────
const CONTRACTS_LS_KEY = 'gest_contracts_cache';
const CONTRACTS_LS_TTL = 5 * 60 * 1000; // 5 minutos

function saveContractsToLS(contracts) {
    try {
        localStorage.setItem(CONTRACTS_LS_KEY, JSON.stringify({
            ts: Date.now(),
            data: contracts
        }));
    } catch(e) { console.warn('[Cache]', e); }
}

function loadContractsFromLS() {
    try {
        const raw = localStorage.getItem(CONTRACTS_LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) return null;
        // Sin límite de TTL para mostrar — siempre mostramos lo que hay
        // El fetch en background siempre actualiza igual
        return parsed.data;
    } catch(e) { return null; }
}

/**
 * Llama a la API de Google Sheets.
 * Reintenta 1 vez si falla o si la respuesta no es JSON válido,
 * para absorber la latencia variable de Apps Script (~1-5s).
 */
async function sheetsRequest(params, retries = 1) {
    const token = localStorage.getItem('gest_api_token') || '';
    if (token) params = Object.assign({}, params, { token });
    const WRITE = new Set(['save','delete']);
    const isWrite = WRITE.has(params.action || '');
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            let resp;
            if (isWrite) {
                resp = await fetch(SHEETS_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(params).toString()
                });
            } else {
                resp = await fetch(SHEETS_API_URL + '?' + new URLSearchParams(params).toString());
            }
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (err) {
            if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
            else throw err;
        }
    }
}

/** Fingerprint rápido del cache: IDs + timestamps de actualización */
function cacheFingerprint(contracts) {
    return contracts.map(c => `${c.id}:${c.updatedAt || c.createdAt || ''}`).sort().join('|');
}

/**
 * Carga contratos desde Sheets.
 * Devuelve true si los datos cambiaron, false si son iguales al cache actual.
 */
async function loadFromSheets() {
    const contracts = await SupabaseDB.getContratos();
    const newFingerprint = cacheFingerprint(contracts);
    const oldFingerprint = cacheFingerprint(contractsCache);
    if (newFingerprint === oldFingerprint) return false;  // sin cambios
    contractsCache = contracts;
    saveContractsToLS(contractsCache);  // guardar en localStorage
    return true;  // hubo cambios
}

function getContracts() {
    return [...contractsCache].sort((a, b) =>
        a.address.localeCompare(b.address, 'es', { sensitivity: 'base' }));
}

function getContractById(id) {
    return contractsCache.find(c => c.id === id) || null;
}

async function addContract(c) {
    c.id = generateId();
    c.createdAt = new Date().toISOString();
    contractsCache.push(c);
    await SupabaseDB.upsertContrato(c);
    return c;
}

async function updateContract(id, data) {
    const i = contractsCache.findIndex(c => c.id === id);
    if (i === -1) return;
    contractsCache[i] = { ...contractsCache[i], ...data, updatedAt: new Date().toISOString() };
    await SupabaseDB.upsertContrato(contractsCache[i]);
    return contractsCache[i];
}

async function deleteContract(id) {
    contractsCache = contractsCache.filter(c => c.id !== id);
    await SupabaseDB.deleteContrato(id);
}

/** Migración única: localStorage → updatesHistory en Sheets */
async function migrateLocalStorageMarks() {
    const contracts = getContracts();
    for (const c of contracts) {
        if (c.updatesHistory && c.updatesHistory.length > 0) continue;
        const localMarks = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(`upd__${c.id}__`)) {
                    try {
                        const v = JSON.parse(localStorage.getItem(k));
                        if (v && v.periodNumber) localMarks.push(v);
                    } catch(e){ console.error('[GestAlquiler]', e); }
                }
            }
        } catch(e){ console.error('[GestAlquiler]', e); }
        if (localMarks.length > 0) {
            await updateContract(c.id, { updatesHistory: localMarks });
            localMarks.forEach(m => {
                try { localStorage.removeItem(`upd__${c.id}__${m.periodNumber}`); } catch(e){ console.error('[GestAlquiler]', e); }
            });
        }
    }
}

/* ══════════════════════════════════════════════════════════════
   9. GENERACIÓN DE MENSAJE WHATSAPP
══════════════════════════════════════════════════════════════ */

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function getPeriodMonthNames(updateDate, freq, endDate) {
    const names = [];
    for (let i = 0; i < freq; i++) {
        const d = new Date(updateDate);
        d.setMonth(d.getMonth() + i);
        if (endDate) {
            const inicioMes = new Date(d.getFullYear(), d.getMonth(), 1);
            if (inicioMes >= endDate) break;
        }
        names.push(MESES[d.getMonth()]);
    }
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
}

/**
 * Genera el mensaje de WhatsApp.
 * @param {object} c          — contrato
 * @param {object} ui         — { nextDate, newAmount, periodNumber }
 * @param {number|null} prevAmount — monto del período anterior (para depósito)
 * @param {boolean} isAPIAmount   — true = monto viene de la API (no fue cambiado a mano)
 */
/** Devuelve si aplica actualización de depósito para una fecha dada.
 *  Si cae dentro de una prórroga, usa el setting de esa prórroga. */
function getDepositSettingForDate(c, date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    const prorrogas = (c.prorrogas || [])
        .slice()
        .sort((a, b) => b.startDate.localeCompare(a.startDate)); // más reciente primero
    for (const p of prorrogas) {
        const pStart = new Date(p.startDate + 'T00:00:00'); pStart.setHours(0, 0, 0, 0);
        if (d >= pStart) return !!p.depositUpdate;
    }
    return !!c.depositUpdate;
}

/** Devuelve true si una fecha cae dentro de alguna prórroga */
function isInProrroga(c, date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    return (c.prorrogas || []).some(p => {
        const ps = new Date(p.startDate + 'T00:00:00'); ps.setHours(0, 0, 0, 0);
        return d >= ps;
    });
}

function genMsg(c, ui, prevAmount = null, isAPIAmount = true) {
    // ── Índice efectivo ──
    const usaAcuerdo = c.acuerdoFecha && ui.nextDate >= new Date(c.acuerdoFecha + 'T00:00:00');
    const idxEfectivo = (usaAcuerdo && c.acuerdoIndice) ? c.acuerdoIndice : c.indexType;
    const freq = parseInt(c.updateFrequency);
    const endDate = getEndDate(c);
    const meses = getPeriodMonthNames(ui.nextDate, freq, endDate);
    const vencimiento = formatDate(endDate);
    const enProrroga  = isInProrroga(c, ui.nextDate);

    const alquiler = ui.newAmount;

    // ── Mora (días 11 en adelante del mes de actualización) ──
    const moraRate = c.moraRate != null ? parseFloat(c.moraRate) : 2;
    const hoy = new Date();
    let diasMora = 0;
    if (ui.periodNumber > 1) {
        const fechaUpdate = ui.nextDate instanceof Date ? ui.nextDate : new Date(ui.nextDate);
        const updateYaPaso = hoy >= fechaUpdate;
        const mismoMes = hoy.getMonth() === fechaUpdate.getMonth() && hoy.getFullYear() === fechaUpdate.getFullYear();
        const diaHoy = (updateYaPaso && mismoMes) ? hoy.getDate() : 0;
        diasMora = diaHoy > 10 ? diaHoy - 10 : 0;
    }
    const moraPorDia = Math.round(alquiler * moraRate / 100);
    const moraTotal  = diasMora * moraPorDia;

    // ── Depósito ──
    // Usa el setting de la prórroga activa (si corresponde) o el del contrato base.
    const depositActivo = getDepositSettingForDate(c, ui.nextDate);
    let depositDiff = 0;
    let depAnterior = 0;
    let depNuevo    = 0;
    if (depositActivo && prevAmount !== null) {
        depAnterior = prevAmount;
        depNuevo    = alquiler;
        depositDiff = Math.max(0, depNuevo - depAnterior);
    }

    // ── Totales ──
    const baseHonorarios = alquiler + moraTotal;
    const honorarios = c.adminFee ? Math.round(baseHonorarios * parseFloat(c.adminFee) / 100) : 0;
    const totalInquilino = alquiler + moraTotal + depositDiff;
    const alDueno = totalInquilino - honorarios;

    const ownerAliases = [c.aliasOwner1, c.aliasOwner2, c.aliasOwner3, c.aliasOwner4].filter(Boolean);
    const aliasInmob   = c.aliasInmobiliaria || (typeof GestShared!=='undefined'?GestShared.getConfig().aliasInmo:ALIAS_INMOB_DEFAULT);

    // ── Formato spec ──
    const idxLabel = idxEfectivo === 'FIJO'
        ? `Porcentaje fijo: ${c.fixedPercent}% · cada ${freq} meses`
        : `Índice: ${idxEfectivo} · cada ${freq} meses`;

    const prorrogaLabel = enProrroga ? ' _(Prórroga)_' : '';
    let msg = `*ACTUALIZACION DE ALQUILER*${prorrogaLabel}\n`;
    msg += `*${c.address}*\n`;
    msg += `\n`;
    msg += `*${idxLabel}* - *Vencimiento contrato: ${vencimiento}*\n`;
    msg += `\n`;
    msg += `*Nuevo alquiler para los meses de (${meses}):* ${formatCurrency(alquiler)}\n`;

    if (moraTotal > 0) {
        msg += `*Mora (${diasMora} día${diasMora > 1 ? 's' : ''}):* ${formatCurrency(moraTotal)}\n`;
    }
    if (depositDiff > 0) {
        msg += `Actualizacion deposito: ${formatCurrency(depAnterior)} → ${formatCurrency(depNuevo)} (diferencia: ${formatCurrency(depositDiff)})\n`;
    }
    if (moraTotal > 0 || depositDiff > 0) {
        msg += `*Total a pagar:* ${formatCurrency(totalInquilino)}\n`;
    }

    msg += `\n`;

    if (honorarios > 0 && !c.honorariosPorDueno) {
        msg += `*Depositar a la inmobiliaria:* ${formatCurrency(honorarios)} (${c.adminFee}% sobre ${formatCurrency(baseHonorarios)})\n`;
        msg += `Alias Inmobiliaria: ${aliasInmob}\n`;
        msg += `\n`;
        msg += `*Depositar al propietario:* ${formatCurrency(alDueno)}\n`;
        if (ownerAliases.length) msg += `Alias: ${ownerAliases.join(' / ')}\n`;
    } else {
        const totalDueno = c.honorariosPorDueno ? totalInquilino : alDueno;
        msg += `*Depositar al propietario:* ${formatCurrency(totalDueno)}\n`;
        if (ownerAliases.length) msg += `Alias: ${ownerAliases.join(' / ')}\n`;
    }

    msg += `\n_Cristian Sanchez Propiedades_`;
    return msg;
}

async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch {
        const ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); document.body.removeChild(ta); return true; }
        catch { document.body.removeChild(ta); return false; }
    }
}

function openWA(t) { window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); }

/* ══════════════════════════════════════════════════════════════
   10. IMPRIMIR FICHA A4
══════════════════════════════════════════════════════════════ */

function printContract(c) {
    const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fmtFecha = d => { const dd = d instanceof Date ? d : new Date(d + 'T00:00:00'); return `${String(dd.getDate()).padStart(2,'0')}/${String(dd.getMonth()+1).padStart(2,'0')}/${dd.getFullYear()}`; };
    const fmtMes   = d => { const dd = d instanceof Date ? d : new Date(d); return MESES_LARGO[dd.getMonth()] + ' ' + dd.getFullYear(); };
    const fmtNum   = n => new Intl.NumberFormat('es-AR').format(n || 0);

    const start = new Date(c.startDate + 'T00:00:00');
    const end   = new Date(start); end.setMonth(end.getMonth() + parseInt(c.duration));
    const freq  = parseInt(c.updateFrequency);
    const normalStart = new Date(start.getFullYear(), start.getMonth(), 1);

    let rows = '';
    for (let m = 0; m < parseInt(c.duration); m += freq) {
        const desde = new Date(normalStart); desde.setMonth(desde.getMonth() + m);
        const hasta = new Date(normalStart); hasta.setMonth(hasta.getMonth() + m + freq - 1);
        const isFirst = m === 0;
        const lineContent = isFirst
            ? `<span style="font-size:8.5pt;font-weight:bold;color:#111">$ ${fmtNum(c.initialAmount)}</span>`
            : `<span style="flex:1;border-bottom:1pt solid #ccc;display:inline-block;margin-bottom:1pt;min-width:60pt"></span>`;
        rows += `<div style="display:flex;align-items:flex-end;gap:8pt;margin-bottom:5pt">
            <span style="font-size:8.5pt;white-space:nowrap;min-width:190pt">De <strong>${fmtMes(desde)}</strong> a <strong>${fmtMes(hasta)}</strong>:</span>
            ${lineContent}
        </div>`;
    }

    const servicios = [
        { label: 'Inquilino paga ABL',      val: !!c.pagaAbl },
        { label: 'Inquilino paga AYSA',     val: !!c.pagaAysa },
        { label: 'Inquilino paga Luz',      val: !!c.pagaLuz },
        { label: 'Inquilino paga Gas',      val: !!c.pagaGas },
        { label: 'Inquilino paga Expensas', val: !!c.pagaExpensas }
    ];
    const chkHtml = servicios.map(s =>
        `<div style="display:flex;align-items:center;gap:5pt;font-size:9pt">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:11pt;height:11pt;border:1.5pt solid #333;border-radius:2pt;flex-shrink:0;font-size:9pt;font-weight:bold;color:#333">${s.val ? '✕' : ''}</span>
            <span>${s.label}</span>
        </div>`
    ).join('');

    let obsLines = '';
    for (let i = 0; i < 4; i++) obsLines += `<div style="height:1cm;border-bottom:0.5pt solid #ccc"></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Contrato - ${c.address}</title>
    <style>
        @page { size: A4; margin: 0.9cm 2cm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 9pt; color: #111; line-height: 1.3; }
        .lbl { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.3px; color: #555; margin-bottom: 1pt; }
        .val { font-size: 9pt; font-weight: bold; }
        .sep { border-top: 0.5pt solid #ccc; margin: 5pt 0; padding-top: 5pt; }
        .sec-title { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.4px; color: #555; margin-bottom: 6pt; }
    </style></head><body>
    <div style="text-align:center;border-bottom:1.5pt solid #333;padding-bottom:4pt;margin-bottom:6pt">
        <div style="font-size:12pt;font-weight:bold">CRISTIAN SANCHEZ PROPIEDADES</div>
        <div style="font-size:7pt;color:#555;margin-top:1pt">Gestión de alquileres</div>
    </div>
    <div style="margin-bottom:5pt">
        <div class="lbl">Dirección del inmueble</div>
        <div style="font-size:12pt;font-weight:bold">${c.address}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6pt;margin-bottom:5pt">
        <div>
            <div class="lbl">Locador (propietario)</div>
            <div class="val">${c.owner || '—'}</div>
            ${c.ownerPhone ? `<div style="font-size:7.5pt;color:#555">${c.ownerPhone}</div>` : ''}
        </div>
        <div>
            <div class="lbl">Locatario (inquilino)</div>
            <div class="val">${c.tenant || '—'}</div>
            ${c.tenantPhone ? `<div style="font-size:7.5pt;color:#555">${c.tenantPhone}</div>` : ''}
        </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5pt;margin-bottom:5pt;border-top:0.5pt solid #ccc;border-bottom:0.5pt solid #ccc;padding:4pt 0">
        <div><div class="lbl">Inicio</div><div class="val" style="font-size:8pt">${fmtFecha(c.startDate)}</div></div>
        <div><div class="lbl">Fin</div><div class="val" style="font-size:8pt">${fmtFecha(end)}</div></div>
        <div><div class="lbl">Monto inicial</div><div class="val" style="font-size:8pt">$${fmtNum(c.initialAmount)}</div></div>
        <div><div class="lbl">Actualiza c/</div><div class="val" style="font-size:8pt">${freq}m · ${c.indexType}${c.indexType==='FIJO'?' '+c.fixedPercent+'%':''}</div></div>
        <div><div class="lbl">Hon. adm.</div><div class="val" style="font-size:8pt">${c.adminFee ? c.adminFee+'%' : '—'}</div></div>
        <div><div class="lbl">Act. depósito</div><div class="val" style="font-size:8pt">${c.depositUpdate ? 'Sí' : 'No'}</div></div>
        <div><div class="lbl">% Mora</div><div style="font-size:8pt;font-weight:bold">${c.moraRate || 2}%</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5pt;margin-bottom:4pt">
        <div><div class="lbl">N° Partida ABL</div><div style="font-size:8pt">${c.nroAbl || '—'}</div></div>
        <div><div class="lbl">N° Cliente AYSA</div><div style="font-size:8pt">${c.nroAysa || '—'}</div></div>
        <div><div class="lbl">N° Cliente Luz</div><div style="font-size:8pt">${c.nroLuz || '—'}</div></div>
        <div><div class="lbl">N° Cliente Gas</div><div style="font-size:8pt">${c.nroGas || '—'}</div></div>
    </div>
    <div style="margin-bottom:3pt">
        <div class="sec-title">Inquilino paga en la inmobiliaria además del alquiler:</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5pt">${chkHtml}</div>
    </div>
    <div class="sep">
        <div class="sec-title">Cronograma de actualizaciones</div>
        ${rows}
    </div>
    <div class="sep">
        <div class="sec-title">Observaciones</div>
        ${obsLines}
    </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
}

/* ══════════════════════════════════════════════════════════════
   11. TOAST
══════════════════════════════════════════════════════════════ */

function showToast(msg, type = 'info') {
    const c = $('#toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    t.innerHTML = `<span>${icons[type] || icons.info}</span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(100%)';
        t.style.transition = '0.3s';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

/* ══════════════════════════════════════════════════════════════
   12. RENDER DE TABLA
══════════════════════════════════════════════════════════════ */

// Estado global de filtros
let activeFilter      = 'all';
let activeIndexFilter = 'all';
let searchTerm        = '';
let lastUndoneEntry   = null;
let _lastMarkedInfo   = null;
let _updConfirmCtx    = null;

/**
 * Guarda el foco activo y posición del cursor antes de re-renderizar,
 * para restaurarlo después. Evita que el auto-refresh saque al usuario
 * del campo que está editando.
 */
function saveFocus() {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
        id:    el.id || null,
        tag:   el.tagName,
        start: el.selectionStart != null ? el.selectionStart : null,
        end:   el.selectionEnd   != null ? el.selectionEnd   : null,
        value: el.value          != null ? el.value          : null
    };
}

function restoreFocus(saved) {
    if (!saved || !saved.id) return;
    const el = document.getElementById(saved.id);
    if (!el) return;
    try {
        el.focus();
        if (saved.start !== null) {
            el.setSelectionRange(saved.start, saved.end);
        }
    } catch(e){ console.error('[GestAlquiler]', e); }
}

async function renderContracts() {
    let contracts = getContracts();
    $('#totalContracts').textContent = contracts.length;

    const alerts = contracts.filter(hasAlert);
    $('#alertCount').textContent = alerts.length;
    $('#alertPill').style.display = alerts.length ? 'flex' : 'none';

    const now = new Date();
    const nm  = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const ma  = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    // Aplicar filtros
    if (activeFilter === 'alerts')
        contracts = contracts.filter(hasAlert);
    else if (activeFilter === 'next-month')
        contracts = contracts.filter(c => updatesInMonth(c, nm.getMonth(), nm.getFullYear()));
    else if (activeFilter === 'month-after')
        contracts = contracts.filter(c => updatesInMonth(c, ma.getMonth(), ma.getFullYear()));
    else if (activeFilter === 'expiring-soon')
        contracts = contracts.filter(c => { const ed = getEndDate(c); const days = Math.ceil((ed - now) / 864e5); return days > 0 && days <= 60; });
    else if (activeFilter === 'expiring-next-month')
        contracts = contracts.filter(c => { const ed = getEndDate(c); return ed.getMonth() === nm.getMonth() && ed.getFullYear() === nm.getFullYear(); });

    if (activeIndexFilter !== 'all')
        contracts = contracts.filter(c => c.indexType === activeIndexFilter);

    if (searchTerm)
        contracts = contracts.filter(c =>
            c.address.toLowerCase().includes(searchTerm) ||
            c.tenant.toLowerCase().includes(searchTerm) ||
            (c.owner && c.owner.toLowerCase().includes(searchTerm))
        );

    if (!getContracts().length) {
        $('#emptyState').style.display = 'flex';
        $('#tableContainer').style.display = 'none';
        return;
    }
    $('#emptyState').style.display = 'none';
    $('#tableContainer').style.display = 'block';

    // Guardar foco antes de destruir DOM
    const focusState = saveFocus();

    const body = $('#contractsBody');
    body.innerHTML = '';
    if (!contracts.length) {
        body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2rem;color:var(--text-muted)">No se encontraron contratos con los filtros seleccionados.</td></tr>';
        restoreFocus(focusState);
        return;
    }
    for (const c of contracts) { body.appendChild(await createRow(c)); }

    // Restaurar foco después de reconstruir DOM
    restoreFocus(focusState);
}

async function createRow(c) {
    const tr = document.createElement('tr');
    const nu = getNextUpdate(c);
    const exp = isExpired(c);
    const ed = getEndDate(c);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const edClean = new Date(ed); edClean.setHours(0, 0, 0, 0);
    const daysToEnd = Math.ceil((edClean - now) / 864e5);

    // ── Monto actual (período anterior al pendiente) ──
    let ca;
    if (nu) {
        try { ca = await calcPeriodAmount(c, nu.periodNumber - 1); }
        catch { ca = { amount: parseFloat(c.initialAmount) }; }
        const frozen = getStoredAmount(c, nu.periodNumber - 1);
        if (frozen) ca = { ...ca, amount: frozen };
    } else {
        try { ca = await calcCurrentAmount(c); }
        catch { ca = { amount: parseFloat(c.initialAmount) }; }
    }

    // ── Próximo monto ──
    let nextAmountHtml = '—';
    if (nu && !exp) {
        try {
            const naData = await calcPeriodAmount(c, nu.periodNumber);
            nextAmountHtml = `<span class="td-amount" style="color:var(--text-muted);font-size:0.88em">${formatCurrency(naData.amount)}</span>`;
        } catch(e){ console.error('[GestAlquiler]', e); }
    }

    // ── Honorarios ──
    const honorariosHtml = c.adminFee
        ? `<span style="font-weight:700;color:#2e7d32">${formatCurrency(Math.round(ca.amount * parseFloat(c.adminFee) / 100))}</span><br><span style="font-size:0.72em;color:var(--text-muted)">${c.adminFee}% admin.</span>`
        : '<span style="color:var(--text-muted)">—</span>';

    // ── Depósito: diferencia al próximo período ──
    let depositHtml = '';
    if (c.depositUpdate && nu && !exp) {
        try {
            const naData = await calcPeriodAmount(c, nu.periodNumber);
            const diff = naData.amount - ca.amount;
            if (diff > 0) depositHtml = `<br><span style="font-size:0.72em;color:#7b1fa2;font-weight:600">🔒 Depósito +${formatCurrency(diff)}</span>`;
        } catch(e){ console.error('[GestAlquiler]', e); }
    }

    // ── Personas ──
    const tenantHtml = c.tenantPhone
        ? `${esc(c.tenant)}<br><span style="font-size:0.75em">${(typeof GestShared!=='undefined'?GestShared.waSpan(c.tenantPhone):'📱 '+esc(c.tenantPhone))}</span>`
        : esc(c.tenant);
    const ownerHtml = c.ownerPhone
        ? `${c.owner}<br><span style="font-size:0.75em">${GestShared.waSpan(c.ownerPhone)}</span>`
        : c.owner;

    // ── Estado de actualización ──
    const needsUpdate = nu && nu.daysUntil <= ALERT_DAYS && !isExpired(c);
    if (needsUpdate) tr.classList.add('row-pending-update');

    // ── Resaltar vencimiento próximo ──
    if (!exp && daysToEnd <= EXPIRING_DAYS) tr.classList.add('row-expiring-soon');

    // ── Celda "Fin Contrato": formato DD/MM/YYYY (Xd) ──
    let endCellHtml;
    if (exp) {
        endCellHtml = `<span class="badge badge-status badge-expired">${formatDate(ed)} (Fin)</span>`;
    } else if (daysToEnd <= EXPIRING_DAYS) {
        endCellHtml = `<span class="badge badge-status badge-warning">${formatDate(ed)} (${daysToEnd}d)</span>`;
    } else {
        endCellHtml = `<span class="date-text">${formatDate(ed)}</span><span class="days-left">En ${daysToEnd} días</span>`;
    }

    // ── Celda "Próx. Actualización" ──
    let ndh;
    if (exp) {
        ndh = '<span class="date-text" style="color:var(--text-muted)">Finalizado</span>';
    } else if (nu && isOverduePast10(nu)) {
        ndh = `<span class="date-text">${formatDate(nu.date)}</span><span class="days-left" style="color:var(--danger)">Hace ${Math.abs(nu.daysUntil)} días</span>`;
    } else if (nu && nu.daysUntil < 0) {
        ndh = `<span class="date-text">${formatDate(nu.date)}</span><span class="days-left">Hace ${Math.abs(nu.daysUntil)} días</span>`;
    } else if (nu && nu.daysUntil <= ALERT_DAYS) {
        ndh = `<span class="date-text">${formatDate(nu.date)}</span><span class="days-left">${nu.daysUntil === 0 ? 'Hoy' : 'En ' + nu.daysUntil + ' días'}</span>`;
    } else if (nu) {
        ndh = `<span class="days-left" style="color:var(--text-muted)">Falta ${nu.daysUntil} días</span>`;
    } else {
        ndh = '—';
    }

    // ── Badge de estado ──
    let sb;
    if (exp) {
        sb = '<span class="badge badge-status badge-expired">Finalizado</span>';
    } else if (nu && isOverduePast10(nu)) {
        sb = `<span class="badge badge-status badge-overdue">🔴 Hace ${Math.abs(nu.daysUntil)}d</span>`;
    } else if (nu && nu.daysUntil < 0) {
        sb = `<span class="badge badge-status badge-past">Hace ${Math.abs(nu.daysUntil)}d</span>`;
    } else if (needsUpdate) {
        sb = `<span class="badge badge-status badge-warning">⚠️ Actualizar</span>`;
    } else if (nu) {
        sb = '<span class="badge badge-status badge-ok">Al día</span>';
    } else {
        sb = '<span class="badge badge-status badge-ok">Al día ✓</span>';
    }

    // ── Botones de acción ──
    const updBtn = needsUpdate
        ? `<button class="btn-icon" title="Marcar como actualizado" data-action="markupdated" style="font-size:0.9rem">✓</button>`
        : '';
    const justMarked  = _lastMarkedInfo && _lastMarkedInfo.contractId === c.id && Date.now() - _lastMarkedInfo.time < 60000;
    const undoBtn = justMarked
        ? `<button class="btn-icon" title="Deshacer actualización" data-action="undoupdated" style="color:#ef4444;border-color:rgba(239,68,68,.35);font-size:0.9rem">↩</button>`
        : '';
    const redoAvailable = lastUndoneEntry && lastUndoneEntry.contractId === c.id;
    const redoBtn = redoAvailable
        ? `<button class="btn-icon" title="Volver a marcar como actualizado" data-action="redoupdated" style="color:#f59e0b;border-color:rgba(245,158,11,.35);font-size:0.9rem">↻</button>`
        : '';

    // Detalle de dirección: mostrar prórrogas si existen
    const prorrogasInfo = (c.prorrogas || []).length > 0
        ? ` · 🔄 +${(c.prorrogas || []).reduce((s,p)=>s+parseInt(p.months||0),0)}m prórroga`
        : '';

    tr.innerHTML = `
        <td class="td-address">
            <span class="address-text" title="${c.address}">${c.address}</span>
            <span class="address-detail">${c.duration}m · c/${c.updateFrequency}m · ${c.indexType}${c.indexType === 'FIJO' ? ' ' + c.fixedPercent + '%' : ''}${prorrogasInfo}</span>
        </td>
        <td class="td-person">${tenantHtml}</td>
        <td class="td-person">${ownerHtml}</td>
        <td class="td-amount">${formatCurrency(ca.amount)}${depositHtml}</td>
        <td class="td-amount">${honorariosHtml}</td>
        <td class="td-amount">${nextAmountHtml}</td>
        <td><span class="date-text">${formatDate(c.startDate)}</span></td>
        <td>${ndh}</td>
        <td>${endCellHtml}</td>
        <td>${sb}</td>
        <td class="td-actions"><div class="actions-group">
            ${updBtn}${undoBtn}${redoBtn}
            <button class="btn-icon" title="Detalle" data-action="detail">👁️</button>
            <button class="btn-icon" title="Prórroga" data-action="prorroga" style="color:#7c3aed;border-color:rgba(124,58,237,.35);font-size:0.82rem">🔄</button>
            <button class="btn-icon" title="Renovar contrato" data-action="renovar" style="color:#10b981;border-color:rgba(16,185,129,.35);font-size:0.82rem">♻️</button>
            <button class="btn-icon" title="Editar" data-action="edit">✏️</button>
            <button class="btn-icon danger" title="Eliminar" data-action="delete">🗑️</button>
        </div></td>`;

    // ── Event handlers ──
    tr.querySelector('[data-action="detail"]').onclick   = () => openDetail(c.id);
    tr.querySelector('[data-action="prorroga"]').onclick = () => openProrrogaModal(c.id);
    tr.querySelector('[data-action="renovar"]').onclick  = () => openRenovarModal(c.id);
    tr.querySelector('[data-action="edit"]').onclick     = () => openModal(c.id);
    tr.querySelector('[data-action="delete"]').onclick = async () => {
        if (!confirm(`¿Eliminar contrato de "${c.address}"?`)) return;
        invalidateScheduleCache(c);
        await deleteContract(c.id);
        showToast('Contrato eliminado', 'info');
        renderContracts();
    };

    const mUpd = tr.querySelector('[data-action="markupdated"]');
    if (mUpd) mUpd.onclick = async () => {
        let calculatedAmt = 0;
        try { const na = await calcPeriodAmount(c, nu.periodNumber); calculatedAmt = na.amount; } catch(e){ console.error('[GestAlquiler]', e); }
        openUpdateConfirmModal(c, nu, calculatedAmt);
    };

    const mUndo = tr.querySelector('[data-action="undoupdated"]');
    if (mUndo) mUndo.onclick = async () => {
        const pn = _lastMarkedInfo?.periodNumber;
        if (!pn) return;
        _lastMarkedInfo = null;
        await unmarkUpdated(c, pn);
        renderContracts();
        showToast('Actualización deshecha — usá ↻ para volver', 'info');
    };

    const mRedo = tr.querySelector('[data-action="redoupdated"]');
    if (mRedo) mRedo.onclick = async () => {
        const info = lastUndoneEntry;
        const success = await reDoUpdated();
        if (success && info) {
            _lastMarkedInfo = { contractId: info.contractId, periodNumber: info.entry.periodNumber, time: Date.now() };
            renderContracts();
            showToast('Actualización restaurada', 'success');
        }
    };

    return tr;
}

/* ══════════════════════════════════════════════════════════════
   13. MODAL — NUEVO / EDITAR CONTRATO
      ⚠️ Formulario y estructura HTML: SIN CAMBIOS
══════════════════════════════════════════════════════════════ */

function openModal(editId = null) {
    $('#contractForm').reset();
    $('#contractId').value = '';
    $('#fixedPercentGroup').style.display = 'none';
    $('#fixedPercent').required = false;

    // Reset toggles
    $('#depositUpdate').checked = false;
    $('#depositToggle').classList.remove('on');
    $('#depositToggleLabel').textContent = 'No';
    $('#depositToggleLabel').style.color = '#64748b';
    $('#depositAmountRow').style.display = 'none';
    $('#depositAmount').value = '';
    $('#depositCurrency').value = 'ARS';

    $('#honorariosPorDueno').checked = false;
    $('#honorariosToggle').classList.remove('on');
    $('#honorariosLabel').textContent = 'Inquilino';
    $('#honorariosLabel').style.color = '#4f8ef7';

    $('#aliasOwner1').value = ''; $('#aliasOwner2').value = '';
    $('#aliasOwner3').value = ''; $('#aliasOwner4').value = '';
    $('#aliasInmobiliaria').value = (typeof GestShared!=='undefined'?GestShared.getConfig().aliasInmo:ALIAS_INMOB_DEFAULT);
    $('#nroAbl').value = ''; $('#nroAysa').value = '';
    $('#nroLuz').value = ''; $('#nroGas').value = '';
    $('#pagaAbl').checked = false; $('#pagaAysa').checked = false;
    $('#pagaLuz').checked = false; $('#pagaGas').checked = false; $('#pagaExpensas').checked = false;
    $('#moraRate').value = '2';
    $('#acuerdoMonto').value = ''; $('#acuerdoFecha').value = ''; $('#acuerdoIndice').value = '';

    if (editId) {
        const c = getContractById(editId);
        if (!c) return;
        $('#modalTitle').textContent = 'Editar Contrato';
        $('#contractId').value = c.id;
        $('#address').value = c.address;
        $('#tenant').value = c.tenant;
        $('#tenantPhone').value = c.tenantPhone || '';
        $('#tenantEmail').value = c.tenantEmail || '';
        $('#owner').value = c.owner;
        $('#ownerPhone').value = c.ownerPhone || '';
        $('#ownerEmail').value = c.ownerEmail || '';
        $('#startDate').value = c.startDate;
        $('#duration').value = c.duration;
        $('#updateFrequency').value = c.updateFrequency;
        $('#indexType').value = c.indexType;
        $('#initialAmount').value = c.initialAmount;
        $('#adminFee').value = c.adminFee || '';
        $('#moraRate').value = c.moraRate != null ? c.moraRate : '2';
        $('#acuerdoMonto').value = c.acuerdoMonto || '';
        $('#acuerdoFecha').value = c.acuerdoFecha || '';
        $('#acuerdoIndice').value = c.acuerdoIndice || '';
        $('#notes').value = c.notes || '';
        $('#aliasOwner1').value = c.aliasOwner1 || '';
        $('#aliasOwner2').value = c.aliasOwner2 || '';
        $('#aliasOwner3').value = c.aliasOwner3 || '';
        $('#aliasOwner4').value = c.aliasOwner4 || '';
        $('#aliasInmobiliaria').value = c.aliasInmobiliaria || (typeof GestShared!=='undefined'?GestShared.getConfig().aliasInmo:ALIAS_INMOB_DEFAULT);
        $('#nroAbl').value = c.nroAbl || ''; $('#nroAysa').value = c.nroAysa || '';
        $('#nroLuz').value = c.nroLuz || ''; $('#nroGas').value = c.nroGas || '';
        $('#pagaAbl').checked = !!c.pagaAbl; $('#pagaAysa').checked = !!c.pagaAysa;
        $('#pagaLuz').checked = !!c.pagaLuz; $('#pagaGas').checked = !!c.pagaGas;
        $('#pagaExpensas').checked = !!c.pagaExpensas;
        if (c.indexType === 'FIJO') {
            $('#fixedPercentGroup').style.display = 'flex';
            $('#fixedPercent').value = c.fixedPercent;
            $('#fixedPercent').required = true;
        }
        if (c.depositUpdate) {
            $('#depositUpdate').checked = true;
            $('#depositToggle').classList.add('on');
            $('#depositToggleLabel').textContent = 'Sí';
            $('#depositToggleLabel').style.color = '#f57c00';
            $('#depositAmountRow').style.display = 'flex';
            $('#depositAmount').value = c.depositAmount || c.initialAmount || '';
            $('#depositCurrency').value = c.depositCurrency || 'ARS';
        }
        if (c.honorariosPorDueno) {
            $('#honorariosPorDueno').checked = true;
            $('#honorariosToggle').classList.add('on');
            $('#honorariosLabel').textContent = 'Dueño';
            $('#honorariosLabel').style.color = '#f57c00';
        }
    } else {
        $('#modalTitle').textContent = 'Nuevo Contrato';
    }

    $('#contractModal').classList.add('active');
    setTimeout(() => $('#address').focus(), 100);
}

function closeModal() {
    $('#contractModal').classList.remove('active');
}

/* ══════════════════════════════════════════════════════════════
   14. MODAL — DETALLE
      ⚠️ Funcionalidad actual: SIN CAMBIOS
══════════════════════════════════════════════════════════════ */

async function openDetail(id) {
    const c = getContractById(id);
    if (!c) return;
    $('#detailTitle').textContent = c.address;
    const db = $('#detailBody');
    db.innerHTML = '<div style="text-align:center;padding:2rem">Calculando...</div>';
    $('#detailModal').classList.add('active');

    const nu  = getNextUpdate(c);
    const ed  = getEndDate(c);
    const exp = isExpired(c);

    // Monto del período anterior al pendiente
    let ca;
    if (nu) {
        try { ca = await calcPeriodAmount(c, nu.periodNumber - 1); }
        catch { ca = { amount: parseFloat(c.initialAmount), variation: null, source: 'error' }; }
        const frozen = getStoredAmount(c, nu.periodNumber - 1);
        if (frozen) ca = { ...ca, amount: frozen };
    } else {
        try { ca = await calcCurrentAmount(c); }
        catch { ca = { amount: parseFloat(c.initialAmount), variation: null, source: 'error' }; }
    }

    let na = null;
    if (nu) try { na = await calcPeriodAmount(c, nu.periodNumber); } catch(e){ console.error('[GestAlquiler]', e); }

    const uds = getUpdateDates(c);
    const history = getUpdHistory(c);
    const histByPeriod = Object.fromEntries(history.map(h => [h.periodNumber, h]));
    const nowD = new Date(); nowD.setHours(0, 0, 0, 0);
    let tlHTML = '';

    // Período 1 — inicio del contrato
    const start = normalizeStart(c);
    tlHTML += `<div class="timeline-item tl-start">
        <div class="timeline-number start">🏠</div>
        <div class="timeline-info">
            <div class="timeline-date">Inicio de contrato · ${formatDate(start)}</div>
            <div class="timeline-amount">${formatCurrency(parseFloat(c.initialAmount))}</div>
        </div>
        <span class="badge" style="background:rgba(245,124,0,.15);color:var(--accent);font-size:.65rem">Inicio</span>
    </div>`;

    // Fila de acuerdo
    const acuerdoFechaObj = c.acuerdoFecha ? new Date(c.acuerdoFecha + 'T00:00:00') : null;
    let acuerdoInsertado = false;

    for (const u of uds) {
        const ud = new Date(u.date); ud.setHours(0, 0, 0, 0);
        const past = ud < nowD;
        const cur  = nu && u.periodNumber === nu.periodNumber;

        if (!acuerdoInsertado && acuerdoFechaObj && c.acuerdoMonto && ud >= acuerdoFechaObj) {
            acuerdoInsertado = true;
            const cambioIdx = c.acuerdoIndice ? ` · cambia a <strong>${c.acuerdoIndice}</strong>` : '';
            tlHTML += `<div class="timeline-item" style="border:1px solid rgba(245,124,0,.3);background:rgba(245,124,0,.06);border-radius:8px;margin:4px 0">
                <div class="timeline-number" style="background:rgba(245,124,0,.2);color:var(--accent);font-size:.75rem">📋</div>
                <div class="timeline-info">
                    <div class="timeline-date" style="color:var(--accent);font-weight:600">Acuerdo · ${formatDate(acuerdoFechaObj)}</div>
                    <div class="timeline-amount" style="font-size:.78rem">Nuevo monto: ${formatCurrency(parseFloat(c.acuerdoMonto))}${cambioIdx}</div>
                </div>
                <span class="badge" style="background:rgba(245,124,0,.15);color:var(--accent);font-size:.65rem">Acuerdo</span>
            </div>`;
        }

        const idxEfectivo = (acuerdoFechaObj && c.acuerdoIndice && ud >= acuerdoFechaObj) ? c.acuerdoIndice : c.indexType;
        const idxBadgeColor = idxEfectivo === 'IPC' ? '#1D9E75' : idxEfectivo === 'ICL' ? '#378ADD' : '#BA7517';

        const h0 = histByPeriod[u.periodNumber];
        let amt = '';
        if (h0 && h0.amount) {
            amt = formatCurrency(h0.amount);
        } else {
            try { amt = formatCurrency((await calcPeriodAmount(c, u.periodNumber)).amount); } catch { amt = '—'; }
        }

        const h = histByPeriod[u.periodNumber];
        const wasMarked  = !!h;
        const markedDate = wasMarked ? new Date(h.markedAt).toLocaleDateString('es-AR') : null;
        const markedAmt  = wasMarked && h.amount ? formatCurrency(h.amount) : null;

        let badge = '';
        if (wasMarked) {
            badge = `<span class="badge" style="background:rgba(16,185,129,.15);color:#10b981;font-size:.65rem">✓ Actualizado</span>
                <button class="btn btn-sm btn-ghost" data-unmark="${u.periodNumber}" style="font-size:.65rem;padding:.15rem .45rem;color:#ef4444;border-color:rgba(239,68,68,.35);margin-left:4px">↩ Desmarcar</button>`;
        } else if (cur) {
            badge = `<span class="badge badge-warning">Próxima</span>`;
        } else if (past) {
            badge = `<span class="badge badge-past" style="font-size:.65rem">Pasada</span>
                <button class="btn btn-sm btn-ghost" data-remark="${u.periodNumber}" style="font-size:.65rem;padding:.15rem .45rem;color:#10b981;border-color:rgba(16,185,129,.35);margin-left:4px">✓ Marcar</button>`;
        }

        const histLine = wasMarked
            ? `<div style="margin-top:3px;font-size:.7rem;color:#10b981">Registrado el ${markedDate}${markedAmt ? ' · ' + markedAmt : ''}</div>`
            : '';

        tlHTML += `<div class="timeline-item ${wasMarked ? 'tl-marked' : ''}">
            <div class="timeline-number ${cur ? 'current' : past ? 'past' : ''}">${u.periodNumber}</div>
            <div class="timeline-info">
                <div class="timeline-date">${formatDate(u.date)} <span style="font-size:.65rem;font-weight:600;color:${idxBadgeColor}">${idxEfectivo}</span></div>
                <div class="timeline-amount">${amt}</div>
                ${histLine}
            </div>
            ${badge}
        </div>`;
    }

    // Sección depósito
    let depositSection = '';
    if (c.depositUpdate && na && ca) {
        const depositDiff = na.amount - ca.amount;
        if (depositDiff > 0) {
            depositSection = `<div class="detail-item full-width" style="background:linear-gradient(135deg,#f3e5f5,#ede7f6);border-radius:10px;padding:1rem">
                <div class="detail-label" style="color:#7b1fa2">🔒 Actualización de Depósito en Garantía</div>
                <div style="margin-top:0.5rem;font-size:0.88rem;color:#4a148c;display:flex;gap:2rem;flex-wrap:wrap">
                    <span>Depósito anterior: <strong>${formatCurrency(ca.amount)}</strong></span>
                    <span>Nuevo depósito: <strong>${formatCurrency(na.amount)}</strong></span>
                    <span style="color:#6a1b9a;font-size:1rem">Diferencia a cobrar: <strong style="font-size:1.1rem">${formatCurrency(depositDiff)}</strong></span>
                    <span style="color:#7b1fa2">📅 Cobrar el: <strong>${formatDateLong(nu.date)}</strong></span>
                </div>
            </div>`;
        }
    }

    // Mensaje WA (usando isAPIAmount: true cuando no hay acuerdo, false cuando sí)
    const ui = {
        nextDate:     nu ? nu.date : new Date(),
        newAmount:    na ? na.amount : ca.amount,
        variation:    na ? na.variation : ca.variation,
        source:       na ? na.source : ca.source,
        periodNumber: nu ? nu.periodNumber : 1
    };
    const msg = genMsg(c, ui, ca.amount);

    db.innerHTML = `<div class="detail-grid">
        <div class="detail-item full-width"><div class="detail-label">Dirección</div><div class="detail-value">${c.address}</div></div>
        <div class="detail-item"><div class="detail-label">Inquilino</div><div class="detail-value">${c.tenant}${c.tenantPhone ? `<br><span style="font-size:0.82rem;color:#4f8ef7">📱 ${c.tenantPhone}</span>` : ''}</div></div>
        <div class="detail-item"><div class="detail-label">Propietario</div><div class="detail-value">${c.owner}${c.ownerPhone?`<br>${(typeof GestShared!=='undefined'?GestShared.waSpan(c.ownerPhone,c.ownerPhone):'📱 '+c.ownerPhone)}`:''}${c.tenantPhone?`<br><span style="font-size:.75em;color:var(--text-muted,#888)">Inquilino:</span> ${(typeof GestShared!=='undefined'?GestShared.waSpan(c.tenantPhone,c.tenantPhone):'📱 '+c.tenantPhone)}`:''}</div></div>
        <div class="detail-item"><div class="detail-label">Inicio</div><div class="detail-value">${formatDate(c.startDate)}</div></div>
        <div class="detail-item"><div class="detail-label">Fin</div><div class="detail-value">${formatDate(ed)}${exp ? ' (Finalizado)' : ''}</div></div>
        <div class="detail-item"><div class="detail-label">Monto Inicial</div><div class="detail-value">${formatCurrency(c.initialAmount)}</div></div>
        <div class="detail-item"><div class="detail-label">Monto Actual</div><div class="detail-value large">${formatCurrency(ca.amount)}</div></div>
        <div class="detail-item"><div class="detail-label">Índice</div><div class="detail-value">${c.indexType}${c.indexType === 'FIJO' ? ' (' + c.fixedPercent + '%)' : ''}</div></div>
        <div class="detail-item"><div class="detail-label">Frecuencia</div><div class="detail-value">Cada ${c.updateFrequency} meses</div></div>
        ${c.adminFee ? `<div class="detail-item"><div class="detail-label">Honorario Administración</div><div class="detail-value" style="color:#2e7d32;font-weight:700">${formatCurrency(Math.round(ca.amount * parseFloat(c.adminFee) / 100))} <span style="font-size:0.8rem;font-weight:400;color:var(--text-muted)">(${c.adminFee}% del monto actual)</span></div></div>` : ''}
        ${c.depositUpdate && c.depositAmount ? `<div class="detail-item"><div class="detail-label">Depósito en Garantía</div><div class="detail-value" style="color:#7b1fa2;font-weight:700">${c.depositCurrency === 'USD' ? 'U$S ' : '$ '}${parseFloat(c.depositAmount).toLocaleString('es-AR')} <span style="font-size:0.8rem;font-weight:400;color:var(--text-muted)">(${c.depositCurrency || 'ARS'})</span></div></div>` : ''}
        ${nu ? `<div class="detail-item"><div class="detail-label">Próxima Actualización</div><div class="detail-value">${formatDateLong(nu.date)} (${nu.daysUntil < 0 ? 'hace ' + Math.abs(nu.daysUntil) + ' días' : nu.daysUntil === 0 ? 'hoy' : 'en ' + nu.daysUntil + ' días'})</div></div>
        <div class="detail-item"><div class="detail-label">Monto Próximo Período</div><div class="detail-value large">${na ? formatCurrency(na.amount) : '—'}</div></div>` : ''}
        ${depositSection}
        ${c.notes ? `<div class="detail-item full-width"><div class="detail-label">Notas</div><div class="detail-value" style="font-weight:400;font-size:0.85rem;color:var(--text-secondary)">${c.notes}</div></div>` : ''}
    </div>
    <div class="whatsapp-section"><h3>💬 Texto para WhatsApp</h3>
        <div class="whatsapp-card">
            <div class="whatsapp-card-header">
                <h4>📤 Actualización de alquiler</h4>
                <div style="display:flex;gap:0.4rem">
                    <button class="btn btn-sm btn-ghost" id="cpMsg">📋 Copiar</button>
                    <button class="btn btn-sm btn-whatsapp" id="waMsg">Enviar</button>
                </div>
            </div>
            <div class="whatsapp-text">${escapeHTML(msg)}</div>
        </div>
    </div>
    ${uds.length ? `<div class="update-timeline"><h3>📅 Cronograma de Actualizaciones</h3>${tlHTML}</div>` : ''}`;

    $('#cpMsg').onclick = async () => { showToast(await copyText(msg) ? 'Copiado' : 'Error', await copyText(msg) ? 'success' : 'error'); };
    $('#waMsg').onclick = () => openWA(msg);
    $('#btnPrintContract').onclick = () => printContract(c);

    // Desmarcar
    db.querySelectorAll('[data-unmark]').forEach(btn => {
        btn.onclick = async () => {
            const pn = parseInt(btn.dataset.unmark);
            if (!confirm(`¿Desmarcar la actualización del período ${pn}?`)) return;
            await unmarkUpdated(c, pn);
            renderContracts();
            openDetail(id);
            showToast('Actualización desmarcada', 'info');
        };
    });

    // Marcar períodos pasados
    db.querySelectorAll('[data-remark]').forEach(btn => {
        btn.onclick = async () => {
            const pn = parseInt(btn.dataset.remark);
            if (!confirm(`¿Marcar el período ${pn} como actualizado?`)) return;
            const history = (c.updatesHistory || []).filter(h => h.periodNumber !== pn);
            history.push({ periodNumber: pn, markedAt: new Date().toISOString(), amount: null });
            await updateContract(c.id, { updatesHistory: history });
            _lastMarkedInfo = { contractId: c.id, periodNumber: pn, time: Date.now() };
            renderContracts();
            openDetail(id);
            showToast('Período marcado como actualizado', 'success');
        };
    });
}

/* ══════════════════════════════════════════════════════════════
   15. MODAL — CONFIRMAR ACTUALIZACIÓN
══════════════════════════════════════════════════════════════ */

function openUpdateConfirmModal(c, nu, calculatedAmount) {
    _updConfirmCtx = { c, nu, calculatedAmount };
    const m = document.getElementById('updConfirmModal');
    document.getElementById('updConfirm_addr').textContent = c.address;
    const nuDate = nu.date instanceof Date ? nu.date : new Date(nu.date);
    document.getElementById('updConfirm_period').textContent = `Período ${nu.periodNumber} — vigente desde ${formatDateLong(nuDate)}`;
    document.getElementById('updConfirm_calcAmount').textContent = formatCurrency(calculatedAmount);
    const inp = document.getElementById('updConfirm_input');
    inp.value = calculatedAmount;
    document.getElementById('updConfirm_changeNote').style.display = 'none';
    document.getElementById('updConfirm_noteInput').value = '';
    m.style.display = 'flex';
    setTimeout(() => { inp.focus(); inp.select(); }, 80);
}

function closeUpdateConfirmModal() {
    document.getElementById('updConfirmModal').style.display = 'none';
    _updConfirmCtx = null;
}

/* ══════════════════════════════════════════════════════════════
   15b. MODAL — PRÓRROGA DE CONTRATO
══════════════════════════════════════════════════════════════ */

let _prorrogaCtx = null;  // { contractId }

function openProrrogaModal(contractId) {
    const c = getContractById(contractId);
    if (!c) return;
    _prorrogaCtx = { contractId };

    const modal = document.getElementById('prorrogaModal');
    const endDate = getEndDate(c);

    // Fecha de inicio de la prórroga = 1er día del mes siguiente al vencimiento actual
    const pStart = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
    const pStartStr = `${String(pStart.getDate()).padStart(2,'0')}/${String(pStart.getMonth()+1).padStart(2,'0')}/${pStart.getFullYear()}`;

    document.getElementById('prorroga_addr').textContent    = c.address;
    document.getElementById('prorroga_finActual').textContent = formatDate(endDate);
    document.getElementById('prorroga_inicio').textContent  = pStartStr;
    document.getElementById('prorroga_meses').value         = 12;
    document.getElementById('prorroga_monto').value         = '';
    document.getElementById('prorroga_depositUpdate').checked  = false;
    document.getElementById('prorrogaDepositToggle').classList.remove('on');
    document.getElementById('prorrogaDepositLabel').textContent = 'No';
    document.getElementById('prorrogaDepositLabel').style.color = '#64748b';

    // Sugerir monto: último período del cronograma actual
    const _cached = scheduleCache.get(contractCacheKey(c));
    const sched = _cached ? _cached.sched : undefined;
    if (sched && sched.length) {
        document.getElementById('prorroga_monto').value = sched[sched.length - 1].amount;
    }

    // Mostrar historial de prórrogas existentes
    const histContainer = document.getElementById('prorroga_historial');
    const prorrogas = c.prorrogas || [];
    if (prorrogas.length) {
        histContainer.style.display = 'block';
        histContainer.innerHTML = `<div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#717171;margin-bottom:0.4rem">Prórrogas anteriores</div>` +
            prorrogas.map((p, i) => `
                <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:8px;padding:0.45rem 0.75rem;margin-bottom:0.3rem">
                    <div style="font-size:0.78rem;color:#c4b5fd">
                        <strong>Prórroga ${i+1}</strong> — Desde ${p.startDate ? formatDate(p.startDate) : '?'} · ${p.months}m · ${formatCurrency(parseFloat(p.newAmount))}
                        ${p.depositUpdate ? ' · dep.✓' : ''}
                    </div>
                    <button data-del-prorroga="${p.id}" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:5px;padding:0.15rem 0.45rem;font-size:0.72rem;cursor:pointer">✕</button>
                </div>`
            ).join('');

        histContainer.querySelectorAll('[data-del-prorroga]').forEach(btn => {
            btn.onclick = async () => {
                const pid = btn.dataset.delProrroga;
                if (!confirm('¿Eliminar esta prórroga?')) return;
                const updated = (c.prorrogas || []).filter(p => p.id !== pid);
                const oldKey = contractCacheKey(c);
                scheduleCache.delete(oldKey);
                await updateContract(c.id, { prorrogas: updated });
                const updC = getContractById(c.id);
                if (updC) { scheduleCache.delete(contractCacheKey(updC)); await fetchContractSchedule(updC); }
                closeProrrogaModal();
                await renderContracts();
                showToast('Prórroga eliminada', 'info');
            };
        });
    } else {
        histContainer.style.display = 'none';
        histContainer.innerHTML = '';
    }

    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('prorroga_meses').focus(), 80);
}

function closeProrrogaModal() {
    document.getElementById('prorrogaModal').style.display = 'none';
    _prorrogaCtx = null;
}

async function confirmProrroga() {
    if (!_prorrogaCtx) return;
    const c = getContractById(_prorrogaCtx.contractId);
    if (!c) return;

    const meses = parseInt(document.getElementById('prorroga_meses').value);
    const monto = parseFloat(document.getElementById('prorroga_monto').value);
    const depUpd = document.getElementById('prorroga_depositUpdate').checked;

    if (!meses || meses < 1) { showToast('Ingresá la cantidad de meses', 'error'); return; }
    if (!monto || monto <= 0) { showToast('Ingresá el nuevo monto base', 'error'); return; }

    const startDateStr = getNextProrrogaStart(c);  // primer día del mes post-vencimiento actual

    const nuevaProrroga = {
        id:            generateId(),
        startDate:     startDateStr,
        months:        meses,
        newAmount:     monto,
        depositUpdate: depUpd,
        createdAt:     new Date().toISOString()
    };

    const prorrogas = [...(c.prorrogas || []), nuevaProrroga];

    // Invalidar cache antes de guardar
    const oldKey = contractCacheKey(c);
    scheduleCache.delete(oldKey);

    await updateContract(c.id, { prorrogas });

    // Recalcular schedule con la nueva duración
    const updC = getContractById(c.id);
    if (updC) {
        scheduleCache.delete(contractCacheKey(updC));
        await fetchContractSchedule(updC);
    }

    closeProrrogaModal();
    await renderContracts();
    showToast(`✓ Prórroga de ${meses} mes${meses > 1 ? 'es' : ''} agregada`, 'success');
}

/* ══════════════════════════════════════════════════════════════
   16. CSV EXPORT / IMPORT
══════════════════════════════════════════════════════════════ */

function exportCSV() {
    const contracts = getContracts();
    if (!contracts.length) { showToast('No hay contratos para exportar', 'info'); return; }
    const headers = ['Dirección','Inquilino','Propietario','Fecha Inicio','Duración (meses)','Frecuencia Actualización (meses)','Tipo Índice','Porcentaje Fijo','Monto Inicial','Notas'];
    const escCSV = v => { const s = String(v == null ? '' : v); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = contracts.map(c => [c.address, c.tenant, c.owner, c.startDate, c.duration, c.updateFrequency, c.indexType, c.fixedPercent || '', c.initialAmount, c.notes || ''].map(escCSV).join(','));
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `contratos_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`${contracts.length} contratos exportados`, 'success');
}

function importCSV(file) {
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            let text = e.target.result.replace(/^\uFEFF/, '');
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) { showToast('El archivo CSV está vacío o no tiene datos', 'error'); return; }
            const imported = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = [];
                let cur = '', inQ = false;
                for (let j = 0; j < lines[i].length; j++) {
                    const ch = lines[i][j];
                    if (ch === '"') { if (inQ && lines[i][j+1] === '"') { cur += '"'; j++; } else { inQ = !inQ; } }
                    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
                    else { cur += ch; }
                }
                cols.push(cur);
                if (cols.length < 9) continue;
                imported.push({
                    id: generateId(), createdAt: new Date().toISOString(),
                    address: cols[0], tenant: cols[1], owner: cols[2], startDate: cols[3],
                    duration: parseInt(cols[4]) || 24, updateFrequency: cols[5] || '3',
                    indexType: cols[6] || 'IPC', fixedPercent: cols[7] ? parseFloat(cols[7]) : null,
                    initialAmount: parseFloat(cols[8]) || 0, notes: cols[9] || ''
                });
            }
            if (!imported.length) { showToast('No se encontraron contratos válidos en el CSV', 'error'); return; }
            if (!confirm(`Se importarán ${imported.length} contrato(s). Esto se AGREGARÁ a los existentes. ¿Continuar?`)) return;
            const banner = $('#loadingBanner');
            $('#loadingBannerText').textContent = `🔄 Guardando en Google Sheets (0/${imported.length})…`;
            banner.style.display = 'block';
            for (let i = 0; i < imported.length; i++) {
                contractsCache.push(imported[i]);
                await SupabaseDB.upsertContrato(imported[i]);
                $('#loadingBannerText').textContent = `🔄 Guardando en Google Sheets (${i+1}/${imported.length})…`;
            }
            banner.style.display = 'none';
            showToast(`${imported.length} contratos importados`, 'success');
            preloadAllSchedules().then(() => renderContracts());
        } catch (err) { showToast('Error al leer el CSV: ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
}

/* ══════════════════════════════════════════════════════════════
   17. FONT SIZE
══════════════════════════════════════════════════════════════ */

const FONT_DEFAULT = 15;
let _fontSize = parseInt(localStorage.getItem('app_fs')) || FONT_DEFAULT;
document.documentElement.style.fontSize = _fontSize + 'px';

function changeFontSize(delta) {
    if (delta === 0) _fontSize = FONT_DEFAULT;
    else _fontSize = Math.min(20, Math.max(11, _fontSize + delta));
    document.documentElement.style.fontSize = _fontSize + 'px';
    try { localStorage.setItem('app_fs', _fontSize); } catch(e){ console.error('[GestAlquiler]', e); }
}

/* ══════════════════════════════════════════════════════════════
   18. STICKY OFFSETS
══════════════════════════════════════════════════════════════ */

function updateStickyOffsets() {
    const header    = document.querySelector('.app-header, .gs-hdr, header');
    const toolbar   = document.querySelector('.app-toolbar');
    const filterBar = document.querySelector('.filter-bar');
    const wrapper   = document.querySelector('.table-wrapper');

    const headerH  = header  ? header.offsetHeight  : 0;
    const toolbarH = toolbar ? toolbar.offsetHeight : 0;
    const filterH  = filterBar ? filterBar.offsetHeight : 0;

    // La filter-bar también es sticky: su top debe quedar debajo del toolbar
    if (filterBar) filterBar.style.top = (headerH + toolbarH) + 'px';

    // El wrapper arranca después del header+toolbar+filter-bar; descontamos
    // además un colchón de 20px para el padding inferior y el scrollbar horizontal.
    if (wrapper) {
        const offset = headerH + toolbarH + filterH + 20;
        wrapper.style.maxHeight = `calc(100vh - ${offset}px)`;
    }
}


/* ══════════════════════════════════════════════════════════════
   18b. RENOVAR CONTRATO
══════════════════════════════════════════════════════════════ */

function openRenovarModal(contractId) {
    const c = getContractById(contractId);
    if (!c) return;

    // Build modal HTML
    const existing = document.getElementById('renovarModal');
    if (existing) existing.remove();

    const m = document.createElement('div');
    m.id = 'renovarModal';
    m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:600;align-items:center;justify-content:center;padding:1rem';
    m.innerHTML = `
        <div style="background:#1c1c1c;border:1px solid rgba(255,255,255,.1);border-radius:16px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.6)">
            <div style="padding:1rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#0d0d0d,#1a1206);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:10">
                <h2 style="font-size:.95rem;font-weight:700;color:#fff">♻️ Renovar contrato — ${c.address}</h2>
                <button onclick="document.getElementById('renovarModal').remove()" style="background:none;border:none;color:#717171;font-size:1.4rem;cursor:pointer;line-height:1">&times;</button>
            </div>
            <div style="padding:1.25rem 1.5rem">

                <div style="font-size:.82rem;color:#b0b0b0;margin-bottom:1rem">
                    Contrato actual: <strong style="color:#fff">${c.tenant}</strong> desde ${c.startDate} — ${c.duration} meses
                </div>

                <!-- Tipo de renovación -->
                <div style="margin-bottom:1rem">
                    <div style="font-size:.72rem;font-weight:700;color:var(--text-muted,#717171);text-transform:uppercase;letter-spacing:.6px;margin-bottom:.5rem">¿Mismo inquilino o inquilino nuevo?</div>
                    <div style="display:flex;gap:.5rem">
                        <button id="rnvBtnMismo" onclick="renovarSetMode('mismo')"
                            style="flex:1;padding:.5rem;border-radius:8px;border:2px solid #f57c00;background:rgba(245,124,0,.15);color:#f57c00;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit;transition:all .15s">
                            👤 Mismo inquilino
                        </button>
                        <button id="rnvBtnNuevo" onclick="renovarSetMode('nuevo')"
                            style="flex:1;padding:.5rem;border-radius:8px;border:2px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#b0b0b0;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit;transition:all .15s">
                            🆕 Nuevo inquilino
                        </button>
                    </div>
                </div>

                <!-- Datos del nuevo inquilino (solo modo nuevo) -->
                <div id="rnvNuevoSection" style="display:none;background:rgba(55,138,221,.06);border:1px solid rgba(55,138,221,.2);border-radius:10px;padding:.9rem 1rem;margin-bottom:1rem">
                    <div style="font-size:.7rem;font-weight:700;color:#378ADD;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.6rem">Datos del nuevo inquilino</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
                        <div style="display:flex;flex-direction:column;gap:.25rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Nombre *</label>
                            <input id="rnvTenant" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s" onfocus="this.style.borderColor='#f57c00'" onblur="this.style.borderColor='rgba(255,255,255,.12)'" placeholder="Nombre del inquilino">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:.25rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Celular</label>
                            <input id="rnvTenantPhone" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s" onfocus="this.style.borderColor='#f57c00'" onblur="this.style.borderColor='rgba(255,255,255,.12)'" type="tel" placeholder="11 5555-1234">
                        </div>
                    </div>
                </div>

                <!-- Condiciones del nuevo período -->
                <div style="background:rgba(245,124,0,.06);border:1px solid rgba(245,124,0,.2);border-radius:10px;padding:.9rem 1rem;margin-bottom:1rem">
                    <div style="font-size:.7rem;font-weight:700;color:#f57c00;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.6rem">Condiciones del nuevo período</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.65rem">
                        <div style="display:flex;flex-direction:column;gap:.25rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Fecha de inicio *</label>
                            <input id="rnvStartDate" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s" onfocus="this.style.borderColor='#f57c00'" onblur="this.style.borderColor='rgba(255,255,255,.12)'" type="date">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:.25rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Duración (meses) *</label>
                            <input id="rnvDuration" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s" onfocus="this.style.borderColor='#f57c00'" onblur="this.style.borderColor='rgba(255,255,255,.12)'" type="number" min="1" max="120" placeholder="24">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:.25rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Actualizar cada (meses) *</label>
                            <select id="rnvUpdateFreq" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark">
                                <option value="3">Cada 3 meses</option>
                                <option value="4">Cada 4 meses</option>
                                <option value="6" selected>Cada 6 meses</option>
                                <option value="12">Cada 12 meses</option>
                            </select>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:.25rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Tipo de índice *</label>
                            <select id="rnvIndexType" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark">
                                <option value="ICL">ICL</option>
                                <option value="IPC">IPC</option>
                                <option value="CVS">CVS</option>
                                <option value="FIJO">Porcentaje fijo</option>
                                <option value="LIBRE">Libre</option>
                            </select>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:.25rem;grid-column:1/-1">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Monto inicial ($) *</label>
                            <input id="rnvAmount" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s" onfocus="this.style.borderColor='#f57c00'" onblur="this.style.borderColor='rgba(255,255,255,.12)'" type="number" min="0" placeholder="Ej: 850000">
                        </div>
                    </div>
                </div>

                <!-- Depósito y cuentas -->
                <div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:.9rem 1rem;margin-bottom:1rem">
                    <div style="font-size:.7rem;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.6rem">Depósito y cuentas del propietario</div>
                    <div style="font-size:.75rem;color:#b0b0b0;margin-bottom:.7rem">
                        Depósito actual: <strong style="color:#fff" id="rnvDepActual"></strong>
                    </div>
                    <div style="display:flex;gap:.5rem;margin-bottom:.7rem">
                        <button id="rnvDepBtnNo" onclick="rnvDepSetMode(false)"
                            style="flex:1;padding:.42rem;border-radius:8px;border:2px solid #10b981;background:rgba(16,185,129,.15);color:#10b981;font-weight:700;font-size:.8rem;cursor:pointer;font-family:inherit;transition:all .15s">
                            ✓ Sin cambios
                        </button>
                        <button id="rnvDepBtnSi" onclick="rnvDepSetMode(true)"
                            style="flex:1;padding:.42rem;border-radius:8px;border:2px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#b0b0b0;font-weight:700;font-size:.8rem;cursor:pointer;font-family:inherit;transition:all .15s">
                            ✏️ Actualizar depósito
                        </button>
                    </div>
                    <div id="rnvDepSection" style="display:none">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.6rem">
                            <div style="display:flex;flex-direction:column;gap:.25rem">
                                <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Nuevo monto depósito ($)</label>
                                <input id="rnvDepAmount" type="number" min="0" placeholder="Ej: 950000"
                                    style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s"
                                    onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='rgba(255,255,255,.12)'">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:.25rem">
                                <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Moneda depósito</label>
                                <select id="rnvDepCurrency"
                                    style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark">
                                    <option value="ARS">ARS $</option>
                                    <option value="USD">USD U$S</option>
                                </select>
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:.25rem;margin-bottom:.5rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Alias / CBU cuenta dueño (principal)</label>
                            <input id="rnvAlias1" type="text" placeholder="alias.cuenta o CBU"
                                style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s"
                                onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='rgba(255,255,255,.12)'">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:.25rem">
                            <label style="font-size:.7rem;font-weight:600;color:#b0b0b0">Alias / CBU cuenta dueño (alternativa)</label>
                            <input id="rnvAlias2" type="text" placeholder="opcional"
                                style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.4rem .65rem;font-size:.82rem;color:#f5f5f5;font-family:inherit;outline:none;color-scheme:dark;transition:border-color .15s"
                                onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='rgba(255,255,255,.12)'">
                        </div>
                    </div>
                </div>

                <div style="font-size:.7rem;color:#717171;margin-bottom:.75rem">
                    ℹ️ El resto de los datos (propietario, honorarios, servicios) se copian del contrato anterior. Podés editarlos después desde "Editar Contrato".
                </div>

            </div>
            <div style="padding:1rem 1.5rem;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:flex-end;gap:.75rem">
                <button onclick="document.getElementById('renovarModal').remove()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#b0b0b0;border-radius:8px;padding:.4rem 1rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
                <button onclick="confirmarRenovar('${c.id}')" style="background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;border-radius:8px;padding:.4rem 1.2rem;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit">♻️ Crear renovación</button>
            </div>
        </div>`;
    document.body.appendChild(m);
    m.onclick = e => { if (e.target === m) m.remove(); };

    // Pre-fill with current contract values as defaults
    const today = new Date();
    const endDate = getEndDate(c);
    // Suggest start = day after end date, normalized to 1st of next month
    let suggestStart;
    if (endDate) {
        const d = new Date(endDate);
        d.setDate(d.getDate() + 1);
        d.setDate(1);
        suggestStart = d.toISOString().slice(0,10);
    } else {
        suggestStart = today.toISOString().slice(0,10);
    }
    document.getElementById('rnvStartDate').value = suggestStart;
    document.getElementById('rnvDuration').value  = c.duration || 24;
    document.getElementById('rnvUpdateFreq').value = c.updateFrequency || '6';
    document.getElementById('rnvIndexType').value  = c.indexType || 'ICL';
    // Leave amount empty so user fills it consciously
    document.getElementById('rnvAmount').value = '';

    // Pre-fill deposit info
    const depLabel = (c.depositAmount ? '$ ' + Number(c.depositAmount).toLocaleString('es-AR') : '—') + (c.depositCurrency ? ' ' + c.depositCurrency : '');
    document.getElementById('rnvDepActual').textContent = depLabel;
    if (document.getElementById('rnvDepAmount'))  document.getElementById('rnvDepAmount').value  = c.depositAmount || '';
    if (document.getElementById('rnvDepCurrency')) document.getElementById('rnvDepCurrency').value = c.depositCurrency || 'ARS';
    if (document.getElementById('rnvAlias1'))     document.getElementById('rnvAlias1').value     = c.aliasOwner1 || '';
    if (document.getElementById('rnvAlias2'))     document.getElementById('rnvAlias2').value     = c.aliasOwner2 || '';
    _renovarUpdateDep = false;
    rnvDepSetMode(false);

    // Default mode: mismo inquilino
    renovarSetMode('mismo');
}

let _renovarMode = 'mismo';
let _renovarUpdateDep = false;
function rnvDepSetMode(update) {
    _renovarUpdateDep = update;
    const btnNo = document.getElementById('rnvDepBtnNo');
    const btnSi = document.getElementById('rnvDepBtnSi');
    const sec   = document.getElementById('rnvDepSection');
    if (!btnNo) return;
    if (update) {
        btnSi.style.borderColor = '#10b981'; btnSi.style.background = 'rgba(16,185,129,.15)'; btnSi.style.color = '#10b981';
        btnNo.style.borderColor = 'rgba(255,255,255,.1)'; btnNo.style.background = 'rgba(255,255,255,.04)'; btnNo.style.color = '#b0b0b0';
        sec.style.display = 'block';
    } else {
        btnNo.style.borderColor = '#10b981'; btnNo.style.background = 'rgba(16,185,129,.15)'; btnNo.style.color = '#10b981';
        btnSi.style.borderColor = 'rgba(255,255,255,.1)'; btnSi.style.background = 'rgba(255,255,255,.04)'; btnSi.style.color = '#b0b0b0';
        sec.style.display = 'none';
    }
}
function renovarSetMode(mode) {
    _renovarMode = mode;
    const sec = document.getElementById('rnvNuevoSection');
    const bMismo = document.getElementById('rnvBtnMismo');
    const bNuevo = document.getElementById('rnvBtnNuevo');
    const activeStyle = 'flex:1;padding:.5rem;border-radius:8px;border:2px solid #f57c00;background:rgba(245,124,0,.15);color:#f57c00;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit;transition:all .15s';
    const inactiveStyle = 'flex:1;padding:.5rem;border-radius:8px;border:2px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#b0b0b0;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit;transition:all .15s';
    if (mode === 'mismo') {
        bMismo.style.cssText = activeStyle;
        bNuevo.style.cssText = inactiveStyle;
        sec.style.display = 'none';
    } else {
        bNuevo.style.cssText = activeStyle;
        bMismo.style.cssText = inactiveStyle;
        sec.style.display = 'block';
        setTimeout(()=>document.getElementById('rnvTenant').focus(),80);
    }
}

async function confirmarRenovar(contractId) {
    const c = getContractById(contractId);
    if (!c) return;

    const startDate = document.getElementById('rnvStartDate').value;
    const duration  = parseInt(document.getElementById('rnvDuration').value);
    const freq      = document.getElementById('rnvUpdateFreq').value;
    const indexType = document.getElementById('rnvIndexType').value;
    const amount    = parseFloat(document.getElementById('rnvAmount').value);

    if (!startDate) { alert('Ingresá la fecha de inicio.'); return; }
    if (!duration || duration < 1) { alert('Ingresá una duración válida.'); return; }
    if (!amount || amount <= 0)  { alert('Ingresá el monto inicial.'); return; }

    let tenant = c.tenant, tenantPhone = c.tenantPhone || '';
    if (_renovarMode === 'nuevo') {
        tenant = document.getElementById('rnvTenant').value.trim();
        tenantPhone = document.getElementById('rnvTenantPhone').value.trim();
        if (!tenant) { alert('Ingresá el nombre del nuevo inquilino.'); return; }
    }

    // Leer campos de depósito si se actualizan
    let depositAmount  = c.depositAmount;
    let depositCurrency = c.depositCurrency;
    let aliasOwner1 = c.aliasOwner1, aliasOwner2 = c.aliasOwner2;
    if (_renovarUpdateDep) {
        const depAmtVal = parseFloat(document.getElementById('rnvDepAmount').value);
        if (!isNaN(depAmtVal) && depAmtVal > 0) depositAmount = depAmtVal;
        depositCurrency = document.getElementById('rnvDepCurrency').value || depositCurrency;
        const a1 = document.getElementById('rnvAlias1').value.trim();
        const a2 = document.getElementById('rnvAlias2').value.trim();
        if (a1) aliasOwner1 = a1;
        if (a2) aliasOwner2 = a2;
    }

    // Nuevo contrato copiando todos los campos del original + cambios de renovación
    const newContract = {
        ...c,
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
        startDate,
        duration,
        updateFrequency: freq,
        indexType,
        initialAmount: amount,
        tenant,
        tenantPhone,
        depositAmount,
        depositCurrency,
        aliasOwner1,
        aliasOwner2,
        updatesHistory: [],
        prorrogas: [],
        acuerdoMonto: '',
        acuerdoFecha: '',
        acuerdoIndice: '',
        acuerdoNota: '',
    };
    // fixedPercent solo aplica cuando el índice es FIJO
    if (indexType !== 'FIJO') delete newContract.fixedPercent;

    if (!confirm(`¿Crear renovación de "${c.address}" para ${tenant}?\n\nInicio: ${startDate} — ${duration} meses — ${indexType} — $${amount.toLocaleString('es-AR')}\n\nEl contrato actual será eliminado y reemplazado por el nuevo.`)) return;

    document.getElementById('renovarModal').remove();
    const lb=$('#loadingBanner'); if(lb){lb.style.display='block';$('#loadingBannerText').textContent='🔄 Guardando renovación…';}

    try {
        // 1. Guardar el nuevo contrato en Supabase
        const saveResult = await SupabaseDB.upsertContrato(newContract);
        if (!saveResult || !saveResult.success) {
            if(lb) lb.style.display='none';
            let errMsg = 'Error al guardar renovación.';
            if (saveResult && saveResult.error) {
                try {
                    const errObj = JSON.parse(saveResult.error);
                    errMsg += ' ' + (errObj.message || errObj.hint || saveResult.error);
                } catch { errMsg += ' ' + saveResult.error; }
            }
            console.error('[Renovar] Supabase error:', saveResult);
            showToast(errMsg, 'error');
            return;
        }

        // 2. Eliminar el contrato anterior de Supabase Y del cache local
        await deleteContract(c.id);

        // 3. Agregar nuevo al cache local y re-renderizar
        contractsCache.push(newContract);

        await renderContracts();
        showToast('♻️ Renovación creada: ' + tenant + ' en ' + c.address, 'success');
    } catch (e) {
        console.error('[confirmarRenovar]', e);
        showToast('Error al guardar renovación: ' + (e.message || e), 'error');
    }
    if(lb) lb.style.display='none';
}


/* ══════════════════════════════════════════════════════════════
   19. INICIALIZACIÓN — DOMContentLoaded
══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof GestShared !== 'undefined') GestShared.initHeader('contratos');

    // ── Cargar índices IPC/ICL desde Supabase (en background, no bloquea UI) ──
    loadIndicesFromSupabase().catch(e => console.warn('[Índices] carga inicial falló:', e));

    const toggleStyle = document.createElement('style');
    toggleStyle.textContent = `
        #depositToggle.on  { background: #f57c00; }
        #depositToggle.on > div { left: 23px; }
        #honorariosToggle.on { background: #f57c00; }
        #honorariosToggle.on > div { left: 23px; }
        #prorrogaDepositToggle.on { background: #7c3aed; }
        #prorrogaDepositToggle.on > div { left: 23px; }
        .row-expiring-soon td { background: rgba(239, 68, 68, 0.06) !important; }
        .row-expiring-soon:hover td { background: rgba(239, 68, 68, 0.12) !important; }
    `;
    document.head.appendChild(toggleStyle);

    // Verificar URL de Sheets configurada
    // Supabase v4.0 — sin validación de URL necesaria

    // ── Carga instantánea desde cache localStorage ──────────────────
    const cached = loadContractsFromLS();
    if (cached && cached.length > 0) {
        contractsCache = cached;
        await preloadAllSchedules();
        await renderContracts();
    } else {
        // Sin cache: mostrar spinner y esperar
        const banner = $('#loadingBanner');
        $('#loadingBannerText').textContent = '🔄 Conectando con Google Sheets…';
        banner.style.display = 'block';
        try {
            await loadFromSheets();
            await migrateLocalStorageMarks();
        } catch (err) {
            showToast('No se pudo conectar con Google Sheets. Verificá la URL.', 'error');
            console.error(err);
        } finally {
            banner.style.display = 'none';
        }
        await preloadAllSchedules();
        await renderContracts();
    }

    // ── Refresh en background (actualiza si hubo cambios en otra PC) ─
    if (cached && cached.length > 0) {
        setTimeout(async () => {
            try {
                const changed = await loadFromSheets();
                await migrateLocalStorageMarks();
                if (changed) {
                    scheduleCache.clear();
                    await preloadAllSchedules();
                    renderContracts();
                }
            } catch(e) { console.warn('[GestAlquiler] Background refresh:', e); }
        }, 100); // lanzar casi inmediatamente después de renderizar
    }

    // ── Botones principales ──
    $('#btnNewContract').onclick = () => openModal();
    $('#btnEmptyNew').onclick    = () => openModal();
    $('#btnCloseModal').onclick  = closeModal;
    $('#btnCancelModal').onclick = closeModal;
    $('#contractModal').onclick  = e => { if (e.target === $('#contractModal')) closeModal(); };
    $('#btnCloseDetail').onclick = () => $('#detailModal').classList.remove('active');
    $('#detailModal').onclick    = e => { if (e.target === $('#detailModal')) $('#detailModal').classList.remove('active'); };

    // ── Índice ──
    $('#indexType').onchange = e => {
        $('#fixedPercentGroup').style.display = e.target.value === 'FIJO' ? 'flex' : 'none';
        $('#fixedPercent').required = e.target.value === 'FIJO';
    };

    // ── Búsqueda y filtros ──
    $('#searchInput').oninput = e => { searchTerm = e.target.value.toLowerCase(); renderContracts(); };
    $$('.filter-btn').forEach(b => b.onclick = () => {
        $$('.filter-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        activeFilter = b.dataset.filter;
        renderContracts();
    });
    $('#filterIndex').onchange = e => { activeIndexFilter = e.target.value; renderContracts(); };
    $('#alertPill').onclick = () => {
        $$('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-filter="alerts"]').classList.add('active');
        activeFilter = 'alerts';
        renderContracts();
    };

    // ── CSV ── (botones opcionales - pueden no estar en el DOM)
    const _btnExp = $('#btnExportCSV'); if (_btnExp) _btnExp.onclick = exportCSV;
    const _btnImp = $('#btnImportCSV'); if (_btnImp) _btnImp.onclick = () => $('#csvFileInput')?.click();
    const _csvInp = $('#csvFileInput'); if (_csvInp) _csvInp.onchange = e => { if (e.target.files[0]) { importCSV(e.target.files[0]); e.target.value = ''; } };

    // ── Teclado ──
    document.onkeydown = e => {
        if (e.key === 'Escape') {
            closeModal();
            $('#detailModal').classList.remove('active');
            closeUpdateConfirmModal();
        }
    };

    // ── Formulario de contrato ──
    $('#contractForm').onsubmit = async e => {
        e.preventDefault();
        const data = {
            address:        $('#address').value.trim(),
            tenant:         $('#tenant').value.trim(),
            tenantPhone:    $('#tenantPhone').value.trim(),
            tenantEmail:    $('#tenantEmail').value.trim(),
            owner:          $('#owner').value.trim(),
            ownerPhone:     $('#ownerPhone').value.trim(),
            ownerEmail:     $('#ownerEmail').value.trim(),
            startDate:      $('#startDate').value,
            duration:       parseInt($('#duration').value),
            updateFrequency: $('#updateFrequency').value,
            indexType:      $('#indexType').value,
            fixedPercent:   $('#fixedPercent').value || null,
            initialAmount:  parseFloat($('#initialAmount').value),
            adminFee:       $('#adminFee').value || null,
            moraRate:       parseFloat($('#moraRate').value) || null,
            acuerdoMonto:   parseFloat($('#acuerdoMonto').value) || null,
            acuerdoFecha:   $('#acuerdoFecha').value || null,
            acuerdoIndice:  $('#acuerdoIndice').value || null,
            honorariosPorDueno: $('#honorariosPorDueno').checked,
            depositUpdate:  $('#depositUpdate').checked,
            depositAmount:  $('#depositUpdate').checked ? (parseFloat($('#depositAmount').value) || parseFloat($('#initialAmount').value) || 0) : 0,
            depositCurrency: $('#depositCurrency').value || 'ARS',
            notes:          $('#notes').value.trim(),
            nroAbl:         $('#nroAbl').value.trim(),
            nroAysa:        $('#nroAysa').value.trim(),
            nroLuz:         $('#nroLuz').value.trim(),
            nroGas:         $('#nroGas').value.trim(),
            pagaAbl:        $('#pagaAbl').checked,
            pagaAysa:       $('#pagaAysa').checked,
            pagaLuz:        $('#pagaLuz').checked,
            pagaGas:        $('#pagaGas').checked,
            pagaExpensas:   $('#pagaExpensas').checked,
            aliasOwner1:    $('#aliasOwner1').value.trim(),
            aliasOwner2:    $('#aliasOwner2').value.trim(),
            aliasOwner3:    $('#aliasOwner3').value.trim(),
            aliasOwner4:    $('#aliasOwner4').value.trim(),
            aliasInmobiliaria: $('#aliasInmobiliaria').value.trim() || ALIAS_INMOB_DEFAULT
        };

        const eid = $('#contractId').value;
        if (eid) {
            const oldC = getContractById(eid);
            if (oldC) invalidateScheduleCache(oldC);
            await updateContract(eid, data);
            showToast('Contrato actualizado', 'success');
        } else {
            await addContract(data);
            showToast('Contrato agregado', 'success');
        }
        closeModal();
        await fetchContractSchedule(eid ? getContractById(eid) : contractsCache[contractsCache.length - 1]);
        await renderContracts();
    };

    // ── Modal prórroga ──
    document.getElementById('btnCloseProrrogaModal').onclick  = closeProrrogaModal;
    document.getElementById('btnCancelProrroga').onclick      = closeProrrogaModal;
    document.getElementById('prorrogaModal').addEventListener('click', e => {
        if (e.target === document.getElementById('prorrogaModal')) closeProrrogaModal();
    });
    document.getElementById('btnConfirmProrroga').onclick = confirmProrroga;

    // Toggle depósito en modal prórroga
    document.getElementById('prorrogaDepositToggle').addEventListener('click', () => {
        const cb    = document.getElementById('prorroga_depositUpdate');
        const label = document.getElementById('prorrogaDepositLabel');
        const tog   = document.getElementById('prorrogaDepositToggle');
        cb.checked  = !cb.checked;
        tog.classList.toggle('on', cb.checked);
        label.textContent = cb.checked ? 'Sí' : 'No';
        label.style.color = cb.checked ? '#7c3aed' : '#64748b';
    });

    // ── Modal confirmación de actualización ──
    document.getElementById('btnCloseUpdConfirm').onclick  = closeUpdateConfirmModal;
    document.getElementById('btnCancelUpdConfirm').onclick = closeUpdateConfirmModal;
    document.getElementById('updConfirmModal').addEventListener('click', e => {
        if (e.target === document.getElementById('updConfirmModal')) closeUpdateConfirmModal();
    });

    document.getElementById('updConfirm_input').addEventListener('input', function() {
        if (!_updConfirmCtx) return;
        const entered = Math.round(parseFloat(this.value) || 0);
        const differs = entered > 0 && entered !== _updConfirmCtx.calculatedAmount;
        document.getElementById('updConfirm_changeNote').style.display = differs ? 'block' : 'none';
    });

    document.getElementById('btnConfirmUpdate').onclick = async () => {
        if (!_updConfirmCtx) return;
        const { c, nu, calculatedAmount } = _updConfirmCtx;
        const inp = document.getElementById('updConfirm_input');
        const agreedAmount = Math.round(parseFloat(inp.value) || calculatedAmount);
        const nota = document.getElementById('updConfirm_noteInput').value.trim();
        closeUpdateConfirmModal();

        const amountChanged = agreedAmount > 0 && agreedAmount !== calculatedAmount;
        const nuDate = nu.date instanceof Date ? nu.date : new Date(nu.date);

        const entry = {
            periodNumber:  nu.periodNumber,
            scheduledDate: nuDate.toISOString().slice(0, 10),
            markedAt:      new Date().toISOString(),
            amount:        agreedAmount
        };
        const currentHistory = (c.updatesHistory || []).filter(h => h.periodNumber !== nu.periodNumber);
        currentHistory.push(entry);

        const updateData = { updatesHistory: currentHistory };
        if (amountChanged) {
            const acuerdoFecha = `${nuDate.getFullYear()}-${String(nuDate.getMonth()+1).padStart(2,'0')}-01`;
            Object.assign(updateData, {
                acuerdoMonto:  agreedAmount,
                acuerdoFecha:  acuerdoFecha,
                acuerdoIndice: c.indexType,
                acuerdoNota:   nota || `Monto acordado en período ${nu.periodNumber}`
            });
        }

        // Borrar SIEMPRE la cache key vieja (usando el objeto c ANTES del update,
        // porque la key incluye acuerdoMonto/acuerdoFecha y puede cambiar).
        const oldCacheKey = contractCacheKey(c);
        scheduleCache.delete(oldCacheKey);

        await updateContract(c.id, updateData);
        _lastMarkedInfo = { contractId: c.id, periodNumber: nu.periodNumber, time: Date.now() };

        const updatedC = getContractById(c.id);
        if (updatedC) {
            scheduleCache.delete(contractCacheKey(updatedC)); // borrar nueva key también (precaución)
            await fetchContractSchedule(updatedC);
        }

        await renderContracts();
        showToast(amountChanged
            ? `✓ Monto acordado: ${formatCurrency(agreedAmount)} — guardado como nueva base`
            : '✓ Contrato marcado como actualizado', 'success');
    };

    // ── Sticky offsets ──
    updateStickyOffsets();
    window.addEventListener('resize', updateStickyOffsets);

    // ── Auto-refresh inteligente cada 60 segundos ──
    //    • Solo actúa si los datos realmente cambiaron en Sheets
    //    • No interrumpe si el usuario está escribiendo en cualquier input/textarea
    //    • No actúa si hay un modal abierto
    function isUserTyping() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || !!el.isContentEditable;
    }

    async function silentRefresh() {
        if ($('#contractModal').classList.contains('active')) return;
        if ($('#detailModal').classList.contains('active')) return;
        if ($('#updConfirmModal').style.display === 'flex') return;
        if ($('#prorrogaModal').style.display === 'flex') return;
        if (isUserTyping()) return;  // no interrumpir al usuario
        try {
            const changed = await loadFromSheets();
            if (!changed) return;  // datos iguales → no tocar el DOM
            scheduleCache.clear();
            await preloadAllSchedules();
            renderContracts();
        } catch(e){ console.error('[GestAlquiler]', e); }
    }

    setInterval(silentRefresh, 60000);

    // ── Refresh al volver a la pestaña ──
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') return;
        await silentRefresh();
    });
});
