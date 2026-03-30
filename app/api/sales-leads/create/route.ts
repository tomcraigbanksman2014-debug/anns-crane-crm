import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../../lib/access";

type Payload = {
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  area?: string | null;
  industry?: string | null;
  lead_source?: string | null;
  status?: string | null;
  services?: string[] | null;
  notes?: string | null;
  lead_score?: number | null;
  do_not_contact?: boolean;
  next_follow_up_on?: string | null;
  last_contacted_at?: string | null;
  assigned_to_username?: string | null;
};

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

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normaliseCompanyName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/limited/g, "ltd")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\bltd\b/g, " ltd ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalisePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D+/g, "").trim();
}

function normaliseEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normaliseServices(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

async function checkDuplicateLead(
  supabaseLike: any,
  payload: { company_name: string; phone: string | null; email: string | null }
) {
  const wantedCompany = normaliseCompanyName(payload.company_name);
  const wantedPhone = normalisePhone(payload.phone);
  const wantedEmail = normaliseEmail(payload.email);

  const { data: existingLeads, error } = await supabaseLike
    .from("sales_leads")
    .select("id, company_name, phone, email, archived")
    .eq("archived", false)
    .order("company_name", { ascending: true });

  if (error) {
    return { error: error.message, duplicateId: null, duplicateMessage: "" };
  }

  const rows = (existingLeads ?? []).map((lead: any) => ({
    ...lead,
    normalisedCompany: normaliseCompanyName(lead.company_name),
    normalisedPhone: normalisePhone(lead.phone),
    normalisedEmail: normaliseEmail(lead.email),
  }));

  const strongMatch =
    rows.find((lead: any) => wantedEmail && lead.normalisedEmail === wantedEmail) ||
    rows.find(
      (lead: any) =>
        wantedCompany && wantedPhone && lead.normalisedCompany === wantedCompany && lead.normalisedPhone === wantedPhone
    );

  if (strongMatch?.id) {
    return {
      error: "",
      duplicateId: strongMatch.id,
      duplicateMessage: `Duplicate lead detected: ${strongMatch.company_name}. Please use the existing lead instead of creating a new one.`,
    };
  }

  return { error: "", duplicateId: null, duplicateMessage: "" };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;

    const company_name = String(body.company_name ?? "").trim();
    const contact_name = norm(body.contact_name);
    const email = norm(body.email);
    const phone = norm(body.phone);
    const address = norm(body.address);
    const area = norm(body.area);
    const industry = norm(body.industry);
    const lead_source = norm(body.lead_source);
    const status = ALLOWED_STATUSES.has(String(body.status ?? "")) ? String(body.status) : "New";
    const services = normaliseServices(body.services);
    const notes = norm(body.notes);
    const lead_score = Number.isFinite(Number(body.lead_score)) ? Number(body.lead_score) : 0;
    const do_not_contact = Boolean(body.do_not_contact);
    const next_follow_up_on = norm(body.next_follow_up_on);
    const last_contacted_at = norm(body.last_contacted_at);
    const assigned_to_username = norm(body.assigned_to_username);

    if (!company_name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const access = await getAccessContext();

    if (!access.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!canCreateCustomers(access)) {
      return NextResponse.json(
        { error: "You do not have permission to create leads." },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    const bearer = getBearer(req);

    if (bearer) {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });

      const { data: u, error: ue } = await authClient.auth.getUser();
      if (ue || !u.user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }

      const duplicateCheck = await checkDuplicateLead(authClient, {
        company_name,
        phone,
        email,
      });

      if (duplicateCheck.error) {
        return NextResponse.json({ error: duplicateCheck.error }, { status: 400 });
      }

      if (duplicateCheck.duplicateMessage) {
        return NextResponse.json(
          { error: duplicateCheck.duplicateMessage, existing_id: duplicateCheck.duplicateId },
          { status: 400 }
        );
      }

      const { data, error } = await authClient
        .from("sales_leads")
        .insert([
          {
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
          },
        ])
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: u.user.id,
        actor_username: u.user.email ? u.user.email.split("@")[0] : null,
        action: "sales_lead_created",
        entity_type: "sales_lead",
        entity_id: data?.id ?? null,
        meta: {
          company_name,
          contact_name,
          email,
          phone,
          status,
          lead_score,
          services,
        },
      });

      return NextResponse.json({ ok: true, id: data?.id ?? null });
    }

    const supabase = createSupabaseServerClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const duplicateCheck = await checkDuplicateLead(supabase, {
      company_name,
      phone,
      email,
    });

    if (duplicateCheck.error) {
      return NextResponse.json({ error: duplicateCheck.error }, { status: 400 });
    }

    if (duplicateCheck.duplicateMessage) {
      return NextResponse.json(
        { error: duplicateCheck.duplicateMessage, existing_id: duplicateCheck.duplicateId },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("sales_leads")
      .insert([
        {
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
        },
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: userRes.user.id,
      actor_username: userRes.user.email ? userRes.user.email.split("@")[0] : null,
      action: "sales_lead_created",
      entity_type: "sales_lead",
      entity_id: data?.id ?? null,
      meta: {
        company_name,
        contact_name,
        email,
        phone,
        status,
        lead_score,
        services,
      },
    });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
