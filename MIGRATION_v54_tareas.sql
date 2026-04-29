-- ═══════════════════════════════════════════════════════════════
-- GestAlquiler v5.4 — MIGRACIÓN: Tabla tareas
-- ─────────────────────────────────────────────────────────────
-- SEGURO: Solo AGREGA la tabla tareas. No modifica nada existente.
--
-- INSTRUCCIONES:
-- 1. Ir a Supabase → SQL Editor
-- 2. Pegar y ejecutar TODO el script
-- 3. Verificar con la query al final
-- ═══════════════════════════════════════════════════════════════

-- ── Tabla tareas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tareas (
  id           TEXT PRIMARY KEY,
  org_id       UUID NOT NULL,
  prioridad    TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  completada   BOOLEAN NOT NULL DEFAULT false,
  data         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tareas_org_id     ON tareas(org_id);
CREATE INDEX IF NOT EXISTS idx_tareas_completada ON tareas(org_id, completada);
CREATE INDEX IF NOT EXISTS idx_tareas_prioridad  ON tareas(org_id, prioridad);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tareas_org_select" ON tareas;
DROP POLICY IF EXISTS "tareas_org_insert" ON tareas;
DROP POLICY IF EXISTS "tareas_org_update" ON tareas;
DROP POLICY IF EXISTS "tareas_org_delete" ON tareas;

CREATE POLICY "tareas_org_select" ON tareas
  FOR SELECT TO authenticated
  USING (org_id = current_org_id());

CREATE POLICY "tareas_org_insert" ON tareas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = current_org_id());

CREATE POLICY "tareas_org_update" ON tareas
  FOR UPDATE TO authenticated
  USING  (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

CREATE POLICY "tareas_org_delete" ON tareas
  FOR DELETE TO authenticated
  USING (org_id = current_org_id());

-- ── Verificación ─────────────────────────────────────────────
SELECT 
  'tareas' AS tabla,
  COUNT(*) AS filas,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'tareas') AS politicas_rls
FROM tareas;
