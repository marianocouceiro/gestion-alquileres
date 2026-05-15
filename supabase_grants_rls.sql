-- ============================================================
-- GestAlquiler — GRANTs y RLS
-- Cambio Supabase: tablas nuevas ya no se exponen por defecto
-- Aplicar hoy (antes del 30/5) en: Dashboard > SQL Editor
-- Seguro de ejecutar múltiples veces (idempotente)
-- ============================================================


-- ============================================================
-- PASO 1: GRANTs a roles estándar de Supabase
-- ============================================================

-- Tablas de datos de negocio (authenticated: lectura/escritura)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propiedades  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compradores  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasaciones   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedores   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas       TO authenticated;

-- user_roles y organizations: solo lectura para usuarios autenticados
-- La escritura la hace service_role (Edge Functions)
GRANT SELECT ON public.user_roles    TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;

-- service_role: acceso total en todas (ya bypassa RLS, pero el GRANT es obligatorio)
GRANT ALL ON public.contratos    TO service_role;
GRANT ALL ON public.pagos        TO service_role;
GRANT ALL ON public.propiedades  TO service_role;
GRANT ALL ON public.compradores  TO service_role;
GRANT ALL ON public.tasaciones   TO service_role;
GRANT ALL ON public.visitas      TO service_role;
GRANT ALL ON public.config       TO service_role;
GRANT ALL ON public.vendedores   TO service_role;
GRANT ALL ON public.tareas       TO service_role;
GRANT ALL ON public.user_roles   TO service_role;
GRANT ALL ON public.organizations TO service_role;

-- anon: sin acceso (la app siempre requiere login)
REVOKE ALL ON public.contratos    FROM anon;
REVOKE ALL ON public.pagos        FROM anon;
REVOKE ALL ON public.propiedades  FROM anon;
REVOKE ALL ON public.compradores  FROM anon;
REVOKE ALL ON public.tasaciones   FROM anon;
REVOKE ALL ON public.visitas      FROM anon;
REVOKE ALL ON public.config       FROM anon;
REVOKE ALL ON public.vendedores   FROM anon;
REVOKE ALL ON public.tareas       FROM anon;
REVOKE ALL ON public.user_roles   FROM anon;
REVOKE ALL ON public.organizations FROM anon;


-- ============================================================
-- PASO 2: Habilitar RLS en todas las tablas
-- ============================================================

ALTER TABLE public.contratos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propiedades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compradores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasaciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PASO 3: Políticas RLS — tablas con org_id
-- Cada usuario autenticado solo ve y modifica datos de su org.
-- El org_id viene del JWT en app_metadata (lo graba la Edge Function).
-- ============================================================

-- contratos
DROP POLICY IF EXISTS "contratos_org_access" ON public.contratos;
CREATE POLICY "contratos_org_access" ON public.contratos
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- pagos
DROP POLICY IF EXISTS "pagos_org_access" ON public.pagos;
CREATE POLICY "pagos_org_access" ON public.pagos
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- propiedades
DROP POLICY IF EXISTS "propiedades_org_access" ON public.propiedades;
CREATE POLICY "propiedades_org_access" ON public.propiedades
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- compradores
DROP POLICY IF EXISTS "compradores_org_access" ON public.compradores;
CREATE POLICY "compradores_org_access" ON public.compradores
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- tasaciones
DROP POLICY IF EXISTS "tasaciones_org_access" ON public.tasaciones;
CREATE POLICY "tasaciones_org_access" ON public.tasaciones
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- visitas
DROP POLICY IF EXISTS "visitas_org_access" ON public.visitas;
CREATE POLICY "visitas_org_access" ON public.visitas
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- config
DROP POLICY IF EXISTS "config_org_access" ON public.config;
CREATE POLICY "config_org_access" ON public.config
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- vendedores
DROP POLICY IF EXISTS "vendedores_org_access" ON public.vendedores;
CREATE POLICY "vendedores_org_access" ON public.vendedores
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);

-- tareas
DROP POLICY IF EXISTS "tareas_org_access" ON public.tareas;
CREATE POLICY "tareas_org_access" ON public.tareas
  FOR ALL TO authenticated
  USING      ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id)
  WITH CHECK ((auth.jwt()->'app_metadata'->>'org_id')::uuid = org_id);


-- ============================================================
-- PASO 4: Políticas RLS — user_roles
-- Cada usuario solo puede leer su propio rol.
-- La escritura la maneja service_role via Edge Function.
-- ============================================================

DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
CREATE POLICY "user_roles_read_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- PASO 5: Políticas RLS — organizations
-- Cada usuario solo puede leer los datos de su propia org.
-- ============================================================

DROP POLICY IF EXISTS "organizations_read_own" ON public.organizations;
CREATE POLICY "organizations_read_own" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = ((auth.jwt()->'app_metadata'->>'org_id')::uuid));


-- ============================================================
-- VERIFICACIÓN FINAL — ejecutar para confirmar que todo quedó bien
-- ============================================================

SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'contratos','pagos','propiedades','compradores','tasaciones',
    'visitas','config','vendedores','tareas','user_roles','organizations'
  )
ORDER BY tablename, policyname;
