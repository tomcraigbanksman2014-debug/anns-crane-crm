import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const jobId = String(body?.job_id ?? "").trim();
    const archived = !!body?.archived;

    if (!jobId) {
      return NextResponse.json({ error: "Transport job ID is required." }, { status: 400 });
    }

    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { error } = await supabase
      .from("transport_jobs")
      .update({
        archived,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, archived });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
