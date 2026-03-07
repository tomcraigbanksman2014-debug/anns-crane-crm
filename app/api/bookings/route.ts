import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();

    const { data, error } = await supabase
      .from("bookings")
      .insert([body])
      .select("id")
      .single();

    if (error) {
      if ((error as any).code === "23P01") {
        return NextResponse.json(
          { error: "That equipment is already booked for the selected time range." },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "create",
      entity_type: "booking",
      entity_id: data?.id ?? null,
      meta: {
        client_id: body?.client_id ?? null,
        equipment_id: body?.equipment_id ?? null,
        start_at: body?.start_at ?? null,
        end_at: body?.end_at ?? null,
        location: body?.location ?? null,
        status: body?.status ?? null,
        total_invoice: body?.total_invoice ?? null,
      },
    });

    return NextResponse.json({ success: true, id: data?.id });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
