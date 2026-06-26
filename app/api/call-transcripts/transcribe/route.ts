import { NextResponse } from "next/server";
import {
  cleanText,
  companyLooksSame,
  phoneDigits,
  phoneLooksSame,
  requireMasterCallTranscriptUser,
  safeArrayOfText,
  safeJsonParse,
} from "../../../lib/callTranscripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchResult = {
  clientId: string | null;
  clientName: string | null;
  jobId: string | null;
  transportJobId: string | null;
  confidence: "none" | "possible" | "strong";
  reason: string | null;
};

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function toStringArray(value: unknown) {
  return safeArrayOfText(value);
}

function truthyFormValue(value: FormDataEntryValue | null) {
  return ["1", "true", "yes", "on", "full"].includes(String(value ?? "").trim().toLowerCase());
}

async function transcribeAudio(audio: File) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing in Vercel environment variables.");
  }

  const form = new FormData();
  form.append("file", audio, audio.name || "call-recording.webm");
  form.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error?.message || "OpenAI transcription failed.");
  }

  return String(data?.text ?? "").trim();
}

async function summariseTranscript(transcript: string, phoneNumber: string | null, direction: string | null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing in Vercel environment variables.");
  }

  if (!transcript.trim()) {
    return {
      summary: "No clear speech was detected.",
      job_requirements: "",
      action_points: ["Review call audio/source if available."],
      detected_customer_name: null,
      detected_contact_name: null,
      detected_phone_numbers: [],
      detected_site_address: null,
      detected_job_date: null,
      detected_job_type: "unknown",
    };
  }

  const prompt = `You are helping AnnS Crane Hire process a phone call.

Return JSON only with these exact keys:
summary: clear short call summary in plain English.
job_requirements: any crane/transport/job requirements mentioned. Include crane size, HIAB, transport, collection/delivery, weight, dates, times, site details, price/quote needs if heard.
action_points: array of practical next actions. ALWAYS include at least one action if any job, quote, hire, crane or transport requirement is mentioned. Examples: "Create draft crane job for Wednesday", "Create transport job and confirm collection address", "Call back with price".
detected_customer_name: likely company/customer name, if mentioned.
detected_contact_name: likely person/contact name, if mentioned. Do not assume Tom is the customer contact just because Tom is speaking.
detected_phone_numbers: array of phone numbers mentioned or known.
detected_site_address: site/collection/delivery address, if mentioned.
detected_job_date: date/time needed, if mentioned. Keep relative wording like Wednesday/tomorrow if that is all that was said.
detected_job_type: one of crane, transport, hiab, low loader, spider crane, contract lift, quote, enquiry, unknown.

Known call direction: ${direction || "unknown"}.
Known clicked/caller phone: ${phoneNumber || "unknown"}.

Important AnnS Crane Hire examples:
- "40 ton crane", "80t", "spider", "Jekko", "contract lift", "CPA" = crane job.
- "HIAB", "low loader", "trailer", "collect", "deliver", "transport", "forklift", "container", "cabin" = transport job.

Transcript:
${transcript}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You extract structured CRM notes and suggested next actions from calls for a crane hire and transport business. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      summary: transcript.slice(0, 800),
      job_requirements: "",
      action_points: ["Review call summary and add follow-up notes."],
      detected_customer_name: null,
      detected_contact_name: null,
      detected_phone_numbers: phoneNumber ? [phoneNumber] : [],
      detected_site_address: null,
      detected_job_date: null,
      detected_job_type: "unknown",
    };
  }

  const parsed = safeJsonParse(String(data?.choices?.[0]?.message?.content ?? "")) ?? {};
  const actionPoints = toStringArray((parsed as any).action_points);
  const jobType = cleanText((parsed as any).detected_job_type) || "unknown";
  const requirements = cleanText((parsed as any).job_requirements) || "";
  const summary = cleanText((parsed as any).summary) || transcript.slice(0, 800);

  const fallbackActionPoints = (() => {
    const text = `${jobType} ${requirements} ${summary}`.toLowerCase();
    if (actionPoints.length) return actionPoints;
    if (/(transport|hiab|low loader|collection|delivery|trailer|move|forklift|container|cabin)/.test(text)) {
      return ["Create draft transport job from this call and confirm any missing collection/delivery details."];
    }
    if (/(crane|lift|spider|jekko|contract lift|cpa|ton crane|40 ton|60 ton|80 ton)/.test(text)) {
      return ["Create draft crane job from this call and confirm any missing site/lift details."];
    }
    if (/(quote|price|cost|rate|enquiry)/.test(text)) return ["Follow up with pricing or quote details."];
    return [];
  })();

  return {
    summary,
    job_requirements: requirements,
    action_points: fallbackActionPoints,
    detected_customer_name: cleanText((parsed as any).detected_customer_name),
    detected_contact_name: cleanText((parsed as any).detected_contact_name),
    detected_phone_numbers: toStringArray((parsed as any).detected_phone_numbers),
    detected_site_address: cleanText((parsed as any).detected_site_address),
    detected_job_date: cleanText((parsed as any).detected_job_date),
    detected_job_type: jobType,
  };
}

async function findBestMatch(admin: any, opts: {
  phoneNumber: string | null;
  detectedPhones: string[];
  detectedCustomerName: string | null;
  transcript: string;
}): Promise<MatchResult> {
  const allPhones = [opts.phoneNumber, ...opts.detectedPhones].filter(Boolean) as string[];
  const transcript = String(opts.transcript ?? "").toLowerCase();

  const [clientsRes, jobsRes, transportsRes] = await Promise.all([
    admin.from("clients").select("id, company_name, contact_name, phone, email, archived").or("archived.is.null,archived.eq.false").limit(5000),
    admin.from("jobs").select("id, job_number, job_date, customer_id, customer_name, site_name, site_address, contact_name, contact_phone, archived").or("archived.is.null,archived.eq.false").order("job_date", { ascending: false }).limit(5000),
    admin.from("transport_jobs").select("id, transport_number, transport_date, delivery_date, customer_id, customer_name, collection_address, delivery_address, collection_contact_name, collection_contact_phone, delivery_contact_name, delivery_contact_phone, archived").or("archived.is.null,archived.eq.false").order("transport_date", { ascending: false }).limit(5000),
  ]);

  const clients = clientsRes.data ?? [];
  const jobs = jobsRes.data ?? [];
  const transports = transportsRes.data ?? [];

  const phoneMatchClient = clients.find((client: any) => allPhones.some((phone) => phoneLooksSame(phone, client.phone)));
  if (phoneMatchClient?.id) {
    return { clientId: phoneMatchClient.id, clientName: phoneMatchClient.company_name ?? null, jobId: null, transportJobId: null, confidence: "strong", reason: "Matched customer account phone number." };
  }

  const phoneMatchJob = jobs.find((job: any) => allPhones.some((phone) => phoneLooksSame(phone, job.contact_phone)));
  if (phoneMatchJob?.id) {
    return { clientId: phoneMatchJob.customer_id ?? null, clientName: firstNonEmpty(phoneMatchJob.customer_name, phoneMatchJob.site_name), jobId: phoneMatchJob.id, transportJobId: null, confidence: "strong", reason: `Matched crane job contact phone${phoneMatchJob.job_number ? ` on job ${phoneMatchJob.job_number}` : ""}.` };
  }

  const phoneMatchTransport = transports.find((job: any) => allPhones.some((phone) => phoneLooksSame(phone, job.collection_contact_phone) || phoneLooksSame(phone, job.delivery_contact_phone)));
  if (phoneMatchTransport?.id) {
    return { clientId: phoneMatchTransport.customer_id ?? null, clientName: phoneMatchTransport.customer_name ?? null, jobId: null, transportJobId: phoneMatchTransport.id, confidence: "strong", reason: `Matched transport job contact phone${phoneMatchTransport.transport_number ? ` on transport job ${phoneMatchTransport.transport_number}` : ""}.` };
  }

  if (opts.detectedCustomerName) {
    const companyMatch = clients.find((client: any) => companyLooksSame(client.company_name, opts.detectedCustomerName));
    if (companyMatch?.id) {
      return { clientId: companyMatch.id, clientName: companyMatch.company_name ?? null, jobId: null, transportJobId: null, confidence: "possible", reason: "Possible customer match from company name heard in the call." };
    }
  }

  const transcriptCompanyMatch = clients.find((client: any) => {
    const company = String(client.company_name ?? "").trim().toLowerCase();
    return company.length > 3 && transcript.includes(company);
  });

  if (transcriptCompanyMatch?.id) {
    return { clientId: transcriptCompanyMatch.id, clientName: transcriptCompanyMatch.company_name ?? null, jobId: null, transportJobId: null, confidence: "possible", reason: "Possible customer match from company name in transcript." };
  }

  return { clientId: null, clientName: null, jobId: null, transportJobId: null, confidence: "none", reason: null };
}

export async function POST(req: Request) {
  const auth = await requireMasterCallTranscriptUser();
  if (auth.ok === false) return auth.response;

  try {
    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Missing audio recording." }, { status: 400 });
    }

    const direction = cleanText(formData.get("direction")) || "unknown";
    const phoneNumber = cleanText(formData.get("phone_number"));
    const pagePath = cleanText(formData.get("page_path"));
    const sourceContext = cleanText(formData.get("source_context"));
    const saveFullTranscript = truthyFormValue(formData.get("save_full_transcript"));

    const transcript = await transcribeAudio(audio);
    const extracted = await summariseTranscript(transcript, phoneNumber, direction);
    const match = await findBestMatch(auth.admin, {
      phoneNumber,
      detectedPhones: extracted.detected_phone_numbers,
      detectedCustomerName: extracted.detected_customer_name,
      transcript,
    });

    const payload = {
      created_by: auth.user.id,
      created_by_email: auth.user.email ?? null,
      call_direction: direction,
      phone_number: phoneNumber,
      phone_number_digits: phoneDigits(phoneNumber),
      page_path: pagePath,
      source_context: sourceContext,
      transcript: saveFullTranscript ? transcript : null,
      summary: extracted.summary,
      job_requirements: extracted.job_requirements,
      action_points: extracted.action_points,
      detected_customer_name: extracted.detected_customer_name,
      detected_contact_name: extracted.detected_contact_name,
      detected_phone_numbers: extracted.detected_phone_numbers,
      detected_site_address: extracted.detected_site_address,
      detected_job_date: extracted.detected_job_date,
      detected_job_type: extracted.detected_job_type,
      matched_client_id: match.clientId,
      matched_client_name: match.clientName,
      matched_job_id: match.jobId,
      matched_transport_job_id: match.transportJobId,
      match_confidence: match.confidence,
      match_reason: match.reason,
      status: saveFullTranscript ? "transcribed" : "summary_only",
    };

    const { data, error } = await auth.admin.from("call_transcripts").insert(payload).select("*").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, transcript: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to transcribe call." }, { status: 500 });
  }
}
