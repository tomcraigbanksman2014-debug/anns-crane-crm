import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { assertOperatorAvailable } from "../../../lib/staffAvailability";
import { hasRequiredTransportJobSiteContact, TRANSPORT_JOB_SITE_CONTACT_ERROR } from "../../../lib/jobContactValidation";

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

    const { supabase, response } = await requireApiUser();
    if (response) return response;

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

    if (!hasRequiredTransportJobSiteContact(job)) {
      return NextResponse.json(
        { error: `${TRANSPORT_JOB_SITE_CONTACT_ERROR} Add the pickup / site contact to the original transport job before duplicating it.` },
        { status: 400 }
      );
    }

    const transportDate = String(job.transport_date ?? "").trim();

    if (job.operator_id && transportDate) {
      await assertOperatorAvailable(supabase, {
        operatorId: job.operator_id,
        startDate: transportDate,
        endDate: transportDate,
        startTime: job.collection_time ?? null,
        endTime: job.delivery_time ?? null,
      });
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
