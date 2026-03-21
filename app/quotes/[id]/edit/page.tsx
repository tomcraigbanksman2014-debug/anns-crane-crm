import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import QuoteForm from "../../QuoteForm";

export default async function EditQuotePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: quote, error: quoteError }, { data: clients, error: clientsError }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, client_id, status, quote_date, valid_until, amount, subject, notes")
        .eq("id", params.id)
        .single(),
      supabase
        .from("clients")
        .select("id, company_name, archived")
        .eq("archived", false)
        .order("company_name", { ascending: true }),
    ]);

  const errorMessage = quoteError?.message || clientsError?.message || "";

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        {errorMessage ? (
          <div style={errorBox}>{errorMessage}</div>
        ) : !quote ? (
          <div style={errorBox}>Quote not found.</div>
        ) : (
          <QuoteForm
            mode="edit"
            customers={(clients ?? []).map((client: any) => ({
              id: client.id,
              company_name: client.company_name ?? null,
            }))}
            quote={{
              id: quote.id,
              client_id: quote.client_id,
              status: quote.status,
              quote_date: quote.quote_date,
              valid_until: quote.valid_until,
              amount: quote.amount,
              subject: quote.subject,
              notes: quote.notes,
            }}
          />
        )}
      </div>
    </ClientShell>
  );
}

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
