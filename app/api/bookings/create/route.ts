import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function combineDateTime(date: string | null, time: string | null) {
  if (!date || !time) return null;
  const iso = `${date}T${time}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

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

    const clientId = norm(body?.client_id);
    const equipmentId = norm(body?.equipment_id);
    const startDate = norm(body?.start_date);
    const endDate = norm(body?.end_date);

    if (!clientId) {
      return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    }
    if (!equipmentId) {
      return NextResponse.json({ error: "equipment_id is required" }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: "start_date is required" }, { status: 400 });
    }
    if (!endDate) {
      return NextResponse.json({ error: "end_date is required" }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    const hirePrice =
      body?.hire_price != null && String(body.hire_price).trim() !== ""
        ? Number(body.hire_price)
        : null;

    if (hirePrice != null && Number.isNaN(hirePrice)) {
      return NextResponse.json({ error: "hire_price must be a number" }, { status: 400 });
    }

    const vatRate =
      body?.vat_rate != null && String(body.vat_rate).trim() !== ""
        ? Number(body.vat_rate)
        : 20;

    const vat =
      body?.vat != null && String(body.vat).trim() !== ""
        ? Number(body.vat)
        : hirePrice != null
          ? Number(((hirePrice * vatRate) / 100).toFixed(2))
          : null;

    const totalInvoice =
      body?.total_invoice != null && String(body.total_invoice).trim() !== ""
        ? Number(body.total_invoice)
        : hirePrice != null && vat != null
          ? Number((hirePrice + vat).toFixed(2))
          : null;

    const paymentReceived =
      body?.payment_received != null && String(body.payment_received).trim() !== ""
        ? Number(body.payment_received)
        : 0;

    const payload = {
      client_id: clientId,
      equipment_id: equipmentId,
      start_date: startDate,
      end_date: endDate,
      start_at: combineDateTime(startDate, norm(body?.start_time)),
      end_at: combineDateTime(endDate, norm(body?.end_time)),
      location: norm(body?.location) || norm(body?.site_address),
      status: norm(body?.status) ?? "Inquiry",
      hire_price: hirePrice,
      vat: vat,
      total_invoice: totalInvoice,
      payment_received: Number.isNaN(paymentReceived) ? 0 : paymentReceived,
      invoice_status: norm(body?.invoice_status) ?? "Not Invoiced",
      notes: norm(body?.notes),
      updated_at: new Date().toISOString(),
    };

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("bookings")
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save booking." },
      { status: 400 }
    );
  }
}
