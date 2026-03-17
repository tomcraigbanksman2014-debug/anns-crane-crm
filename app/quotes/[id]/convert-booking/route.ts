import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(`
      id,
      client_id,
      status,
      subject,
      amount,
      quote_date,
      valid_until,
      notes,
      clients:client_id (
        company_name,
        contact_name,
        phone
      )
    `)
    .eq("id", params.id)
    .single();

  if (!quote) {
    redirect(`/quotes/${params.id}?error=${encodeURIComponent("Quote not found.")}`);
  }

  const client = Array.isArray((quote as any)?.clients)
    ? (quote as any).clients[0]
    : (quote as any)?.clients;

  const query = new URLSearchParams();
  query.set("quote_id", String((quote as any)?.id ?? ""));
  query.set("client_id", String((quote as any)?.client_id ?? ""));
  query.set("company", String(client?.company_name ?? ""));
  query.set("subject", String((quote as any)?.subject ?? ""));
  query.set("amount", String((quote as any)?.amount ?? ""));
  query.set("notes", String((quote as any)?.notes ?? ""));
  query.set("quote_status", String((quote as any)?.status ?? ""));
  query.set("quote_date", String((quote as any)?.quote_date ?? ""));
  query.set("valid_until", String((quote as any)?.valid_until ?? ""));
  query.set("contact_name", String(client?.contact_name ?? ""));
  query.set("contact_phone", String(client?.phone ?? ""));

  redirect(`/bookings/new?${query.toString()}`);
}
