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
    .eq("entity_type", "transport_job")
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
    const transportDate = clean(body?.transport_date);
    const vehicleId = clean(body?.vehicle_id);
    const currentHasVehicle = !!vehicleId;

    if (!clientId || clientId === "other" || !transportDate) {
      return NextResponse.json({ duplicate: false });
    }

    const { data, error } = await supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        client_id,
        vehicle_id,
        transport_date,
        delivery_date,
        status,
        created_at,
        created_by,
        clients:client_id (
          id,
          company_name
        ),
        vehicles:vehicle_id (
          id,
          name,
          reg_number
        )
      `)
      .eq("client_id", clientId)
      .eq("transport_date", transportDate)
      .or("archived.is.null,archived.eq.false")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ duplicate: false, error: error.message }, { status: 200 });
    }

    const activeRows = ((data ?? []) as any[]).filter((row) => {
      const status = clean(row?.status).toLowerCase();
      return status !== "cancelled" && status !== "late_cancelled";
    });

    const strongDuplicate = currentHasVehicle
      ? activeRows.find((row) => String(row?.vehicle_id ?? "") === vehicleId)
      : null;

    if (strongDuplicate) {
      const customer = first((strongDuplicate as any)?.clients)?.company_name || "this customer";
      const vehicle = first((strongDuplicate as any)?.vehicles);
      const vehicleLabel = [vehicle?.name, vehicle?.reg_number].filter(Boolean).join(" / ") || "the same vehicle";
      const createdBy = await creatorNameFor(supabase, strongDuplicate);
      const jobDate = fmtDate(strongDuplicate.transport_date ?? transportDate);

      return NextResponse.json({
        duplicate: true,
        duplicate_type: "strong",
        duplicate_transport_job_id: strongDuplicate.id,
        duplicate_transport_number: strongDuplicate.transport_number ?? null,
        message: `A transport job has already been created by ${createdBy} for ${customer} on ${jobDate} using ${vehicleLabel}. This may be a duplicate. Are you sure you wish to save?`,
      });
    }

    const possibleDuplicate = activeRows.find((row) => {
      const existingHasVehicle = !!clean(row?.vehicle_id);
      return !currentHasVehicle || !existingHasVehicle;
    });

    if (possibleDuplicate) {
      const customer = first((possibleDuplicate as any)?.clients)?.company_name || "this customer";
      const createdBy = await creatorNameFor(supabase, possibleDuplicate);
      const jobDate = fmtDate(possibleDuplicate.transport_date ?? transportDate);
      const jobRef = possibleDuplicate.transport_number ? ` job ${possibleDuplicate.transport_number}` : " job";

      return NextResponse.json({
        duplicate: true,
        duplicate_type: "possible_missing_vehicle",
        duplicate_transport_job_id: possibleDuplicate.id,
        duplicate_transport_number: possibleDuplicate.transport_number ?? null,
        message: `A transport${jobRef} has already been created by ${createdBy} for ${customer} on ${jobDate}, but one of the jobs has no vehicle allocated yet. This may be a duplicate. Are you sure you wish to save?`,
      });
    }

    return NextResponse.json({ duplicate: false });
  } catch (error: any) {
    return NextResponse.json({ duplicate: false, error: error?.message || "Duplicate check failed." }, { status: 200 });
  }
}
