import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "../../../../lib/audit";

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

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

    const { data: existingCustomer, error: existingError } = await supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, notes, archived")
      .eq("id", params.id)
      .single();

    if (existingError || !existingCustomer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const company_name = String(body?.company_name ?? "").trim();
    const contact_name = norm(body?.contact_name);
    const phone = norm(body?.phone);
    const email = norm(body?.email);
    const notes = norm(body?.notes);

    if (!company_name) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
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
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: userRes.user.id,
      actor_username: fromAuthEmail(userRes.user.email ?? null) || null,
      action: "customer_updated",
      entity_type: "customer",
      entity_id: params.id,
      meta: {
        previous_company_name: existingCustomer.company_name ?? null,
        new_company_name: company_name,
        contact_name,
        phone,
        email,
        archived: existingCustomer.archived ?? false,
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
