import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { geocodeAddress } from "../../../lib/geocode";
import { assertOperatorAvailable } from "../../../lib/staffAvailability";

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
      return NextResponse.json({ error: "Crane job ID is required." }, { status: 400 });
    }

    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { data: job, error: readError } = await supabase
      .from("jobs")
      .select(`
        id,
        client_id,
        operator_id,
        job_date,
        start_time,
        end_time,
        site_name,
        site_address,
        notes
      `)
      .eq("id", jobId)
      .single();

    if (readError || !job) {
      return NextResponse.json(
        { error: readError?.message || "Crane job not found." },
        { status: 404 }
      );
    }

    if (job.operator_id && job.job_date) {
      await assertOperatorAvailable(supabase, {
        operatorId: job.operator_id,
        startDate: job.job_date,
        endDate: job.job_date,
        startTime: job.start_time,
        endTime: job.end_time,
      });
    }

    const pickupAddress = String(job.site_address ?? "").trim();
    const deliveryAddress = String(job.site_address ?? "").trim();

    const pickupCoords = pickupAddress ? await geocodeAddress(pickupAddress) : null;
    const deliveryCoords = deliveryAddress ? await geocodeAddress(deliveryAddress) : null;

    const insertRow = {
      transport_number: makeTransportNumber(),
      linked_job_id: job.id,
      client_id: job.client_id ?? null,
      operator_id: job.operator_id ?? null,
      vehicle_id: null,
      job_type: "crane_support",
      collection_address: pickupAddress || null,
      delivery_address: deliveryAddress || null,
      collection_lat: pickupCoords?.lat ?? null,
      collection_lng: pickupCoords?.lng ?? null,
      delivery_lat: deliveryCoords?.lat ?? null,
      delivery_lng: deliveryCoords?.lng ?? null,
      transport_date: job.job_date ?? null,
      collection_time: job.start_time ?? null,
      delivery_time: job.end_time ?? null,
      load_description: job.site_name
        ? `Linked crane job: ${job.site_name}`
        : "Linked crane support transport",
      status: "planned",
      price: 0,
      notes: job.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("transport_jobs")
      .insert(insertRow)
      .select("id, transport_number")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Could not create transport job." },
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
