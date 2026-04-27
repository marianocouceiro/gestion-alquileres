-- ═══════════════════════════════════════════════════════════════
-- GestAlquiler v5 — SETUP AUTENTICACIÓN + RLS
-- Ejecutar en Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Agregar columnas de email a contratos
ALTER TABLE contratos 
  ADD COLUMN IF NOT EXISTS tenant_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_email  TEXT DEFAULT '';

-- 2. Agregar email de inmobiliaria a config
INSERT INTO config(clave, valor, updated_at)
VALUES ('emailInmo', '', NOW())
ON CONFLICT(clave) DO NOTHING;

-- 3. Habilitar RLS en todas las tablas
ALTER TABLE contratos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasaciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE compradores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendedores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE config        ENABLE ROW LEVEL SECURITY;

-- 4. Políticas: solo usuarios autenticados pueden leer y escribir
-- (DROP IF EXISTS primero para poder re-ejecutar sin errores)

DO $$ 
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contratos','pagos','visitas','tasaciones',
                            'propiedades','compradores','vendedores','config']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_all" ON %I', t);
    EXECUTE format('
      CREATE POLICY "auth_all" ON %I
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true)
    ', t);
  END LOOP;
END $$;

-- 5. Verificar resultado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('contratos','pagos','visitas','tasaciones',
                    'propiedades','compradores','vendedores','config')
ORDER BY tablename;
