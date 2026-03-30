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

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
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

function validCraneJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "draft" && status !== "cancelled" && status !== "late_cancelled";
}

function validTransportJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "cancelled";
}

function craneJobDate(row: any) {
  return (
    row?.end_date ||
    row?.start_date ||
    row?.job_date ||
    row?.updated_at ||
    row?.created_at ||
    null
  );
}

function transportJobDate(row: any) {
  return (
    row?.delivery_date ||
    row?.transport_date ||
    row?.updated_at ||
    row?.created_at ||
    null
  );
}

function serviceLabel(craneCount: number, transportCount: number) {
  if (craneCount > 0 && transportCount > 0) return "Crane + Transport";
  if (craneCount > 0) return "Crane Hire";
  if (transportCount > 0) return "Transport";
  return "—";
}

function serviceArray(craneCount: number, transportCount: number) {
  const services: string[] = [];
  if (craneCount > 0) services.push("Crane Hire");
  if (transportCount > 0) services.push("Transport");
  return services;
}

function recoveryScore(args: {
  craneCount: number;
  transportCount: number;
  dormantDays: number;
  hasPhone: boolean;
  hasEmail: boolean;
}) {
  let score = 0;

  const totalHistory = args.craneCount + args.transportCount;
  score += Math.min(totalHistory * 8, 45);

  if (args.craneCount > 0 && args.transportCount > 0) score += 15;
  if (args.hasPhone) score += 15;
  if (args.hasEmail) score += 10;

  if (args.dormantDays >= 90 && args.dormantDays <= 180) score += 18;
  else if (args.dormantDays <= 365) score += 12;
  else score += 6;

  return Math.min(score, 100);
}

async function createRecoveryLead(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  if (!access.user || !canCreateCustomers(access)) {
    redirect("/sales-hub/dormant-customers?error=You%20do%20not%20have%20permission%20to%20create%20recovery%20leads.");
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!clientId) {
    redirect("/sales-hub/dormant-customers?error=Missing%20client%20id.");
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
      .select("id")
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
    redirect("/sales-hub/dormant-customers?error=Client%20not%20found.");
  }

  if (jobsError || transportError) {
    redirect("/sales-hub/dormant-customers?error=Could%20not%20read%20client%20history.");
  }

  if (existingLead?.id) {
    redirect(`/sales-hub/leads/${existingLead.id}?success=${encodeURIComponent("Recovery lead already existed, opened existing lead.")}`);
  }

  const validJobs = (jobs ?? []).filter(validCraneJob);
  const validTransport = (transportJobs ?? []).filter(validTransportJob);

  const lastCraneDate = latestDate(validJobs.map(craneJobDate));
  const lastTransportDate = latestDate(validTransport.map(transportJobDate));
  const lastActivity = latestDate([lastCraneDate, lastTransportDate]);
  const dormantDays = daysSince(lastActivity) ?? 0;

  const craneCount = validJobs.length;
  const transportCount = validTransport.length;
  const services = serviceArray(craneCount, transportCount);
  const score = recoveryScore({
    craneCount,
    transportCount,
    dormantDays,
    hasPhone: Boolean(client.phone),
    hasEmail: Boolean(client.email),
  });

  const assignedUsername = fromAuthEmail(authRes.data.user?.email ?? null) || null;

  const noteLines = [
    "Created from Dormant Customer Recovery.",
    `Historical service mix: ${serviceLabel(craneCount, transportCount)}.`,
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
      lead_source: "Dormant Customer Recovery",
      status: "Dormant",
      services,
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
    redirect(`/sales-hub/dormant-customers?error=${encodeURIComponent(createError?.message || "Could not create recovery lead.")}`);
  }

  await writeAuditLog({
    actor_user_id: authRes.data.user?.id ?? null,
    actor_username: assignedUsername,
    action: "sales_recovery_lead_created",
    entity_type: "sales_recovery_lead",
    entity_id: createdLead.id,
    meta: {
      client_id: client.id,
      company_name: client.company_name,
      crane_count: craneCount,
      transport_count: transportCount,
      last_activity: lastActivity,
      dormant_days: dormantDays,
      lead_score: score,
    },
  });

  redirect(`/sales-hub/leads/${createdLead.id}?success=${encodeURIComponent("Recovery lead created.")}`);
}

type DormantPageProps = {
  searchParams?: {
    days?: string;
    service?: string;
    error?: string;
  };
};

export default async function DormantCustomersPage({
  searchParams,
}: DormantPageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();
  const canCreate = !!access.user && canCreateCustomers(access);

  const threshold = Math.max(30, Number(searchParams?.days || 90) || 90);
  const serviceFilter = String(searchParams?.service ?? "all").trim().toLowerCase();
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

  const candidates = (clients ?? [])
    .map((client: any) => {
      const clientJobs = jobsByClient.get(String(client.id)) ?? [];
      const clientTransport = transportByClient.get(String(client.id)) ?? [];

      const craneCount = clientJobs.length;
      const transportCount = clientTransport.length;

      const lastCraneDate = latestDate(clientJobs.map(craneJobDate));
      const lastTransportDate = latestDate(clientTransport.map(transportJobDate));
      const lastActivity = latestDate([lastCraneDate, lastTransportDate]);
      const dormantDays = daysSince(lastActivity);

      const serviceMix = serviceLabel(craneCount, transportCount);
      const hasPhone = Boolean(client.phone);
      const hasEmail = Boolean(client.email);

      const score =
        dormantDays == null
          ? 0
          : recoveryScore({
              craneCount,
              transportCount,
              dormantDays,
              hasPhone,
              hasEmail,
            });

      return {
        client,
        craneCount,
        transportCount,
        totalCount: craneCount + transportCount,
        lastActivity,
        dormantDays,
        serviceMix,
        score,
        existingLead: leadByClientId.get(String(client.id)) ?? null,
        hasPhone,
        hasEmail,
      };
    })
    .filter((row) => row.totalCount > 0 && row.dormantDays != null && row.dormantDays >= threshold)
    .filter((row) => {
      if (serviceFilter === "crane") return row.craneCount > 0;
      if (serviceFilter === "transport") return row.transportCount > 0;
      if (serviceFilter === "both") return row.craneCount > 0 && row.transportCount > 0;
      return true;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.dormantDays ?? 0) - (a.dormantDays ?? 0);
    });

  const noContactCount = candidates.filter((row) => !row.hasPhone && !row.hasEmail).length;
  const bothServicesCount = candidates.filter((row) => row.craneCount > 0 && row.transportCount > 0).length;
  const highPriorityCount = candidates.filter((row) => row.score >= 70).length;

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Dormant Customer Recovery</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Find past customers who have gone quiet and turn them into reactivation leads.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
          </div>
        </div>

        {clientsError ? <div style={errorCard}>{clientsError.message}</div> : null}
        {jobsError ? <div style={errorCard}>{jobsError.message}</div> : null}
        {transportError ? <div style={errorCard}>{transportError.message}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Dormant candidates" value={String(candidates.length)} />
          <StatCard label="Threshold" value={`${threshold} days`} />
          <StatCard label="High priority" value={String(highPriorityCount)} />
          <StatCard label="Used both services" value={String(bothServicesCount)} />
          <StatCard label="No contact details" value={String(noContactCount)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/dormant-customers" style={filterGrid}>
            <div>
              <label style={labelStyle}>Dormant at least</label>
              <select name="days" defaultValue={String(threshold)} style={inputStyle}>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
                <option value="120">120 days</option>
                <option value="180">180 days</option>
                <option value="365">365 days</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Service filter</label>
              <select name="service" defaultValue={serviceFilter} style={inputStyle}>
                <option value="all">All</option>
                <option value="crane">Crane users</option>
                <option value="transport">Transport users</option>
                <option value="both">Both services</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Apply
              </button>
              <a href="/sales-hub/dormant-customers" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          {!candidates.length ? (
            <p style={{ margin: 0, opacity: 0.78 }}>
              No dormant customers matched your filters.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {candidates.map((row) => {
                const client = row.client;
                const existingLead = row.existingLead;

                return (
                  <div key={client.id} style={candidateCard}>
                    <div style={candidateTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, wordBreak: "break-word" }}>
                          {client.company_name}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {client.contact_name || "No contact name"}
                          {client.phone ? ` • ${client.phone}` : ""}
                          {client.email ? ` • ${client.email}` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Badge label={`Score ${row.score}`} />
                        <Badge label={`${row.dormantDays} days dormant`} />
                        <Badge label={row.serviceMix} />
                      </div>
                    </div>

                    <div style={infoGrid}>
                      <InfoLine label="Last service">{fmtDate(row.lastActivity)}</InfoLine>
                      <InfoLine label="Crane jobs">{String(row.craneCount)}</InfoLine>
                      <InfoLine label="Transport jobs">{String(row.transportCount)}</InfoLine>
                      <InfoLine label="Recovery lead">
                        {existingLead ? `Yes • ${existingLead.status ?? "Dormant"}` : "No"}
                      </InfoLine>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                      {existingLead ? (
                        <>
                          <a href={`/sales-hub/leads/${existingLead.id}`} style={secondaryBtn}>
                            Open lead
                          </a>
                          <a href={`/sales-hub/leads/${existingLead.id}/outreach`} style={secondaryBtn}>
                            Outreach
                          </a>
                        </>
                      ) : canCreate ? (
                        <form action={createRecoveryLead}>
                          <input type="hidden" name="client_id" value={client.id} />
                          <button type="submit" style={primaryBtn}>
                            Create Recovery Lead
                          </button>
                        </form>
                      ) : (
                        <div style={mutedNote}>You do not have permission to create recovery leads.</div>
                      )}

                      <a href={`/customers/${client.id}`} style={secondaryBtn}>
                        Open customer
                      </a>
                    </div>
                  </div>
                );
              })}
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
  return (
    <div style={badgeStyle}>
      {label}
    </div>
  );
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
  gridTemplateColumns: "minmax(180px, 220px) minmax(180px, 220px) auto",
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

const candidateCard: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const candidateTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
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
