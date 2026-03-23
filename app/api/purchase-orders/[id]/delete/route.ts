import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(
        new URL(
          `/purchase-orders?error=${encodeURIComponent("You must be signed in.")}`,
          req.url
        )
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("purchase_orders")
      .select("id, po_number, supplier_id, job_id, transport_job_id")
      .eq("id", params.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.redirect(
        new URL(
          `/purchase-orders?error=${encodeURIComponent("Purchase order not found.")}`,
          req.url
        )
      );
    }

    const { error: lineDeleteError } = await supabase
      .from("purchase_order_lines")
      .delete()
      .eq("purchase_order_id", params.id);

    if (lineDeleteError) {
      return NextResponse.redirect(
        new URL(
          `/purchase-orders?error=${encodeURIComponent(lineDeleteError.message)}`,
          req.url
        )
      );
    }

    const { error: deleteError } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", params.id);

    if (deleteError) {
      return NextResponse.redirect(
        new URL(
          `/purchase-orders?error=${encodeURIComponent(deleteError.message)}`,
          req.url
        )
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "purchase_order_deleted",
      entity_type: "purchase_order",
      entity_id: params.id,
      meta: {
        po_number: existing.po_number,
        supplier_id: existing.supplier_id,
        job_id: existing.job_id,
        transport_job_id: existing.transport_job_id,
      },
    });

    return NextResponse.redirect(
      new URL(
        `/purchase-orders?success=${encodeURIComponent(
          `Purchase order ${existing.po_number ?? ""} deleted.`
        )}`,
        req.url
      )
    );
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(
        `/purchase-orders?error=${encodeURIComponent(
          e?.message ?? "Could not delete purchase order."
        )}`,
        req.url
      )
    );
  }
}
