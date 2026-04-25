import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";

const LOG_TYPES = new Set([
  "general",
  "issue",
  "maintenance",
  "breakdown",
  "defect",
  "delay",
  "yard",
  "vehicle",
  "crane",
  "transport",
  "job",
  "other",
]);

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function normaliseType(value: unknown) {
  const type = String(value ?? "general").trim().toLowerCase();
  return LOG_TYPES.has(type) ? type : "general";
}

function normaliseBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

function toUsername(email: string | null | undefined) {
  const raw = String(email ?? "").trim();
  return raw.includes("@") ? raw.split("@")[0] : raw;
}

function buildLookupLabel(prefix: string, primary: string | null | undefined, secondary?: string | null | undefined) {
  const main = String(primary ?? "").trim();
  const extra = String(secondary ?? "").trim();
  if (main && extra) return `${prefix}${main} • ${extra}`;
  if (main) return `${prefix}${main}`;
  return `${prefix}—`;
}

export async function GET(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const from = clean(searchParams.get("from"));
    const to = clean(searchParams.get("to"));
    const logType = clean(searchParams.get("log_type"));
    const resolved = clean(searchParams.get("resolved"));

    let entriesQuery = supabase
      .from("daily_log_entries")
      .select(`
        id,
        log_date,
        log_time,
        log_type,
        title,
        notes,
        resolved,
        resolved_at,
        created_by_name,
        created_at,
        updated_at,
        linked_job_id,
        linked_transport_job_id,
        linked_operator_id,
        linked_vehicle_id,
        linked_crane_id,
        linked_equipment_id,
        linked_job:jobs!daily_log_entries_linked_job_id_fkey (
          id,
          job_number,
          site_name
        ),
        linked_transport_job:transport_jobs!daily_log_entries_linked_transport_job_id_fkey (
          id,
          transport_number,
          collection_address,
          delivery_address
        ),
        linked_operator:operators!daily_log_entries_linked_operator_id_fkey (
          id,
          full_name,
          company_name,
          employment_type
        ),
        linked_vehicle:vehicles!daily_log_entries_linked_vehicle_id_fkey (
          id,
          name,
          reg_number
        ),
        linked_crane:cranes!daily_log_entries_linked_crane_id_fkey (
          id,
          name,
          reg_number
        ),
        linked_equipment:equipment!daily_log_entries_linked_equipment_id_fkey (
          id,
          name,
          asset_number
        )
      `)
      .order("log_date", { ascending: false })
      .order("log_time", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);

    if (from) entriesQuery = entriesQuery.gte("log_date", from);
    if (to) entriesQuery = entriesQuery.lte("log_date", to);
    if (logType && logType !== "all") entriesQuery = entriesQuery.eq("log_type", normaliseType(logType));
    if (resolved === "open") entriesQuery = entriesQuery.eq("resolved", false);
    if (resolved === "resolved") entriesQuery = entriesQuery.eq("resolved", true);

    const [
      { data: entries, error: entriesError },
      { data: jobs, error: jobsError },
      { data: transportJobs, error: transportJobsError },
      { data: operators, error: operatorsError },
      { data: vehicles, error: vehiclesError },
      { data: cranes, error: cranesError },
      { data: equipment, error: equipmentError },
    ] = await Promise.all([
      entriesQuery,
      supabase.from("jobs").select("id, job_number, site_name").eq("archived", false).order("job_number", { ascending: false }).limit(120),
      supabase.from("transport_jobs").select("id, transport_number, collection_address, delivery_address").eq("archived", false).order("transport_number", { ascending: false }).limit(120),
      supabase.from("operators").select("id, full_name, company_name, employment_type").eq("archived", false).order("full_name", { ascending: true }).limit(250),
      supabase.from("vehicles").select("id, name, reg_number").eq("archived", false).order("name", { ascending: true }).limit(250),
      supabase.from("cranes").select("id, name, reg_number").eq("archived", false).order("name", { ascending: true }).limit(250),
      supabase.from("equipment").select("id, name, asset_number").eq("archived", false).order("name", { ascending: true }).limit(250),
    ]);

    if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 400 });
    if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 400 });
    if (transportJobsError) return NextResponse.json({ error: transportJobsError.message }, { status: 400 });
    if (operatorsError) return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    if (vehiclesError) return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
    if (cranesError) return NextResponse.json({ error: cranesError.message }, { status: 400 });
    if (equipmentError) return NextResponse.json({ error: equipmentError.message }, { status: 400 });

    return NextResponse.json({
      entries: entries ?? [],
      lookups: {
        jobs: (jobs ?? []).map((row: any) => ({
          id: row.id,
          label: buildLookupLabel("#", row.job_number, row.site_name),
        })),
        transport_jobs: (transportJobs ?? []).map((row: any) => ({
          id: row.id,
          label: buildLookupLabel("", row.transport_number, row.delivery_address ?? row.collection_address),
        })),
        operators: (operators ?? []).map((row: any) => ({
          id: row.id,
          label: row.full_name ?? "Unnamed operator",
          sublabel: row.company_name ?? row.employment_type ?? null,
        })),
        vehicles: (vehicles ?? []).map((row: any) => ({
          id: row.id,
          label: buildLookupLabel("", row.name, row.reg_number),
        })),
        cranes: (cranes ?? []).map((row: any) => ({
          id: row.id,
          label: buildLookupLabel("", row.name, row.reg_number),
        })),
        equipment: (equipment ?? []).map((row: any) => ({
          id: row.id,
          label: buildLookupLabel("", row.name, row.asset_number),
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load daily log." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    const payload = {
      log_date: clean(body?.log_date),
      log_time: clean(body?.log_time),
      log_type: normaliseType(body?.log_type),
      title: clean(body?.title),
      notes: clean(body?.notes),
      resolved: normaliseBool(body?.resolved),
      linked_job_id: clean(body?.linked_job_id),
      linked_transport_job_id: clean(body?.linked_transport_job_id),
      linked_operator_id: clean(body?.linked_operator_id),
      linked_vehicle_id: clean(body?.linked_vehicle_id),
      linked_crane_id: clean(body?.linked_crane_id),
      linked_equipment_id: clean(body?.linked_equipment_id),
    };

    if (!payload.log_date) {
      return NextResponse.json({ error: "Log date is required." }, { status: 400 });
    }

    if (!payload.notes) {
      return NextResponse.json({ error: "Notes are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("daily_log_entries")
      .insert({
        log_date: payload.log_date,
        log_time: payload.log_time,
        log_type: payload.log_type,
        title: payload.title,
        notes: payload.notes,
        resolved: payload.resolved,
        resolved_at: payload.resolved ? new Date().toISOString() : null,
        linked_job_id: payload.linked_job_id,
        linked_transport_job_id: payload.linked_transport_job_id,
        linked_operator_id: payload.linked_operator_id,
        linked_vehicle_id: payload.linked_vehicle_id,
        linked_crane_id: payload.linked_crane_id,
        linked_equipment_id: payload.linked_equipment_id,
        created_by_name: toUsername(user?.email ?? null) || null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save daily log entry." }, { status: 500 });
  }
}
