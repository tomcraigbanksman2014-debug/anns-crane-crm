import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function makeTransportNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ss = `${d.getSeconds()}`.padStart(2, "0");
  return `TR-${y}${m}${day}-${hh}${mm}${ss}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const jobId = String(body?.job_id ?? "").trim();

    if (!jobId) {
      return NextResponse.json({ error: "Transport job ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: job, error: readError } = await supabase
      .from("transport_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (readError || !job) {
      return NextResponse.json(
        { error: readError?.message || "Transport job not found." },
        { status: 404 }
      );
    }

    const insertRow: Record<string, any> = { ...job };

    delete insertRow.id;
    delete insertRow.created_at;
    delete insertRow.updated_at;

    insertRow.transport_number = makeTransportNumber();
    insertRow.status = "planned";
    insertRow.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("transport_jobs")
      .insert(insertRow)
      .select("id, transport_number")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Could not duplicate transport job." },
        { status: 400 }
      );
    }

    return NextResponse.json({ job: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
