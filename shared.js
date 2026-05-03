// ============================================================
// GestAlquiler Shared v5.1
// Config · Vendedores · WA · FontSize · Header · Sentry
// ─────────────────────────────────────────────────────────
// v5.1: Sentry error monitoring integrado
// ============================================================

// ─── SENTRY — Error monitoring ────────────────────────────
(function() {
  const isProd = location.hostname !== 'localhost' && !location.hostname.includes('staging');
  if (!isProd) return;
  const script = document.createElement('script');
  script.src = 'https://js.sentry-cdn.com/9476414ed442d5f573b3f9bbaba63073.min.js';
  script.crossOrigin = 'anonymous';
  script.onload = function() {
    if (typeof Sentry === 'undefined') return;
    Sentry.init({
      dsn: 'https://9476414ed442d5f573b3f9bbaba63073@o4511326393925632.ingest.us.sentry.io/4511326399102976',
      environment: 'production',
      beforeSend(event) {
        try {
          const s = JSON.parse(localStorage.getItem('ga_session') || '{}');
          if (s.user_email) event.user = { email: s.user_email };
        } catch(e) {}
        return event;
      }
    });
  };
  document.head.appendChild(script);
})();

const GestShared = (function () {
  'use strict';

  const CONFIG_KEY = 'gest_config'; // clave de localStorage para la configuración
  let _waNum = '5491161381046'; // número de soporte, se actualiza desde Edge Function
  const FONT_KEY   = 'app_fs';
  const FONT_DEF   = 15;

  const DEFAULTS = {
    diasFinContrato:           65,
    diasActualizacion:         10,
    diasAlertaTasacion1:       7,
    diasAlertaTasacion2:       15,
    moraRateDefault:           2,
    adminFeeDefault:           5,
    aliasInmo:                 '',
    vendedores:                [],
    vendedoresIdx:             0,
    diasExpiracionComprador:   120,
    aniosRetencionVisitas:     10,
    brandName:     '',
    brandSubtitle: 'Administración de Alquileres',
    brandColor:    '#f57c00',
    brandLogo:     '',
  };

  function getConfig() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'));
    } catch(e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    } catch(e) { console.warn('[GestShared] saveConfig:', e); }
    if (typeof SupabaseDB !== 'undefined') {
      const toSave = {};
      const KEYS = ['diasFinContrato','diasActualizacion','diasAlertaTasacion1',
                    'diasAlertaTasacion2','moraRateDefault','adminFeeDefault',
                    'aliasInmo','emailInmo','vendedores','vendedoresIdx','diasExpiracionComprador',
                    'aniosRetencionVisitas',
                    'brandName','brandSubtitle','brandColor','brandLogo'];
      KEYS.forEach(k => { if (cfg[k] !== undefined) toSave[k] = cfg[k]; });
      SupabaseDB.saveConfig(toSave).catch(e => console.warn('[GestShared] saveConfig Supabase:', e));
    }
  }

  async function syncConfigFromSupabase() {
    if (typeof SupabaseDB === 'undefined') return;
    try {
      const remote = await SupabaseDB.getConfig();
      if (!remote || !Object.keys(remote).length) return;
      const cfg = getConfig();
      ['diasActualizacion','diasFinContrato','diasAlertaTasacion1','diasAlertaTasacion2',
       'moraRateDefault','adminFeeDefault','vendedoresIdx'].forEach(k => {
        if (remote[k] !== undefined) remote[k] = parseFloat(remote[k]) || 0;
      });
      if (typeof remote.vendedores === 'string') {
        try { remote.vendedores = JSON.parse(remote.vendedores); } catch { remote.vendedores = []; }
      }
      const BRAND_KEYS = ['brandName','brandSubtitle','brandColor','brandLogo'];
      BRAND_KEYS.forEach(k => {
        if (!remote[k] && cfg[k]) delete remote[k];
      });
      Object.assign(cfg, remote);
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch {}
    } catch(e) {
      console.warn('[GestShared] syncConfigFromSupabase:', e);
    }
  }

  function getVendedores() { return getConfig().vendedores || []; }

  function saveVendedores(list) {
    const cfg = getConfig();
    cfg.vendedores = list;
    saveConfig(cfg);
    if (typeof SupabaseDB !== 'undefined') {
      SupabaseDB.saveVendedores(list).catch(e => console.warn('[GestShared] saveVendedores:', e));
    }
  }

  function getNextVendedor() {
    const cfg = getConfig();
    const list = getVendedores();
    if (!list.length) return '';
    let idx = cfg.vendedoresIdx || 0;
    const v = list[idx % list.length];
    cfg.vendedoresIdx = (idx + 1) % list.length;
    saveConfig(cfg);
    return v;
  }

  function applyFontSize() {
    const fs = parseInt(localStorage.getItem(FONT_KEY)) || FONT_DEF;
    document.documentElement.style.fontSize = fs + 'px';
    return fs;
  }

  function changeFontSize(delta) {
    let fs = parseInt(localStorage.getItem(FONT_KEY)) || FONT_DEF;
    fs = delta === 0 ? FONT_DEF : Math.min(20, Math.max(11, fs + delta));
    document.documentElement.style.fontSize = fs + 'px';
    try { localStorage.setItem(FONT_KEY, fs); } catch {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#x27;');
  }

  function waLink(phone, text) {
    if (!phone) return text || '';
    const clean = String(phone).replace(/\D/g, '');
    if (!clean) return text || phone;
    let num = clean;
    if (!num.startsWith('54')) num = '549' + (num.startsWith('9') ? num.slice(1) : num);
    return `<a href="https://wa.me/${num}" target="_blank" onclick="event.stopPropagation()" class="wa-phone-link">📱 ${esc(text||phone)}</a>`;
  }

  function waSpan(phone, text) {
    if (!phone) return text || '';
    const clean = String(phone).replace(/\D/g, '');
    if (!clean) return text || phone;
    let num = clean;
    if (!num.startsWith('54')) num = '549' + (num.startsWith('9') ? num.slice(1) : num);
    const url = 'https://wa.me/' + num;
    return `<span onclick="event.stopPropagation();window.open('${url}','_blank')" class="wa-phone-link" title="Abrir WhatsApp">📱 ${esc(text||phone)}</span>`;
  }

  function setIntervalJitter(fn, baseMs) {
    return setInterval(fn, baseMs + Math.random() * 15000);
  }

  const LOGO_SVG = '<svg viewBox="0 0 1532.9 1229.94" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%"><path fill="#f39200" d="M766.45,39.94L54.91,353.68h229.76c-3.51,0-6.36,3-6.36,6.7v677.09c0,72.57,55.77,131.39,124.57,131.39h788.13c35.1,0,63.56-30.01,63.56-67.04V353.68h223.41L766.45,39.94Z"/><path fill="#fff" d="M786.94,398.11v186.57h-13.66c-10.28-48.68-29.43-86-57.45-111.94-28.03-25.94-59.78-38.9-95.28-38.9-29.66,0-56.87,9.66-81.61,28.98-24.75,19.32-42.86,44.59-54.3,75.82-14.71,39.96-22.06,84.42-22.06,133.39s5.37,92.03,16.11,131.59c10.75,39.57,27.55,69.47,50.44,89.72,22.89,20.25,52.55,30.37,88.97,30.37,29.89,0,57.27-7.4,82.14-22.23,24.88-14.82,51.09-40.35,78.64-76.62v46.45c-26.62,31.5-54.35,54.33-83.19,68.48-28.84,14.15-62.52,21.24-101.06,21.24-50.67,0-95.69-11.51-135.04-34.54-39.35-23.03-69.7-56.11-91.07-99.24-21.37-43.13-32.06-89.06-32.06-137.75,0-51.34,11.85-100.05,35.56-146.09,23.7-46.05,55.69-81.77,95.98-107.19,40.28-25.4,83.07-38.11,128.38-38.11,33.39,0,68.65,8.21,105.79,24.61,21.48,9.53,35.14,14.29,40.98,14.29,7.47,0,13.95-3.11,19.43-9.33,5.48-6.21,9.05-16.07,10.69-29.57h13.66Z"/><path fill="#fff" d="M1163.15,398.11l3.85,179.43h-14.35c-6.78-44.99-23.42-81.18-49.92-108.57-26.51-27.39-55.17-41.08-85.99-41.08-23.82,0-42.68,7.21-56.57,21.63-13.9,14.42-20.85,31.03-20.85,49.82,0,11.92,2.45,22.5,7.36,31.76,6.77,12.44,17.63,24.75,32.58,36.92,10.98,8.73,36.31,24.22,76.01,46.45,55.57,30.96,93.05,60.21,112.44,87.74,19.15,27.52,28.73,59.02,28.73,94.48,0,45-15.47,83.7-46.41,116.12-30.95,32.43-70.23,48.63-117.87,48.63-14.95,0-29.07-1.72-42.39-5.16-13.31-3.45-30.01-9.92-50.09-19.45-11.21-5.3-20.44-7.94-27.68-7.94-6.07,0-12.49,2.64-19.26,7.94-6.77,5.3-12.27,13.36-16.46,24.22h-12.97v-203.26h12.97c10.27,57.17,30.06,100.77,59.37,130.81,29.3,30.04,60.89,45.05,94.75,45.05,26.15,0,46.99-8.07,62.52-24.22,15.53-16.14,23.29-34.93,23.29-56.37,0-12.7-2.97-25-8.93-36.92-5.96-11.91-15.01-23.22-27.15-33.94-12.14-10.72-33.62-24.67-64.45-41.88-43.21-24.07-74.26-44.59-93.18-61.53-18.91-16.94-33.45-35.86-43.61-56.77-10.16-20.9-15.24-43.93-15.24-69.07,0-42.88,13.89-79.4,41.69-109.57,27.78-30.17,62.81-45.26,105.08-45.26,15.41,0,30.36,2.13,44.84,6.36,10.97,3.17,24.34,9.06,40.11,17.66,15.76,8.6,26.79,12.9,33.1,12.9s10.86-2.12,14.36-6.35c3.5-4.23,6.77-14.42,9.81-30.57h10.51Z"/></svg>';

  const NAV = [
    { key:'dashboard',      href:'dashboard.html',      icon:'🏠', label:'Dashboard' },
    { key:'ventas',         href:'ventas.html',          icon:'🏘️', label:'Propiedades' },
    { key:'visitas',        href:'visitas.html',         icon:'📅', label:'Visitas' },
    { key:'tasaciones',     href:'tasaciones.html',      icon:'📋', label:'Tasaciones' },
    { key:'banco',          href:'banco.html',           icon:'👤', label:'Banco' },
    { key:'contratos',      href:'index.html',           icon:'📄', label:'Contratos' },
    { key:'administracion', href:'administracion.html',  icon:'🧾', label:'Administración' },
    { key:'tareas',         href:'tareas.html',           icon:'✅', label:'Tareas' },
    { key:'configuracion',  href:'configuracion.html',   icon:'⚙️', label:'Configuración' },
    { key:'ayuda',          href:'ayuda.html',            icon:'❓', label:'Ayuda' },
  ];

  function _injectCSS() {
    if (document.getElementById('gs-css')) return;
    const s = document.createElement('style'); s.id = 'gs-css';
    s.textContent = `.gs-hdr{position:sticky;top:0;z-index:300;display:flex;align-items:center;justify-content:space-between;padding:.55rem 1.4rem;background:linear-gradient(135deg,#0d0d0d 0%,#1a1206 50%,#0d0d0d 100%);border-bottom:1px solid rgba(255,255,255,.08);backdrop-filter:blur(20px);gap:.8rem;flex-wrap:wrap}.gs-logo{display:flex;align-items:center;gap:.65rem;flex-shrink:0;text-decoration:none}.gs-logo-ico{width:34px;height:34px;flex-shrink:0;border-radius:9px;overflow:hidden;border:1px solid rgba(245,124,0,.35);padding:2px;background:rgba(245,124,0,.1)}.gs-logo-name{font-family:'Inter',-apple-system,sans-serif;font-size:.88rem;font-weight:700;color:#fff;line-height:1.2}.gs-logo-sub{font-family:'Inter',-apple-system,sans-serif;font-size:.64rem;color:#717171;line-height:1}.gs-nav{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}.gs-nav-btn{display:inline-flex;align-items:center;gap:.3rem;padding:.35rem .75rem;border-radius:8px;font-family:'Inter',-apple-system,sans-serif;font-size:.76rem;font-weight:600;color:rgba(245,124,0,.85);background:rgba(245,124,0,.1);border:1px solid rgba(245,124,0,.22);text-decoration:none;cursor:pointer;transition:background .15s,border-color .15s;white-space:nowrap}.gs-nav-btn:hover{background:rgba(245,124,0,.22);color:#f57c00;border-color:rgba(245,124,0,.45)}.gs-nav-active{background:rgba(245,124,0,.25)!important;color:#ff9800!important;border-color:rgba(245,124,0,.6)!important}.gs-font-ctrl{display:flex;align-items:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;overflow:hidden;flex-shrink:0}.gs-font-ctrl button{background:none;border:none;color:#b0b0b0;cursor:pointer;padding:.28rem .48rem;font-family:'Inter',-apple-system,sans-serif;font-size:.8rem;font-weight:600;transition:color .15s}.gs-font-ctrl button:hover{color:#f57c00;background:rgba(245,124,0,.1)}.wa-phone-link{color:#378ADD;text-decoration:none;cursor:pointer}.wa-phone-link:hover{text-decoration:underline;color:#25d366}`;
    document.head.appendChild(s);
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r}, ${g}, ${b}`;
  }

  async function checkTrial() {
    const page = location.pathname.split('/').pop();
    if (page === 'login.html' || page === 'superadmin.html') return;
    if (typeof SupabaseDB === 'undefined') return;
    try {
      const org = await SupabaseDB.getOrgPlan();
      // Precargar el rol del usuario en background (lo usa dashboard y administracion)
      SupabaseDB.getUserRole().then(r => {
        try { localStorage.setItem('ga_user_role', r); } catch {}
      }).catch(() => {});
      if (!org) return;
      if (!org.trial_ends_at) return;
      const daysLeft = Math.ceil((new Date(org.trial_ends_at) - new Date()) / 86400000);
      if (daysLeft <= 0) {
        // Leer número desde Edge Function (configurable en superadmin)
        let waNum = '5491161381046'; // fallback
        try {
          const SB_URL = 'https://ratkgsxlqjjhjcclpcee.supabase.co';
          const SB_KEY = 'sb_publishable_frPLdQ7k0nOOP5JsULLU-g_XEPjc1Bv';
          const tok = (() => { try { const s = JSON.parse(localStorage.getItem('ga_session')||'{}'); return s.access_token || SB_KEY; } catch { return SB_KEY; } })();
          const r = await fetch(`${SB_URL}/functions/v1/gestalquiler-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}`, 'apikey': SB_KEY },
            body: JSON.stringify({ action: 'get_superadmin_config' })
          });
          const d = await r.json();
          if (d.ok && d.wa_num) { waNum = d.wa_num; _waNum = waNum; }
        } catch(e) { /* usar fallback */ }
        document.body.innerHTML = `
          <div style="min-height:100vh;background:#0d0d0d;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif">
            <div style="text-align:center;padding:2rem;max-width:420px">
              <div style="font-size:3rem;margin-bottom:1rem">⛔</div>
              <h2 style="color:#f5f5f5;font-size:1.3rem;margin-bottom:.75rem">Período de prueba vencido</h2>
              <p style="color:#717171;font-size:.9rem;line-height:1.6;margin-bottom:1.5rem">
                Tu demo de GestAlquiler ha expirado.<br>
                Contactanos para continuar usando el sistema.
              </p>
              <a href="https://wa.me/${waNum}" target="_blank"
                style="display:inline-block;background:linear-gradient(135deg,#f57c00,#ff9800);color:#fff;text-decoration:none;padding:.75rem 1.5rem;border-radius:10px;font-weight:600;font-size:.9rem">
                📱 Contactar por WhatsApp
              </a>
            </div>
          </div>`;
        return;
      }
      if (daysLeft <= 7) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#854F0B;color:#FAEEDA;text-align:center;padding:8px 16px;font-size:13px;font-weight:500;position:relative;z-index:999';
        banner.textContent = `⏳ Tu período de prueba vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}. Contactanos para continuar.`;
        document.body.prepend(banner);
      }
    } catch(e) { /* silencioso */ }
  }

  function applyBranding() {
    const cfg   = getConfig();
    const color = cfg.brandColor || '#f57c00';
    const rgb   = hexToRgb(color);
    const r = document.documentElement;
    r.style.setProperty('--accent',           color);
    r.style.setProperty('--accent-hover',     color + 'cc');
    r.style.setProperty('--accent-glow',      `rgba(${rgb}, 0.28)`);
    r.style.setProperty('--accent-soft',      `rgba(${rgb}, 0.12)`);
    r.style.setProperty('--info',             color);
    r.style.setProperty('--info-soft',        `rgba(${rgb}, 0.10)`);
    r.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`);
    r.style.setProperty('--gradient-header',  `linear-gradient(135deg, #0d0d0d 0%, #0d0d0d 50%, #0d0d0d 100%)`);
    const bName = cfg.brandName     || 'GestAlquiler';
    const bSub  = cfg.brandSubtitle || 'Administración de Alquileres';
    document.querySelectorAll('.gs-logo-name, .app-hdr-name').forEach(el => { el.textContent = bName; });
    document.querySelectorAll('.gs-logo-sub, .app-hdr-sub').forEach(el  => { el.textContent = bSub; });
    if (cfg.brandLogo) {
      document.querySelectorAll('.gs-logo-ico, .app-hdr-ico').forEach(el => {
        el.innerHTML = `<img src="${cfg.brandLogo}" alt="${bName}" style="width:100%;height:100%;object-fit:contain;border-radius:7px">`;
      });
    }
    document.querySelectorAll('.gs-nav-btn, .nav-lnk').forEach(el => {
      el.style.color      = `rgba(${rgb}, 0.85)`;
      el.style.background = `rgba(${rgb}, 0.10)`;
      el.style.borderColor = `rgba(${rgb}, 0.22)`;
    });
    document.querySelectorAll('.gs-nav-active, .nav-lnk.active').forEach(el => {
      el.style.color       = color;
      el.style.background  = `rgba(${rgb}, 0.25)`;
      el.style.borderColor = `rgba(${rgb}, 0.6)`;
    });
    document.querySelectorAll('.hbg-btn span').forEach(el => { el.style.background = color; });
    document.querySelectorAll('.hbg-btn').forEach(el => {
      el.style.background   = `rgba(${rgb}, 0.10)`;
      el.style.borderColor  = `rgba(${rgb}, 0.30)`;
    });
  }

  function initHeader(activePage) {
    if (typeof SupabaseDB !== 'undefined' && typeof SupabaseDB.requireAuth === 'function') {
      if (!SupabaseDB.requireAuth()) return;
    }
    _injectCSS(); applyFontSize();
    const navHtml = NAV.map(n => {
      const active = n.key === activePage ? ' gs-nav-active' : '';
      return `<a href="${n.href}" class="gs-nav-btn${active}">${n.icon} ${n.label}</a>`;
    }).join('');
    const userEmail = (typeof SupabaseDB !== 'undefined' && SupabaseDB.getUserEmail) ? SupabaseDB.getUserEmail().split('@')[0] : '';
    const logoutBtn = `<div style="display:flex;align-items:center;gap:.4rem;padding-left:.5rem;border-left:1px solid rgba(255,255,255,.1)">${userEmail ? `<span style="font-size:.68rem;color:#717171">${userEmail}</span>` : ''}<button onclick="typeof SupabaseDB!=='undefined'&&SupabaseDB.logout()" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ef4444;border-radius:6px;padding:.22rem .55rem;font-size:.68rem;cursor:pointer;font-family:inherit" title="Cerrar sesión">Salir</button></div>`;
    const cfg     = getConfig();
    const bName    = cfg.brandName     || 'GestAlquiler';
    const bSub     = cfg.brandSubtitle || 'Administración de Alquileres';
    const logoHtml = cfg.brandLogo
      ? `<img src="${cfg.brandLogo}" alt="${bName}" style="width:100%;height:100%;object-fit:contain;border-radius:7px">`
      : LOGO_SVG;
    const html = `<a href="index.html" class="gs-logo"><div class="gs-logo-ico">${logoHtml}</div><div><div class="gs-logo-name">${bName}</div><div class="gs-logo-sub">${bSub}</div></div></a><div class="gs-nav">${navHtml}<div class="gs-font-ctrl"><button onclick="GestShared.changeFontSize(-1)" title="Reducir">A-</button><button onclick="GestShared.changeFontSize(0)" title="Defecto">↺</button><button onclick="GestShared.changeFontSize(1)" title="Agrandar">A+</button></div>${logoutBtn}</div>`;
    let hdr = document.querySelector('header');
    if (!hdr) { hdr = document.createElement('header'); document.body.insertBefore(hdr, document.body.firstChild); }
    hdr.className = 'gs-hdr'; hdr.innerHTML = html;
  }

  // ─── BOTÓN FLOTANTE DE SOPORTE ─────────────────────────────────────────────
  function initSupportButton() {
    // No mostrar en login ni en superadmin
    const page = window.location.pathname;
    if (page.includes('login') || page.includes('superadmin')) return;
    // Evitar duplicados
    if (document.getElementById('gs-support-btn')) return;

    const btn = document.createElement('a');
    btn.id   = 'gs-support-btn';
    btn.href = `https://wa.me/${_waNum}?text=${encodeURIComponent('Hola, necesito ayuda con GestAlquiler')}`;
    btn.target = '_blank';
    btn.rel    = 'noopener noreferrer';
    btn.title  = 'Soporte por WhatsApp';
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.132.558 4.13 1.532 5.862L.057 23.486a.5.5 0 0 0 .611.612l5.76-1.51A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.5-5.24-1.375l-.378-.217-3.917 1.027 1.003-3.79-.232-.389A9.946 9.946 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg><span>¿Ayuda?</span>`;
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '9999',
      display: 'flex', alignItems: 'center', gap: '7px',
      background: '#25d366', color: '#fff',
      padding: '10px 16px', borderRadius: '50px',
      textDecoration: 'none', fontFamily: 'inherit',
      fontSize: '13px', fontWeight: '600',
      boxShadow: '0 4px 16px rgba(37,211,102,0.45)',
      transition: 'transform .18s, box-shadow .18s',
    });
    btn.onmouseenter = () => { btn.style.transform = 'translateY(-2px)'; btn.style.boxShadow = '0 6px 22px rgba(37,211,102,0.55)'; };
    btn.onmouseleave = () => { btn.style.transform = ''; btn.style.boxShadow = '0 4px 16px rgba(37,211,102,0.45)'; };
    document.body.appendChild(btn);
  }

  return {
    getConfig, saveConfig, syncConfigFromSupabase, DEFAULTS,
    getVendedores, saveVendedores, getNextVendedor,
    applyFontSize, changeFontSize,
    esc, waLink, waSpan,
    applyBranding, initHeader, setIntervalJitter, checkTrial, initSupportButton,
    getToken:       () => '',
    setToken:       () => {},
    getServerUrl:   () => '',
    syncFromServer: async () => false,
    apiCall:        async () => ({ success: false, error: 'GAS eliminado en v5' }),
  };
})();

window.changeFontSize = GestShared.changeFontSize.bind(GestShared);

(function waitForSupabase() {
  if (typeof SupabaseDB !== 'undefined') {
    window._gsReady = (async () => {
      try {
        await GestShared.syncConfigFromSupabase();
        GestShared.applyBranding();
        window.dispatchEvent(new CustomEvent('gs:config-synced'));
        // No correr checkTrial ni initSupportButton en el superadmin
        const _isSuperadmin = window.location.pathname.includes('superadmin');
        if (!_isSuperadmin) {
          GestShared.checkTrial();
          GestShared.initSupportButton();
        }
      } catch(e) { console.warn('[GestShared] auto-sync:', e); }
    })();
  } else {
    setTimeout(waitForSupabase, 20);
  }
})();

document.addEventListener('DOMContentLoaded', function() {
  GestShared.applyBranding();
  if (window._gsReady && typeof window._gsReady.then === 'function') {
    window._gsReady.then(() => {
      setTimeout(() => GestShared.applyBranding(), 100);
    }).catch(() => {});
  } else {
    var tries = 0;
    var iv = setInterval(function() {
      tries++;
      if (window._gsReady && typeof window._gsReady.then === 'function') {
        clearInterval(iv);
        window._gsReady.then(() => setTimeout(() => GestShared.applyBranding(), 100)).catch(() => {});
      } else if (tries > 50) clearInterval(iv);
    }, 100);
  }
});
