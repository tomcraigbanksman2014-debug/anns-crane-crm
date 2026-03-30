import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function stageWeight(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();

  if (s === "new") return 0.1;
  if (s === "to contact") return 0.15;
  if (s === "contacted") return 0.25;
  if (s === "follow up") return 0.4;
  if (s === "quoted") return 0.65;
  if (s === "won") return 1;
  if (s === "dormant") return 0.08;
  return 0;
}

function stageLabel(status: string | null | undefined) {
  const s = String(status ?? "").trim();
  return s || "New";
}

function isOpenStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  return s !== "won" && s !== "lost";
}

function priorityScore(lead: any, today: string) {
  let score = Number(lead?.lead_score ?? 0);
  const status = String(lead?.status ?? "").toLowerCase();
  const next = dateOnly(lead?.next_follow_up_on);

  if (status === "quoted") score += 30;
  else if (status === "follow up") score += 24;
  else if (status === "contacted") score += 18;
  else if (status === "to contact") score += 14;
  else if (status === "new") score += 10;
  else if (status === "dormant") score += 8;

  if (lead?.phone) score += 8;
  if (lead?.email) score += 6;

  if (next) {
    const diff = Math.floor(
      (new Date(today).getTime() - new Date(next).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diff > 3) score += 24;
    else if (diff >= 1) score += 18;
    else if (diff === 0) score += 14;
  }

  return Math.min(score, 100);
}

function matchesView(view: string, status: string) {
  const s = status.toLowerCase();

  if (view === "all") return true;
  if (view === "open") return s !== "won" && s !== "lost";
  if (view === "quoted") return s === "quoted";
  if (view === "won") return s === "won";
  if (view === "dormant") return s === "dormant";
  return true;
}

function badgeStyleForStatus(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "won") {
    return {
      background: "rgba(0,160,80,0.14)",
      border: "1px solid rgba(0,160,80,0.18)",
      color: "#0b6b3a",
    };
  }

  if (s === "quoted") {
    return {
      background: "rgba(0,120,255,0.12)",
      border: "1px solid rgba(0,120,255,0.16)",
      color: "#0b4fae",
    };
  }

  if (s === "follow up") {
    return {
      background: "rgba(255,180,0,0.14)",
      border: "1px solid rgba(255,180,0,0.18)",
      color: "#946200",
    };
  }

  if (s === "lost") {
    return {
      background: "rgba(180,0,0,0.12)",
      border: "1px solid rgba(180,0,0,0.16)",
      color: "#8f1b1b",
    };
  }

  return {
    background: "rgba(0,0,0,0.05)",
    border: "1px solid rgba(0,0,0,0.08)",
    color: "#111",
  };
}

type OpportunityPageProps = {
  searchParams?: {
    owner?: string;
    view?: string;
  };
};

export default async function OpportunityTrackingPage({
  searchParams,
}: OpportunityPageProps) {
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const selectedOwner = String(searchParams?.owner ?? "all");
  const selectedView = String(searchParams?.view ?? "open");

  const { data: leads, error } = await supabase
    .from("sales_leads")
    .select(`
      id,
      company_name,
      contact_name,
      email,
      phone,
      status,
      lead_score,
      do_not_contact,
      archived,
      next_follow_up_on,
      services,
      assigned_to_username,
      notes,
      lead_source,
      created_at,
      updated_at
    `)
    .eq("archived", false)
    .order("updated_at", { ascending: false });

  const allRows = (leads ?? []).filter((lead: any) => !lead.archived);

  const owners = Array.from(
    new Set(
      allRows
        .map((lead: any) => String(lead.assigned_to_username ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredRows = allRows.filter((lead: any) => {
    const ownerOk =
      selectedOwner === "all" ||
      String(lead.assigned_to_username ?? "").trim() === selectedOwner;

    const viewOk = matchesView(selectedView, String(lead.status ?? ""));

    return ownerOk && viewOk;
  });

  const stageOrder = [
    "New",
    "To Contact",
    "Contacted",
    "Follow Up",
    "Quoted",
    "Won",
    "Dormant",
    "Lost",
  ];

  const grouped = stageOrder.map((stage) => {
    const items = filteredRows
      .filter((lead: any) => stageLabel(lead.status) === stage)
      .map((lead: any) => ({
        ...lead,
        weighted_score: Math.round(Number(lead.lead_score ?? 0) * stageWeight(lead.status)),
        priority_score: priorityScore(lead, today),
      }))
      .sort((a: any, b: any) => b.priority_score - a.priority_score);

    return {
      stage,
      items,
    };
  });

  const openRows = filteredRows.filter((lead: any) => isOpenStatus(lead.status));
  const hotRows = openRows.filter((lead: any) => Number(lead.lead_score ?? 0) >= 75);
  const quotedRows = filteredRows.filter((lead: any) => String(lead.status ?? "") === "Quoted");
  const wonRows = filteredRows.filter((lead: any) => String(lead.status ?? "") === "Won");

  const weightedForecast = openRows.reduce((sum: number, lead: any) => {
    return sum + Number(lead.lead_score ?? 0) * stageWeight(lead.status);
  }, 0);

  const hotList = [...openRows]
    .map((lead: any) => ({
      ...lead,
      priority_score: priorityScore(lead, today),
      weighted_score: Math.round(Number(lead.lead_score ?? 0) * stageWeight(lead.status)),
    }))
    .sort((a: any, b: any) => b.priority_score - a.priority_score)
    .slice(0, 12);

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Opportunity Tracking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Pipeline board and weighted forecast using your live lead stages.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/leads/new" style={primaryBtn}>
              + Add lead
            </a>
          </div>
        </div>

        {error ? <div style={errorCard}>{error.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Open opportunities" value={String(openRows.length)} />
          <StatCard label="Hot opportunities" value={String(hotRows.length)} />
          <StatCard label="Quoted" value={String(quotedRows.length)} />
          <StatCard label="Won" value={String(wonRows.length)} />
          <StatCard label="Weighted forecast" value={String(Math.round(weightedForecast))} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/opportunities" style={filterGrid}>
            <div>
              <label style={labelStyle}>View</label>
              <select name="view" defaultValue={selectedView} style={inputStyle}>
                <option value="open">Open pipeline</option>
                <option value="all">All stages</option>
                <option value="quoted">Quoted only</option>
                <option value="won">Won only</option>
                <option value="dormant">Dormant only</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Owner</label>
              <select name="owner" defaultValue={selectedOwner} style={inputStyle}>
                <option value="all">All owners</option>
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Apply
              </button>
              <a href="/sales-hub/opportunities" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <div style={topSectionGrid}>
          <section style={panelStyle}>
            <h2 style={sectionTitle}>Hot opportunities</h2>

            {!hotList.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No hot opportunities in the current filter.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {hotList.map((lead: any) => (
                  <div key={lead.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.contact_name || "No contact name"}
                          {lead.assigned_to_username ? ` • ${lead.assigned_to_username}` : ""}
                          {lead.status ? ` • ${lead.status}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Follow-up {fmtDate(lead.next_follow_up_on)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <MiniBadge label={`Lead ${lead.lead_score ?? 0}`} />
                        <MiniBadge label={`Weighted ${lead.weighted_score}`} />
                        <MiniBadge label={`Priority ${lead.priority_score}`} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <a href={`/sales-hub/leads/${lead.id}`} style={secondaryBtn}>
                        Open lead
                      </a>
                      <a href={`/sales-hub/leads/${lead.id}/outreach`} style={primaryBtn}>
                        Outreach
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitle}>How forecast works</h2>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={tipRow}>This first version uses your existing lead score and current stage.</div>
              <div style={tipRow}>Weighted forecast = lead score × stage weighting.</div>
              <div style={tipRow}>Quoted and Follow Up leads naturally rise higher than New or Dormant leads.</div>
              <div style={tipRow}>This keeps it safe for live use without needing any database change.</div>
            </div>
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Pipeline board</h2>

          <div style={boardGrid}>
            {grouped.map((group) => (
              <div key={group.stage} style={columnCard}>
                <div style={columnHeader}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{group.stage}</div>
                  <div style={countBadge}>{group.items.length}</div>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {group.items.length === 0 ? (
                    <div style={emptyCard}>No leads</div>
                  ) : (
                    group.items.map((lead: any) => (
                      <div key={lead.id} style={leadCard}>
                        <div
                          style={{
                            ...statusBadge,
                            ...badgeStyleForStatus(lead.status),
                          }}
                        >
                          {lead.status || "New"}
                        </div>

                        <div style={{ marginTop: 10, fontWeight: 900, wordBreak: "break-word" }}>
                          {lead.company_name}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.contact_name || "No contact name"}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.assigned_to_username || "Unassigned"}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Follow-up {fmtDate(lead.next_follow_up_on)}
                        </div>

                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <MiniBadge label={`Lead ${lead.lead_score ?? 0}`} />
                          <MiniBadge label={`Weighted ${lead.weighted_score}`} />
                        </div>

                        {Array.isArray(lead.services) && lead.services.length ? (
                          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.76 }}>
                            {lead.services.join(", ")}
                          </div>
                        ) : null}

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                          <a href={`/sales-hub/leads/${lead.id}`} style={miniBtn}>
                            Open
                          </a>
                          <a href={`/sales-hub/leads/${lead.id}/outreach`} style={miniBtnDark}>
                            Outreach
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

function MiniBadge({ label }: { label: string }) {
  return <div style={miniBadge}>{label}</div>;
}

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const topSectionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.75fr)",
  gap: 16,
  marginTop: 16,
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 260px) minmax(220px, 260px) auto",
  gap: 12,
  alignItems: "end",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const itemCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const itemTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const boardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 14,
};

const columnCard: React.CSSProperties = {
  padding: "12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.5)",
  border: "1px solid rgba(0,0,0,0.08)",
  minHeight: 220,
};

const columnHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const countBadge: React.CSSProperties = {
  minWidth: 32,
  height: 32,
  borderRadius: 999,
  background: "rgba(0,0,0,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
};

const emptyCard: React.CSSProperties = {
  padding: "12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.75)",
  border: "1px dashed rgba(0,0,0,0.12)",
  opacity: 0.7,
};

const leadCard: React.CSSProperties = {
  padding: "12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const statusBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
};

const miniBadge: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 12,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniBtnDark: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const tipRow: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 600,
};
