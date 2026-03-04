import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // 1) Authenticate (Bearer first, then cookie)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const bearer = getBearer(req);

    if (bearer) {
      const sb = createClient(supabaseUrl, anonKey);
      const { data, error } = await sb.auth.getUser(bearer);
      if (error || !data.user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
    } else {
      const sb = createSupabaseServerClient();
      const { data } = await sb.auth.getUser();
      if (!data.user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
    }

    // 2) Validate + normalise input
    const company_name = String(body?.company_name ?? "").trim();
    const contact_name = String(body?.contact_name ?? "").trim() || null;
    const phone = String(body?.phone ?? "").trim() || null;
    const email = String(body?.email ?? "").trim() || null;
    const notes = String(body?.notes ?? "").trim() || null;

    if (!company_name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    // 3) Insert
    const supabase = createSupabaseServerClient();

    const { data: created, error } = await supabase
      .from("clients")
      .insert({ company_name, contact_name, phone, email, notes })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, customer: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
