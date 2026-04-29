-- ═══════════════════════════════════════════════════════════════
-- GestAlquiler v5.4 — MIGRACIÓN: Tabla tareas (completa)
-- ─────────────────────────────────────────────────────────────
-- SEGURO: Solo AGREGA. No modifica nada existente.
-- Si ya corriste la migración anterior, solo corré el ALTER TABLE.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Crear tabla (si no existe) ────────────────────────────
CREATE TABLE IF NOT EXISTS tareas (
  id           TEXT PRIMARY KEY,
  org_id       UUID NOT NULL,
  prioridad    TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  completada   BOOLEAN NOT NULL DEFAULT false,
  data         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Agregar columnas directas (si no existen) ─────────────
ALTER TABLE tareas
  ADD COLUMN IF NOT EXISTS texto         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observaciones TEXT,
  ADD COLUMN IF NOT EXISTS fecha         DATE;

-- ── 3. Índices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tareas_org_id     ON tareas(org_id);
CREATE INDEX IF NOT EXISTS idx_tareas_completada ON tareas(org_id, completada);
CREATE INDEX IF NOT EXISTS idx_tareas_prioridad  ON tareas(org_id, prioridad);

-- ── 4. RLS ───────────────────────────────────────────────────
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tareas_org_select" ON tareas;
DROP POLICY IF EXISTS "tareas_org_insert" ON tareas;
DROP POLICY IF EXISTS "tareas_org_update" ON tareas;
DROP POLICY IF EXISTS "tareas_org_delete" ON tareas;

CREATE POLICY "tareas_org_select" ON tareas
  FOR SELECT TO authenticated USING (org_id = current_org_id());
CREATE POLICY "tareas_org_insert" ON tareas
  FOR INSERT TO authenticated WITH CHECK (org_id = current_org_id());
CREATE POLICY "tareas_org_update" ON tareas
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
CREATE POLICY "tareas_org_delete" ON tareas
  FOR DELETE TO authenticated USING (org_id = current_org_id());

-- ── 5. Recargar caché PostgREST ──────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── 6. Verificar resultado ───────────────────────────────────
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tareas' ORDER BY ordinal_position;
