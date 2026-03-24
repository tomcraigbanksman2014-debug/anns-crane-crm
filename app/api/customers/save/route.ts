import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Payload = {
  mode: "create" | "edit";
  id: string | null;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

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
  supabase: ReturnType<typeof createSupabaseServerClient>,
  payload: {
    company_name: string;
    phone: string | null;
    email: string | null;
    ignoreId?: string | null;
  }
) {
  const wantedCompany = normaliseCompanyName(payload.company_name);
  const wantedPhone = normalisePhone(payload.phone);
  const wantedEmail = normaliseEmail(payload.email);

  const { data: existingClients, error } = await supabase
    .from("clients")
    .select("id, company_name, phone, email, archived")
    .eq("archived", false)
    .order("company_name", { ascending: true });

  if (error) {
    return { error: error.message, duplicateMessage: "" };
  }

  const rows = (existingClients ?? [])
    .filter((client: any) => String(client.id) !== String(payload.ignoreId ?? ""))
    .map((client: any) => ({
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
      duplicateMessage: `Duplicate customer detected: ${strongMatch.company_name}. Please use the existing customer record instead.`,
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
      duplicateMessage: `Possible duplicate customer found: ${labels}. Please use the existing customer record instead.`,
    };
  }

  return { error: "", duplicateMessage: "" };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Payload>;

    const mode = body.mode;
    const id = body.id ?? null;

    const company_name = (body.company_name ?? "").trim();
    const contact_name = (body.contact_name ?? null)?.trim() || null;
    const phone = (body.phone ?? null)?.trim() || null;
    const email = (body.email ?? null)?.trim() || null;
    const notes = (body.notes ?? null)?.trim() || null;

    if (mode !== "create" && mode !== "edit") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    if (!company_name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    if (mode === "edit" && !id) {
      return NextResponse.json({ error: "Missing customer id" }, { status: 400 });
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
      ignoreId: mode === "edit" ? id : null,
    });

    if (duplicateCheck.error) {
      return NextResponse.json({ error: duplicateCheck.error }, { status: 400 });
    }

    if (duplicateCheck.duplicateMessage) {
      return NextResponse.json({ error: duplicateCheck.duplicateMessage }, { status: 400 });
    }

    if (mode === "create") {
      const { data, error } = await supabase
        .from("clients")
        .insert([
          {
            company_name,
            contact_name,
            phone,
            email,
            notes,
          },
        ])
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, id: data?.id ?? null });
    }

    const { error } = await supabase
      .from("clients")
      .update({
        company_name,
        contact_name,
        phone,
        email,
        notes,
      })
      .eq("id", id as string);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
