import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Missing transport job id" }, { status: 400 });
    }

    const formData = await req.formData().catch(() => null);
    const cancelMode = String(formData?.get("cancel_mode") ?? "").trim().toLowerCase();
    const nextStatus = cancelMode === "late_cancelled" ? "late_cancelled" : "cancelled";

    const updatePayload: Record<string, any> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (nextStatus === "late_cancelled") {
      updatePayload.invoice_status = "Not Invoiced";
    }

    const { error } = await supabase
      .from("transport_jobs")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.redirect(new URL(`/transport-jobs/${id}`, req.url));
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Cancel failed" }, { status: 500 });
  }
}
