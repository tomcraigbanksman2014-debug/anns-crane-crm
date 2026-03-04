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
      if (!data.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2) Validate
    const client_id = String(body?.client_id ?? "").trim();
    const equipment_id = String(body?.equipment_id ?? "").trim();
    const start_date = String(body?.start_date ?? "").trim();
    const end_date = String(body?.end_date ?? "").trim();

    if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    if (!equipment_id) return NextResponse.json({ error: "equipment_id is required" }, { status: 400 });
    if (!start_date) return NextResponse.json({ error: "start_date is required" }, { status: 400 });
    if (!end_date) return NextResponse.json({ error: "end_date is required" }, { status: 400 });
    if (end_date < start_date) return NextResponse.json({ error: "End date cannot be before start date" }, { status: 400 });

    const location = body?.location ? String(body.location).trim() : null;
    const status = body?.status ? String(body.status).trim() : "Inquiry";
    const invoice_status = body?.invoice_status ? String(body.invoice_status).trim() : "Not Invoiced";

    const hire_price = Number(body?.hire_price ?? "");
    if (Number.isNaN(hire_price) || hire_price < 0) {
      return NextResponse.json({ error: "hire_price must be a valid number" }, { status: 400 });
    }

    const payment_received = Number(body?.payment_received ?? 0);
    if (Number.isNaN(payment_received) || payment_received < 0) {
      return NextResponse.json({ error: "payment_received must be a valid number" }, { status: 400 });
    }

    // 3) Insert booking
    const supabase = createSupabaseServerClient();

    const { data: created, error: insErr } = await supabase
      .from("bookings")
      .insert({
        client_id,
        equipment_id,
        start_date,
        end_date,
        location,
        status,
        invoice_status,
        hire_price,
        payment_received,
        // vat / total_invoice can be set by your trigger if present
      })
      .select("*")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    return NextResponse.json({ success: true, booking: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
