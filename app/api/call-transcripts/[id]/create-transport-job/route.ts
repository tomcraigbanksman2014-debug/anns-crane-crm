import { NextResponse } from "next/server";
import { cleanText, requireMasterCallTranscriptUser, safeArrayOfText } from "../../../../lib/callTranscripts";

export const dynamic = "force-dynamic";

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseCallDate(value: unknown, createdAt: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  const base = createdAt ? new Date(String(createdAt)) : new Date();
  if (Number.isNaN(base.getTime())) base.setTime(Date.now());

  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;

  const uk = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (uk) {
    const day = Number(uk[1]);
    const month = Number(uk[2]);
    const yearRaw = uk[3] ? Number(uk[3]) : base.getFullYear();
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  if (raw.includes("today")) return formatDateOnly(base);
  if (raw.includes("tomorrow")) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return formatDateOnly(d);
  }

  const weekdays: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  for (const [name, day] of Object.entries(weekdays)) {
    if (raw.includes(name)) {
      const d = new Date(base);
      let delta = (day - d.getDay() + 7) % 7;
      if (delta === 0 || raw.includes(`next ${name}`)) delta += 7;
      d.setDate(d.getDate() + delta);
      return formatDateOnly(d);
    }
  }

  return null;
}

function inferTransportJobType(transcript: any) {
  const text = `${transcript.detected_job_type ?? ""} ${transcript.job_requirements ?? ""} ${transcript.summary ?? ""}`.toLowerCase();
  if (text.includes("hiab")) return "on_site_hiab";
  if (text.includes("delivery") || text.includes("deliver")) return "delivery";
  if (text.includes("collection") || text.includes("collect")) return "collection";
  if (text.includes("ballast")) return "ballast";
  if (text.includes("crane support")) return "crane_support";
  return "haulage";
}

function buildInternalNote(transcript: any, clientName: string | null) {
  const actions = safeArrayOfText(transcript.action_points);
  return [
    `Created from call summary${clientName ? ` for ${clientName}` : ""}.`,
    transcript.summary ? `Summary: ${transcript.summary}` : null,
    transcript.job_requirements ? `Requirements: ${transcript.job_requirements}` : null,
    transcript.detected_job_date ? `Date/time heard: ${transcript.detected_job_date}` : null,
    transcript.detected_site_address ? `Address heard: ${transcript.detected_site_address}` : null,
    transcript.detected_contact_name ? `Contact heard: ${transcript.detected_contact_name}` : null,
    transcript.phone_number ? `Call number: ${transcript.phone_number}` : null,
    actions.length ? `Actions:\n${actions.map((item) => `- ${item}`).join("\n")}` : null,
  ].filter(Boolean).join("\n\n");
}

async function appendCustomerNote(admin: any, client: any, note: string, transcriptId: string) {
  const marker = `Call transcript ${transcriptId}`;
  const existing = String(client.notes ?? "");
  if (existing.includes(marker)) return;

  const datedNote = `[${new Date().toLocaleDateString("en-GB")}] ${marker}\n${note}`;
  const nextNotes = existing.trim() ? `${existing.trim()}\n\n---\n${datedNote}` : datedNote;

  await admin.from("clients").update({ notes: nextNotes }).eq("id", client.id);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireMasterCallTranscriptUser();
  if (auth.ok === false) return auth.response;

  try {
    const { data: transcript, error: transcriptError } = await auth.admin
      .from("call_transcripts")
      .select("*")
      .eq("id", params.id)
      .single();

    if (transcriptError || !transcript?.id) {
      return NextResponse.json({ error: transcriptError?.message || "Call summary not found." }, { status: 404 });
    }

    if (!transcript.matched_client_id) {
      return NextResponse.json({ error: "Link this call to a customer before creating a transport job." }, { status: 400 });
    }

    const { data: client, error: clientError } = await auth.admin
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, notes")
      .eq("id", transcript.matched_client_id)
      .single();

    if (clientError || !client?.id) {
      return NextResponse.json({ error: clientError?.message || "Customer not found." }, { status: 404 });
    }

    const transportDate = parseCallDate(transcript.detected_job_date, transcript.created_at);
    if (!transportDate) {
      return NextResponse.json({ error: "I could not detect a transport date. Edit the Date/time heard field first, then create the transport job." }, { status: 400 });
    }

    const contactName = firstNonEmpty(transcript.detected_contact_name, client.contact_name);
    const contactPhone = firstNonEmpty(transcript.phone_number, transcript.detected_phone_numbers?.[0], client.phone);

    if (!contactName || !contactPhone) {
      return NextResponse.json({ error: "Pickup/site contact name and number are required. Edit the call details first, then create the transport job." }, { status: 400 });
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const internalNote = buildInternalNote(transcript, client.company_name ?? null);

    const payload = {
      transport_number: `TR-${stamp}`,
      client_id: client.id,
      vehicle_id: null,
      operator_id: null,
      job_type: inferTransportJobType(transcript),
      collection_address: cleanText(transcript.detected_site_address),
      delivery_address: null,
      transport_date: transportDate,
      delivery_date: transportDate,
      collection_time: null,
      delivery_time: null,
      load_description: firstNonEmpty(transcript.job_requirements, transcript.summary),
      notes: null,
      internal_notes: internalNote,
      price: 0,
      agreed_sell_rate: 0,
      invoice_status: "Not Invoiced",
      invoice_subtotal: 0,
      invoice_vat: 0,
      total_invoice: 0,
      abnormal_load_enabled: false,
      collection_contact_name: contactName,
      collection_contact_phone: contactPhone,
      delivery_contact_name: null,
      delivery_contact_phone: null,
      submission_status: "not_started",
      approval_status: "not_started",
      status: "planned",
      created_by: auth.user.id,
      archived: false,
      updated_at: new Date().toISOString(),
    };

    const { data: transportJob, error: insertError } = await auth.admin
      .from("transport_jobs")
      .insert(payload)
      .select("id, transport_number")
      .single();

    if (insertError || !transportJob?.id) {
      return NextResponse.json({ error: insertError?.message || "Could not create transport job." }, { status: 400 });
    }

    await appendCustomerNote(auth.admin, client, internalNote, transcript.id);

    const { data: updatedTranscript } = await auth.admin
      .from("call_transcripts")
      .update({
        matched_transport_job_id: transportJob.id,
        status: "transport_job_created",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcript.id)
      .select("*")
      .single();

    return NextResponse.json({
      ok: true,
      transport_job_id: transportJob.id,
      transport_number: transportJob.transport_number ?? null,
      transcript: updatedTranscript ?? transcript,
      message: `Transport job ${transportJob.transport_number ?? ""} created from call summary.`.trim(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not create transport job from call." }, { status: 500 });
  }
}
