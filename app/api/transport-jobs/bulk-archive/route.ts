import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    const archived = !!body?.archived;

    if (ids.length === 0) {
      return NextResponse.json({ error: "No transport job IDs provided." }, { status: 400 });
    }

    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { error } = await supabase
      .from("transport_jobs")
      .update({
        archived,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      count: ids.length,
      archived,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
