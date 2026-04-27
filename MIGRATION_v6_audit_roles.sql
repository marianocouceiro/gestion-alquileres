-- ═══════════════════════════════════════════════════════════════
-- GestAlquiler v5.1 — MIGRACIÓN: Roles + Audit Log
-- ─────────────────────────────────────────────────────────────
-- SEGURO: No modifica tablas existentes ni datos actuales.
-- Solo AGREGA tablas nuevas y triggers.
--
-- INSTRUCCIONES:
-- 1. Ir a Supabase → SQL Editor
-- 2. Pegar y ejecutar TODO el script de una vez
-- 3. Verificar con las queries al final del archivo
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- PARTE 1: ROLES DE USUARIO
-- ─────────────────────────────────────────────────────────────
-- Tabla que asigna un rol a cada usuario de auth.users.
-- Roles disponibles:
--   admin    → acceso total (el tuyo actual)
--   operador → puede crear/editar, no puede eliminar
--   readonly → solo lectura

CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'operador', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (user_id)  -- un rol por usuario
);

-- RLS: solo admins pueden ver y gestionar roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_admin_all"    ON user_roles;
DROP POLICY IF EXISTS "roles_own_readonly" ON user_roles;

-- Los admins pueden hacer todo
CREATE POLICY "roles_admin_all" ON user_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Cada usuario puede leer su propio rol (para que la app sepa qué mostrar)
CREATE POLICY "roles_own_readonly" ON user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- ASIGNAR ROLES A TODOS LOS USUARIOS
-- ─────────────────────────────────────────────────────────────
-- admin    → acceso total, ve todos los vendedores en Visitas y Compradores
-- operador → acceso normal pero sin visibilidad de todos los vendedores

INSERT INTO user_roles (user_id, role)
SELECT id, r.role
FROM auth.users u
JOIN (VALUES
  ('marianocouceiro@gmail.com', 'admin'),
  ('kiaracouceiro@gmail.com',   'operador'),
  ('hpaolagrisel@gmail.com',    'operador'),
  ('cristiansanchez@gmail.com', 'operador')
) AS r(email, role) ON u.email = r.email
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


-- ─────────────────────────────────────────────────────────────
-- PARTE 2: AUDIT LOG
-- ─────────────────────────────────────────────────────────────
-- Registra automáticamente quién hizo qué y cuándo.
-- Se escribe via triggers de Postgres — no requiere cambios en el frontend.

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     UUID REFERENCES auth.users(id),
  user_email  TEXT,                -- snapshot del email al momento de la acción
  action      TEXT NOT NULL,       -- 'INSERT' | 'UPDATE' | 'DELETE'
  table_name  TEXT NOT NULL,       -- nombre de la tabla afectada
  record_id   TEXT,                -- id del registro afectado (siempre TEXT para unificar UUIDs y bigints)
  old_data    JSONB,               -- datos anteriores (solo en UPDATE y DELETE)
  new_data    JSONB                -- datos nuevos (solo en INSERT y UPDATE)
);

-- RLS: solo admins pueden leer el audit log. Nadie puede escribirlo directamente.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_read" ON audit_log;

CREATE POLICY "audit_admin_read" ON audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS audit_log_ts         ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_id    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_table_name ON audit_log (table_name);
CREATE INDEX IF NOT EXISTS audit_log_record_id  ON audit_log (record_id);


-- ─────────────────────────────────────────────────────────────
-- FUNCIÓN TRIGGER: escribe en audit_log
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- corre con privilegios del owner, no del usuario
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_user_email TEXT;
  v_record_id  TEXT;
  v_old        JSONB;
  v_new        JSONB;
BEGIN
  -- Obtener usuario actual de Supabase Auth (puede ser NULL en llamadas internas)
  BEGIN
    v_user_id    := auth.uid();
    v_user_email := (SELECT email FROM auth.users WHERE id = v_user_id);
  EXCEPTION WHEN OTHERS THEN
    v_user_id    := NULL;
    v_user_email := NULL;
  END;

  -- Extraer el id del registro afectado (convertir a texto para unificar tipos)
  IF TG_OP = 'DELETE' THEN
    BEGIN v_record_id := OLD.id::TEXT; EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    BEGIN v_record_id := NEW.id::TEXT; EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE -- UPDATE
    BEGIN v_record_id := NEW.id::TEXT; EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  -- En UPDATE solo loguear si realmente cambió algo
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data)
  VALUES (v_user_id, v_user_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- APLICAR TRIGGERS A TABLAS CRÍTICAS
-- ─────────────────────────────────────────────────────────────
-- Tablas auditadas: contratos y pagos (las más sensibles).
-- Se pueden agregar más tablas copiando el mismo patrón.

DROP TRIGGER IF EXISTS trg_audit_contratos ON contratos;
CREATE TRIGGER trg_audit_contratos
  AFTER INSERT OR UPDATE OR DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_pagos ON pagos;
CREATE TRIGGER trg_audit_pagos
  AFTER INSERT OR UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- Opcional: agregar a otras tablas si se desea
-- DROP TRIGGER IF EXISTS trg_audit_propiedades ON propiedades;
-- CREATE TRIGGER trg_audit_propiedades
--   AFTER INSERT OR UPDATE OR DELETE ON propiedades
--   FOR EACH ROW EXECUTE FUNCTION fn_audit_log();


-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────
-- Ejecutar estas queries por separado para confirmar que todo quedó bien.

-- 1. Ver tablas nuevas y si tienen RLS activo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user_roles', 'audit_log')
ORDER BY tablename;

-- 2. Ver triggers creados
SELECT trigger_name, event_object_table, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trg_audit_%'
ORDER BY event_object_table, event_manipulation;

-- 3. Ver el rol asignado (reemplazar email)
SELECT u.email, ur.role, ur.created_at
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id;

-- 4. Test manual del audit log:
--    Modificar cualquier contrato desde la app y luego ejecutar:
--    SELECT * FROM audit_log ORDER BY ts DESC LIMIT 5;
