import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { displayUserName } from "../../../lib/displayUserName";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "the selected date";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parsePrimarySelection(value: string) {
  const raw = clean(value);
  if (raw.startsWith("crane:")) {
    return { kind: "crane", id: raw.replace("crane:", "") };
  }
  if (raw.startsWith("equipment:")) {
    return { kind: "equipment", id: raw.replace("equipment:", "") };
  }
  if (raw === "cross_hire") {
    return { kind: "cross_hire", id: "cross_hire" };
  }
  if (raw === "other") {
    return { kind: "other", id: "other" };
  }
  return { kind: "", id: "" };
}

function allocationMatches(row: any, selection: { kind: string; id: string }, body: any) {
  const allocations = Array.isArray(row?.job_equipment) ? row.job_equipment : [];

  if (selection.kind === "crane" && selection.id) {
    return allocations.some((item: any) => String(item?.crane_id ?? "") === selection.id);
  }

  if (selection.kind === "equipment" && selection.id) {
    return allocations.some((item: any) => String(item?.equipment_id ?? "") === selection.id);
  }

  if (selection.kind === "cross_hire") {
    const wanted = clean(body?.cross_hire_item_name).toLowerCase();
    if (!wanted) return false;
    return allocations.some((item: any) => clean(item?.item_name).toLowerCase() === wanted);
  }

  if (selection.kind === "other") {
    const wanted = clean(body?.other_item_name).toLowerCase();
    if (!wanted) return false;
    return allocations.some((item: any) => clean(item?.item_name).toLowerCase() === wanted);
  }

  return false;
}

function assetLabel(row: any, selection: { kind: string; id: string }) {
  const allocations = Array.isArray(row?.job_equipment) ? row.job_equipment : [];

  if (selection.kind === "crane") {
    const item = allocations.find((a: any) => String(a?.crane_id ?? "") === selection.id);
    const crane = first(item?.cranes);
    return [crane?.name, crane?.reg_number].filter(Boolean).join(" / ") || "the same crane";
  }

  if (selection.kind === "equipment") {
    const item = allocations.find((a: any) => String(a?.equipment_id ?? "") === selection.id);
    const equipment = first(item?.equipment);
    return [equipment?.name, equipment?.asset_number].filter(Boolean).join(" / ") || "the same equipment";
  }

  const item = allocations.find((a: any) => clean(a?.item_name));
  return clean(item?.item_name) || "the same asset";
}

async function creatorNameFor(supabase: ReturnType<typeof createSupabaseServerClient>, row: any) {
  if (row?.created_by) {
    const { data: staff } = await supabase
      .from("staff_profiles")
      .select("username, role")
      .eq("user_id", row.created_by)
      .maybeSingle();

    const staffName = displayUserName((staff as any)?.username || (staff as any)?.role);
    if (staffName) return staffName;
  }

  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("actor_username, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", row.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const auditName = displayUserName((auditRows as any[])?.[0]?.actor_username);
  return auditName || "someone";
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const clientId = clean(body?.client_id);
    const startDate = clean(body?.start_date);
    const selection = parsePrimarySelection(clean(body?.primary_equipment_selection));

    if (!clientId || clientId === "other" || !startDate || !selection.kind) {
      return NextResponse.json({ duplicate: false });
    }

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        site_name,
        start_date,
        end_date,
        job_date,
        status,
        created_at,
        created_by,
        clients:client_id (
          id,
          company_name
        ),
        job_equipment (
          id,
          asset_type,
          crane_id,
          equipment_id,
          vehicle_id,
          item_name,
          cranes:crane_id (
            id,
            name,
            reg_number
          ),
          equipment:equipment_id (
            id,
            name,
            asset_number
          ),
          vehicles:vehicle_id (
            id,
            name,
            reg_number
          )
        )
      `)
      .eq("client_id", clientId)
      .or("archived.is.null,archived.eq.false")
      .or(`start_date.eq.${startDate},job_date.eq.${startDate}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ duplicate: false, error: error.message }, { status: 200 });
    }

    const duplicate = ((data ?? []) as any[]).find((row) => {
      const status = clean(row?.status).toLowerCase();
      if (status === "cancelled" || status === "late_cancelled") return false;
      return allocationMatches(row, selection, body);
    });

    if (!duplicate) {
      return NextResponse.json({ duplicate: false });
    }

    const customer = first((duplicate as any)?.clients)?.company_name || "this customer";
    const asset = assetLabel(duplicate, selection);
    const createdBy = await creatorNameFor(supabase, duplicate);
    const jobDate = fmtDate(duplicate?.start_date ?? duplicate?.job_date ?? startDate);

    return NextResponse.json({
      duplicate: true,
      duplicate_job_id: duplicate.id,
      duplicate_job_number: duplicate.job_number ?? null,
      message: `A crane job has already been created by ${createdBy} for ${customer} on ${jobDate} using ${asset}. This may be a duplicate. Are you sure you wish to save?`,
    });
  } catch (error: any) {
    return NextResponse.json({ duplicate: false, error: error?.message || "Duplicate check failed." }, { status: 200 });
  }
}
