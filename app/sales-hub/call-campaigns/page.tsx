import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import ClientShell from "../../ClientShell";
import ServerSubmitButton from "../../components/ServerSubmitButton";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { displayUserNameFromEmail } from "../../lib/displayUserName";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function fmtDate(value: string | null | undefined) {
  const raw = dateOnly(value);
  if (!raw) return "—";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB");
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysSince(value: string | null | undefined) {
  const raw = dateOnly(value);
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function latestDate(values: Array<string | null | undefined>) {
  const valid = values
    .map((value) => {
      const raw = dateOnly(value);
      if (!raw) return null;
      const d = new Date(`${raw}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : raw;
    })
    .filter(Boolean) as string[];

  valid.sort((a, b) => b.localeCompare(a));
  return valid[0] ?? null;
}

function normalisePhone(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "").trim();
}

function activeCraneJob(row: any) {
  const status = clean(row?.status).toLowerCase();
  return status !== "cancelled" && status !== "late_cancelled" && status !== "draft";
}

function activeTransportJob(row: any) {
  const status = clean(row?.status).toLowerCase();
  return status !== "cancelled" && status !== "late_cancelled";
}

function craneJobDate(row: any) {
  return dateOnly(row?.end_date || row?.start_date || row?.job_date || row?.updated_at || row?.created_at) || null;
}

function transportJobDate(row: any) {
  return dateOnly(row?.delivery_date || row?.transport_date || row?.updated_at || row?.created_at) || null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function pushCount(map: Map<string, number>, label: string | null | undefined) {
  const value = clean(label);
  if (!value || value === "—") return;
  map.set(value, (map.get(value) ?? 0) + 1);
}

function topLabels(map: Map<string, number>, max = 4) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([label]) => label);
}

function craneAssetLabels(row: any) {
  const labels: string[] = [];
  const items = Array.isArray(row?.job_equipment) ? row.job_equipment : [];

  for (const item of items) {
    const crane = first(item?.cranes);
    const equipment = first(item?.equipment);
    const vehicle = first(item?.vehicles);
    const assetLabel =
      clean(crane?.name) ||
      clean(equipment?.name) ||
      clean(vehicle?.name) ||
      clean(item?.item_name);

    if (assetLabel) labels.push(assetLabel);
  }

  if (clean(row?.hire_type)) labels.push(clean(row.hire_type));
  if (clean(row?.lift_type)) labels.push(clean(row.lift_type));
  if (labels.length === 0) labels.push("Crane hire");
  return labels;
}

function transportLabels(row: any) {
  const labels: string[] = [];
  const vehicle = first(row?.vehicles);
  const vehicleLabel = [clean(vehicle?.name), clean(vehicle?.reg_number)].filter(Boolean).join(" / ");

  if (clean(row?.job_type)) labels.push(clean(row.job_type));
  if (vehicleLabel) labels.push(vehicleLabel);
  if (clean(row?.trailer_type)) labels.push(clean(row.trailer_type));

  const load = clean(row?.load_description);
  const lowerLoad = load.toLowerCase();
  if (lowerLoad.includes("hiab")) labels.push("HIAB");
  if (lowerLoad.includes("low loader") || lowerLoad.includes("lowloader")) labels.push("Low loader");
  if (labels.length === 0) labels.push("Transport");

  return labels;
}

function rowValue(row: any) {
  const candidates = [row?.total_invoice, row?.invoice_total, row?.price, row?.amount];
  for (const candidate of candidates) {
    const n = Number(candidate ?? 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function latestJobType(lastCrane: any | null, lastTransport: any | null) {
  const craneDate = craneJobDate(lastCrane);
  const transportDate = transportJobDate(lastTransport);

  if (craneDate && (!transportDate || craneDate >= transportDate)) {
    const labels = craneAssetLabels(lastCrane);
    return labels[0] || "Crane job";
  }

  if (transportDate) {
    const labels = transportLabels(lastTransport);
    return labels[0] || "Transport job";
  }

  return "—";
}

function latestSiteArea(lastCrane: any | null, lastTransport: any | null) {
  const craneDate = craneJobDate(lastCrane);
  const transportDate = transportJobDate(lastTransport);

  if (craneDate && (!transportDate || craneDate >= transportDate)) {
    return clean(lastCrane?.site_name) || clean(lastCrane?.site_address) || "—";
  }

  if (transportDate) {
    return [clean(lastTransport?.collection_address), clean(lastTransport?.delivery_address)]
      .filter(Boolean)
      .join(" → ") || "—";
  }

  return "—";
}

function buildCallAngle(company: string, normalHire: string, lastJobDate: string | null, serviceFocus: string) {
  const normal = normalHire || "crane / transport work";
  const last = lastJobDate ? `You last used us around ${fmtDate(lastJobDate)} for ${normal}.` : `We've worked with you before on ${normal}.`;
  const focus = serviceFocus === "all" ? "anything coming up that we can help with" : `${serviceFocus.replace(/_/g, " ")} coming up`;

  return `${last} Just checking in with ${company} to see if you've got ${focus}.`;
}

type JobContactOption = {
  contact_name_snapshot: string | null;
  phone_snapshot: string | null;
  contact_source: string | null;
  contact_source_detail: string | null;
  contact_last_used_on: string | null;
};

function addContactOption(contacts: Map<string, JobContactOption>, option: JobContactOption) {
  const name = clean(option.contact_name_snapshot);
  const phone = clean(option.phone_snapshot);

  if (!name && !phone) return;

  const phoneKey = normalisePhone(phone);
  const key = phoneKey
    ? `phone:${phoneKey}`
    : `name:${name.toLowerCase()}|source:${clean(option.contact_source).toLowerCase()}`;

  const next: JobContactOption = {
    contact_name_snapshot: name || null,
    phone_snapshot: phone || null,
    contact_source: clean(option.contact_source) || null,
    contact_source_detail: clean(option.contact_source_detail) || null,
    contact_last_used_on: dateOnly(option.contact_last_used_on) || null,
  };

  const existing = contacts.get(key);
  if (!existing) {
    contacts.set(key, next);
    return;
  }

  const existingDate = dateOnly(existing.contact_last_used_on);
  const nextDate = dateOnly(next.contact_last_used_on);

  if (nextDate && (!existingDate || nextDate >= existingDate)) {
    contacts.set(key, {
      ...existing,
      ...next,
      contact_name_snapshot: next.contact_name_snapshot || existing.contact_name_snapshot,
      phone_snapshot: next.phone_snapshot || existing.phone_snapshot,
    });
  }
}

function craneJobContactDetail(job: any) {
  return [
    clean(job?.job_number) ? `Job ${job.job_number}` : null,
    clean(job?.site_name) || clean(job?.site_address) || null,
    fmtDate(craneJobDate(job)),
  ]
    .filter(Boolean)
    .join(" • ");
}

function transportJobContactDetail(job: any) {
  return [
    clean(job?.transport_number) ? `Transport ${job.transport_number}` : null,
    [clean(job?.collection_address), clean(job?.delivery_address)].filter(Boolean).join(" → ") || null,
    fmtDate(transportJobDate(job)),
  ]
    .filter(Boolean)
    .join(" • ");
}

function serviceMatches(filter: string, normalHire: string, craneCount: number, transportCount: number) {
  const lower = normalHire.toLowerCase();
  if (filter === "all") return true;
  if (filter === "crane") return craneCount > 0;
  if (filter === "transport") return transportCount > 0;
  if (filter === "both") return craneCount > 0 && transportCount > 0;
  if (filter === "crane_only") return craneCount > 0 && transportCount === 0;
  if (filter === "transport_only") return transportCount > 0 && craneCount === 0;
  if (filter === "hiab") return lower.includes("hiab");
  if (filter === "low_loader") return lower.includes("low loader") || lower.includes("lowloader");
  if (filter === "spider") return lower.includes("spider") || lower.includes("jekko");
  if (filter === "contract_lift") return lower.includes("contract");
  return true;
}

type CampaignCandidate = {
  client_id: string;
  company_name_snapshot: string;
  contact_name_snapshot: string | null;
  phone_snapshot: string | null;
  email_snapshot: string | null;
  contact_source: string | null;
  contact_source_detail: string | null;
  contact_last_used_on: string | null;
  last_job_date: string | null;
  last_job_type: string | null;
  last_site_area: string | null;
  normal_hire: string | null;
  suggested_call_angle: string | null;
  crane_job_count: number;
  transport_job_count: number;
  total_job_count: number;
  last_quote_date: string | null;
  last_value: number | null;
  sort_order: number;
};

async function generateCallCampaign(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const name = clean(formData.get("name")) || `Call campaign ${new Date().toLocaleDateString("en-GB")}`;
  const description = clean(formData.get("description")) || null;
  const dormantDays = Number(clean(formData.get("dormant_days")) || "90");
  const serviceFocus = clean(formData.get("service_focus")) || "all";
  const areaSearch = clean(formData.get("area_search")).toLowerCase();
  const includeNoPhone = clean(formData.get("include_no_phone")) === "on";
  const excludeRecentlyCalledDays = Number(clean(formData.get("exclude_recently_called_days")) || "14");
  const limitRaw = Number(clean(formData.get("limit")) || "100");
  const limit = Math.max(10, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));

  const now = new Date();
  const cutoffDate = dormantDays > 0 ? addDays(now, -dormantDays).toISOString().slice(0, 10) : null;
  const recentCallCutoff = excludeRecentlyCalledDays > 0 ? addDays(now, -excludeRecentlyCalledDays).toISOString() : null;

  const [clientsRes, jobsRes, transportRes, quotesRes, recentCallsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address, notes, archived")
      .or("archived.is.null,archived.eq.false")
      .order("company_name", { ascending: true })
      .limit(10000),
    supabase
      .from("jobs")
      .select(`
        id,
        client_id,
        job_number,
        job_date,
        start_date,
        end_date,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        hire_type,
        lift_type,
        status,
        price,
        total_invoice,
        updated_at,
        created_at,
        job_equipment (
          id,
          item_name,
          crane_id,
          equipment_id,
          vehicle_id,
          cranes:crane_id (id, name, reg_number),
          equipment:equipment_id (id, name, asset_number),
          vehicles:vehicle_id (id, name, reg_number)
        )
      `)
      .or("archived.is.null,archived.eq.false")
      .not("client_id", "is", null)
      .limit(10000),
    supabase
      .from("transport_jobs")
      .select(`
        id,
        client_id,
        transport_number,
        transport_date,
        delivery_date,
        collection_address,
        delivery_address,
        collection_contact_name,
        collection_contact_phone,
        delivery_contact_name,
        delivery_contact_phone,
        job_type,
        load_description,
        trailer_type,
        status,
        price,
        total_invoice,
        invoice_total,
        updated_at,
        created_at,
        vehicles:vehicle_id (id, name, reg_number, vehicle_type)
      `)
      .or("archived.is.null,archived.eq.false")
      .not("client_id", "is", null)
      .limit(10000),
    supabase
      .from("quotes")
      .select("id, client_id, quote_date, amount, status, subject, created_at")
      .or("archived.is.null,archived.eq.false")
      .not("client_id", "is", null)
      .limit(10000),
    recentCallCutoff
      ? supabase
          .from("call_activity")
          .select("client_id, created_at")
          .gte("created_at", recentCallCutoff)
          .not("client_id", "is", null)
          .limit(10000)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const firstError = clientsRes.error || jobsRes.error || transportRes.error || quotesRes.error || recentCallsRes.error;
  if (firstError) {
    redirect(`/sales-hub/call-campaigns?error=${encodeURIComponent(firstError.message || "Could not read CRM data. Have you run the call campaign SQL first?")}`);
  }

  const clientMap = new Map<string, any>();
  for (const client of clientsRes.data ?? []) {
    if (client?.id) clientMap.set(String(client.id), client);
  }

  const aggregates = new Map<string, any>();
  function aggregateFor(clientId: string) {
    if (!aggregates.has(clientId)) {
      aggregates.set(clientId, {
        craneJobs: [],
        transportJobs: [],
        quotes: [],
        labels: new Map<string, number>(),
        searchText: "",
      });
    }
    return aggregates.get(clientId);
  }

  for (const job of (jobsRes.data ?? []).filter(activeCraneJob)) {
    const clientId = clean(job?.client_id);
    if (!clientId || !clientMap.has(clientId)) continue;
    const agg = aggregateFor(clientId);
    agg.craneJobs.push(job);
    for (const label of craneAssetLabels(job)) pushCount(agg.labels, label);
    agg.searchText += ` ${job?.site_name ?? ""} ${job?.site_address ?? ""} ${job?.hire_type ?? ""} ${job?.lift_type ?? ""}`;
  }

  for (const job of (transportRes.data ?? []).filter(activeTransportJob)) {
    const clientId = clean(job?.client_id);
    if (!clientId || !clientMap.has(clientId)) continue;
    const agg = aggregateFor(clientId);
    agg.transportJobs.push(job);
    for (const label of transportLabels(job)) pushCount(agg.labels, label);
    agg.searchText += ` ${job?.collection_address ?? ""} ${job?.delivery_address ?? ""} ${job?.job_type ?? ""} ${job?.load_description ?? ""}`;
  }

  for (const quote of quotesRes.data ?? []) {
    const clientId = clean(quote?.client_id);
    if (!clientId || !clientMap.has(clientId)) continue;
    aggregateFor(clientId).quotes.push(quote);
  }

  const recentlyCalledClientIds = new Set(
    (recentCallsRes.data ?? [])
      .map((row: any) => clean(row?.client_id))
      .filter(Boolean)
  );

  const candidates: CampaignCandidate[] = [];

  for (const [clientId, agg] of aggregates.entries()) {
    const client = clientMap.get(clientId);
    if (!client) continue;

    const craneJobs = [...agg.craneJobs].sort((a: any, b: any) => String(craneJobDate(b) ?? "").localeCompare(String(craneJobDate(a) ?? "")));
    const transportJobs = [...agg.transportJobs].sort((a: any, b: any) => String(transportJobDate(b) ?? "").localeCompare(String(transportJobDate(a) ?? "")));
    const quotes = [...agg.quotes].sort((a: any, b: any) => String(dateOnly(b?.quote_date || b?.created_at)).localeCompare(String(dateOnly(a?.quote_date || a?.created_at))));

    const lastCrane = craneJobs[0] ?? null;
    const lastTransport = transportJobs[0] ?? null;
    const lastJobDate = latestDate([craneJobDate(lastCrane), transportJobDate(lastTransport)]);
    const jobCount = craneJobs.length + transportJobs.length;

    if (jobCount === 0 || !lastJobDate) continue;
    if (cutoffDate && lastJobDate > cutoffDate) continue;
    if (recentlyCalledClientIds.has(clientId)) continue;

    const normalHire = topLabels(agg.labels, 4).join(", ") || "Crane / transport";
    if (!serviceMatches(serviceFocus, normalHire, craneJobs.length, transportJobs.length)) continue;

    const areaHaystack = `${client?.address ?? ""} ${agg.searchText}`.toLowerCase();
    if (areaSearch && !areaHaystack.includes(areaSearch)) continue;

    const lastQuote = quotes[0] ?? null;
    const lastValue = rowValue(lastCrane) ?? rowValue(lastTransport) ?? rowValue(lastQuote);
    const company = clean(client?.company_name) || "Customer";

    const contactOptions = new Map<string, JobContactOption>();

    addContactOption(contactOptions, {
      contact_name_snapshot: clean(client?.contact_name) || null,
      phone_snapshot: clean(client?.phone) || null,
      contact_source: "Customer profile",
      contact_source_detail: "Main customer contact",
      contact_last_used_on: lastJobDate,
    });

    for (const job of craneJobs) {
      addContactOption(contactOptions, {
        contact_name_snapshot: clean(job?.contact_name) || null,
        phone_snapshot: clean(job?.contact_phone) || null,
        contact_source: "Crane job contact",
        contact_source_detail: craneJobContactDetail(job),
        contact_last_used_on: craneJobDate(job),
      });
    }

    for (const job of transportJobs) {
      addContactOption(contactOptions, {
        contact_name_snapshot: clean(job?.collection_contact_name) || null,
        phone_snapshot: clean(job?.collection_contact_phone) || null,
        contact_source: "Transport pickup contact",
        contact_source_detail: transportJobContactDetail(job),
        contact_last_used_on: transportJobDate(job),
      });

      addContactOption(contactOptions, {
        contact_name_snapshot: clean(job?.delivery_contact_name) || null,
        phone_snapshot: clean(job?.delivery_contact_phone) || null,
        contact_source: "Transport delivery contact",
        contact_source_detail: transportJobContactDetail(job),
        contact_last_used_on: transportJobDate(job),
      });
    }

    const contactsToCall = Array.from(contactOptions.values())
      .filter((contact) => includeNoPhone || Boolean(normalisePhone(contact.phone_snapshot)))
      .sort((a, b) => {
        const aPhone = normalisePhone(a.phone_snapshot) ? 0 : 1;
        const bPhone = normalisePhone(b.phone_snapshot) ? 0 : 1;
        return aPhone - bPhone || String(b.contact_last_used_on ?? "").localeCompare(String(a.contact_last_used_on ?? ""));
      });

    for (const contact of contactsToCall) {
      candidates.push({
        client_id: clientId,
        company_name_snapshot: company,
        contact_name_snapshot: contact.contact_name_snapshot,
        phone_snapshot: contact.phone_snapshot,
        email_snapshot: clean(client?.email) || null,
        contact_source: contact.contact_source,
        contact_source_detail: contact.contact_source_detail,
        contact_last_used_on: contact.contact_last_used_on,
        last_job_date: lastJobDate,
        last_job_type: latestJobType(lastCrane, lastTransport),
        last_site_area: latestSiteArea(lastCrane, lastTransport),
        normal_hire: normalHire,
        suggested_call_angle: buildCallAngle(company, normalHire, lastJobDate, serviceFocus),
        crane_job_count: craneJobs.length,
        transport_job_count: transportJobs.length,
        total_job_count: jobCount,
        last_quote_date: dateOnly(lastQuote?.quote_date || lastQuote?.created_at) || null,
        last_value: lastValue,
        sort_order: 0,
      });
    }
  }

  candidates.sort((a, b) => {
    const aDays = daysSince(a.last_job_date) ?? 0;
    const bDays = daysSince(b.last_job_date) ?? 0;
    return bDays - aDays || b.total_job_count - a.total_job_count || a.company_name_snapshot.localeCompare(b.company_name_snapshot);
  });

  const selected = candidates.slice(0, limit).map((row, index) => ({ ...row, sort_order: index + 1 }));

  if (selected.length === 0) {
    redirect("/sales-hub/call-campaigns?error=No%20customers%20matched%20those%20filters.");
  }

  const username = displayUserNameFromEmail(user.email) || null;
  const filterSettings = {
    dormant_days: dormantDays,
    service_focus: serviceFocus,
    area_search: areaSearch,
    include_no_phone: includeNoPhone,
    exclude_recently_called_days: excludeRecentlyCalledDays,
    limit,
  };

  const { data: campaign, error: campaignError } = await supabase
    .from("call_campaigns")
    .insert({
      name,
      description,
      status: "Active",
      filter_settings: filterSettings,
      target_count: selected.length,
      created_by_user_id: user.id,
      created_by_username: username,
    })
    .select("id")
    .single();

  if (campaignError || !campaign?.id) {
    redirect(`/sales-hub/call-campaigns?error=${encodeURIComponent(campaignError?.message || "Could not create call campaign.")}`);
  }

  const rows = selected.map((row) => ({
    campaign_id: campaign.id,
    ...row,
    status: "Not called",
  }));

  const { error: insertError } = await supabase.from("call_campaign_contacts").insert(rows);

  if (insertError) {
    await supabase.from("call_campaigns").delete().eq("id", campaign.id);
    redirect(`/sales-hub/call-campaigns?error=${encodeURIComponent(insertError.message || "Could not add campaign contacts.")}`);
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: username,
    action: "call_campaign_created",
    entity_type: "call_campaign",
    entity_id: campaign.id,
    meta: {
      name,
      target_count: selected.length,
      filters: filterSettings,
    },
  });

  redirect(`/sales-hub/call-campaigns/${campaign.id}?success=${encodeURIComponent(`Campaign created with ${selected.length} contacts.`)}`);
}

type CallCampaignsPageProps = {
  searchParams?: {
    success?: string;
    error?: string;
  };
};

export default async function CallCampaignsPage({ searchParams }: CallCampaignsPageProps) {
  const supabase = createSupabaseServerClient();
  const successMessage = clean(searchParams?.success);
  const errorMessage = clean(searchParams?.error);

  const { data: campaigns, error } = await supabase
    .from("call_campaigns")
    .select(`
      id,
      name,
      description,
      status,
      target_count,
      filter_settings,
      created_by_username,
      created_at,
      updated_at,
      completed_at,
      call_campaign_contacts (
        id,
        status,
        outcome,
        called_at,
        next_follow_up_on
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = campaigns ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={headerRow}>
          <div>
            <p style={eyebrow}>Sales Hub</p>
            <h1 style={{ margin: 0, fontSize: 32 }}>Call Campaigns</h1>
            <p style={{ marginTop: 8, opacity: 0.78 }}>
              Generate a call list from real customer history, then work through it with click-to-call, outcomes and follow-ups.
            </p>
          </div>
          <a href="/sales-hub" style={secondaryBtn}>Back to Sales Hub</a>
        </div>

        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {errorMessage || error ? <div style={errorBox}>{errorMessage || error?.message}</div> : null}

        <section style={cardStyle}>
          <h2 style={sectionTitle}>Generate call campaign</h2>
          <p style={{ marginTop: -6, opacity: 0.75 }}>
            This pulls customer-level contacts and job-level contacts/numbers used on crane and transport jobs.
          </p>

          <form action={generateCallCampaign} style={{ display: "grid", gap: 14 }}>
            <div style={grid3}>
              <Field label="Campaign name" name="name" defaultValue={`Call list ${new Date().toLocaleDateString("en-GB")}`} required />
              <label style={labelStyle}>
                Dormant / last used
                <select name="dormant_days" defaultValue="90" style={inputStyle}>
                  <option value="0">Any previous customer</option>
                  <option value="30">Not used in 30+ days</option>
                  <option value="60">Not used in 60+ days</option>
                  <option value="90">Not used in 90+ days</option>
                  <option value="180">Not used in 180+ days</option>
                  <option value="365">Not used in 365+ days</option>
                </select>
              </label>
              <label style={labelStyle}>
                Service focus
                <select name="service_focus" defaultValue="all" style={inputStyle}>
                  <option value="all">All services</option>
                  <option value="crane">Crane customers</option>
                  <option value="transport">Transport customers</option>
                  <option value="both">Crane + transport customers</option>
                  <option value="crane_only">Crane-only customers</option>
                  <option value="transport_only">Transport-only customers</option>
                  <option value="hiab">HIAB customers</option>
                  <option value="low_loader">Low loader customers</option>
                  <option value="spider">Spider / Jekko customers</option>
                  <option value="contract_lift">Contract lift customers</option>
                </select>
              </label>
            </div>

            <div style={grid3}>
              <Field label="Area / postcode contains" name="area_search" placeholder="Cardiff, Swansea, CF, SA..." />
              <label style={labelStyle}>
                Exclude recently called
                <select name="exclude_recently_called_days" defaultValue="14" style={inputStyle}>
                  <option value="0">Do not exclude</option>
                  <option value="7">Called in last 7 days</option>
                  <option value="14">Called in last 14 days</option>
                  <option value="30">Called in last 30 days</option>
                  <option value="60">Called in last 60 days</option>
                </select>
              </label>
              <label style={labelStyle}>
                Max contacts
                <input name="limit" type="number" min="10" max="500" defaultValue="100" style={inputStyle} />
              </label>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
              <input type="checkbox" name="include_no_phone" />
              Include contacts/customers with no phone number
            </label>

            <label style={labelStyle}>
              Description / call angle note
              <textarea name="description" rows={3} style={textareaStyle} placeholder="Optional notes for this call list..." />
            </label>

            <div>
              <ServerSubmitButton style={primaryButtonElement}>Generate call campaign</ServerSubmitButton>
            </div>
          </form>
        </section>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Existing call campaigns</h2>

          {rows.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.75 }}>No call campaigns created yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((campaign: any) => {
                const contacts = Array.isArray(campaign.call_campaign_contacts) ? campaign.call_campaign_contacts : [];
                const called = contacts.filter((row: any) => clean(row.status) !== "Not called").length;
                const callbacks = contacts.filter((row: any) => clean(row.status) === "Call back" || row.next_follow_up_on).length;
                const quoted = contacts.filter((row: any) => clean(row.status) === "Quoted" || clean(row.outcome) === "Quoted").length;
                const won = contacts.filter((row: any) => clean(row.status) === "Won" || clean(row.outcome) === "Won").length;

                return (
                  <a key={campaign.id} href={`/sales-hub/call-campaigns/${campaign.id}`} style={campaignCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 1000 }}>{campaign.name}</div>
                        <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
                          {campaign.status} • Created {fmtDate(campaign.created_at)} • {campaign.created_by_username || "Tom"}
                        </div>
                        {campaign.description ? <div style={{ marginTop: 6, opacity: 0.75 }}>{campaign.description}</div> : null}
                      </div>
                      <div style={miniStats}>
                        <MiniStat label="Targets" value={String(campaign.target_count ?? contacts.length)} />
                        <MiniStat label="Called" value={String(called)} />
                        <MiniStat label="Callbacks" value={String(callbacks)} />
                        <MiniStat label="Quoted" value={String(quoted)} />
                        <MiniStat label="Won" value={String(won)} />
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} required={required} style={inputStyle} />
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniStatBox}>
      <div style={{ fontSize: 18, fontWeight: 1000 }}>{value}</div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.68 }}>{label}</div>
    </div>
  );
}

const headerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrow: CSSProperties = {
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.65,
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 14px 40px rgba(15,23,42,0.07)",
};

const sectionTitle: CSSProperties = { margin: "0 0 12px", fontSize: 22 };

const grid3: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(15,23,42,0.16)",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 78,
};


const primaryButtonElement: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 1000,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.16)",
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 900,
  background: "#fff",
};

const successBox: CSSProperties = {
  margin: "14px 0",
  padding: 12,
  borderRadius: 14,
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#065f46",
  fontWeight: 800,
};

const errorBox: CSSProperties = {
  margin: "14px 0",
  padding: 12,
  borderRadius: 14,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontWeight: 800,
};

const campaignCard: CSSProperties = {
  display: "block",
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#f8fafc",
  color: "#0f172a",
  textDecoration: "none",
};

const miniStats: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const miniStatBox: CSSProperties = {
  minWidth: 74,
  borderRadius: 14,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.10)",
  padding: "8px 10px",
  textAlign: "center",
};
