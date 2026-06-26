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
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  if (raw.includes("today")) return formatDateOnly(base);
  if (raw.includes("tomorrow")) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return formatDateOnly(d);
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

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

function buildInternalNote(transcript: any, clientName: string | null) {
  const actions = safeArrayOfText(transcript.action_points);
  return [
    `Created from call summary${clientName ? ` for ${clientName}` : ""}.`,
    transcript.summary ? `Summary: ${transcript.summary}` : null,
    transcript.job_requirements ? `Requirements: ${transcript.job_requirements}` : null,
    transcript.detected_job_date ? `Date/time heard: ${transcript.detected_job_date}` : null,
    transcript.detected_site_address ? `Site/address heard: ${transcript.detected_site_address}` : null,
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
      return NextResponse.json({ error: "Link this call to a customer before creating a crane job." }, { status: 400 });
    }

    const { data: client, error: clientError } = await auth.admin
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, notes")
      .eq("id", transcript.matched_client_id)
      .single();

    if (clientError || !client?.id) {
      return NextResponse.json({ error: clientError?.message || "Customer not found." }, { status: 404 });
    }

    const jobDate = parseCallDate(transcript.detected_job_date, transcript.created_at);
    if (!jobDate) {
      return NextResponse.json({ error: "I could not detect a job date. Edit the Date/time heard field first, then create the crane job." }, { status: 400 });
    }

    const contactName = firstNonEmpty(transcript.detected_contact_name, client.contact_name);
    const contactPhone = firstNonEmpty(transcript.phone_number, transcript.detected_phone_numbers?.[0], client.phone);

    if (!contactName || !contactPhone) {
      return NextResponse.json({ error: "Contact name and number are required. Edit the call details first, then create the crane job." }, { status: 400 });
    }

    const internalNote = buildInternalNote(transcript, client.company_name ?? null);
    const siteName = firstNonEmpty(transcript.detected_site_address, transcript.job_requirements, transcript.summary, `${client.company_name} call enquiry`);

    const payload = {
      client_id: client.id,
      site_name: siteName?.slice(0, 180) ?? null,
      site_address: cleanText(transcript.detected_site_address),
      contact_name: contactName,
      contact_phone: contactPhone,
      job_date: jobDate,
      start_date: jobDate,
      end_date: jobDate,
      start_time: null,
      end_time: null,
      status: "draft",
      hire_type: String(transcript.job_requirements ?? transcript.summary ?? "").toLowerCase().includes("contract lift") ? "CONTRACT LIFT" : null,
      lift_type: cleanText(transcript.detected_job_type) === "crane" ? null : cleanText(transcript.detected_job_type),
      notes: null,
      internal_notes: internalNote,
      created_by: auth.user.id,
      archived: false,
      updated_at: new Date().toISOString(),
    };

    const { data: job, error: insertError } = await auth.admin
      .from("jobs")
      .insert(payload)
      .select("id, job_number")
      .single();

    if (insertError || !job?.id) {
      return NextResponse.json({ error: insertError?.message || "Could not create crane job." }, { status: 400 });
    }

    await appendCustomerNote(auth.admin, client, internalNote, transcript.id);

    const { data: updatedTranscript } = await auth.admin
      .from("call_transcripts")
      .update({
        matched_job_id: job.id,
        status: "crane_job_created",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcript.id)
      .select("*")
      .single();

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      job_number: job.job_number ?? null,
      transcript: updatedTranscript ?? transcript,
      message: `Crane job${job.job_number ? ` #${job.job_number}` : ""} created from call summary.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not create crane job from call." }, { status: 500 });
  }
}
