import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";
import { normaliseLolerStatus } from "../../lib/craneLolerInspections";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isMissingLolerTable(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("crane_loler_inspection") || message.includes("does not exist") || message.includes("schema cache");
}

export async function GET() {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const [{ data: cranes, error: cranesError }, { data: runs, error: runsError }] = await Promise.all([
      supabase
        .from("cranes")
        .select("id, name, reg_number, fleet_number, loler_due_on, last_loler_completed_on, loler_notes, archived")
        .or("archived.is.null,archived.eq.false")
        .order("name", { ascending: true }),
      supabase
        .from("crane_loler_inspection_runs")
        .select("id, title, start_date, end_date, inspector_company, inspector_name, notes, archived, created_at, updated_at")
        .eq("archived", false)
        .order("start_date", { ascending: false })
        .limit(50),
    ]);

    if (cranesError) return NextResponse.json({ error: cranesError.message }, { status: 400 });
    if (runsError) {
      if (isMissingLolerTable(runsError)) {
        return NextResponse.json({ cranes: cranes ?? [], runs: [], items: [], setup_required: true });
      }
      return NextResponse.json({ error: runsError.message }, { status: 400 });
    }

    const runIds = (runs ?? []).map((row: any) => String(row?.id ?? "")).filter(Boolean);
    let items: any[] = [];

    if (runIds.length > 0) {
      const { data: itemRows, error: itemsError } = await supabase
        .from("crane_loler_inspection_items")
        .select("id, run_id, crane_id, planned_date, status, blocks_assignment, notes, certificate_reference, next_loler_due_on, completed_at, completed_by, created_at, updated_at")
        .in("run_id", runIds)
        .order("planned_date", { ascending: true });

      if (itemsError) {
        if (isMissingLolerTable(itemsError)) {
          return NextResponse.json({ cranes: cranes ?? [], runs: runs ?? [], items: [], setup_required: true });
        }
        return NextResponse.json({ error: itemsError.message }, { status: 400 });
      }
      items = itemRows ?? [];
    }

    return NextResponse.json({ cranes: cranes ?? [], runs: runs ?? [], items, setup_required: false });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load LOLER inspections." },
      { status: 400 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));
    const title = clean(body?.title) ?? "LOLER inspection";
    const startDate = clean(body?.start_date);
    const endDate = clean(body?.end_date) ?? startDate;
    const inspectorCompany = clean(body?.inspector_company);
    const inspectorName = clean(body?.inspector_name);
    const notes = clean(body?.notes);
    const craneIds = Array.isArray(body?.crane_ids)
      ? body.crane_ids.map((id: unknown) => clean(id)).filter(Boolean)
      : [];

    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });
    }

    if (String(endDate) < String(startDate)) {
      return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    }

    const { data: run, error: runError } = await supabase
      .from("crane_loler_inspection_runs")
      .insert({
        title,
        start_date: startDate,
        end_date: endDate,
        inspector_company: inspectorCompany,
        inspector_name: inspectorName,
        notes,
        created_by: user?.id ?? null,
      })
      .select("id, title, start_date, end_date, inspector_company, inspector_name, notes, archived, created_at, updated_at")
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: runError?.message || "Could not create LOLER run." }, { status: 400 });
    }

    let items: any[] = [];
    if (craneIds.length > 0) {
      const rows = craneIds.map((craneId: string) => ({
        run_id: run.id,
        crane_id: craneId,
        planned_date: startDate,
        status: normaliseLolerStatus("planned"),
        blocks_assignment: false,
      }));

      const { data: insertedItems, error: itemError } = await supabase
        .from("crane_loler_inspection_items")
        .insert(rows)
        .select("id, run_id, crane_id, planned_date, status, blocks_assignment, notes, certificate_reference, next_loler_due_on, completed_at, completed_by, created_at, updated_at");

      if (itemError) {
        await supabase.from("crane_loler_inspection_runs").delete().eq("id", run.id);
        return NextResponse.json({ error: itemError.message }, { status: 400 });
      }
      items = insertedItems ?? [];
    }

    return NextResponse.json({ ok: true, run, items });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not create LOLER inspection." },
      { status: 400 }
    );
  }
}
