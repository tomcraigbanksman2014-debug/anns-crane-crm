import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await request.json();

    const { error } = await supabase
      .from("bookings")
      .update({
        client_id: body.client_id ?? null,
        equipment_id: body.equipment_id ?? null,
        start_at: body.start_at ?? null,
        end_at: body.end_at ?? null,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        location: body.location ?? null,
        status: body.status ?? null,
        hire_price: body.hire_price ?? null,
        vat: body.vat ?? null,
        total_invoice: body.total_invoice ?? null,
        payment_received: body.payment_received ?? null,
        invoice_status: body.invoice_status ?? null,
      })
      .eq("id", params.id);

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
      action: "update",
      entity_type: "booking",
      entity_id: params.id,
      meta: {
        client_id: body?.client_id ?? null,
        equipment_id: body?.equipment_id ?? null,
        start_at: body?.start_at ?? null,
        end_at: body?.end_at ?? null,
        location: body?.location ?? null,
        status: body?.status ?? null,
        hire_price: body?.hire_price ?? null,
        total_invoice: body?.total_invoice ?? null,
        invoice_status: body?.invoice_status ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "delete",
      entity_type: "booking",
      entity_id: params.id,
      meta: null,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
