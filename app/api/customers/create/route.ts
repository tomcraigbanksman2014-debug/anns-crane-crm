import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../../lib/access";

type Payload = {
  company_name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

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

async function checkDuplicateClient(
  supabaseLike: any,
  payload: {
    company_name: string;
    phone: string | null;
    email: string | null;
  }
) {
  const wantedCompany = normaliseCompanyName(payload.company_name);
  const wantedPhone = normalisePhone(payload.phone);
  const wantedEmail = normaliseEmail(payload.email);

  const { data: existingClients, error } = await supabaseLike
    .from("clients")
    .select("id, company_name, phone, email, archived")
    .eq("archived", false)
    .order("company_name", { ascending: true });

  if (error) {
    return { error: error.message, duplicateId: null, duplicateMessage: "" };
  }

  const rows = (existingClients ?? []).map((client: any) => ({
    ...client,
    normalisedCompany: normaliseCompanyName(client.company_name),
    normalisedPhone: normalisePhone(client.phone),
    normalisedEmail: normaliseEmail(client.email),
  }));

  const strongMatch =
    rows.find((client: any) => wantedEmail && client.normalisedEmail && client.normalisedEmail === wantedEmail) ||
    rows.find(
      (client: any) =>
        wantedCompany &&
        wantedPhone &&
        client.normalisedCompany === wantedCompany &&
        client.normalisedPhone === wantedPhone
    ) ||
    rows.find(
      (client: any) =>
        wantedCompany &&
        client.normalisedCompany === wantedCompany &&
        ((wantedPhone && client.normalisedPhone === wantedPhone) ||
          (wantedEmail && client.normalisedEmail === wantedEmail))
    );

  if (strongMatch?.id) {
    return {
      error: "",
      duplicateId: strongMatch.id,
      duplicateMessage: `Duplicate customer detected: ${strongMatch.company_name}. Please use the existing customer record instead of creating a new one.`,
    };
  }

  const possibleMatches = rows.filter((client: any) => {
    if (wantedCompany && client.normalisedCompany === wantedCompany) return true;
    if (wantedPhone && client.normalisedPhone && client.normalisedPhone === wantedPhone) return true;
    if (wantedEmail && client.normalisedEmail && client.normalisedEmail === wantedEmail) return true;
    return false;
  });

  if (possibleMatches.length > 0) {
    const labels = possibleMatches
      .slice(0, 5)
      .map((client: any) => client.company_name || "Existing customer")
      .join(", ");

    return {
      error: "",
      duplicateId: null,
      duplicateMessage: `Possible duplicate customer found: ${labels}. Please search for and use the existing customer instead of creating a new one.`,
    };
  }

  return { error: "", duplicateId: null, duplicateMessage: "" };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;

    const company_name = String(body.company_name ?? "").trim();
    const contact_name = norm(body.contact_name);
    const phone = norm(body.phone);
    const email = norm(body.email);
    const notes = norm(body.notes);

    if (!company_name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const access = await getAccessContext();

    if (!access.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!canCreateCustomers(access)) {
      return NextResponse.json(
        { error: "You do not have permission to create customers." },
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

      const duplicateCheck = await checkDuplicateClient(authClient, {
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
        .from("clients")
        .insert([{ company_name, contact_name, phone, email, notes }])
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: u.user.id,
        actor_username: u.user.email ? u.user.email.split("@")[0] : null,
        action: "customer_created",
        entity_type: "customer",
        entity_id: data?.id ?? null,
        meta: {
          company_name,
          contact_name,
          phone,
          email,
        },
      });

      return NextResponse.json({ ok: true, id: data?.id ?? null });
    }

    const supabase = createSupabaseServerClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const duplicateCheck = await checkDuplicateClient(supabase, {
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
      .from("clients")
      .insert([{ company_name, contact_name, phone, email, notes }])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: userRes.user.id,
      actor_username: userRes.user.email ? userRes.user.email.split("@")[0] : null,
      action: "customer_created",
      entity_type: "customer",
      entity_id: data?.id ?? null,
      meta: {
        company_name,
        contact_name,
        phone,
        email,
      },
    });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
