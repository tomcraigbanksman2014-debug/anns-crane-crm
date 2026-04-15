import { createSupabaseServerClient } from "../../../lib/supabase/server";
import PrintQuoteActions from "./PrintQuoteActions";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "—";
  return `£${n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function safeText(value: any) {
  const s = String(value ?? "").trim();
  return s.length ? s : "—";
}

function quoteReference(id: string, date: string | null | undefined) {
  const cleanDate = String(date ?? "").replace(/-/g, "");
  const suffix = String(id ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  if (cleanDate && suffix) return `QT-${cleanDate}-${suffix}`;
  if (suffix) return `QT-${suffix}`;
  return "—";
}

function splitNotes(value: string | null | undefined) {
  return String(value ?? "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default async function QuotePrintPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: quote }, { data: settings }] = await Promise.all([
    supabase
      .from("quotes")
      .select(`
        id,
        status,
        quote_date,
        valid_until,
        amount,
        subject,
        notes,
        created_at,
        clients:client_id (
          company_name,
          contact_name,
          phone,
          email
        )
      `)
      .eq("id", params.id)
      .single(),
    supabase.from("app_settings").select("*").limit(1).maybeSingle(),
  ]);

  const client = Array.isArray((quote as any)?.clients)
    ? (quote as any).clients[0] ?? null
    : (quote as any)?.clients ?? null;

  const businessName = settings?.business_name || "Ann's Crane Hire Ltd";
  const businessAddress =
    settings?.business_address || "6 Bay Street, Port Tennant, Swansea, SA1 8LB";
  const businessPhone = settings?.business_phone || "01792 641653";
  const businessEmail = settings?.business_email || "info@annscranehire.co.uk";
  const paymentTermsDays = Number(settings?.payment_terms_days ?? 30) || 30;

  const noteSections = splitNotes((quote as any)?.notes);
  const scopeSummary = noteSections.length ? noteSections[0] : "—";
  const supportingNotes = noteSections.slice(1);

  return (
    <html>
      <head>
        <title>Quote {quoteReference(params.id, (quote as any)?.quote_date)}</title>
      </head>
      <body style={bodyStyle}>
        <style>{`
          @media print {
            .print-hide {
              display: none !important;
            }

            body {
              background: #fff !important;
            }

            .quote-page {
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
            }
          }
        `}</style>

        <div className="quote-page" style={pageStyle}>
          <div className="print-hide" style={topBarStyle}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 1000 }}>QUOTE</div>
              <div style={{ marginTop: 6, opacity: 0.75 }}>
                {quoteReference(params.id, (quote as any)?.quote_date)}
              </div>
            </div>

            <PrintQuoteActions backHref={`/quotes/${params.id}`} />
          </div>

          <div style={headerStyle}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 30, fontWeight: 1000, letterSpacing: 0.2 }}>
                {businessName}
              </div>
              <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.45 }}>
                <div>{businessAddress}</div>
                <div>Tel: {businessPhone}</div>
                <div>Email: {businessEmail}</div>
              </div>
            </div>

            <div style={{ width: 240, maxWidth: "100%", textAlign: "right" }}>
              <img
                src="/logo.png"
                alt="AnnS Crane Hire"
                style={{
                  width: 220,
                  maxWidth: "100%",
                  height: "auto",
                  objectFit: "contain",
                  display: "block",
                  marginLeft: "auto",
                }}
              />
            </div>
          </div>

          <div style={titleBandStyle}>
            <div>
              <div style={{ fontSize: 34, fontWeight: 1000, letterSpacing: 0.4 }}>QUOTE</div>
              <div style={{ marginTop: 6, fontSize: 15 }}>
                {quoteReference(params.id, (quote as any)?.quote_date)}
              </div>
            </div>

            <div style={{ minWidth: 220 }}>
              <MetaRow label="Quote date" value={fmtDate((quote as any)?.quote_date)} />
              <MetaRow label="Valid until" value={fmtDate((quote as any)?.valid_until)} />
              <MetaRow label="Status" value={safeText((quote as any)?.status)} />
            </div>
          </div>

          <div style={twoColGrid}>
            <section style={cardStyle}>
              <h2 style={sectionTitle}>Client</h2>
              <InfoRow label="Company" value={client?.company_name} />
              <InfoRow label="Contact" value={client?.contact_name} />
              <InfoRow label="Phone" value={client?.phone} />
              <InfoRow label="Email" value={client?.email} />
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitle}>Project / Quote details</h2>
              <InfoRow label="Subject" value={(quote as any)?.subject} />
              <InfoRow label="Reference" value={quoteReference(params.id, (quote as any)?.quote_date)} />
              <InfoRow label="Hire type" value="As quoted" />
              <InfoRow label="Total quoted" value={fmtMoney((quote as any)?.amount)} />
            </section>
          </div>

          <section style={{ ...cardStyle, marginTop: 18 }}>
            <h2 style={sectionTitle}>Scope of work</h2>
            <div style={blockStyle}>{scopeSummary}</div>
          </section>

          <div style={{ ...twoColGrid, marginTop: 18 }}>
            <section style={cardStyle}>
              <h2 style={sectionTitle}>Commercial summary</h2>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdStyle}>{safeText((quote as any)?.subject)}</td>
                    <td style={tdStyle}>{fmtMoney((quote as any)?.amount)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={totalStyle}>Quoted total: {fmtMoney((quote as any)?.amount)}</div>
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitle}>Additional notes</h2>
              {supportingNotes.length ? (
                <ul style={bulletListStyle}>
                  {supportingNotes.map((note, index) => (
                    <li key={`${index}-${note}`}>{note}</li>
                  ))}
                </ul>
              ) : (
                <div style={blockStyle}>—</div>
              )}
            </section>
          </div>

          <section style={{ ...cardStyle, marginTop: 18 }}>
            <h2 style={sectionTitle}>Terms</h2>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>
              <div>• All work is subject to Ann&apos;s Crane Hire Ltd terms and CPA / RHA terms where applicable.</div>
              <div>• Unless stated otherwise, prices are exclusive of VAT.</div>
              <div>• This quotation is offered subject to site access, suitable ground conditions and the agreed scope of works.</div>
              <div>• Delays, aborted visits, waiting time, additional labour or specification changes may result in revised charges.</div>
              <div>• Quote acceptance should be confirmed in writing with any relevant purchase order reference.</div>
              <div>• Payment terms: {paymentTermsDays} days from month end unless agreed otherwise in writing.</div>
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop: 18 }}>
            <h2 style={sectionTitle}>Acceptance</h2>
            <div style={acceptanceGridStyle}>
              <SignatureRow label="For and on behalf of" />
              <SignatureRow label="Name" />
              <SignatureRow label="Signed" />
              <SignatureRow label="Date" />
              <SignatureRow label="Purchase Order No." />
              <SignatureRow label="Payment terms" value={`${paymentTermsDays} days from month end`} />
            </div>
          </section>
        </div>
      </body>
    </html>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={metaRowStyle}>
      <span style={{ fontWeight: 800 }}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div style={infoRowStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{safeText(value)}</div>
    </div>
  );
}

function SignatureRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 800 }}>{label}</div>
      <div style={signatureBoxStyle}>{value ?? ""}</div>
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  background: "#f4f4f4",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#111",
};

const pageStyle: React.CSSProperties = {
  width: "min(1100px, 94vw)",
  margin: "20px auto",
  background: "#fff",
  padding: 28,
  boxSizing: "border-box",
  boxShadow: "0 8px 28px rgba(0,0,0,0.08)",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 18,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  alignItems: "flex-start",
  flexWrap: "wrap",
  paddingBottom: 18,
  borderBottom: "2px solid #111",
};

const titleBandStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap",
  alignItems: "flex-start",
  marginTop: 20,
};

const twoColGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 18,
  marginTop: 18,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #cfcfcf",
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const infoRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px solid #ececec",
};

const infoLabelStyle: React.CSSProperties = {
  fontWeight: 800,
};

const infoValueStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const metaRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 14,
  padding: "4px 0",
};

const blockStyle: React.CSSProperties = {
  minHeight: 80,
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #bbb",
  padding: "10px 8px",
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "10px 8px",
  fontSize: 14,
};

const totalStyle: React.CSSProperties = {
  marginTop: 14,
  textAlign: "right",
  fontSize: 18,
  fontWeight: 900,
};

const bulletListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  lineHeight: 1.6,
};

const acceptanceGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
  gap: 14,
};

const signatureBoxStyle: React.CSSProperties = {
  minHeight: 44,
  border: "1px solid #cfcfcf",
  padding: 10,
  fontSize: 14,
};
