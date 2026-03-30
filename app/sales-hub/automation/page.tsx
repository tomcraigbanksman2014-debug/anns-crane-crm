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

function moneyGBP(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  });
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
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
  return row?.end_date || row?.start_date || row?.job_date || row?.updated_at || row?.created_at || null;
}

function transportJobDate(row: any) {
  return row?.delivery_date || row?.transport_date || row?.updated_at || row?.created_at || null;
}

function isOpenStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  return s !== "won" && s !== "lost";
}

function probabilityForLead(lead: any) {
  const manual = Number(lead?.probability_percent);
  if (Number.isFinite(manual)) {
    return Math.max(0, Math.min(100, manual));
  }

  const status = String(lead?.status ?? "").toLowerCase();

  if (status === "new") return 10;
  if (status === "to contact") return 15;
  if (status === "contacted") return 25;
  if (status === "follow up") return 40;
  if (status === "quoted") return 65;
  if (status === "won") return 100;
  if (status === "dormant") return 8;
  return 0;
}

function weightedValue(lead: any) {
  const value = Number(lead?.opportunity_value ?? 0);
  const probability = probabilityForLead(lead);
  return value * (probability / 100);
}

function priorityScore(lead: any, today: string) {
  let score = Number(lead?.lead_score ?? 0);
  score += Math.round(probabilityForLead(lead) * 0.7);

  if (Number(lead?.opportunity_value ?? 0) >= 10000) score += 18;
  else if (Number(lead?.opportunity_value ?? 0) >= 5000) score += 12;
  else if (Number(lead?.opportunity_value ?? 0) > 0) score += 8;

  if (lead?.phone) score += 8;
  if (lead?.email) score += 6;

  const next = dateOnly(lead?.next_follow_up_on);
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

function dormantRecoveryScore(args: {
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

  const access = await getAccessContext();

  if (!access.user || !canCreateCustomers(access)) {
    redirect("/sales-hub/automation?error=You%20do%20not%20have%20permission%20to%20create%20recovery%20leads.");
  }

  const supabase = createSupabaseServerClient();
  const clientId = String(formData.get("client_id") ?? "").trim();

  if (!clientId) {
    redirect("/sales-hub/automation?error=Missing%20client%20id.");
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
      .select("id, status, archived")
      .eq("converted_client_id", clientId)
      .eq("archived", false),
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
    redirect("/sales-hub/automation?error=Client%20not%20found.");
  }

  if (jobsError || transportError) {
    redirect("/sales-hub/automation?error=Could%20not%20read%20client%20history.");
  }

  const existingOpenLead =
    (existingLead ?? []).find((lead: any) => !lead.archived && isOpenStatus(lead.status)) ?? null;

  if (existingOpenLead?.id) {
    redirect(`/sales-hub/leads/${existingOpenLead.id}?success=${encodeURIComponent("Recovery lead already existed, opened existing lead.")}`);
  }

  const validJobs = (jobs ?? []).filter(validCraneJob);
  const validTransport = (transportJobs ?? []).filter(validTransportJob);

  const craneCount = validJobs.length;
  const transportCount = validTransport.length;

  const lastActivity = latestDate([
    latestDate(validJobs.map(craneJobDate)),
    latestDate(validTransport.map(transportJobDate)),
  ]);

  const dormantDays = daysSince(lastActivity) ?? 0;

  const leadScore = dormantRecoveryScore({
    craneCount,
    transportCount,
    dormantDays,
    hasPhone: Boolean(client.phone),
    hasEmail: Boolean(client.email),
  });

  const services: string[] = [];
  if (craneCount > 0) services.push("Crane Hire");
  if (transportCount > 0) services.push("Transport");

  const assignedUsername = fromAuthEmail(authRes.data.user?.email ?? null) || null;

  const noteLines = [
    "Created from Automation Centre.",
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
      lead_source: "Automation Centre",
      status: "Dormant",
      services,
      notes: noteLines.join(" "),
      lead_score: leadScore,
      do_not_contact: false,
      next_follow_up_on: new Date().toISOString().slice(0, 10),
      assigned_to_username: assignedUsername,
      converted_client_id: client.id,
    })
    .select("id")
    .single();

  if (createError || !createdLead?.id) {
    redirect(`/sales-hub/automation?error=${encodeURIComponent(createError?.message || "Could not create recovery lead.")}`);
  }

  await writeAuditLog({
    actor_user_id: authRes.data.user?.id ?? null,
    actor_username: assignedUsername,
    action: "sales_recovery_lead_created_from_automation_centre",
    entity_type: "sales_recovery_lead",
    entity_id: createdLead.id,
    meta: {
      client_id: client.id,
      company_name: client.company_name,
      crane_count: craneCount,
      transport_count: transportCount,
      dormant_days: dormantDays,
      lead_score: leadScore,
    },
  });

  redirect(`/sales-hub/leads/${createdLead.id}?success=${encodeURIComponent("Recovery lead created.")}`);
}

type AutomationCentrePageProps = {
  searchParams?: {
    owner?: string;
    error?: string;
  };
};

export default async function AutomationCentrePage({
  searchParams,
}: AutomationCentrePageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();
  const canCreate = !!access.user && canCreateCustomers(access);

  const today = new Date().toISOString().slice(0, 10);
  const closeWindowEnd = addDays(new Date(), 7).toISOString().slice(0, 10);
  const selectedOwner = String(searchParams?.owner ?? "all").trim();
  const errorMessage = String(searchParams?.error ?? "");

  const [
    { data: leads, error: leadsError },
    { data: clients, error: clientsError },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportError },
  ] = await Promise.all([
    supabase
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
        last_contacted_at,
        services,
        assigned_to_username,
        converted_client_id,
        updated_at,
        opportunity_value,
        probability_percent,
        expected_close_date
      `)
      .eq("archived", false)
      .order("updated_at", { ascending: false }),

    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("jobs")
      .select("id, client_id, job_date, start_date, end_date, status, updated_at, created_at")
      .not("client_id", "is", null),

    supabase
      .from("transport_jobs")
      .select("id, client_id, transport_date, delivery_date, status, updated_at, created_at")
      .not("client_id", "is", null),
  ]);

  const owners = Array.from(
    new Set(
      (leads ?? [])
        .map((lead: any) => String(lead.assigned_to_username ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const leadRows = (leads ?? []).filter((lead: any) => {
    if (lead.archived || lead.do_not_contact) return false;
    if (selectedOwner === "all") return true;
    return String(lead.assigned_to_username ?? "").trim() === selectedOwner;
  });

  const overdueFollowUps = leadRows
    .filter((lead: any) => {
      return (
        isOpenStatus(lead.status) &&
        !!lead.next_follow_up_on &&
        dateOnly(lead.next_follow_up_on) <= today
      );
    })
    .map((lead: any) => ({
      ...lead,
      probability: probabilityForLead(lead),
      weighted_value: weightedValue(lead),
      priority_score: priorityScore(lead, today),
    }))
    .sort((a: any, b: any) => {
      if (a.next_follow_up_on !== b.next_follow_up_on) {
        return String(a.next_follow_up_on ?? "").localeCompare(String(b.next_follow_up_on ?? ""));
      }
      return b.priority_score - a.priority_score;
    });

  const staleQuotes = leadRows
    .filter((lead: any) => String(lead.status ?? "") === "Quoted")
    .map((lead: any) => {
      const referenceDate = lead.last_contacted_at || lead.updated_at || null;
      const staleDays = daysSince(referenceDate) ?? 0;

      return {
        ...lead,
        probability: probabilityForLead(lead),
        weighted_value: weightedValue(lead),
        stale_days: staleDays,
      };
    })
    .filter((lead: any) => lead.stale_days >= 7)
    .sort((a: any, b: any) => {
      if (b.stale_days !== a.stale_days) return b.stale_days - a.stale_days;
      return Number(b.weighted_value ?? 0) - Number(a.weighted_value ?? 0);
    });

  const nearCloseOpportunities = leadRows
    .filter((lead: any) => {
      return (
        isOpenStatus(lead.status) &&
        !!lead.expected_close_date &&
        dateOnly(lead.expected_close_date) >= today &&
        dateOnly(lead.expected_close_date) <= closeWindowEnd
      );
    })
    .map((lead: any) => ({
      ...lead,
      probability: probabilityForLead(lead),
      weighted_value: weightedValue(lead),
      priority_score: priorityScore(lead, today),
    }))
    .sort((a: any, b: any) => {
      if (a.expected_close_date !== b.expected_close_date) {
        return String(a.expected_close_date ?? "").localeCompare(String(b.expected_close_date ?? ""));
      }
      return Number(b.weighted_value ?? 0) - Number(a.weighted_value ?? 0);
    });

  const unassignedHotOpportunities = leadRows
    .filter((lead: any) => isOpenStatus(lead.status))
    .filter((lead: any) => !String(lead.assigned_to_username ?? "").trim())
    .map((lead: any) => ({
      ...lead,
      probability: probabilityForLead(lead),
      weighted_value: weightedValue(lead),
      priority_score: priorityScore(lead, today),
    }))
    .filter((lead: any) => {
      return (
        Number(lead.lead_score ?? 0) >= 70 ||
        Number(lead.opportunity_value ?? 0) > 0 ||
        Number(lead.probability ?? 0) >= 50 ||
        String(lead.status ?? "") === "Quoted"
      );
    })
    .sort((a: any, b: any) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return Number(b.weighted_value ?? 0) - Number(a.weighted_value ?? 0);
    });

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

  const openLeadByClientId = new Map<string, any>();
  for (const lead of leads ?? []) {
    const key = String((lead as any).converted_client_id ?? "");
    if (!key) continue;
    if (!(lead as any).archived && isOpenStatus((lead as any).status) && !(lead as any).do_not_contact) {
      openLeadByClientId.set(key, lead);
    }
  }

  const dormantRecoveryCandidates = (clients ?? [])
    .map((client: any) => {
      const clientJobs = jobsByClient.get(String(client.id)) ?? [];
      const clientTransport = transportByClient.get(String(client.id)) ?? [];

      const craneCount = clientJobs.length;
      const transportCount = clientTransport.length;
      const totalCount = craneCount + transportCount;

      if (totalCount === 0) return null;
      if (openLeadByClientId.has(String(client.id))) return null;

      const lastActivity = latestDate([
        latestDate(clientJobs.map(craneJobDate)),
        latestDate(clientTransport.map(transportJobDate)),
      ]);

      const dormantDays = daysSince(lastActivity);
      if (dormantDays == null || dormantDays < 90) return null;

      const score = dormantRecoveryScore({
        craneCount,
        transportCount,
        dormantDays,
        hasPhone: Boolean(client.phone),
        hasEmail: Boolean(client.email),
      });

      return {
        client,
        craneCount,
        transportCount,
        lastActivity,
        dormantDays,
        score,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.dormantDays ?? 0) - (a.dormantDays ?? 0);
    });

  const totalActions =
    overdueFollowUps.length +
    staleQuotes.length +
    nearCloseOpportunities.length +
    unassignedHotOpportunities.length +
    dormantRecoveryCandidates.length;

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Automation Centre</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Smart action flags for follow-ups, quotes, opportunities and dormant recovery.
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

        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {clientsError ? <div style={errorCard}>{clientsError.message}</div> : null}
        {jobsError ? <div style={errorCard}>{jobsError.message}</div> : null}
        {transportError ? <div style={errorCard}>{transportError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Total actions" value={String(totalActions)} />
          <StatCard label="Overdue follow-ups" value={String(overdueFollowUps.length)} />
          <StatCard label="Stale quotes" value={String(staleQuotes.length)} />
          <StatCard label="Near close (7 days)" value={String(nearCloseOpportunities.length)} />
          <StatCard label="Unassigned hot" value={String(unassignedHotOpportunities.length)} />
          <StatCard label="Dormant recovery" value={String(dormantRecoveryCandidates.length)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/automation" style={filterGrid}>
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
              <a href="/sales-hub/automation" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <div style={sectionGrid}>
          <section style={panelStyle}>
            <h2 style={sectionTitle}>Overdue follow-ups</h2>

            {!overdueFollowUps.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No overdue follow-ups in the current filter.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {overdueFollowUps.map((lead: any) => (
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
                          Due {fmtDate(lead.next_follow_up_on)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <MiniBadge label={`Priority ${lead.priority_score}`} />
                        <MiniBadge label={`Weighted ${moneyGBP(lead.weighted_value)}`} />
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
            <h2 style={sectionTitle}>Stale quotes</h2>

            {!staleQuotes.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No stale quoted opportunities right now.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {staleQuotes.map((lead: any) => (
                  <div key={lead.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.contact_name || "No contact name"}
                          {lead.assigned_to_username ? ` • ${lead.assigned_to_username}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Stale for {lead.stale_days} days
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <MiniBadge label={`Value ${moneyGBP(lead.opportunity_value)}`} />
                        <MiniBadge label={`Weighted ${moneyGBP(lead.weighted_value)}`} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <a href={`/sales-hub/opportunities/${lead.id}`} style={secondaryBtn}>
                        Opportunity
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
            <h2 style={sectionTitle}>Near-close opportunities</h2>

            {!nearCloseOpportunities.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No close-date opportunities due in the next 7 days.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {nearCloseOpportunities.map((lead: any) => (
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
                          Close target {fmtDate(lead.expected_close_date)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <MiniBadge label={`Prob ${lead.probability}%`} />
                        <MiniBadge label={`Weighted ${moneyGBP(lead.weighted_value)}`} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <a href={`/sales-hub/opportunities/${lead.id}`} style={secondaryBtn}>
                        Opportunity
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
            <h2 style={sectionTitle}>Unassigned hot opportunities</h2>

            {!unassignedHotOpportunities.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No unassigned hot opportunities right now.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {unassignedHotOpportunities.map((lead: any) => (
                  <div key={lead.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.contact_name || "No contact name"} • Unassigned
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.status || "New"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <MiniBadge label={`Priority ${lead.priority_score}`} />
                        <MiniBadge label={`Value ${moneyGBP(lead.opportunity_value)}`} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <a href={`/sales-hub/opportunities/${lead.id}`} style={secondaryBtn}>
                        Opportunity
                      </a>
                      <a href={`/sales-hub/leads/${lead.id}`} style={secondaryBtn}>
                        Lead
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitle}>Dormant recovery candidates</h2>

            {!dormantRecoveryCandidates.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No dormant recovery candidates right now.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {dormantRecoveryCandidates.map((row: any) => (
                  <div key={row.client.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{row.client.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {row.client.contact_name || "No contact name"}
                          {row.client.phone ? ` • ${row.client.phone}` : ""}
                          {row.client.email ? ` • ${row.client.email}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Last service {fmtDate(row.lastActivity)} • Crane {row.craneCount} • Transport {row.transportCount}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <MiniBadge label={`Dormant ${row.dormantDays}d`} />
                        <MiniBadge label={`Score ${row.score}`} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      {canCreate ? (
                        <form action={createRecoveryLead}>
                          <input type="hidden" name="client_id" value={row.client.id} />
                          <button type="submit" style={primaryBtn}>
                            Create recovery lead
                          </button>
                        </form>
                      ) : (
                        <div style={mutedNote}>No permission to create recovery lead.</div>
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

const sectionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
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
