import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import CustomerOutreachGenerator from "./CustomerOutreachGenerator";

type TimelineItem = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  body?: string | null;
  href?: string | null;
  sortDate: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : "";
}

function inferDefaultService(jobs: any[], transportJobs: any[], customerNotes: string | null) {
  const notes = String(customerNotes ?? "").toLowerCase();

  if (jobs.length > 0 && transportJobs.length > 0) return "crane hire, contract lifts and HIAB transport";
  if (transportJobs.length > 0) {
    if (notes.includes("container")) return "HIAB transport and container movements";
    if (notes.includes("machinery")) return "HIAB transport and machinery moves";
    return "HIAB transport and transport support";
  }
  if (jobs.length > 0) {
    if (notes.includes("spider")) return "spider crane hire and restricted-access lifting";
    if (notes.includes("contract lift")) return "contract lifts and crane hire";
    return "crane hire and lifting support";
  }
  return "crane hire and transport support";
}

function buildTimeline(jobs: any[], transportJobs: any[], correspondence: any[], quotes: any[]) {
  const items: TimelineItem[] = [
    ...jobs.map((job: any) => ({
      id: `job-${job.id}`,
      badge: "JOB",
      title: `Job #${job.job_number ?? "—"}${job.site_name ? ` — ${job.site_name}` : ""}`,
      subtitle: [job.job_date ? formatDate(job.job_date) : "-", job.status ? `Status: ${job.status}` : null]
        .filter(Boolean)
        .join(" • "),
      body: clean(job.notes) || null,
      href: `/jobs/${job.id}`,
      sortDate: String(job.job_date || job.created_at || ""),
    })),
    ...transportJobs.map((job: any) => ({
      id: `transport-${job.id}`,
      badge: "TRANSPORT",
      title: job.transport_number || "Transport Job",
      subtitle: [job.transport_date ? formatDate(job.transport_date) : "-", job.status ? `Status: ${job.status}` : null]
        .filter(Boolean)
        .join(" • "),
      body:
        [clean(job.collection_address), clean(job.delivery_address)].filter(Boolean).join(" → ") ||
        clean(job.load_description) ||
        null,
      href: `/transport-jobs/${job.id}`,
      sortDate: String(job.transport_date || job.created_at || ""),
    })),
    ...quotes.map((quote: any) => ({
      id: `quote-${quote.id}`,
      badge: "QUOTE",
      title: clean(quote.subject) || "Quote",
      subtitle: [quote.quote_date ? formatDate(quote.quote_date) : "-", quote.status ? `Status: ${quote.status}` : null]
        .filter(Boolean)
        .join(" • "),
      body: clean(quote.notes) || null,
      href: `/quotes/${quote.id}`,
      sortDate: String(quote.quote_date || quote.created_at || ""),
    })),
    ...correspondence.map((entry: any) => ({
      id: `correspondence-${entry.id}`,
      badge: String(entry.entry_type ?? "note").toUpperCase(),
      title: clean(entry.subject) || "Customer correspondence",
      subtitle: [formatDateTime(entry.created_at), entry.created_by_username ? `By: ${entry.created_by_username}` : null]
        .filter(Boolean)
        .join(" • "),
      body: clean(entry.message) || null,
      href: null,
      sortDate: String(entry.created_at || ""),
    })),
  ];

  return items.sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate))).slice(0, 12);
}

export default async function CustomerOutreachPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [customerRes, jobsRes, transportRes, correspondenceRes, quotesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, notes, created_at")
      .eq("id", params.id)
      .single(),
    supabase
      .from("jobs")
      .select("id, job_number, job_date, status, site_name, notes, created_at")
      .eq("client_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("transport_jobs")
      .select("id, transport_number, transport_date, status, collection_address, delivery_address, load_description, created_at")
      .eq("client_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("customer_correspondence")
      .select("id, entry_type, subject, message, created_at, created_by_username")
      .eq("client_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("quotes")
      .select("id, status, quote_date, subject, notes, created_at")
      .eq("client_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const customer = customerRes.data;
  const jobs = jobsRes.data ?? [];
  const transportJobs = transportRes.data ?? [];
  const correspondence = correspondenceRes.data ?? [];
  const quotes = quotesRes.data ?? [];

  if (customerRes.error || !customer) {
    return (
      <ClientShell>
        <div style={{ width: "min(1180px, 96vw)", margin: "0 auto" }}>
          <div style={errorBox}>{customerRes.error?.message || "Customer not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const defaultService = inferDefaultService(jobs, transportJobs, customer.notes ?? null);
  const timeline = buildTimeline(jobs, transportJobs, correspondence, quotes);
  const lastActivity = timeline[0]?.subtitle || "No recent activity";

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Customer Outreach</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Generate AI-assisted outreach for returning customers using their real job history.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/customers/${customer.id}`} style={secondaryBtn}>
              Customer Record
            </a>
            <a href="/customers" style={secondaryBtn}>
              ← Customers
            </a>
          </div>
        </div>

        {jobsRes.error ? <div style={errorBox}>{jobsRes.error.message}</div> : null}
        {transportRes.error ? <div style={errorBox}>{transportRes.error.message}</div> : null}
        {correspondenceRes.error ? <div style={errorBox}>{correspondenceRes.error.message}</div> : null}
        {quotesRes.error ? <div style={errorBox}>{quotesRes.error.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Customer" value={customer.company_name} />
          <StatCard label="Crane jobs" value={String(jobs.length)} />
          <StatCard label="Transport jobs" value={String(transportJobs.length)} />
          <StatCard label="Last activity" value={lastActivity} />
        </div>

        <div style={twoColGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Customer summary</h2>

            <div style={{ display: "grid", gap: 10 }}>
              <InfoRow label="Company">{customer.company_name}</InfoRow>
              <InfoRow label="Contact">{customer.contact_name || "—"}</InfoRow>
              <InfoRow label="Phone">{customer.phone || "—"}</InfoRow>
              <InfoRow label="Email">{customer.email || "—"}</InfoRow>
              <InfoRow label="Address">{customer.address || "—"}</InfoRow>
              <InfoRow label="Created">{formatDateTime(customer.created_at)}</InfoRow>
              <InfoRow label="Likely service focus">{defaultService}</InfoRow>
              <InfoRow label="Notes">{customer.notes || "—"}</InfoRow>
            </div>

            <div style={tipBox}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Best use</div>
              <div>
                Use follow-up or reactivation for existing customers. Use availability when you
                want to push spare fleet or last-minute slots.
              </div>
            </div>
          </section>

          <div style={{ marginTop: 16 }}>
            <CustomerOutreachGenerator
              customerId={customer.id}
              customerCompany={customer.company_name}
              customerEmail={customer.email}
              customerPhone={customer.phone}
              defaultService={defaultService}
            />
          </div>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Recent customer activity</h2>

          {!timeline.length ? (
            <div style={mutedBox}>No recent activity recorded yet for this customer.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {timeline.map((item) => (
                <div key={item.id} style={activityCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={badgeStyle}>{item.badge}</span>
                        {item.href ? (
                          <a href={item.href} style={titleLinkStyle}>
                            {item.title}
                          </a>
                        ) : (
                          <div style={{ fontWeight: 900 }}>{item.title}</div>
                        )}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>{item.subtitle}</div>
                    </div>
                  </div>

                  {item.body ? <div style={messageBox}>{item.body}</div> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 1000, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 700, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 18,
  alignItems: "start",
};

const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};

const mutedBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  color: "#555",
};

const tipBox: CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.5,
};

const activityCard: CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  background: "rgba(0,0,0,0.08)",
};

const titleLinkStyle: CSSProperties = {
  color: "#111",
  fontWeight: 900,
  textDecoration: "none",
};

const messageBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.64)",
  border: "1px solid rgba(0,0,0,0.06)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};
