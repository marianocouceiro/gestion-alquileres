import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAPIDAPI_KEY       = Deno.env.get("RAPIDAPI_KEY") ?? "";
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (_req) => {
  const result = { ok: false, icl_months: 0, ipc_months: 0, orgs_updated: 0, error: "" };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [iclData, ipcData] = await Promise.all([fetchICL(), fetchIPC()]);

    if (!Object.keys(iclData).length && !Object.keys(ipcData).length) {
      result.error = "Ambas fuentes fallaron (Arquiler e INDEC)";
      return new Response(JSON.stringify(result), { status: 500, headers: cors() });
    }

    const { data: orgs, error: orgsErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("active", true);

    if (orgsErr) throw new Error(orgsErr.message);

    const now = new Date().toISOString();
    for (const org of orgs ?? []) {
      await updateOrgConfig(supabase, org.id, iclData, ipcData, now);
      result.orgs_updated++;
    }

    result.ok        = true;
    result.icl_months = Object.keys(iclData).length;
    result.ipc_months = Object.keys(ipcData).length;

  } catch (e) {
    result.error = String(e);
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: cors(),
  });
});

// ── ICL desde Arquiler API ────────────────────────────────────────────────────
async function fetchICL(): Promise<Record<string, number>> {
  if (!RAPIDAPI_KEY) return {};

  // Pedir los últimos 24 meses (ventana siempre actualizada)
  const start = new Date();
  start.setMonth(start.getMonth() - 24);
  const dateStr = start.toISOString().substring(0, 7) + "-01";

  try {
    const resp = await fetch("https://arquilerapi1.p.rapidapi.com/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": "arquilerapi1.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
      },
      body: JSON.stringify({ amount: 100000, date: dateStr, months: 1, rate: "icl" }),
    });

    if (!resp.ok) return {};
    const json = await resp.json();

    const result: Record<string, number> = {};
    for (const item of json.data ?? []) {
      // Solo valores confirmados (no estimados)
      if (item.date && item.value != null && item.estimated === false) {
        result[item.date.substring(0, 10)] = parseFloat(item.value);
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ── IPC desde INDEC (datos.gob.ar) ───────────────────────────────────────────
async function fetchIPC(): Promise<Record<string, number>> {
  // Serie 148.3_INIVELNAL_DICI_M_26 — Nivel General Nacional, base dic 2016
  // Devuelve niveles acumulados → convertimos a variación mensual %
  const URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=60&sort=asc&format=json";

  try {
    const resp = await fetch(URL);
    if (!resp.ok) return {};
    const json = await resp.json();

    const data: [string, number][] = json.data ?? [];
    const result: Record<string, number> = {};

    for (let i = 1; i < data.length; i++) {
      const [fecha, nivel] = data[i];
      const prevNivel = data[i - 1][1];
      if (!prevNivel || nivel == null) continue;
      const variacion = parseFloat(((nivel / prevNivel - 1) * 100).toFixed(2));
      if (variacion > 0 && variacion < 100) { // sanity check
        result[fecha.substring(0, 7)] = variacion; // "YYYY-MM"
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ── Actualizar config de una org ──────────────────────────────────────────────
async function updateOrgConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  iclData: Record<string, number>,
  ipcData: Record<string, number>,
  now: string,
) {
  // Leer datos existentes para hacer merge (no pisar meses viejos)
  const { data: existing } = await supabase
    .from("config")
    .select("clave, valor")
    .eq("org_id", orgId)
    .in("clave", ["icl_data", "ipc_data"]);

  const existingMap: Record<string, Record<string, number>> = {};
  for (const row of existing ?? []) {
    try { existingMap[row.clave] = JSON.parse(row.valor); } catch { /* */ }
  }

  const mergedICL = { ...(existingMap["icl_data"] ?? {}), ...iclData };
  const mergedIPC = { ...(existingMap["ipc_data"] ?? {}), ...ipcData };

  // Validar IPC: descartar si algún valor parece un nivel en lugar de variación
  const maxIPC = Math.max(...Object.values(mergedIPC));
  const cleanIPC = maxIPC > 100 ? ipcData : mergedIPC; // si hay corrupción, usar solo datos frescos

  const iclUltimo = Object.keys(mergedICL).sort().pop() ?? "";
  const ipcUltimo = Object.keys(cleanIPC).sort().pop() ?? "";

  const rows = [
    { clave: "icl_data",          valor: JSON.stringify(mergedICL), org_id: orgId, updated_at: now },
    { clave: "ipc_data",          valor: JSON.stringify(cleanIPC),  org_id: orgId, updated_at: now },
    { clave: "icl_ultimo_mes",    valor: iclUltimo,                 org_id: orgId, updated_at: now },
    { clave: "ipc_ultimo_mes",    valor: ipcUltimo,                 org_id: orgId, updated_at: now },
    { clave: "indices_updated_at", valor: now,                      org_id: orgId, updated_at: now },
  ];

  await supabase.from("config").upsert(rows, { onConflict: "clave,org_id" });
}

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}
