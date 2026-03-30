import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function latestDate(values: Array<string | null | undefined>) {
  const valid = values
    .map((value) => {
      const d = new Date(String(value ?? ""));
      return Number.isNaN(d.getTime()) ? null : d;
    })
    .filter(Boolean) as Date[];

  if (valid.length === 0) return null;
  valid.sort((a, b) => b.getTime() - a.getTime());
  return valid[0].toISOString();
}

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function validCraneJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "draft" && status !== "cancelled" && status !== "late_cancelled";
}

function validTransportJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "cancelled";
}

function craneJobDate(row: any) {
  return row?.end_date || row?.start_date || row?.job_date || row?.updated_at || row?.created_at || null;
}

function transportJobDate(row: any) {
  return row?.delivery_date || row?.transport_date || row?.updated_at || row?.created_at || null;
}

function crossSellType(craneCount: number, transportCount: number) {
  if (craneCount > 0 && transportCount === 0) return "crane_to_transport";
  if (transportCount > 0 && craneCount === 0) return "transport_to_crane";
  if (craneCount > 0 && transportCount > 0) return "both_to_full_package";
  return null;
}

function promptDetails(type: string | null) {
  if (type === "crane_to_transport") {
    return {
      title: "Offer HIAB / Transport Support",
      serviceFocus: "HIAB Transport",
      summary:
        "This customer already uses crane hire but has no transport history recorded. Good next sell: HIAB transport, machinery moves, container work and support vehicles.",
    };
  }

  if (type === "transport_to_crane") {
    return {
      title: "Offer Crane Hire / Contract Lift",
      serviceFocus: "Crane Hire",
      summary:
        "This customer already uses transport but has no crane history recorded. Good next sell: crane hire, contract lifts, spider crane work and lifting support.",
    };
  }

  if (type === "both_to_full_package") {
    return {
      title: "Offer Contract Lift / Full Package",
      serviceFocus: "Contract Lift",
      summary:
        "This customer already uses both cranes and transport. Good next sell: higher-value full package work, planning, lifting operations and contract lift support.",
    };
  }

  return {
    title: "Cross-sell review",
    serviceFocus: "Crane Hire",
    summary: "Review this customer for additional services.",
  };
}

function promptScore(args: {
  craneCount: number;
  transportCount: number;
  dormantDays: number;
  hasPhone: boolean;
  hasEmail: boolean;
  type: string | null;
}) {
  let score = 0;

  const history = args.craneCount + args.transportCount;
  score += Math.min(history * 7, 42);

  if (args.type === "crane_to_transport" || args.type === "transport_to_crane") {
    score += 22;
  } else if (args.type === "both_to_full_package") {
    score += 15;
  }

  if (args.hasPhone) score += 14;
  if (args.hasEmail) score += 10;

  if (args.dormantDays <= 90) score += 18;
  else if (args.dormantDays <= 180) score += 14;
  else if (args.dormantDays <= 365) score += 10;
  else score += 6;

  return Math.min(score, 100);
}

async function createCrossSellLead(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  if (!access.user || !canCreateCustomers(access)) {
    redirect("/sales-hub/cross-sell-prompts?error=You%20do%20not%20have%20permission%20to%20create%20cross-sell%20leads.");
  }

  const clientId = String(formData.get("client_id") ?? "").trim();

  if (!clientId) {
    redirect("/sales-hub/cross-sell-prompts?error=Missing%20client%20id.");
  }

  const [
    { data: client, error: clientError },
    { data: existingLead },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportError },
    { data: authRes },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, notes")
      .eq("id", clientId)
      .single(),
    supabase
      .from("sales_leads")
      .select("id, status")
      .eq("converted_client_id", clientId)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("id, client_id, job_date, start_date, end_date, status, updated_at, created_at")
      .eq("client_id", clientId),
    supabase
      .from("transport_jobs")
      .select("id, client_id, transport_date, delivery_date, status, updated_at, created_at")
      .eq("client_id", clientId),
    supabase.auth.getUser(),
  ]);

  if (clientError || !client) {
    redirect("/sales-hub/cross-sell-prompts?error=Client%20not%20found.");
  }

  if (jobsError || transportError) {
    redirect("/sales-hub/cross-sell-prompts?error=Could%20not%20read%20client%20history.");
  }

  if (existingLead?.id) {
    redirect(`/sales-hub/leads/${existingLead.id}?success=${encodeURIComponent("Cross-sell lead already existed, opened existing lead.")}`);
  }

  const validJobs = (jobs ?? []).filter(validCraneJob);
  const validTransport = (transportJobs ?? []).filter(validTransportJob);

  const craneCount = validJobs.length;
  const transportCount = validTransport.length;
  const type = crossSellType(craneCount, transportCount);
  const details = promptDetails(type);
  const lastActivity = latestDate([
    latestDate(validJobs.map(craneJobDate)),
    latestDate(validTransport.map(transportJobDate)),
  ]);
  const dormantDays = daysSince(lastActivity) ?? 0;

  const score = promptScore({
    craneCount,
    transportCount,
    dormantDays,
    hasPhone: Boolean(client.phone),
    hasEmail: Boolean(client.email),
    type,
  });

  const assignedUsername = fromAuthEmail(authRes.user?.email ?? null) || null;

  const noteLines = [
    "Created from Cross-Sell Prompts.",
    details.summary,
    `Crane jobs: ${craneCount}.`,
    `Transport jobs: ${transportCount}.`,
    lastActivity ? `Last service date: ${fmtDate(lastActivity)}.` : "Last service date: unknown.",
    `Dormant for approximately ${dormantDays} days.`,
    client.notes ? `Existing client notes: ${client.notes}` : "",
  ].filter(Boolean);

  const { data: createdLead, error: createError } = await supabase
    .from("sales_leads")
    .insert({
      company_name: client.company_name,
      contact_name: client.contact_name || null,
      email: client.email || null,
      phone: client.phone || null,
      address: client.address || null,
      lead_source: "Cross-Sell Prompt",
      status: "To Contact",
      services: [details.serviceFocus],
      notes: noteLines.join(" "),
      lead_score: score,
      do_not_contact: false,
      next_follow_up_on: new Date().toISOString().slice(0, 10),
      assigned_to_username: assignedUsername,
      converted_client_id: client.id,
    })
    .select("id")
    .single();

  if (createError || !createdLead?.id) {
    redirect(`/sales-hub/cross-sell-prompts?error=${encodeURIComponent(createError?.message || "Could not create cross-sell lead.")}`);
  }

  await writeAuditLog({
    actor_user_id: authRes.user?.id ?? null,
    actor_username: assignedUsername,
    action: "sales_cross_sell_lead_created",
    entity_type: "sales_cross_sell_lead",
    entity_id: createdLead.id,
    meta: {
      client_id: client.id,
      company_name: client.company_name,
      prompt_type: type,
      crane_count: craneCount,
      transport_count: transportCount,
      last_activity: lastActivity,
      lead_score: score,
    },
  });

  redirect(`/sales-hub/leads/${createdLead.id}?success=${encodeURIComponent("Cross-sell lead created.")}`);
}

type CrossSellPageProps = {
  searchParams?: {
    type?: string;
    error?: string;
  };
};

export default async function CrossSellPromptsPage({
  searchParams,
}: CrossSellPageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();
  const canCreate = !!access.user && canCreateCustomers(access);

  const typeFilter = String(searchParams?.type ?? "all").trim().toLowerCase();
  const errorMessage = String(searchParams?.error ?? "");

  const [
    { data: clients, error: clientsError },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportError },
    { data: existingLeads, error: leadsError },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("jobs")
      .select("id, client_id, job_date, start_date, end_date, status, updated_at, created_at"),

    supabase
      .from("transport_jobs")
      .select("id, client_id, transport_date, delivery_date, status, updated_at, created_at"),

    supabase
      .from("sales_leads")
      .select("id, company_name, converted_client_id, status")
      .not("converted_client_id", "is", null),
  ]);

  const jobsByClient = new Map<string, any[]>();
  for (const row of (jobs ?? []).filter(validCraneJob)) {
    const key = String((row as any).client_id ?? "");
    if (!key) continue;
    if (!jobsByClient.has(key)) jobsByClient.set(key, []);
    jobsByClient.get(key)!.push(row);
  }

  const transportByClient = new Map<string, any[]>();
  for (const row of (transportJobs ?? []).filter(validTransportJob)) {
    const key = String((row as any).client_id ?? "");
    if (!key) continue;
    if (!transportByClient.has(key)) transportByClient.set(key, []);
    transportByClient.get(key)!.push(row);
  }

  const leadByClientId = new Map<string, any>();
  for (const lead of existingLeads ?? []) {
    const key = String((lead as any).converted_client_id ?? "");
    if (!key) continue;
    leadByClientId.set(key, lead);
  }

  const prompts = (clients ?? [])
    .map((client: any) => {
      const clientJobs = jobsByClient.get(String(client.id)) ?? [];
      const clientTransport = transportByClient.get(String(client.id)) ?? [];

      const craneCount = clientJobs.length;
      const transportCount = clientTransport.length;
      const totalCount = craneCount + transportCount;
      const type = crossSellType(craneCount, transportCount);

      if (!type || totalCount === 0) return null;

      const details = promptDetails(type);

      const lastActivity = latestDate([
        latestDate(clientJobs.map(craneJobDate)),
        latestDate(clientTransport.map(transportJobDate)),
      ]);
      const dormantDays = daysSince(lastActivity) ?? 0;

      const score = promptScore({
        craneCount,
        transportCount,
        dormantDays,
        hasPhone: Boolean(client.phone),
        hasEmail: Boolean(client.email),
        type,
      });

      return {
        client,
        craneCount,
        transportCount,
        totalCount,
        type,
        details,
        lastActivity,
        dormantDays,
        score,
        existingLead: leadByClientId.get(String(client.id)) ?? null,
      };
    })
    .filter(Boolean)
    .filter((row: any) => {
      if (typeFilter === "crane_to_transport") return row.type === "crane_to_transport";
      if (typeFilter === "transport_to_crane") return row.type === "transport_to_crane";
      if (typeFilter === "both_to_full_package") return row.type === "both_to_full_package";
      return true;
    })
    .sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.dormantDays ?? 0) - (b.dormantDays ?? 0);
    });

  const craneToTransportCount = prompts.filter((row: any) => row.type === "crane_to_transport").length;
  const transportToCraneCount = prompts.filter((row: any) => row.type === "transport_to_crane").length;
  const bothToFullPackageCount = prompts.filter((row: any) => row.type === "both_to_full_package").length;
  const existingLeadCount = prompts.filter((row: any) => Boolean(row.existingLead)).length;

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Cross-Sell Prompts</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Find customers already buying one service and prompt the office to offer the next one.
            </p>
          </div>

          <a href="/sales-hub" style={secondaryBtn}>
            ← Sales Hub
          </a>
        </div>

        {clientsError ? <div style={errorCard}>{clientsError.message}</div> : null}
        {jobsError ? <div style={errorCard}>{jobsError.message}</div> : null}
        {transportError ? <div style={errorCard}>{transportError.message}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Cross-sell prompts" value={String(prompts.length)} />
          <StatCard label="Crane → Transport" value={String(craneToTransportCount)} />
          <StatCard label="Transport → Crane" value={String(transportToCraneCount)} />
          <StatCard label="Both → Full Package" value={String(bothToFullPackageCount)} />
          <StatCard label="Existing leads already open" value={String(existingLeadCount)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/cross-sell-prompts" style={filterGrid}>
            <div>
              <label style={labelStyle}>Prompt type</label>
              <select name="type" defaultValue={typeFilter} style={inputStyle}>
                <option value="all">All</option>
                <option value="crane_to_transport">Crane users to transport</option>
                <option value="transport_to_crane">Transport users to crane</option>
                <option value="both_to_full_package">Both services to full package</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Apply
              </button>
              <a href="/sales-hub/cross-sell-prompts" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          {!prompts.length ? (
            <p style={{ margin: 0, opacity: 0.78 }}>
              No cross-sell prompts matched the current filter.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {prompts.map((row: any) => (
                <div key={row.client.id} style={promptCard}>
                  <div style={promptTopRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, wordBreak: "break-word" }}>
                        {row.client.company_name}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                        {row.client.contact_name || "No contact name"}
                        {row.client.phone ? ` • ${row.client.phone}` : ""}
                        {row.client.email ? ` • ${row.client.email}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Badge label={row.details.title} />
                      <Badge label={`Score ${row.score}`} />
                    </div>
                  </div>

                  <div style={summaryBox}>{row.details.summary}</div>

                  <div style={infoGrid}>
                    <InfoLine label="Last service">{fmtDate(row.lastActivity)}</InfoLine>
                    <InfoLine label="Crane jobs">{String(row.craneCount)}</InfoLine>
                    <InfoLine label="Transport jobs">{String(row.transportCount)}</InfoLine>
                    <InfoLine label="Suggested service">{row.details.serviceFocus}</InfoLine>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                    {row.existingLead ? (
                      <>
                        <a href={`/sales-hub/leads/${row.existingLead.id}`} style={secondaryBtn}>
                          Open lead
                        </a>
                        <a href={`/sales-hub/leads/${row.existingLead.id}/outreach`} style={primaryBtn}>
                          Outreach
                        </a>
                      </>
                    ) : canCreate ? (
                      <form action={createCrossSellLead}>
                        <input type="hidden" name="client_id" value={row.client.id} />
                        <button type="submit" style={primaryBtn}>
                          Create Cross-Sell Lead
                        </button>
                      </form>
                    ) : (
                      <div style={mutedNote}>You do not have permission to create cross-sell leads.</div>
                    )}

                    <a href={`/customers/${row.client.id}`} style={secondaryBtn}>
                      Open customer
                    </a>
                  </div>
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
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.66, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 700 }}>{children}</div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return <div style={badgeStyle}>{label}</div>;
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

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 280px) auto",
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

const promptCard: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const promptTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const summaryBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.06)",
  fontWeight: 600,
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const badgeStyle: React.CSSProperties = {
  padding: "8px 10px",
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

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const mutedNote: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.76,
  fontWeight: 700,
};
