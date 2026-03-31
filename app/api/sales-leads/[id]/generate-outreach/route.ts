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

function firstService(lead: any) {
  const services = Array.isArray(lead?.services) ? (lead.services as string[]) : [];
  return services.find((item) => String(item ?? "").trim()) ?? null;
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

    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("id", params.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.do_not_contact) {
      return NextResponse.json(
        { error: "This lead is marked Do Not Contact." },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const channel = normaliseChannel(body.channel);
    const goal = normaliseGoal(body.goal);
    const tone = normaliseTone(body.tone);
    const serviceFocus = clean(body.service_focus) || firstService(lead);
    const availabilityNote = clean(body.availability_note);
    const customCta = clean(body.custom_cta);

    const { draft, provider } = await generateSalesDraftWithFallback({
      lead,
      channel,
      goal,
      tone,
      serviceFocus,
      availabilityNote,
      customCta,
    });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "sales_lead_outreach_generated",
      entity_type: "sales_lead_outreach",
      entity_id: params.id,
      meta: {
        lead_id: params.id,
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
        channel,
        goal,
        tone,
        service_focus: serviceFocus,
        lead_company: lead.company_name ?? null,
        lead_contact: lead.contact_name ?? null,
        provider,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate outreach." },
      { status: 500 }
    );
  }
}
