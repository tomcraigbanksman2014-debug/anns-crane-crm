import ClientShell from "../../ClientShell";
import QuoteForm from "../QuoteForm";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtMoney(value: any) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "-";
  return `£${n.toFixed(2)}`;
}

export default async function QuotePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: customers, error: customersError }, { data: quote, error: quoteError }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, company_name")
        .order("company_name", { ascending: true }),
      supabase
        .from("quotes")
        .select(`
          id,
          client_id,
          status,
          quote_date,
          valid_until,
          amount,
          subject,
          notes,
          created_at,
          clients:client_id (
            id,
            company_name
          )
        `)
        .eq("id", params.id)
        .single(),
    ]);

  const clientRow = Array.isArray((quote as any)?.clients)
    ? (quote as any).clients[0] ?? null
    : (quote as any)?.clients ?? null;

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        {customersError ? (
          <div style={errorBox}>{customersError.message}</div>
        ) : quoteError ? (
          <div style={errorBox}>{quoteError.message}</div>
        ) : !quote ? (
          <div style={errorBox}>Quote not found.</div>
        ) : (
          <>
            <div style={{ ...summaryCardStyle, marginBottom: 16 }}>
              <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                <div>
                  <strong>Customer:</strong> {clientRow?.company_name ?? "-"}
                </div>
                <div>
                  <strong>Status:</strong> {(quote as any).status ?? "-"}
                </div>
                <div>
                  <strong>Amount:</strong> {fmtMoney((quote as any).amount)}
                </div>
                <div>
                  <strong>Created:</strong>{" "}
                  {(quote as any).created_at
                    ? new Date((quote as any).created_at).toLocaleString()
                    : "-"}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <a href="/quotes" style={btnStyle}>
                  ← Back to quotes
                </a>
                {(quote as any).client_id ? (
                  <a
                    href={`/customers/${(quote as any).client_id}`}
                    style={{ ...btnStyle, marginLeft: 10 }}
                  >
                    Open customer
                  </a>
                ) : null}
              </div>
            </div>

            <QuoteForm mode="edit" customers={customers ?? []} quote={quote as any} />
          </>
        )}
      </div>
    </ClientShell>
  );
}

const summaryCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
