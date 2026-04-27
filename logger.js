/* ═══════════════════════════════════════════════════════════════
   logger.js — GestAlquiler v5.1
   ─────────────────────────────────────────────────────────────
   Logger de producción. Parchea el objeto global console para:
   · En DEV (localhost / 127.0.0.1): comportamiento idéntico al original.
   · En PROD: silencia console.log/info/warn. Los console.error se
     capturan en memoria (accesibles via GestLogger.getErrors()) y
     se pueden enviar a Sentry/Supabase en el futuro sin cambiar
     nada más del código.

   INSTALACIÓN: agregar como PRIMER <script> en cada HTML, antes
   que shared.js, supabase.js y script.js.

   <script src="logger.js"></script>
═══════════════════════════════════════════════════════════════ */

'use strict';

const GestLogger = (function () {

  const IS_DEV = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.startsWith('192.168.') ||
    location.hostname.endsWith('.local')
  );

  // Buffer en memoria para errores de producción
  // Máximo 50 entradas para no consumir memoria indefinidamente
  const _errorBuffer = [];
  const MAX_BUFFER    = 50;

  // Guardamos referencias originales antes de parchear
  const _orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    group: console.group.bind(console),
    groupEnd: console.groupEnd.bind(console),
  };

  function _captureError(...args) {
    const entry = {
      ts:      new Date().toISOString(),
      // Convertir args a strings seguros (evitar referencias circulares)
      message: args.map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
        catch { return '[no serializable]'; }
      }).join(' '),
    };
    if (_errorBuffer.length >= MAX_BUFFER) _errorBuffer.shift();
    _errorBuffer.push(entry);
  }

  if (!IS_DEV) {
    // Silenciar logs verbosos en producción
    console.log   = () => {};
    console.info  = () => {};
    console.debug = () => {};
    console.group = () => {};
    console.groupEnd = () => {};

    // warn: silenciar en producción (evita exponer internals)
    console.warn  = () => {};

    // error: capturar en buffer + silenciar del inspector del usuario
    console.error = (...args) => {
      _captureError(...args);
      // No llamamos a _orig.error para que el usuario no vea
      // detalles de tablas/queries en sus DevTools.
    };
  }

  /* ── API pública ───────────────────────────────────────────── */

  // Siempre disponible independientemente del entorno
  function log(...args)   { if (IS_DEV) _orig.log(...args); }
  function warn(...args)  { if (IS_DEV) _orig.warn(...args); }
  function error(...args) {
    _captureError(...args);
    if (IS_DEV) _orig.error(...args);
  }

  // Devuelve los errores capturados (útil para enviar a Sentry/Supabase)
  function getErrors() { return [..._errorBuffer]; }

  // Limpiar buffer (llamar después de enviar a un servicio externo)
  function clearErrors() { _errorBuffer.length = 0; }

  // Envío manual a Supabase audit_log (preparado para Fase 2)
  // Por ahora solo guarda en buffer; cuando esté audit_log creado
  // descomentar el bloque de fetch.
  async function flushErrors() {
    if (!_errorBuffer.length) return;
    const errors = getErrors();
    clearErrors();
    /* -- DESCOMENTAR en Fase 2 cuando exista la tabla error_log --
    try {
      if (typeof SupabaseDB !== 'undefined') {
        await SupabaseDB.saveErrorLog(errors);
      }
    } catch { }
    */
    return errors;
  }

  // En producción, intentar flush al cerrar/navegar fuera
  if (!IS_DEV && typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushErrors();
    });
  }

  return { log, warn, error, getErrors, clearErrors, flushErrors, IS_DEV };

})();
