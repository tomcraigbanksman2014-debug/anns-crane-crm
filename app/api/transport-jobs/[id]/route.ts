import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const formData = await req.formData();

    const payload = {
      transport_date: String(formData.get("transport_date") ?? "").trim() || null,
      vehicle_id: String(formData.get("vehicle_id") ?? "").trim() || null,
      operator_id: String(formData.get("operator_id") ?? "").trim() || null,
      status: String(formData.get("status") ?? "").trim() || "planned",
      collection_time: String(formData.get("collection_time") ?? "").trim() || null,
      delivery_time: String(formData.get("delivery_time") ?? "").trim() || null,
      collection_address: String(formData.get("collection_address") ?? "").trim() || null,
      delivery_address: String(formData.get("delivery_address") ?? "").trim() || null,
      load_description: String(formData.get("load_description") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("transport_jobs")
      .update(payload)
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
