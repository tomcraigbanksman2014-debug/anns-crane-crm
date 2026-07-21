import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

type Payload = {
  entry_type?: "service" | "repair" | "inspection" | "loler" | "breakdown" | "note";
  service_date?: string | null;
  engineer?: string | null;
  notes?: string | null;
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const entry_type =
      (body.entry_type as
        | "service"
        | "repair"
        | "inspection"
        | "loler"
        | "breakdown"
        | "note") ?? "note";

    const service_date =
      norm(body.service_date) ?? new Date().toISOString().slice(0, 10);
    const engineer = norm(body.engineer);
    const notes = norm(body.notes);

    if (
      !["service", "repair", "inspection", "loler", "breakdown", "note"].includes(
        entry_type
      )
    ) {
      return NextResponse.json({ error: "Invalid entry type" }, { status: 400 });
    }

    if (!notes) {
      return NextResponse.json({ error: "Notes are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("equipment_service_log")
      .insert([
        {
          equipment_id: params.id,
          entry_type,
          service_date,
          engineer,
          notes,
          created_by: auth.user.id,
        },
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_username: auth.user.email ? auth.user.email.split("@")[0] : null,
      action: "create",
      entity_type: "equipment_service_log",
      entity_id: data?.id ?? null,
      meta: {
        equipment_id: params.id,
        entry_type,
        service_date,
        engineer,
      },
    });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Bad request" },
      { status: 400 }
    );
  }
}
