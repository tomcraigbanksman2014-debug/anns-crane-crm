import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { error: "Missing transport job id" },
        { status: 400 }
      );
    }

    // ✅ Cancel transport job (same logic as crane jobs)
    const { error } = await supabase
      .from("transport_jobs")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // ✅ Redirect back to job page
    return NextResponse.redirect(
      new URL(`/transport-jobs/${id}`, req.url)
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}
