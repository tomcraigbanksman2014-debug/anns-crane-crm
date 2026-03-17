import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: any) {
  const supabase = createSupabaseServerClient();
  const formData = await req.formData();

  const payload = {
    vehicle_id: formData.get("vehicle_id"),
    operator_id: formData.get("operator_id"),
    status: formData.get("status"),
    collection_time: formData.get("collection_time"),
    delivery_time: formData.get("delivery_time"),
    notes: formData.get("notes"),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("transport_jobs")
    .update(payload)
    .eq("id", params.id);

  return NextResponse.json({ success: true });
}
