import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";
import { generateSalesDraftWithFallback } from "../../../../lib/ai/sales";

type Channel = "email" | "text" | "linkedin";
type Goal = "introduction" | "follow_up" | "reactivation" | "availability";
type Tone = "professional" | "friendly" | "direct";

type Payload = {
  channel?: Channel;
  goal?: Goal;
  tone?: Tone;
  service_focus?: string | null;
  availability_note?: string | null;
  custom_cta?: string | null;
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function normaliseChannel(value: unknown): Channel {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "text" || v === "linkedin") return v;
  return "email";
}

function normaliseGoal(value: unknown): Goal {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "follow_up" || v === "reactivation" || v === "availability") return v;
  return "introduction";
}

function normaliseTone(value: unknown): Tone {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "friendly" || v === "direct") return v;
  return "professional";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB");
}

function inferServiceFocus(args: {
  requestedServiceFocus: string | null;
  jobsCount: number;
  transportCount: number;
  notes: string | null;
}) {
  if (args.requestedServiceFocus) return args.requestedServiceFocus;

  const notes = String(args.notes ?? "").toLowerCase();

  if (args.jobsCount > 0 && args.transportCount > 0) {
    return "crane hire, contract lifts and HIAB transport";
  }

  if (args.transportCount > 0) {
    if (notes.includes("container")) return "HIAB transport and container movements";
    if (notes.includes("machinery")) return "HIAB transport and machinery moves";
    return "HIAB transport and transport support";
  }

  if (args.jobsCount > 0) {
    if (notes.includes("spider")) return "spider crane hire and restricted-access lifting";
    if (notes.includes("contract lift")) return "contract lifts and crane hire";
    return "crane hire and lifting support";
  }

  return "crane hire and transport support";
}

function buildBodyHint(args: {
  companyName: string;
  jobsCount: number;
  transportCount: number;
  quoteCount: number;
  correspondenceCount: number;
  lastJobDate: string | null;
  lastTransportDate: string | null;
  lastContactDate: string | null;
}) {
  const lines = [
    `${args.companyName} is an existing customer, not a cold lead.`,
    `Previous relationship summary: ${args.jobsCount} crane jobs, ${args.transportCount} transport jobs, ${args.quoteCount} quotes, ${args.correspondenceCount} correspondence entries logged.`,
    args.lastJobDate ? `Most recent crane job: ${args.lastJobDate}.` : "",
    args.lastTransportDate ? `Most recent transport job: ${args.lastTransportDate}.` : "",
    args.lastContactDate ? `Most recent logged contact: ${args.lastContactDate}.` : "",
    "Write the message like a returning-customer check-in or reactivation, not a first introduction unless the goal clearly requires that style.",
    "Keep it commercially useful, warm and professional.",
  ].filter(Boolean);

  return lines.join(" ");
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [customerRes, jobsRes, transportRes, quotesRes, correspondenceRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, company_name, contact_name, email, phone, address, notes")
        .eq("id", params.id)
        .single(),
      supabase
        .from("jobs")
        .select("id, job_date, start_date, end_date, status, site_name, notes, created_at")
        .eq("client_id", params.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("transport_jobs")
        .select("id, transport_date, delivery_date, status, load_description, notes, created_at")
        .eq("client_id", params.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("quotes")
        .select("id")
        .eq("client_id", params.id),
      supabase
        .from("customer_correspondence")
        .select("id, created_at")
        .eq("client_id", params.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (customerRes.error || !customerRes.data) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const customer = customerRes.data;
    const jobs = jobsRes.data ?? [];
    const transportJobs = transportRes.data ?? [];
    const quotes = quotesRes.data ?? [];
    const correspondence = correspondenceRes.data ?? [];

    const body = (await req.json().catch(() => ({}))) as Payload;

    const channel = normaliseChannel(body.channel);
    const goal = normaliseGoal(body.goal);
    const tone = normaliseTone(body.tone);
    const requestedServiceFocus = clean(body.service_focus);
    const availabilityNote = clean(body.availability_note);
    const customCta = clean(body.custom_cta);

    const serviceFocus = inferServiceFocus({
      requestedServiceFocus,
      jobsCount: jobs.length,
      transportCount: transportJobs.length,
      notes: clean(customer.notes),
    });

    const lastJobDate = formatDate(
      jobs[0]?.job_date || jobs[0]?.start_date || jobs[0]?.created_at || null
    );
    const lastTransportDate = formatDate(
      transportJobs[0]?.transport_date || transportJobs[0]?.created_at || null
    );
    const lastContactDate = formatDate(correspondence[0]?.created_at || null);

    const bodyHint = buildBodyHint({
      companyName: customer.company_name,
      jobsCount: jobs.length,
      transportCount: transportJobs.length,
      quoteCount: quotes.length,
      correspondenceCount: correspondence.length,
      lastJobDate,
      lastTransportDate,
      lastContactDate,
    });

    const subjectHint =
      goal === "availability"
        ? `${serviceFocus} availability from AnnS Crane Hire`
        : goal === "reactivation"
        ? `Support for upcoming work at ${customer.company_name}`
        : goal === "follow_up"
        ? `Following up from AnnS Crane Hire`
        : `Checking in from AnnS Crane Hire`;

    const { draft, provider } = await generateSalesDraftWithFallback({
      lead: {
        company_name: customer.company_name,
        contact_name: customer.contact_name,
        area: customer.address,
        industry: null,
        services: serviceFocus ? [serviceFocus] : null,
      },
      channel,
      goal,
      tone,
      serviceFocus,
      availabilityNote,
      customCta,
      subjectHint,
      bodyHint,
    });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "customer_outreach_generated",
      entity_type: "customer_outreach",
      entity_id: params.id,
      meta: {
        customer_id: params.id,
        customer_name: customer.company_name,
        channel,
        goal,
        tone,
        service_focus: serviceFocus,
        availability_note: availabilityNote,
        provider,
      },
    });

    return NextResponse.json({
      ok: true,
      draft,
      meta: {
        customer_id: params.id,
        customer_name: customer.company_name,
        customer_contact: customer.contact_name ?? null,
        channel,
        goal,
        tone,
        service_focus: serviceFocus,
        provider,
        relationship: {
          jobs_count: jobs.length,
          transport_jobs_count: transportJobs.length,
          quotes_count: quotes.length,
          correspondence_count: correspondence.length,
          last_job_date: lastJobDate,
          last_transport_date: lastTransportDate,
          last_contact_date: lastContactDate,
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate customer outreach." },
      { status: 500 }
    );
  }
}
