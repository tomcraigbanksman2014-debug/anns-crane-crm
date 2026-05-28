import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));
    const id = clean(params?.id);
    if (!id) return NextResponse.json({ error: "Inspection id is required." }, { status: 400 });

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };

    if ("title" in body) payload.title = clean(body.title) ?? "LOLER inspection";
    if ("inspector_company" in body) payload.inspector_company = clean(body.inspector_company);
    if ("inspector_name" in body) payload.inspector_name = clean(body.inspector_name);
    if ("notes" in body) payload.notes = clean(body.notes);
    if ("archived" in body) payload.archived = body.archived === true;

    const startDate = "start_date" in body ? clean(body.start_date) : null;
    const endDate = "end_date" in body ? clean(body.end_date) : null;

    if ("start_date" in body) {
      if (!isIsoDate(startDate)) return NextResponse.json({ error: "Start date is invalid." }, { status: 400 });
      payload.start_date = startDate;
    }
    if ("end_date" in body) {
      if (!isIsoDate(endDate)) return NextResponse.json({ error: "End date is invalid." }, { status: 400 });
      payload.end_date = endDate;
    }

    if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
      return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crane_loler_inspection_runs")
      .update(payload)
      .eq("id", id)
      .select("id, title, start_date, end_date, inspector_company, inspector_name, notes, archived, created_at, updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Could not update LOLER inspection." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, run: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not update LOLER inspection." },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const id = clean(params?.id);
    if (!id) return NextResponse.json({ error: "Inspection id is required." }, { status: 400 });

    const { error } = await supabase
      .from("crane_loler_inspection_runs")
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not archive LOLER inspection." },
      { status: 400 }
    );
  }
}
