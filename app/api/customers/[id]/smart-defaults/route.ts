import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function mostCommon(values: unknown[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const text = clean(value);
    if (!text) continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;

  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });

  return best;
}

function latestNonEmpty(rows: any[], key: string) {
  for (const row of rows) {
    const value = clean(row?.[key]);
    if (value) return value;
  }
  return null;
}

function numericMostCommon(values: unknown[]) {
  const value = mostCommon(values.map((item) => (item === null || item === undefined ? null : String(item))));
  return value;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const customerId = clean(params.id);
    if (!customerId) return NextResponse.json({ error: "Customer id is required." }, { status: 400 });

    const [clientRes, jobsRes, transportRes] = await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .eq("id", customerId)
        .maybeSingle(),
      supabase
        .from("jobs")
        .select("*")
        .eq("client_id", customerId)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("transport_jobs")
        .select("*")
        .eq("client_id", customerId)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (clientRes.error) return NextResponse.json({ error: clientRes.error.message }, { status: 400 });
    if (jobsRes.error) return NextResponse.json({ error: jobsRes.error.message }, { status: 400 });
    if (transportRes.error) return NextResponse.json({ error: transportRes.error.message }, { status: 400 });

    const client = clientRes.data ?? {};
    const jobs = jobsRes.data ?? [];
    const transports = transportRes.data ?? [];

    const jobSuggestions = {
      contact_name: clean(client.contact_name) || latestNonEmpty(jobs, "contact_name"),
      contact_phone: clean(client.phone) || latestNonEmpty(jobs, "contact_phone"),
      invoice_email: clean(client.email) || latestNonEmpty(jobs, "invoice_email"),
      site_address: mostCommon(jobs.map((row: any) => row.site_address ?? row.site_name)),
      site_name: mostCommon(jobs.map((row: any) => row.site_name)),
      hire_type: mostCommon(jobs.map((row: any) => row.hire_type)),
      lift_type: mostCommon(jobs.map((row: any) => row.lift_type)),
      primary_equipment_selection: numericMostCommon(jobs.map((row: any) => row.crane_id).filter(Boolean).map((id: any) => `crane:${id}`)),
      notes: latestNonEmpty(jobs, "notes"),
      price_per_day: numericMostCommon(jobs.map((row: any) => row.price_per_day)),
      price_mode: mostCommon(jobs.map((row: any) => row.price_mode)),
    };

    const transportSuggestions = {
      collection_contact_name: clean(client.contact_name) || latestNonEmpty(transports, "collection_contact_name"),
      collection_contact_phone: clean(client.phone) || latestNonEmpty(transports, "collection_contact_phone"),
      delivery_contact_name: latestNonEmpty(transports, "delivery_contact_name"),
      delivery_contact_phone: latestNonEmpty(transports, "delivery_contact_phone"),
      invoice_email: clean(client.email) || latestNonEmpty(transports, "invoice_email"),
      collection_address: mostCommon(transports.map((row: any) => row.collection_address)),
      delivery_address: mostCommon(transports.map((row: any) => row.delivery_address)),
      vehicle_id: mostCommon(transports.map((row: any) => row.vehicle_id)),
      notes: latestNonEmpty(transports, "notes"),
      price_per_day: numericMostCommon(transports.map((row: any) => row.price_per_day)),
      price_mode: mostCommon(transports.map((row: any) => row.price_mode)),
      service_type: "HIAB / low loader / transport",
    };

    return NextResponse.json({
      ok: true,
      customer: {
        id: client.id,
        company_name: client.company_name ?? null,
      },
      has_crane_history: jobs.length > 0,
      has_transport_history: transports.length > 0,
      job: jobSuggestions,
      transport: transportSuggestions,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load customer smart defaults." }, { status: 400 });
  }
}
