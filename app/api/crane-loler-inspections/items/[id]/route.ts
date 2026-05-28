import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";
import { normaliseLolerStatus } from "../../../../lib/craneLolerInspections";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function isIsoDate(value: string | null) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const id = clean(params?.id);
    if (!id) return NextResponse.json({ error: "LOLER item id is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };

    if ("planned_date" in body) {
      const plannedDate = clean(body.planned_date);
      if (!isIsoDate(plannedDate)) return NextResponse.json({ error: "Planned date is invalid." }, { status: 400 });
      payload.planned_date = plannedDate;
    }

    if ("completed_date" in body || "completed_at" in body) {
      const completedDate = clean(body.completed_date ?? body.completed_at);
      if (!isIsoDate(completedDate)) return NextResponse.json({ error: "Completed date is invalid." }, { status: 400 });
      payload.completed_at = completedDate ? `${completedDate}T00:00:00.000Z` : null;
      payload.completed_by = completedDate ? user?.email ?? null : null;
    }

    if ("status" in body) {
      const status = normaliseLolerStatus(body.status);
      payload.status = status;
      if ((status === "passed" || status === "failed") && !payload.completed_at) {
        payload.completed_at = new Date().toISOString();
        payload.completed_by = user?.email ?? null;
      }
      if (status !== "passed" && status !== "failed" && !("completed_date" in body) && !("completed_at" in body)) {
        payload.completed_at = null;
        payload.completed_by = null;
      }
    }

    if ("blocks_assignment" in body) payload.blocks_assignment = body.blocks_assignment === true;
    if ("notes" in body) payload.notes = clean(body.notes);
    if ("certificate_reference" in body) payload.certificate_reference = clean(body.certificate_reference);
    if ("next_loler_due_on" in body) {
      const nextDue = clean(body.next_loler_due_on);
      if (!isIsoDate(nextDue)) return NextResponse.json({ error: "Next LOLER due date is invalid." }, { status: 400 });
      payload.next_loler_due_on = nextDue;
    }

    const { data, error } = await supabase
      .from("crane_loler_inspection_items")
      .update(payload)
      .eq("id", id)
      .select("id, run_id, crane_id, planned_date, status, blocks_assignment, notes, certificate_reference, next_loler_due_on, completed_at, completed_by, created_at, updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Could not update LOLER item." }, { status: 400 });
    }

    const status = normaliseLolerStatus(data.status);
    if (status === "passed") {
      const cranePayload: Record<string, any> = {
        last_loler_completed_on: String(data.completed_at ?? new Date().toISOString()).slice(0, 10),
      };
      if (data.next_loler_due_on) cranePayload.loler_due_on = data.next_loler_due_on;
      if (data.notes) cranePayload.loler_notes = data.notes;

      await supabase.from("cranes").update(cranePayload).eq("id", data.crane_id);
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not update LOLER item." },
      { status: 400 }
    );
  }
}
