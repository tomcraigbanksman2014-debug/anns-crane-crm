import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function resolveCancelStatus(cancelMode: string | null) {
  const mode = String(cancelMode ?? "").trim().toLowerCase();

  if (mode === "provisional") return "provisional";
  if (mode === "late_cancelled") return "late_cancelled";
  return "cancelled";
}

function successMessageFor(status: string) {
  if (status === "provisional") return "Job marked as provisional / pencilled.";
  if (status === "late_cancelled") return "Job marked as late cancelled.";
  return "Job cancelled.";
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const formData = await req.formData().catch(() => null);
    const cancelMode = formData ? String(formData.get("cancel_mode") ?? "") : "";
    const status = resolveCancelStatus(cancelMode);

    const { error } = await supabase
      .from("jobs")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) {
      const url = new URL(`/jobs/${params.id}?error=${encodeURIComponent(error.message)}`, req.url);
      return NextResponse.redirect(url);
    }

    const url = new URL(
      `/jobs/${params.id}?success=${encodeURIComponent(successMessageFor(status))}`,
      req.url
    );
    return NextResponse.redirect(url);
  } catch (e: any) {
    const url = new URL(
      `/jobs/${params.id}?error=${encodeURIComponent(e?.message ?? "Could not update job status.")}`,
      req.url
    );
    return NextResponse.redirect(url);
  }
}
