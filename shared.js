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

  const LOGO_SVG = `<svg id="Capa_1" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 492.39 145.16"> <defs> <style> .st0 { fill: url(#Degradado_sin_nombre_49); } .st1 { fill: url(#Degradado_sin_nombre_494); } .st2 { fill: url(#Degradado_sin_nombre_491); } .st3 { fill: #fff; } .st4 { fill: url(#Degradado_sin_nombre_492); } .st5 { fill: url(#Degradado_sin_nombre_495); } .st6 { fill: url(#Degradado_sin_nombre_493); } .st7 { fill: url(#Degradado_sin_nombre_496); } </style> <linearGradient id="Degradado_sin_nombre_49" data-name="Degradado sin nombre 49" x1="74.78" y1="39.28" x2="93.43" y2="39.28" gradientUnits="userSpaceOnUse"> <stop offset="0" stop-color="#ec6608"/> <stop offset=".33" stop-color="#ef7a04"/> <stop offset=".72" stop-color="#f28b01"/> <stop offset="1" stop-color="#f39200"/> </linearGradient> <linearGradient id="Degradado_sin_nombre_491" data-name="Degradado sin nombre 49" x1="10.45" y1="93.8" x2="134.6" y2="93.8" xlink:href="#Degradado_sin_nombre_49"/> <linearGradient id="Degradado_sin_nombre_492" data-name="Degradado sin nombre 49" x1="28.85" y1="73.23" x2="70.59" y2="73.23" xlink:href="#Degradado_sin_nombre_49"/> <linearGradient id="Degradado_sin_nombre_493" data-name="Degradado sin nombre 49" x1="176.57" y1="107" x2="176.57" y2="71.14" xlink:href="#Degradado_sin_nombre_49"/> <linearGradient id="Degradado_sin_nombre_494" data-name="Degradado sin nombre 49" x1="209.64" y1="106.76" x2="209.64" y2="79.17" xlink:href="#Degradado_sin_nombre_49"/> <linearGradient id="Degradado_sin_nombre_495" data-name="Degradado sin nombre 49" x1="238.13" y1="106.76" x2="238.13" y2="79.17" xlink:href="#Degradado_sin_nombre_49"/> <linearGradient id="Degradado_sin_nombre_496" data-name="Degradado sin nombre 49" x1="263.92" y1="106.76" x2="263.92" y2="73.66" xlink:href="#Degradado_sin_nombre_49"/> </defs> <g> <path class="st3" d="M97.43,13.56v53.19l25.16,20.4V30.45l-25.16-16.9ZM117.96,58.99l-15.77-9.51v-5.76l15.77,10.01v5.26ZM117.96,49.48l-15.77-9.51v-5.76l15.77,10.01v5.26ZM117.96,39.97l-15.77-9.51v-5.76l15.77,10.01v5.26Z"/> <polygon class="st0" points="93.43 12.06 93.43 63.87 86.04 57.49 74.78 66.5 74.78 24.7 93.43 12.06"/> <g> <rect class="st3" x="81.29" y="89.53" width="5.57" height="5.57"/> <rect class="st3" x="89.34" y="89.53" width="5.57" height="5.57"/> <rect class="st3" x="81.29" y="97.83" width="5.57" height="5.57"/> <rect class="st3" x="89.34" y="97.83" width="5.57" height="5.57"/> </g> <path class="st3" d="M10.45,103.4s1.63,19.92,42.93,23.93,64.58-11.14,64.58-11.14c0,0-19.77,17.65-62.83,16.9-43.05-.75-44.68-27.2-44.68-29.68Z"/> <path class="st2" d="M39.49,63.12s-18.4,12.89-18.4,26.41,16.4,23.28,41.05,26.66c24.66,3.38,51.44,1.63,72.46-12.01-16.02,10.17-27.66,20.9-71.09,20.27-43.43-.63-53.19-20.27-53.07-29.35s9.89-22.84,29.04-31.98Z"/> <path class="st3" d="M145.87,73.01c-2.88-5.88-12.14-12.52-16.65-13.39,3.57,3.13,9.76,6.38,9.76,13.27s-5.88,14.77-17.46,21.03c-10.26-7.76-35.36-27.72-35.36-27.72l-32.67,26.66-3.7.23-4.18.26-.25,14.97c9,2.7,22.4,4.76,22.4,4.76v-21.78l19.09-15.02,23.84,18.84v7.57s8.39-4.13,15.14-8.39c6.76-4.26,15.27-11.39,15.77-14.77,0,3.13-6.13,13.02-16.9,19.4-10.76,6.38-26.66,15.52-40.61,15.39,13.33.5,34.73-5.01,49-13.14,14.27-8.14,15.64-22.28,12.77-28.16Z"/> <path class="st4" d="M49.94,51.79v28.1l-21.09,17.94s6.15,7.2,16.52,10.47l.25-14.97-7.88.46,20.34-15.41v-14.39h8.57v8.95l3.94-3.25v-31.54l-20.65,13.64Z"/> </g> <g> <g> <path class="st6" d="M181.36,98.09c-.08.03-.16.07-.23.1-1.4.49-2.85.74-4.36.74-1.87,0-3.46-.32-4.78-.96-1.31-.64-2.31-1.54-3-2.71-.69-1.17-1.03-2.52-1.03-4.06,0-1.71.27-3.29.81-4.75.54-1.46,1.32-2.73,2.34-3.82,1.02-1.08,2.24-1.92,3.67-2.51,1.43-.59,3.03-.89,4.8-.89s3.38.28,4.73.84c1.35.56,2.59,1.54,3.74,2.96l6.99-5.52c-1.54-2.07-3.57-3.65-6.08-4.73-2.51-1.08-5.49-1.63-8.94-1.63s-6.26.51-8.94,1.53c-2.68,1.02-4.98,2.46-6.92,4.31-1.94,1.86-3.43,4.05-4.48,6.58-1.05,2.53-1.58,5.29-1.58,8.27s.71,5.62,2.14,7.91,3.45,4.06,6.06,5.34c2.61,1.28,5.66,1.92,9.14,1.92,2.63,0,5.11-.36,7.44-1.08,2.33-.72,4.38-1.74,6.16-3.05l2.91-14.53h-8.62l-1.96,9.75Z"/> <path class="st1" d="M218.16,80.65c-1.95-.99-4.29-1.48-7.02-1.48-3.22,0-6.04.67-8.47,2.02-2.43,1.35-4.32,3.18-5.66,5.49-1.35,2.31-2.02,4.95-2.02,7.91,0,2.46.59,4.61,1.77,6.43s2.83,3.23,4.95,4.24c2.12,1,4.6,1.5,7.46,1.5,2,0,3.98-.26,5.94-.79,1.95-.52,3.77-1.41,5.44-2.66l-3.89-5.86c-.85.69-1.85,1.22-2.98,1.6-1.13.38-2.29.57-3.47.57-2.04,0-3.56-.43-4.58-1.31-.81-.7-1.29-1.71-1.45-3.03h19.58c.16-.69.3-1.4.39-2.12.1-.72.15-1.48.15-2.27,0-2.33-.53-4.38-1.6-6.13-1.07-1.76-2.58-3.13-4.53-4.11ZM206.98,86.96c.97-.75,2.21-1.13,3.72-1.13,1.18,0,2.17.24,2.98.71.8.48,1.38,1.15,1.72,2.02.21.52.29,1.13.28,1.8h-10.97c.04-.11.06-.22.1-.32.48-1.3,1.2-2.32,2.17-3.08Z"/> <path class="st5" d="M237.34,86.41c.66-.39,1.76-.59,3.3-.59,1.21,0,2.51.14,3.89.42,1.38.28,2.72.81,4.04,1.6l3.3-6.55c-1.31-.69-2.86-1.21-4.63-1.58-1.77-.36-3.61-.54-5.52-.54-2.69,0-5.11.36-7.27,1.08-2.15.72-3.85,1.81-5.1,3.25-1.25,1.45-1.87,3.23-1.87,5.37,0,1.51.34,2.72,1.01,3.62.67.9,1.53,1.6,2.59,2.09,1.05.49,2.16.87,3.32,1.13,1.17.26,2.27.48,3.32.64,1.05.16,1.91.37,2.59.62.67.25,1.01.63,1.01,1.16,0,.59-.33,1.06-.98,1.4-.66.34-1.76.52-3.3.52s-3.2-.21-4.88-.64c-1.67-.43-3.14-1.03-4.38-1.82l-3.4,6.55c1.15.72,2.77,1.34,4.88,1.85,2.1.51,4.33.76,6.7.76,2.66,0,5.06-.36,7.19-1.08,2.13-.72,3.83-1.81,5.1-3.25,1.26-1.44,1.9-3.22,1.9-5.32,0-1.51-.34-2.71-1.01-3.6-.67-.89-1.53-1.58-2.56-2.07-1.04-.49-2.14-.86-3.33-1.11s-2.29-.46-3.32-.64c-1.03-.18-1.89-.41-2.56-.69-.67-.28-1.01-.66-1.01-1.16,0-.56.33-1.03.98-1.43Z"/> <path class="st7" d="M266.83,86.56h6.07l1.38-6.94h-6.07l1.19-5.96h-9.36l-1.19,5.96h-3.89l-1.43,6.94h3.93l-1.96,9.85c-.43,2.17-.33,4.03.3,5.59.62,1.56,1.67,2.74,3.15,3.55,1.48.8,3.25,1.21,5.32,1.21,1.25,0,2.47-.12,3.67-.37,1.2-.25,2.29-.65,3.28-1.21l-1.18-6.45c-.46.26-.92.46-1.38.59-.46.13-.94.2-1.43.2-.95,0-1.62-.27-2.02-.81-.39-.54-.51-1.32-.34-2.34l1.96-9.8Z"/> </g> <g> <path class="st3" d="M292.46,71.83l-22.12,34.48h10.29l3.98-6.7h14.68l1.38,6.7h9.7l-8.32-34.48h-9.6ZM288.89,92.42l6.63-11.16,2.3,11.16h-8.93Z"/> <polygon class="st3" points="320.04 69.77 312.75 106.31 322.11 106.31 329.4 69.77 320.04 69.77"/> <path class="st3" d="M352.02,83.37c-.71-1.29-1.67-2.28-2.9-2.94-1.56-.84-3.42-1.26-5.59-1.26-1.97,0-3.83.39-5.59,1.16-1.76.77-3.3,1.85-4.63,3.23-1.33,1.38-2.37,3-3.13,4.88-.76,1.87-1.13,3.92-1.13,6.16,0,2.59.53,4.79,1.6,6.6,1.07,1.81,2.47,3.19,4.21,4.14,1.74.95,3.56,1.43,5.47,1.43,2.4,0,4.48-.6,6.25-1.8.29-.2.55-.43.83-.65l-2.3,11.56h9.36l7.24-36.25h-8.92l-.77,3.75ZM343.59,99.22c-1.61,0-2.86-.46-3.74-1.38-.89-.92-1.33-2.15-1.33-3.69s.27-2.77.81-3.89c.54-1.12,1.3-2,2.27-2.64.97-.64,2.06-.96,3.28-.96,1.61,0,2.86.47,3.74,1.4.89.94,1.33,2.18,1.33,3.72s-.27,2.77-.81,3.89c-.54,1.12-1.29,1.99-2.24,2.61-.95.62-2.05.94-3.3.94Z"/> <path class="st3" d="M383.78,92.82c-.39,2.04-1.12,3.54-2.19,4.51-1.07.97-2.39,1.45-3.96,1.45-1.48,0-2.5-.46-3.08-1.38-.58-.92-.68-2.23-.32-3.94l2.76-13.84h-9.36l-2.96,14.73c-.53,2.73-.46,5.01.2,6.85.66,1.84,1.78,3.23,3.37,4.16,1.59.94,3.47,1.4,5.64,1.4,1.97,0,3.88-.47,5.74-1.4.92-.47,1.77-1.06,2.55-1.79l-.56,2.75h8.87l5.32-26.7h-9.36l-2.66,13.2Z"/> <path class="st3" d="M407.71,76.66c1.84,0,3.31-.51,4.41-1.53,1.1-1.02,1.65-2.33,1.65-3.94,0-1.28-.48-2.35-1.45-3.2-.97-.85-2.27-1.28-3.92-1.28-1.81,0-3.27.51-4.38,1.53-1.12,1.02-1.67,2.28-1.67,3.79,0,1.28.48,2.37,1.45,3.28.97.9,2.27,1.35,3.92,1.35Z"/> <polygon class="st3" points="396.48 106.31 405.79 106.31 411.11 79.62 401.8 79.62 396.48 106.31"/> <polygon class="st3" points="419.14 69.77 411.85 106.31 421.21 106.31 428.5 69.77 419.14 69.77"/> <path class="st3" d="M451.33,80.65c-1.95-.99-4.29-1.48-7.02-1.48-3.22,0-6.04.67-8.47,2.02-2.43,1.35-4.32,3.18-5.66,5.49-1.35,2.31-2.02,4.95-2.02,7.91,0,2.46.59,4.61,1.77,6.43,1.18,1.82,2.83,3.23,4.95,4.24,2.12,1,4.61,1.5,7.46,1.5,2,0,3.98-.26,5.93-.79,1.95-.52,3.77-1.41,5.44-2.66l-3.89-5.86c-.85.69-1.85,1.22-2.98,1.6-1.13.38-2.29.57-3.47.57-2.04,0-3.56-.43-4.58-1.31-.81-.7-1.29-1.71-1.45-3.03h19.58c.16-.69.29-1.4.39-2.12.1-.72.15-1.48.15-2.27,0-2.33-.53-4.38-1.6-6.13-1.07-1.76-2.58-3.13-4.53-4.11ZM440.15,86.96c.97-.75,2.21-1.13,3.72-1.13,1.18,0,2.17.24,2.98.71.8.48,1.38,1.15,1.72,2.02.21.52.29,1.13.28,1.8h-10.97c.04-.11.06-.22.1-.32.48-1.3,1.2-2.32,2.17-3.08Z"/> <path class="st3" d="M475.14,80.5c-1.07.49-2.02,1.17-2.86,2.04l.59-2.93h-8.87l-5.32,26.7h9.36l2.56-12.61c.43-2.23,1.29-3.83,2.59-4.8,1.3-.97,2.96-1.45,5-1.45.36,0,.71,0,1.03.02.33.02.69.06,1.08.12l1.62-8.42c-2.59,0-4.86.44-6.8,1.33Z"/> </g> </g> </svg>`;

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
    // Guard robusto para login y superadmin (cubre pathname vacío en mobile)
    const _href = location.href.toLowerCase();
    const _page = location.pathname.split('/').pop().toLowerCase();
    if (_page === 'login.html' || _page === 'superadmin.html') return;
    if (_href.includes('login.html') || _href.includes('superadmin.html')) return;
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
          if (d.ok && d.wa_num) { waNum = d.wa_num; }
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
    document.querySelectorAll('.gs-logo-ico, .app-hdr-ico').forEach(el => {
      if (cfg.brandLogo) {
        el.style.display = '';
        el.innerHTML = `<img src="${cfg.brandLogo}" alt="${bName}" style="width:100%;height:100%;object-fit:contain;border-radius:7px">`;
      } else {
        // Sin logo propio: ocultar el contenedor del ícono
        el.style.display = 'none';
      }
    });
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
    const logoIcoHtml = cfg.brandLogo
      ? `<div class="gs-logo-ico"><img src="${cfg.brandLogo}" alt="${bName}" style="width:100%;height:100%;object-fit:contain;border-radius:7px"></div>`
      : '';
    const html = `<a href="index.html" class="gs-logo">${logoIcoHtml}<div><div class="gs-logo-name">${bName}</div><div class="gs-logo-sub">${bSub}</div></div></a><div class="gs-nav">${navHtml}<div class="gs-font-ctrl"><button onclick="GestShared.changeFontSize(-1)" title="Reducir">A-</button><button onclick="GestShared.changeFontSize(0)" title="Defecto">↺</button><button onclick="GestShared.changeFontSize(1)" title="Agrandar">A+</button></div>${logoutBtn}</div>`;
    let hdr = document.querySelector('header');
    if (!hdr) { hdr = document.createElement('header'); document.body.insertBefore(hdr, document.body.firstChild); }
    hdr.className = 'gs-hdr'; hdr.innerHTML = html;
  }


  return {
    getConfig, saveConfig, syncConfigFromSupabase, DEFAULTS,
    getVendedores, saveVendedores, getNextVendedor,
    applyFontSize, changeFontSize,
    esc, waLink, waSpan,
    applyBranding, initHeader, setIntervalJitter, checkTrial,
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
        // No correr checkTrial en el superadmin
        const _href2 = window.location.href.toLowerCase();
        const _isSuperadmin = _href2.includes('superadmin');
        const _isLogin = _href2.includes('login.html');
        if (!_isSuperadmin && !_isLogin) {
          GestShared.checkTrial();
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
