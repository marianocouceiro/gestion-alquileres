/* ═══════════════════════════════════════════════════════════════
   notif_email.js — Notificaciones automáticas por email
   Se carga solo en dashboard.html.
   Usa EmailJS (gratis hasta 200 emails/mes, sin servidor).
   
   SETUP inicial (una sola vez):
   1. Crear cuenta gratis en emailjs.com
   2. Conectar servicio Gmail/Outlook (Email Services → Add New Service)
   3. Crear plantilla con variables: {{to_email}}, {{subject}}, {{message}}
   4. Copiar Service ID, Template ID y Public Key
   5. Pegarlos en Configuración → General → Notificaciones por email
   
   La verificación corre al abrir el dashboard si hay email configurado
   y NO se mandó resumen hoy todavía.
═══════════════════════════════════════════════════════════════ */
'use strict';

const NotifEmail = (function () {

  const SENT_KEY = 'ga_email_sent_date'; // fecha del último envío

  // ── Verificar si ya se mandó hoy ───────────────────────────
  function yaEnviadoHoy() {
    const last = localStorage.getItem(SENT_KEY) || '';
    return last === new Date().toISOString().slice(0, 10);
  }

  function marcarEnviado() {
    localStorage.setItem(SENT_KEY, new Date().toISOString().slice(0, 10));
  }

  // ── Cargar EmailJS SDK dinámicamente ───────────────────────
  async function loadEmailJS() {
    if (window.emailjs) return true;
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  // ── Construir cuerpo del email ─────────────────────────────
  function buildResumen(contracts, curYear, curMonth) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR',
      {day:'2-digit', month:'2-digit', year:'numeric'}) : '—';

    // Contratos activos
    function isExpired(c) {
      const s = new Date(c.startDate + 'T00:00:00');
      const e = new Date(s);
      const dur = parseInt(c.duration) + ((c.prorrogas||[]).reduce((a,p)=>a+parseInt(p.months||0),0));
      e.setMonth(e.getMonth() + dur);
      return new Date() > e;
    }
    function getEndDate(c) {
      const s = new Date(c.startDate + 'T00:00:00');
      const e = new Date(s);
      const dur = parseInt(c.duration) + ((c.prorrogas||[]).reduce((a,p)=>a+parseInt(p.months||0),0));
      e.setMonth(e.getMonth() + dur); e.setDate(e.getDate() - 1); return e;
    }

    const activos = contracts.filter(c => !isExpired(c));

    // Por vencer ≤65 días
    const porVencer = activos.filter(c => {
      const d = Math.ceil((getEndDate(c) - hoy) / 864e5);
      return d >= 0 && d <= 65;
    }).sort((a,b) => getEndDate(a) - getEndDate(b));

    // Por actualizar ≤10 días
    const porActualizar = activos.filter(c => {
      const hist = c.updatesHistory || [];
      // simplified: check if any update date is coming in ≤10 days
      const s = new Date(c.startDate + 'T00:00:00');
      const freq = parseInt(c.updateFrequency);
      const dur = parseInt(c.duration) + ((c.prorrogas||[]).reduce((a,p)=>a+parseInt(p.months||0),0));
      for (let m = freq; m <= dur; m += freq) {
        const ud = new Date(new Date(s).setMonth(s.getMonth() + m));
        const pn = m / freq + 1;
        if (hist.some(h => h.periodNumber === pn)) continue;
        const days = Math.ceil((ud - hoy) / 864e5);
        if (days >= 0 && days <= 10) return true;
      }
      return false;
    });

    if (!porVencer.length && !porActualizar.length) return null;

    let body = `📋 RESUMEN DIARIO — ${fmtDate(hoy.toISOString().slice(0,10))}\n`;
    body += `${'-'.repeat(48)}\n\n`;

    if (porActualizar.length) {
      body += `⚠️ CONTRATOS A ACTUALIZAR (≤10 días) — ${porActualizar.length}\n\n`;
      porActualizar.forEach(c => {
        body += `  🏠 ${c.address}\n`;
        body += `     Inquilino: ${c.tenant} | ${c.tenantPhone || ''}\n`;
        if (c.tenantEmail) body += `     Email: ${c.tenantEmail}\n`;
        body += '\n';
      });
    }

    if (porVencer.length) {
      body += `⏰ CONTRATOS POR VENCER (≤65 días) — ${porVencer.length}\n\n`;
      porVencer.forEach(c => {
        const ed = getEndDate(c);
        const days = Math.ceil((ed - hoy) / 864e5);
        body += `  🏠 ${c.address}\n`;
        body += `     Inquilino: ${c.tenant} | Vence: ${fmtDate(ed.toISOString().slice(0,10))} (${days} días)\n`;
        if (c.tenantEmail) body += `     Email: ${c.tenantEmail}\n`;
        if (c.ownerEmail) body += `     Dueño email: ${c.ownerEmail}\n`;
        body += '\n';
      });
    }

    body += `${'-'.repeat(48)}\n`;
    body += `Enviado automáticamente por GestAlquiler — ${new Date().toLocaleDateString('es-AR')}\n`;
    return body;
  }

  // ── Enviar resumen ─────────────────────────────────────────
  async function enviarResumen(contracts) {
    if (yaEnviadoHoy()) return { skip: true };

    // Obtener config de EmailJS y email destino
    let cfg;
    try { cfg = await SupabaseDB.getConfig(); } catch { return { error: 'Sin config' }; }

    const emailDest    = cfg.emailInmo || '';
    const ejsServiceId  = cfg.ejsServiceId || '';
    const ejsTemplateId = cfg.ejsTemplateId || '';
    const ejsPublicKey  = cfg.ejsPublicKey || '';

    if (!emailDest || !ejsServiceId || !ejsTemplateId || !ejsPublicKey) {
      return { skip: true, reason: 'EmailJS no configurado' };
    }

    const hoy = new Date();
    const resumen = buildResumen(contracts, hoy.getFullYear(), hoy.getMonth());
    if (!resumen) { marcarEnviado(); return { skip: true, reason: 'Sin alertas hoy' }; }

    // Cargar SDK
    const loaded = await loadEmailJS();
    if (!loaded) return { error: 'No se pudo cargar EmailJS' };

    window.emailjs.init({ publicKey: ejsPublicKey });

    try {
      await window.emailjs.send(ejsServiceId, ejsTemplateId, {
        to_email: emailDest,
        subject: `GestAlquiler — Alertas ${hoy.toLocaleDateString('es-AR')}`,
        message: resumen,
      });
      marcarEnviado();
      return { ok: true };
    } catch(e) {
      return { error: e.text || e.message || 'Error EmailJS' };
    }
  }

  return { enviarResumen, yaEnviadoHoy };
})();
