import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("jobs")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) {
      const url = new URL(`/jobs/${params.id}?error=${encodeURIComponent(error.message)}`, req.url);
      return NextResponse.redirect(url);
    }

    const url = new URL(`/jobs/${params.id}?success=${encodeURIComponent("Job cancelled.")}`, req.url);
    return NextResponse.redirect(url);
  } catch (e: any) {
    const url = new URL(
      `/jobs/${params.id}?error=${encodeURIComponent(e?.message ?? "Could not cancel job.")}`,
      req.url
    );
    return NextResponse.redirect(url);
  }
}
