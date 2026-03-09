import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, client_id, status, quote_date, amount, subject, notes")
      .eq("id", params.id)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    if (quote.status !== "Accepted") {
      return NextResponse.json(
        { error: "Quote must be accepted before conversion" },
        { status: 400 }
      );
    }

    const startDate =
      quote.quote_date ?? new Date().toISOString().slice(0, 10);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert([
        {
          client_id: quote.client_id,
          start_date: startDate,
          status: "Pending",
          location: quote.subject ?? null,
          total_invoice: quote.amount ?? null,
        },
      ])
      .select("id")
      .single();

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_username: auth.user.email ? auth.user.email.split("@")[0] : null,
      action: "convert",
      entity_type: "quote",
      entity_id: params.id,
      meta: {
        booking_id: booking?.id ?? null,
        client_id: quote.client_id,
      },
    });

    return NextResponse.redirect(new URL(`/bookings/${booking?.id}`, req.url));
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Conversion failed" },
      { status: 400 }
    );
  }
}
