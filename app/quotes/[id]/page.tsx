import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import StatusBadge from "../../components/StatusBadge";
import QuoteArchiveButton from "../QuoteArchiveButton";
import CreateBookingFromQuoteButton from "./CreateBookingFromQuoteButton";
import CreateJobFromQuoteButton from "./CreateJobFromQuoteButton";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: any) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "—";
  return `£${n.toFixed(2)}`;
}

export default async function QuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(`
      *,
      clients:client_id (
        id,
        company_name,
        contact_name,
        phone,
        email
      )
    `)
    .eq("id", params.id)
    .single();

  const client = Array.isArray((quote as any)?.clients)
    ? (quote as any).clients[0]
    : (quote as any)?.clients;

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>
                {(quote as any)?.subject || "Quote"}
              </h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Review quote details and convert into the next workflow step.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {quote ? (
                <QuoteArchiveButton id={(quote as any).id} archived={!!(quote as any).archived} />
              ) : null}
              <a href="/quotes" style={secondaryBtn}>
                ← Back to quotes
              </a>
            </div>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : !quote ? (
            <div style={errorBox}>Quote not found.</div>
          ) : (
            <>
              <div style={actionsBar}>
                <CreateBookingFromQuoteButton quoteId={(quote as any).id} />
                <CreateJobFromQuoteButton quoteId={(quote as any).id} />
                <a href={`/quotes/${(quote as any).id}/edit`} style={secondaryBtn}>
                  Edit quote
                </a>
              </div>

              <div style={gridWrap}>
                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Quote summary</h2>
                  <InfoRow label="Customer" value={client?.company_name ?? "—"} />
                  <InfoRow label="Status" valueNode={<StatusBadge value={(quote as any).status} archived={!!(quote as any).archived} />} />
                  <InfoRow label="Quote date" value={fmtDate((quote as any).quote_date)} />
                  <InfoRow label="Valid until" value={fmtDate((quote as any).valid_until)} />
                  <InfoRow label="Amount" value={fmtMoney((quote as any).amount)} />
                  <InfoRow label="Archived" value={(quote as any).archived ? "Yes" : "No"} />
                  <Block label="Notes" value={(quote as any).notes} />
                </section>

                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Customer</h2>
                  <InfoRow label="Company" value={client?.company_name ?? "—"} />
                  <InfoRow label="Contact" value={client?.contact_name ?? "—"} />
                  <InfoRow label="Phone" value={client?.phone ?? "—"} />
                  <InfoRow label="Email" value={client?.email ?? "—"} />

                  {client?.id ? (
                    <div style={{ marginTop: 12 }}>
                      <a href={`/customers/${client.id}`} style={secondaryBtn}>
                        Open customer
                      </a>
                    </div>
                  ) : null}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function InfoRow({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div style={infoRow}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{valueNode ?? value ?? "—"}</div>
    </div>
  );
}

function Block({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <div style={blockStyle}>{value || "—"}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const actionsBar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const gridWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginTop: 16,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const infoRow: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
};

const infoValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
};

const blockStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
