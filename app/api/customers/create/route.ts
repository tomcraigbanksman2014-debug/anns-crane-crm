import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    // Prefer Bearer token (sent by your CustomerForm). Fallback to cookie-based auth.
    const bearer = getBearer(req);

    if (bearer) {
      // 1) Validate token
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });

      const { data: u, error: ue } = await authClient.auth.getUser();
      if (ue || !u.user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }

      // 2) Use the SAME authed client for the insert (this is the important bit)
      const { data, error } = await authClient
        .from("clients")
        .insert([{ company_name, contact_name, phone, email, notes }])
        .select("id")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      return NextResponse.json({ ok: true, id: data?.id ?? null });
    }

    // Fallback: cookie session (if you ever call this route without Authorization header)
    const supabase = createSupabaseServerClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("clients")
      .insert([{ company_name, contact_name, phone, email, notes }])
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
