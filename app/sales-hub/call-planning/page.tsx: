import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
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

function craneStart(row: any) {
  return row?.start_date || row?.job_date || row?.end_date || null;
}

function craneEnd(row: any) {
  return row?.end_date || row?.start_date || row?.job_date || null;
}

function transportStart(row: any) {
  return row?.transport_date || row?.delivery_date || null;
}

function transportEnd(row: any) {
  return row?.delivery_date || row?.transport_date || null;
}

function overlapsWindow(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
  windowStart: string,
  windowEnd: string
) {
  const start = dateOnly(startValue);
  const end = dateOnly(endValue || startValue);

  if (!start) return false;

  return start <= windowEnd && (end || start) >= windowStart;
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
        "This customer already uses crane hire but has no transport history recorded. Good next sell: HIAB transport, container work, machinery moves and support vehicles.",
    };
  }

  if (type === "transport_to_crane") {
    return {
      title: "Offer Crane Hire / Contract Lift",
      serviceFocus: "Crane Hire",
      summary:
        "This customer already uses transport but has no crane history recorded. Good next sell: crane hire, contract lifts, spider cranes and lifting support.",
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

function crossSellScore(args: {
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

function followUpPriority(lead: any, today: string) {
  let score = Number(lead?.lead_score ?? 0);
  const status = String(lead?.status ?? "").toLowerCase();
  const next = dateOnly(lead?.next_follow_up_on);

  if (status === "follow up") score += 25;
  else if (status === "to contact") score += 20;
  else if (status === "contacted") score += 15;
  else if (status === "dormant") score += 14;
  else if (status === "new") score += 12;
  else if (status === "quoted") score += 8;

  if (lead?.phone) score += 8;
  if (lead?.email) score += 6;

  if (!next && (status === "to contact" || status === "follow up" || status === "new")) {
    score += 12;
  }

  if (next) {
    const diff = Math.floor(
      (new Date(today).getTime() - new Date(next).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diff > 3) score += 25;
    else if (diff >= 1) score += 20;
    else if (diff === 0) score += 18;
    else if (diff === -1) score += 10;
  }

  return Math.min(score, 100);
}

function craneEligibleStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (!s) return true;
  return !s.includes("maintenance") && !s.includes("repair") && !s.includes("inactive");
}

function vehicleEligibleStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (!s) return true;
  return !s.includes("maintenance") && !s.includes("repair") && !s.includes("inactive");
}

function serviceMatch(assetType: "crane" | "transport", services: string[] | null | undefined) {
  const joined = (services ?? []).join(" ").toLowerCase();

  if (!joined.trim()) return 1;

  if (assetType === "crane") {
    if (
      joined.includes("crane") ||
      joined.includes("contract lift") ||
      joined.includes("spider") ||
      joined.includes("lifting")
    ) {
      return 3;
    }
    return 0;
  }

  if (
    joined.includes("transport") ||
    joined.includes("hiab") ||
    joined.includes("haulage") ||
    joined.includes("container") ||
    joined.includes("machinery")
  ) {
    return 3;
  }

  return 0;
}

function leadRank(assetType: "crane" | "transport", lead: any) {
  const serviceScore = serviceMatch(assetType, lead.services);
  if (serviceScore === 0) return -999;

  let score = 0;
  score += Number(lead.lead_score ?? 0);
  score += serviceScore * 15;

  const status = String(lead.status ?? "").toLowerCase();
  if (status === "follow up") score += 20;
  else if (status === "to contact") score += 18;
  else if (status === "contacted") score += 14;
  else if (status === "dormant") score += 16;
  else if (status === "quoted") score += 10;
  else if (status === "new") score += 12;
  else if (status === "won" || status === "lost") score -= 100;

  if (lead.phone) score += 8;
  if (lead.email) score += 6;
  if (lead.next_follow_up_on) score += 4;

  return score;
}

async function createRecoveryLead(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  if (!access.user || !canCreateCustomers(access)) {
    redirect("/sales-hub/call-planning?error=You%20do%20not%20have%20permission%20to%20create%20recovery%20leads.");
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!clientId) {
    redirect("/sales-hub/call-planning?error=Missing%20client%20id.");
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
    redirect("/sales-hub/call-planning?error=Client%20not%20found.");
  }

  if (jobsError || transportError) {
    redirect("/sales-hub/call-planning?error=Could%20not%20read%20client%20history.");
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
  const score = recoveryScore({
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
    "Created from Call Planning Dashboard (Dormant Recovery).",
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
    redirect(`/sales-hub/call-planning?error=${encodeURIComponent(createError?.message || "Could not create recovery lead.")}`);
  }

  await writeAuditLog({
    actor_user_id: authRes.data.user?.id ?? null,
    actor_username: assignedUsername,
    action: "sales_recovery_lead_created_from_call_dashboard",
    entity_type: "sales_recovery_lead",
    entity_id: createdLead.id,
    meta: {
      client_id: client.id,
      company_name: client.company_name,
      crane_count: craneCount,
      transport_count: transportCount,
      dormant_days: dormantDays,
      lead_score: score,
    },
  });

  redirect(`/sales-hub/leads/${createdLead.id}?success=${encodeURIComponent("Recovery lead created.")}`);
}

async function createCrossSellLead(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  if (!access.user || !canCreateCustomers(access)) {
    redirect("/sales-hub/call-planning?error=You%20do%20not%20have%20permission%20to%20create%20cross-sell%20leads.");
  }

  const clientId = String(formData.get("client_id") ?? "").trim();

  if (!clientId) {
    redirect("/sales-hub/call-planning?error=Missing%20client%20id.");
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
    redirect("/sales-hub/call-planning?error=Client%20not%20found.");
  }

  if (jobsError || transportError) {
    redirect("/sales-hub/call-planning?error=Could%20not%20read%20client%20history.");
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

  const score = crossSellScore({
    craneCount,
    transportCount,
    dormantDays,
    hasPhone: Boolean(client.phone),
    hasEmail: Boolean(client.email),
    type,
  });

  const assignedUsername = fromAuthEmail(authRes.data.user?.email ?? null) || null;

  const noteLines = [
    "Created from Call Planning Dashboard (Cross-Sell Prompt).",
    details.summary,
    `Crane jobs: ${craneCount}.`,
    `Transport jobs: ${transportCount}.`,
    lastActivity ? `Last service date: ${fmtDate(lastActivity)}.` : "Last service date: unknown.",
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
    redirect(`/sales-hub/call-planning?error=${encodeURIComponent(createError?.message || "Could not create cross-sell lead.")}`);
  }

  await writeAuditLog({
    actor_user_id: authRes.data.user?.id ?? null,
    actor_username: assignedUsername,
    action: "sales_cross_sell_lead_created_from_call_dashboard",
    entity_type: "sales_cross_sell_lead",
    entity_id: createdLead.id,
    meta: {
      client_id: client.id,
      company_name: client.company_name,
      prompt_type: type,
      crane_count: craneCount,
      transport_count: transportCount,
      lead_score: score,
    },
  });

  redirect(`/sales-hub/leads/${createdLead.id}?success=${encodeURIComponent("Cross-sell lead created.")}`);
}

type CallPlanningPageProps = {
  searchParams?: {
    days?: string;
    error?: string;
  };
};

export default async function CallPlanningPage({
  searchParams,
}: CallPlanningPageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();
  const canCreate = !!access.user && canCreateCustomers(access);

  const today = new Date().toISOString().slice(0, 10);
  const lookAheadDays = Math.max(1, Math.min(14, Number(searchParams?.days || 3) || 3));
  const availStart = addDays(new Date(), 1).toISOString().slice(0, 10);
  const availEnd = addDays(new Date(availStart), lookAheadDays - 1).toISOString().slice(0, 10);
  const errorMessage = String(searchParams?.error ?? "");

  const [
    { data: leads, error: leadsError },
    { data: clients, error: clientsError },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportError },
    { data: existingLeads, error: existingLeadsError },
    { data: cranes, error: cranesError },
    { data: vehicles, error: vehiclesError },
  ] = await Promise.all([
    supabase
      .from("sales_leads")
      .select("id, company_name, contact_name, phone, email, status, lead_score, do_not_contact, archived, next_follow_up_on, services, converted_client_id")
      .eq("archived", false)
      .order("lead_score", { ascending: false }),

    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("jobs")
      .select("id, client_id, crane_id, job_date, start_date, end_date, status, updated_at, created_at")
      .not("client_id", "is", null),

    supabase
      .from("transport_jobs")
      .select("id, client_id, vehicle_id, transport_date, delivery_date, status, updated_at, created_at")
      .not("client_id", "is", null),

    supabase
      .from("sales_leads")
      .select("id, company_name, converted_client_id, status")
      .not("converted_client_id", "is", null),

    supabase
      .from("cranes")
      .select("id, name, reg_number, fleet_number, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);

  const activeLeadRows = (leads ?? []).filter(
    (lead: any) =>
      !lead.archived &&
      !lead.do_not_contact &&
      !["won", "lost"].includes(String(lead.status ?? "").toLowerCase())
  );

  const followUpTasks = activeLeadRows
    .map((lead: any) => {
      const due = dateOnly(lead.next_follow_up_on);
      const status = String(lead.status ?? "").toLowerCase();

      const shouldShow =
        (due && due <= today) ||
        (!due && ["new", "to contact", "follow up", "contacted", "dormant", "quoted"].includes(status));

      if (!shouldShow) return null;

      return {
        id: lead.id,
        company_name: lead.company_name,
        contact_name: lead.contact_name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        next_follow_up_on: lead.next_follow_up_on,
        score: followUpPriority(lead, today),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 15);

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

  const dormantTasks = (clients ?? [])
    .map((client: any) => {
      const clientJobs = jobsByClient.get(String(client.id)) ?? [];
      const clientTransport = transportByClient.get(String(client.id)) ?? [];

      const craneCount = clientJobs.length;
      const transportCount = clientTransport.length;
      const totalCount = craneCount + transportCount;
      if (totalCount === 0) return null;

      const lastActivity = latestDate([
        latestDate(clientJobs.map(craneJobDate)),
        latestDate(clientTransport.map(transportJobDate)),
      ]);

      const dormantDays = daysSince(lastActivity);
      if (dormantDays == null || dormantDays < 90) return null;

      const score = recoveryScore({
        craneCount,
        transportCount,
        dormantDays,
        hasPhone: Boolean(client.phone),
        hasEmail: Boolean(client.email),
      });

      return {
        client,
        existingLead: leadByClientId.get(String(client.id)) ?? null,
        craneCount,
        transportCount,
        lastActivity,
        dormantDays,
        score,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  const crossSellTasks = (clients ?? [])
    .map((client: any) => {
      const clientJobs = jobsByClient.get(String(client.id)) ?? [];
      const clientTransport = transportByClient.get(String(client.id)) ?? [];
      const craneCount = clientJobs.length;
      const transportCount = clientTransport.length;

      const type = crossSellType(craneCount, transportCount);
      if (!type) return null;

      const details = promptDetails(type);
      const lastActivity = latestDate([
        latestDate(clientJobs.map(craneJobDate)),
        latestDate(clientTransport.map(transportJobDate)),
      ]);
      const dormantDays = daysSince(lastActivity) ?? 0;

      const score = crossSellScore({
        craneCount,
        transportCount,
        dormantDays,
        hasPhone: Boolean(client.phone),
        hasEmail: Boolean(client.email),
        type,
      });

      return {
        client,
        existingLead: leadByClientId.get(String(client.id)) ?? null,
        craneCount,
        transportCount,
        type,
        details,
        lastActivity,
        score,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  const bookedCraneIds = new Set(
    (jobs ?? [])
      .filter(
        (row: any) =>
          row.crane_id &&
          validCraneJob(row) &&
          overlapsWindow(craneStart(row), craneEnd(row), availStart, availEnd)
      )
      .map((row: any) => String(row.crane_id))
  );

  const bookedVehicleIds = new Set(
    (transportJobs ?? [])
      .filter(
        (row: any) =>
          row.vehicle_id &&
          validTransportJob(row) &&
          overlapsWindow(transportStart(row), transportEnd(row), availStart, availEnd)
      )
      .map((row: any) => String(row.vehicle_id))
  );

  const availabilityLeadPool = activeLeadRows;

  const freeCraneTasks = (cranes ?? [])
    .filter((crane: any) => craneEligibleStatus(crane.status))
    .filter((crane: any) => !bookedCraneIds.has(String(crane.id)))
    .map((crane: any) => ({
      assetType: "crane" as const,
      asset: crane,
      suggestions: [...availabilityLeadPool]
        .map((lead: any) => ({ lead, score: leadRank("crane", lead) }))
        .filter((row) => row.score > -999)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    }));

  const freeVehicleTasks = (vehicles ?? [])
    .filter((vehicle: any) => vehicleEligibleStatus(vehicle.status))
    .filter((vehicle: any) => !bookedVehicleIds.has(String(vehicle.id)))
    .map((vehicle: any) => ({
      assetType: "transport" as const,
      asset: vehicle,
      suggestions: [...availabilityLeadPool]
        .map((lead: any) => ({ lead, score: leadRank("transport", lead) }))
        .filter((row) => row.score > -999)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    }));

  const availabilityTasks = [...freeCraneTasks, ...freeVehicleTasks].slice(0, 8);

  const totalActions =
    followUpTasks.length + dormantTasks.length + crossSellTasks.length + availabilityTasks.length;

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Call Planning Dashboard</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Daily action screen for follow-ups, recovery, cross-sell and spare capacity selling.
            </p>
          </div>

          <a href="/sales-hub" style={secondaryBtn}>
            ← Sales Hub
          </a>
        </div>

        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {clientsError ? <div style={errorCard}>{clientsError.message}</div> : null}
        {jobsError ? <div style={errorCard}>{jobsError.message}</div> : null}
        {transportError ? <div style={errorCard}>{transportError.message}</div> : null}
        {existingLeadsError ? <div style={errorCard}>{existingLeadsError.message}</div> : null}
        {cranesError ? <div style={errorCard}>{cranesError.message}</div> : null}
        {vehiclesError ? <div style={errorCard}>{vehiclesError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Total actions" value={String(totalActions)} />
          <StatCard label="Follow-ups due" value={String(followUpTasks.length)} />
          <StatCard label="Dormant recovery" value={String(dormantTasks.length)} />
          <StatCard label="Cross-sell prompts" value={String(crossSellTasks.length)} />
          <StatCard label="Free assets" value={String(availabilityTasks.length)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/call-planning" style={filterGrid}>
            <div>
              <label style={labelStyle}>Availability look-ahead</label>
              <select name="days" defaultValue={String(lookAheadDays)} style={inputStyle}>
                <option value="1">Tomorrow only</option>
                <option value="3">Next 3 days</option>
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Apply
              </button>
              <a href="/sales-hub/call-planning" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <div style={sectionGrid}>
          <section style={panelStyle}>
            <h2 style={sectionTitle}>Lead follow-ups due now</h2>
            {!followUpTasks.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No urgent lead follow-ups right now.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {followUpTasks.map((lead: any) => (
                  <div key={lead.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                          {lead.contact_name || "No contact name"}
                          {lead.status ? ` • ${lead.status}` : ""}
                          {lead.phone ? ` • ${lead.phone}` : ""}
                          {lead.email ? ` • ${lead.email}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                          Next follow-up: {fmtDate(lead.next_follow_up_on)}
                        </div>
                      </div>

                      <Badge label={`Priority ${lead.score}`} />
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
            <h2 style={sectionTitle}>Dormant recovery opportunities</h2>
            {!dormantTasks.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No strong dormant recovery opportunities found.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {dormantTasks.map((row: any) => (
                  <div key={row.client.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{row.client.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                          {row.client.contact_name || "No contact name"}
                          {row.client.phone ? ` • ${row.client.phone}` : ""}
                          {row.client.email ? ` • ${row.client.email}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                          Last service {fmtDate(row.lastActivity)} • Crane {row.craneCount} • Transport {row.transportCount}
                        </div>
                      </div>

                      <Badge label={`Priority ${row.score}`} />
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
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

          <section style={panelStyle}>
            <h2 style={sectionTitle}>Cross-sell prompts</h2>
            {!crossSellTasks.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No strong cross-sell prompts found.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {crossSellTasks.map((row: any) => (
                  <div key={row.client.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{row.client.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                          {row.details.title}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                          Last service {fmtDate(row.lastActivity)} • Crane {row.craneCount} • Transport {row.transportCount}
                        </div>
                      </div>

                      <Badge label={`Priority ${row.score}`} />
                    </div>

                    <div style={summaryBox}>{row.details.summary}</div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
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
                            Create cross-sell lead
                          </button>
                        </form>
                      ) : (
                        <div style={mutedNote}>No permission to create cross-sell lead.</div>
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

          <section style={panelStyle}>
            <h2 style={sectionTitle}>Spare capacity selling</h2>
            <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.75 }}>
              Free assets between {fmtDate(availStart)} and {fmtDate(availEnd)}
            </div>

            {!availabilityTasks.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No free assets found in this window.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {availabilityTasks.map((row: any) => (
                  <div key={`${row.assetType}-${row.asset.id}`} style={itemCard}>
                    <div style={itemTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>
                          {row.asset.name || (row.assetType === "crane" ? "Crane" : "Vehicle")}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                          {row.assetType === "crane" ? "Crane" : "Transport"}
                          {row.asset.reg_number ? ` • ${row.asset.reg_number}` : ""}
                          {row.asset.fleet_number ? ` • ${row.asset.fleet_number}` : ""}
                          {row.asset.vehicle_type ? ` • ${row.asset.vehicle_type}` : ""}
                          {row.asset.capacity ? ` • ${row.asset.capacity}` : ""}
                        </div>
                      </div>

                      <Badge label={`${row.suggestions.length} suggestions`} />
                    </div>

                    {row.suggestions.length === 0 ? (
                      <div style={{ marginTop: 10, opacity: 0.78 }}>
                        No matching leads currently. Use Leads or Dormant Recovery to build more targets.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {row.suggestions.map((item: any) => (
                          <div key={item.lead.id} style={nestedCard}>
                            <div style={itemTopRow}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 800 }}>{item.lead.company_name}</div>
                                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                                  {item.lead.contact_name || "No contact name"}
                                  {item.lead.status ? ` • ${item.lead.status}` : ""}
                                </div>
                              </div>
                              <Badge label={`Rank ${item.score}`} />
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                              <a href={`/sales-hub/leads/${item.lead.id}`} style={secondaryBtn}>
                                Open lead
                              </a>
                              <a href={`/sales-hub/leads/${item.lead.id}/outreach`} style={primaryBtn}>
                                Outreach
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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

const nestedCard: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const itemTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const summaryBox: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.06)",
  fontWeight: 600,
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
