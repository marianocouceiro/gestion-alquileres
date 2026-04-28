/* ═══════════════════════════════════════════════════════════════
   supabase.js — GestAlquiler v5.0
   ─────────────────────────────────────────────────────────────
   CAMBIOS v5:
   • Header Authorization: Bearer añadido (requerido)
   • Tablas no-contratos: patrón JSONB { id, ..., data: obj }
   • historial_visitas: filtra sobre tabla visitas directamente
   • fromApp() mapper para upsertContrato (no se enviaba snake_case)
═══════════════════════════════════════════════════════════════ */
'use strict';

const SupabaseDB = (function () {

  const BASE = 'https://ratkgsxlqjjhjcclpcee.supabase.co';
  const ANON = 'sb_publishable_frPLdQ7k0nOOP5JsULLU-g_XEPjc1Bv';

  // Devuelve el token de sesión si está activo, sino el anon key.
  // SÍNCRONO: para usos legacy. Puede devolver un token vencido si el refresh todavía no corrió.
  function getToken() {
    try {
      const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
      if (s.access_token && s.expires_at > Date.now()/1000 + 30) return s.access_token;
    } catch {}
    return ANON;
  }

  // ASYNC: devuelve el token, esperando a refrescar si está por vencer.
  // Es la forma correcta de obtener el token antes de hacer una request.
  let _refreshing = null; // coalescer: si ya hay un refresh en curso, todos esperan al mismo
  async function getTokenAsync() {
    try {
      const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
      if (!s.access_token) return ANON;
      const secLeft = s.expires_at - Date.now()/1000;
      // Si tiene más de 60 segundos de vida, usar tal cual
      if (secLeft > 60) return s.access_token;
      // Sino intentar refrescar (coalescido entre llamadas concurrentes)
      if (s.refresh_token) {
        if (!_refreshing) _refreshing = refreshSession(s.refresh_token).finally(() => { _refreshing = null; });
        await _refreshing;
        const s2 = JSON.parse(localStorage.getItem('ga_session') || '{}');
        if (s2.access_token && s2.expires_at > Date.now()/1000 + 30) return s2.access_token;
      }
    } catch {}
    return ANON;
  }

  function getHeaders(extra) {
    const tok = getToken();
    return Object.assign({
      'apikey':        ANON,
      'Authorization': 'Bearer ' + tok,
      'Content-Type':  'application/json',
    }, extra || {});
  }

  // Igual a getHeaders pero asíncrono — espera a refrescar el token si hace falta
  async function getHeadersAsync(extra) {
    const tok = await getTokenAsync();
    return Object.assign({
      'apikey':        ANON,
      'Authorization': 'Bearer ' + tok,
      'Content-Type':  'application/json',
    }, extra || {});
  }

  function getOrgId() {
    try {
      const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
      if (!s.access_token) return null;
      const p = JSON.parse(atob(s.access_token.split('.')[1]));
      return p.app_metadata?.org_id || null;
    } catch { return null; }
  }

  // Verifica sesión — redirige a login si no hay (llamar desde initHeader)
  function requireAuth() {
    try {
      const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
      if (!s.access_token || s.expires_at <= Date.now()/1000 + 30) {
        window.location.replace('login.html');
        return false;
      }
      // Refrescar si quedan menos de 10 min
      if (s.expires_at - Date.now()/1000 < 600) refreshSession(s.refresh_token);
      return true;
    } catch {
      window.location.replace('login.html');
      return false;
    }
  }

  async function refreshSession(refreshToken) {
    try {
      const r = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const d = await r.json();
      if (d.access_token) {
        localStorage.setItem('ga_session', JSON.stringify({
          access_token: d.access_token,
          refresh_token: d.refresh_token,
          expires_at: Math.floor(Date.now()/1000) + (d.expires_in || 3600),
          user_email: d.user?.email || '',
        }));
      }
    } catch {}
  }

  function logout() {
    localStorage.removeItem('ga_session');
    window.location.replace('login.html');
  }

  function getUserEmail() {
    try { return JSON.parse(localStorage.getItem('ga_session') || '{}').user_email || ''; } catch { return ''; }
  }

  // ── Utilidad base ──────────────────────────────────────────────
  async function query(table, options = {}) {
    const { method = 'GET', filters = '', body = null } = options;
    let endpoint = `${BASE}/rest/v1/${table}`;
    if (filters) endpoint += `?${filters}`;

    const buildOpts = () => {
      const o = {
        method,
        headers: {
          ...getHeaders(),
          'Prefer': method === 'GET'
            ? 'count=exact'
            : 'resolution=merge-duplicates,return=representation'
        }
      };
      if (body !== null) o.body = JSON.stringify(body);
      return o;
    };

    try {
      let r = await fetch(endpoint, buildOpts());
      // Si el token venció (401/403 con token de usuario), intentar refrescar y reintentar una vez
      if ((r.status === 401 || r.status === 403) && await _tryRefreshSession()) {
        r = await fetch(endpoint, buildOpts());
      }
      if (!r.ok) {
        const errText = await r.text();
        console.error(`[Supabase] ${method} /${table} → HTTP ${r.status}:`, errText);
        // Si sigue 401 después de refrescar, la sesión realmente murió → forzar login
        if (r.status === 401) {
          try { localStorage.removeItem('ga_session'); } catch {}
          if (!location.pathname.endsWith('login.html')) window.location.replace('login.html');
        }
        return { success: false, error: errText, status: r.status };
      }
      const data = r.status === 204 ? null : await r.json();
      return { success: true, data };
    } catch (e) {
      console.error('[Supabase] fetch error:', e);
      return { success: false, error: e.toString() };
    }
  }

  // Helper: intenta refrescar usando el refresh_token guardado. Devuelve true si la sesión
  // quedó vigente (ya lo estaba o se refrescó exitosamente).
  async function _tryRefreshSession() {
    try {
      const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
      if (!s.refresh_token) return false;
      if (!_refreshing) _refreshing = refreshSession(s.refresh_token).finally(() => { _refreshing = null; });
      await _refreshing;
      const s2 = JSON.parse(localStorage.getItem('ga_session') || '{}');
      return !!(s2.access_token && s2.expires_at > Date.now()/1000 + 30);
    } catch { return false; }
  }

  async function upsert(table, body) {
    const r = await fetch(`${BASE}/rest/v1/${table}`, {
      method:  'POST',
      headers: { ...getHeaders(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.text();
      console.error(`[Supabase] upsert ${table} → HTTP ${r.status}:`, err);
      return { success: false, status: r.status, error: err };
    }
    return { success: true };
  }

  async function del(table, id) {
    const r = await query(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return { success: r.success };
  }

  // ══════════════════════════════════════════════════════════════
  // CONTRATOS — mapper snake_case ↔ camelCase
  // ══════════════════════════════════════════════════════════════
  function toApp(c) {
    if (!c) return c;
    return {
      id: c.id, address: c.address, tenant: c.tenant,
      tenantPhone: c.tenant_phone, tenantEmail: c.tenant_email,
      owner: c.owner, ownerPhone: c.owner_phone, ownerEmail: c.owner_email,
      startDate: c.start_date, duration: c.duration,
      updateFrequency: c.update_frequency, indexType: c.index_type,
      initialAmount: c.initial_amount, fixedPercent: c.fixed_percent,
      adminFee: c.admin_fee, moraRate: c.mora_rate,
      depositAmount: c.deposit_amount, depositCurrency: c.deposit_currency,
      depositUpdate: c.deposit_update, honorariosPorDueno: c.honorarios_por_dueno,
      notes: c.notes, aliasInmobiliaria: c.alias_inmobiliaria,
      aliasOwner1: c.alias_owner1, aliasOwner2: c.alias_owner2,
      aliasOwner3: c.alias_owner3, aliasOwner4: c.alias_owner4,
      nroAbl: c.nro_abl, nroAysa: c.nro_aysa, nroLuz: c.nro_luz, nroGas: c.nro_gas,
      pagaAbl: c.paga_abl, pagaAysa: c.paga_aysa, pagaLuz: c.paga_luz,
      pagaGas: c.paga_gas, pagaExpensas: c.paga_expensas,
      prorrogas: c.prorrogas || [], updatesHistory: c.updates_history || [],
      acuerdoMonto: c.acuerdo_monto, acuerdoFecha: c.acuerdo_fecha,
      acuerdoIndice: c.acuerdo_indice, acuerdoNota: c.acuerdo_nota,
      createdAt: c.created_at, updatedAt: c.updated_at,
    };
  }

  // "" → null para columnas DATE y NUMERIC (Postgres rechaza strings vacíos en esos tipos)
  function nullDate(v)  { return (v === '' || v == null) ? null : v; }
  function nullNum(v)   { const n = parseFloat(v); return isNaN(n) ? null : n; }

  function fromApp(c) {
    return {
      id: c.id, address: c.address, tenant: c.tenant,
      tenant_phone: c.tenantPhone || null,
      owner: c.owner, owner_phone: c.ownerPhone || null,
      start_date:        nullDate(c.startDate),
      duration:          c.duration,
      update_frequency:  c.updateFrequency,
      index_type:        c.indexType,
      initial_amount:    nullNum(c.initialAmount),
      fixed_percent:     nullNum(c.fixedPercent),
      admin_fee:         nullNum(c.adminFee),
      mora_rate:         nullNum(c.moraRate),
      deposit_amount:    nullNum(c.depositAmount),
      deposit_currency:  c.depositCurrency || null,
      deposit_update:    c.depositUpdate ?? false,
      honorarios_por_dueno: c.honorariosPorDueno ?? false,
      notes:             c.notes || '',
      alias_inmobiliaria: c.aliasInmobiliaria || '',
      alias_owner1: c.aliasOwner1 || '', alias_owner2: c.aliasOwner2 || '',
      alias_owner3: c.aliasOwner3 || '', alias_owner4: c.aliasOwner4 || '',
      nro_abl:  c.nroAbl  || '', nro_aysa: c.nroAysa || '',
      nro_luz:  c.nroLuz  || '', nro_gas:  c.nroGas  || '',
      paga_abl: c.pagaAbl ?? false, paga_aysa: c.pagaAysa ?? false,
      paga_luz: c.pagaLuz ?? false, paga_gas:  c.pagaGas  ?? false,
      paga_expensas: c.pagaExpensas ?? false,
      prorrogas:       c.prorrogas       || [],
      updates_history: c.updatesHistory  || [],
      acuerdo_monto:  nullNum(c.acuerdoMonto),
      acuerdo_fecha:  nullDate(c.acuerdoFecha),
      acuerdo_indice: c.acuerdoIndice || null,
      acuerdo_nota:   c.acuerdoNota   || null,
      updated_at: new Date().toISOString(),
      org_id:     getOrgId(),
    };
  }

  async function getContratos() {
    const r = await query('contratos', { filters: 'order=address.asc' });
    return r.success ? (r.data || []).map(toApp) : [];
  }
  async function upsertContrato(c) { return await upsert('contratos', fromApp(c)); }
  async function deleteContrato(id) { return await del('contratos', id); }

  // ══════════════════════════════════════════════════════════════
  // PATRÓN JSONB — todas las demás tablas
  // upsert: extrae cols indexables + guarda obj completo en data
  // get:    devuelve row.data (el objeto original tal cual)
  // ══════════════════════════════════════════════════════════════

  // ── PAGOS ────────────────────────────────────────────────────
  async function getPagosMes(year, month) {
    const r = await query('pagos', {
      filters: `year=eq.${year}&month=eq.${month}&order=address.asc`
    });
    return r.success ? (r.data || []).map(row => row.data || {}) : [];
  }
  async function upsertPago(pago) {
    return await upsert('pagos', {
      id: pago.id, address: pago.address || '',
      year: pago.year || 0, month: pago.month || 0,
      data: pago, updated_at: new Date().toISOString(), org_id: getOrgId()
    });
  }
  async function deletePago(id) { return await del('pagos', id); }

  // ── VISITAS ──────────────────────────────────────────────────
  async function getVisitas() {
    const r = await query('visitas', { filters: 'order=fecha.asc,hora.asc' });
    return r.success ? (r.data || []).map(row => row.data || { id: row.id }) : [];
  }
  async function upsertVisita(v) {
    return await upsert('visitas', {
      id: v.id, fecha: v.fecha || '', hora: v.hora || '00:00',
      data: v, updated_at: new Date().toISOString(), org_id: getOrgId()
    });
  }
  async function deleteVisita(id) { return await del('visitas', id); }

  // historial = visitas con estados finales
  async function getHistorialVisitas(year) {
    const r = await query('visitas', {
      filters: `fecha=gte.${year}-01-01&fecha=lte.${year}-12-31&order=fecha.desc`
    });
    if (!r.success) return [];
    // Devuelve TODAS las visitas del año (historial completo, no solo finalizadas)
    return (r.data || []).map(row => row.data || { id: row.id });
  }

  // ── TASACIONES ───────────────────────────────────────────────
  async function getTasaciones() {
    const r = await query('tasaciones', { filters: 'order=fecha.desc' });
    return r.success ? (r.data || []).map(row => row.data || { id: row.id }) : [];
  }
  async function upsertTasacion(t) {
    return await upsert('tasaciones', {
      id: t.id, fecha: t.fecha || '',
      data: t, updated_at: new Date().toISOString(), org_id: getOrgId()
    });
  }
  async function deleteTasacion(id) { return await del('tasaciones', id); }

  // ── PROPIEDADES ──────────────────────────────────────────────
  async function getPropiedades() {
    const r = await query('propiedades', { filters: 'order=created_at.desc' });
    return r.success ? (r.data || []).map(row => row.data || { id: row.id, address: row.address }) : [];
  }
  async function upsertPropiedad(p) {
    return await upsert('propiedades', {
      id: p.id, address: p.address || '', tipo: p.tipo || 'venta',
      venta: p.venta || null,          // col separada para getVentasYear
      data: p, updated_at: new Date().toISOString(), org_id: getOrgId()
    });
  }
  async function deletePropiedad(id) { return await del('propiedades', id); }

  async function getVentasYear(year) {
    const r = await query('propiedades', {
      filters: `venta->>fechaReserva=gte.${year}-01-01&venta->>fechaReserva=lte.${year}-12-31`
    });
    if (!r.success) return [];
    return (r.data || []).map(row => {
      const p = row.data || {};
      const v = p.venta || row.venta || {};
      return { ...v, address: p.address || row.address, id: row.id };
    });
  }

  async function deleteVenta(id) {
    // 1. Limpiar columna venta separada
    await fetch(`${BASE}/rest/v1/propiedades?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ venta: null })
    });
    // 2. También limpiar dentro de data
    const rGet = await query('propiedades', { filters: `id=eq.${encodeURIComponent(id)}` });
    if (rGet.success && rGet.data && rGet.data[0]) {
      const p = rGet.data[0].data || {};
      delete p.venta;
      await upsert('propiedades', { ...rGet.data[0], venta: null, data: p });
    }
    return { success: true };
  }

  // ── COMPRADORES ──────────────────────────────────────────────
  async function getCompradores() {
    const r = await query('compradores', { filters: 'order=nombre.asc' });
    return r.success ? (r.data || []).map(row => row.data || { id: row.id }) : [];
  }
  async function upsertComprador(c) {
    return await upsert('compradores', {
      id: c.id, nombre: c.nombre || '',
      data: c, updated_at: new Date().toISOString(), org_id: getOrgId()
    });
  }
  async function deleteComprador(id) { return await del('compradores', id); }

  // ── VENDEDORES ───────────────────────────────────────────────
  async function getVendedores() {
    const r = await query('vendedores', { filters: 'activo=eq.true&order=orden.asc' });
    return r.success ? (r.data || []).map(v => v.nombre) : [];
  }
  async function saveVendedores(lista) {
    await fetch(`${BASE}/rest/v1/vendedores?id=gt.0`, {
      method: 'DELETE', headers: getHeaders()
    });
    if (!lista.length) return { success: true };
    const rows = lista.map((nombre, i) => ({ nombre, activo: true, orden: i, org_id: getOrgId() }));
    const r = await fetch(`${BASE}/rest/v1/vendedores`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(rows)
    });
    return { success: r.ok };
  }

  // ── CONFIG ───────────────────────────────────────────────────
  async function getConfig() {
    const r = await query('config');
    if (!r.success) return {};
    const cfg = {};
    for (const row of (r.data || [])) {
      try   { cfg[row.clave] = JSON.parse(row.valor); }
      catch { cfg[row.clave] = row.valor; }
    }
    return cfg;
  }
  async function saveConfig(cfg) {
    // Obtener org_id del JWT para incluirlo en cada fila (PK es clave+org_id)
    let orgId = null;
    try {
      const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
      if (s.access_token) {
        const p = JSON.parse(atob(s.access_token.split('.')[1]));
        orgId = p.app_metadata?.org_id || null;
      }
    } catch {}
    if (!orgId) return { success: false, error: 'no org_id' };

    const rows = Object.entries(cfg)
      .filter(([, v]) => v !== undefined)
      .map(([clave, valor]) => ({
        clave,
        valor: typeof valor === 'object' ? JSON.stringify(valor) : String(valor),
        org_id: orgId,
        updated_at: new Date().toISOString()
      }));
    if (!rows.length) return { success: true };
    const r = await fetch(`${BASE}/rest/v1/config`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    });
    if (!r.ok) console.error('[Supabase] saveConfig:', await r.text());
    return { success: r.ok };
  }

  async function ping() {
    try {
      const r = await fetch(`${BASE}/rest/v1/config?limit=1`, {
        headers: getHeaders()
      });
      return r.ok;
    } catch { return false; }
  }

  const api = {
    requireAuth, logout, getUserEmail,
    getContratos, upsertContrato, deleteContrato,
    getPagosMes, upsertPago, deletePago,
    getVisitas, upsertVisita, deleteVisita, getHistorialVisitas,
    getTasaciones, upsertTasacion, deleteTasacion,
    getPropiedades, upsertPropiedad, deletePropiedad, getVentasYear, deleteVenta,
    getCompradores, upsertComprador, deleteComprador,
    getVendedores, saveVendedores,
    getConfig, saveConfig,
    ping
  };

  /* ─────────────────────────────────────────────────────────────
     Auto-refresh de sesión en segundo plano
     ─────────────────────────────────────────────────────────────
     - Cada 30 min chequea si el access_token está por vencer y lo refresca.
     - También refresca cuando la pestaña vuelve a primer plano después de
       un período de inactividad (es el momento típico donde encontrarías
       el token vencido).
     Mientras el refresh_token siga vigente (30 días por default en Supabase),
     nunca debería pedir volver a loguearse. ─────────────────────────── */
  async function _bgRefreshIfNeeded() {
    try {
      const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
      if (!s.access_token || !s.refresh_token) return;
      const secLeft = s.expires_at - Date.now()/1000;
      // Si quedan menos de 15 minutos, refrescar ahora
      if (secLeft < 15*60) {
        await _tryRefreshSession();
      }
    } catch { /* silent */ }
  }
  if (typeof window !== 'undefined') {
    setInterval(_bgRefreshIfNeeded, 30 * 60 * 1000); // cada 30 min
    window.addEventListener('focus', _bgRefreshIfNeeded);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _bgRefreshIfNeeded();
    });
  }

  return api;
})();
