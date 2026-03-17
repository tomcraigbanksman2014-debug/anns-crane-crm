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
      subject,
      amount,
      quote_date,
      valid_until,
      notes,
      clients:client_id (
        company_name
      )
    `)
    .eq("id", params.id)
    .single();

  const clientId = String((quote as any)?.client_id ?? "");
  const subject = encodeURIComponent(String((quote as any)?.subject ?? ""));
  const notes = encodeURIComponent(String((quote as any)?.notes ?? ""));
  const amount = encodeURIComponent(String((quote as any)?.amount ?? ""));
  const quoteId = encodeURIComponent(String((quote as any)?.id ?? ""));
  const company = encodeURIComponent(
    String((quote as any)?.clients?.company_name ?? "")
  );

  redirect(
    `/bookings/new?quote_id=${quoteId}&client_id=${encodeURIComponent(
      clientId
    )}&company=${company}&subject=${subject}&amount=${amount}&notes=${notes}`
  );
}
