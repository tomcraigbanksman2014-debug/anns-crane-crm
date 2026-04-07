import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function makeJobTimestamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ss = `${d.getSeconds()}`.padStart(2, "0");
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const jobId = String(body?.job_id ?? "").trim();

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
    }

    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { data: job, error: readError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (readError || !job) {
      return NextResponse.json(
        { error: readError?.message || "Job not found." },
        { status: 404 }
      );
    }

    const { data: allocations } = await supabase
      .from("job_equipment")
      .select("*")
      .eq("job_id", jobId);

    const insertRow: Record<string, any> = { ...job };

    delete insertRow.id;
    delete insertRow.job_number;
    delete insertRow.created_at;
    delete insertRow.updated_at;

    insertRow.status = "draft";
    insertRow.updated_at = new Date().toISOString();
    insertRow.notes = [job.notes ?? "", `Duplicated from job ${job.job_number ?? ""} on ${makeJobTimestamp()}`]
      .filter(Boolean)
      .join("\n");

    const { data: createdJob, error: createError } = await supabase
      .from("jobs")
      .insert(insertRow)
      .select("id, job_number")
      .single();

    if (createError || !createdJob) {
      return NextResponse.json(
        { error: createError?.message || "Could not duplicate job." },
        { status: 400 }
      );
    }

    if ((allocations ?? []).length > 0) {
      const duplicatedAllocations = (allocations ?? []).map((row: any) => {
        const next = { ...row };
        delete next.id;
        delete next.created_at;
        delete next.updated_at;
        next.job_id = createdJob.id;
        next.updated_at = new Date().toISOString();
        return next;
      });

      const { error: allocError } = await supabase
        .from("job_equipment")
        .insert(duplicatedAllocations);

      if (allocError) {
        return NextResponse.json(
          { error: allocError.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ job: createdJob });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
