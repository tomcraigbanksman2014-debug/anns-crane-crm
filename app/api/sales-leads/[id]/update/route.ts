import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "../../../../../lib/audit";

const ALLOWED_STATUSES = new Set([
  "New",
  "To Contact",
  "Contacted",
  "Quoted",
  "Follow Up",
  "Won",
  "Lost",
  "Dormant",
]);

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function normaliseServices(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { persistSession: false },
    });

    const { data: userRes } = await supabase.auth.getUser(token);

    if (!userRes?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: existingLead, error: existingError } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("id", params.id)
      .single();

    if (existingError || !existingLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const company_name = String(body?.company_name ?? "").trim();
    const contact_name = norm(body?.contact_name);
    const email = norm(body?.email);
    const phone = norm(body?.phone);
    const address = norm(body?.address);
    const area = norm(body?.area);
    const industry = norm(body?.industry);
    const lead_source = norm(body?.lead_source);
    const status = ALLOWED_STATUSES.has(String(body?.status ?? "")) ? String(body.status) : "New";
    const services = normaliseServices(body?.services);
    const notes = norm(body?.notes);
    const lead_score = Number.isFinite(Number(body?.lead_score)) ? Number(body.lead_score) : 0;
    const do_not_contact = Boolean(body?.do_not_contact);
    const next_follow_up_on = norm(body?.next_follow_up_on);
    const last_contacted_at = norm(body?.last_contacted_at);
    const assigned_to_username = norm(body?.assigned_to_username);

    if (!company_name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("sales_leads")
      .update({
        company_name,
        contact_name,
        email,
        phone,
        address,
        area,
        industry,
        lead_source,
        status,
        services,
        notes,
        lead_score,
        do_not_contact,
        next_follow_up_on,
        last_contacted_at,
        assigned_to_username,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: userRes.user.id,
      actor_username: fromAuthEmail(userRes.user.email ?? null) || null,
      action: "sales_lead_updated",
      entity_type: "sales_lead",
      entity_id: params.id,
      meta: {
        previous_company_name: existingLead.company_name ?? null,
        new_company_name: company_name,
        status,
        lead_score,
        do_not_contact,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
