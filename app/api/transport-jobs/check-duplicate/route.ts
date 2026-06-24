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

    if (!clientId || clientId === "other" || !transportDate || !vehicleId) {
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
      .eq("vehicle_id", vehicleId)
      .eq("transport_date", transportDate)
      .or("archived.is.null,archived.eq.false")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ duplicate: false, error: error.message }, { status: 200 });
    }

    const duplicate = ((data ?? []) as any[]).find((row) => {
      const status = clean(row?.status).toLowerCase();
      return status !== "cancelled" && status !== "late_cancelled";
    });

    if (!duplicate) {
      return NextResponse.json({ duplicate: false });
    }

    const customer = first((duplicate as any)?.clients)?.company_name || "this customer";
    const vehicle = first((duplicate as any)?.vehicles);
    const vehicleLabel = [vehicle?.name, vehicle?.reg_number].filter(Boolean).join(" / ") || "the same vehicle";
    const createdBy = await creatorNameFor(supabase, duplicate);
    const jobDate = fmtDate(duplicate.transport_date ?? transportDate);

    return NextResponse.json({
      duplicate: true,
      duplicate_transport_job_id: duplicate.id,
      duplicate_transport_number: duplicate.transport_number ?? null,
      message: `A transport job has already been created by ${createdBy} for ${customer} on ${jobDate} using ${vehicleLabel}. This may be a duplicate. Are you sure you wish to save?`,
    });
  } catch (error: any) {
    return NextResponse.json({ duplicate: false, error: error?.message || "Duplicate check failed." }, { status: 200 });
  }
}
