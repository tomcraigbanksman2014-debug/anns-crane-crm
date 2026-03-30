import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getAccessContext, canCreateCustomers } from "../../lib/access";

type CraneRow = {
  id: string;
  name: string;
  model: string | null;
  capacity: string | null;
  status: string | null;
  archived: boolean | null;
};

type VehicleRow = {
  id: string;
  name: string | null;
  reg_number: string | null;
  vehicle_type: string | null;
  capacity: string | null;
  status: string | null;
  archived: boolean | null;
};

type JobRow = {
  id: string;
  crane_id: string | null;
  status: string | null;
  archived: boolean | null;
  job_date: string | null;
  start_date: string | null;
  end_date: string | null;
  site_name: string | null;
};

type TransportJobRow = {
  id: string;
  vehicle_id: string | null;
  status: string | null;
  archived: boolean | null;
  transport_date: string | null;
  delivery_date: string | null;
  collection_address: string | null;
  delivery_address: string | null;
  load_description: string | null;
};

type LeadRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
  industry: string | null;
  status: string | null;
  services: string[] | null;
  do_not_contact: boolean | null;
  archived: boolean | null;
  assigned_to_username: string | null;
  opportunity_value: number | null;
  probability_percent: number | null;
  expected_close_date: string | null;
  next_follow_up_on: string | null;
};

type AvailabilityAsset = {
  id: string;
  name: string;
  subtitle: string;
  status: string;
  firstBookedOn: string | null;
  bookingCount: number;
  availableDays: number;
};

type SellingPlay = {
  key: string;
  title: string;
  focusLabel: string;
  summary: string;
  message: string;
  leads: LeadRow[];
  socialStudioHref: string;
  campaignsHref: string;
};

type PageProps = {
  searchParams?: {
    window?: string;
    area?: string;
    focus?: string;
  };
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function formatDateUK(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function formatMoneyGBP(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });
}

function toDateOnlyString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function overlapsDateRange(
  itemStart: string | null | undefined,
  itemEnd: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date
) {
  const start = parseDateOnly(itemStart);
  const end = parseDateOnly(itemEnd || itemStart);

  if (!start || !end) return false;

  return start <= rangeEnd && end >= rangeStart;
}

function probabilityForLead(lead: LeadRow) {
  const manual = Number(lead.probability_percent);
  if (Number.isFinite(manual)) {
    return Math.max(0, Math.min(100, manual));
  }

  const status = String(lead.status ?? "").toLowerCase();

  if (status === "new") return 10;
  if (status === "to contact") return 15;
  if (status === "contacted") return 25;
  if (status === "follow up") return 40;
  if (status === "quoted") return 65;
  if (status === "won") return 100;
  if (status === "dormant") return 8;
  return 0;
}

function weightedValueForLead(lead: LeadRow) {
  return Number(lead.opportunity_value ?? 0) * (probabilityForLead(lead) / 100);
}

function daysUntil(value: string | null | undefined) {
  const date = parseDateOnly(value);
  if (!date) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isLeadOpen(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  return s !== "won" && s !== "lost";
}

function leadMatchesArea(lead: LeadRow, areaFilter: string) {
  if (areaFilter === "all") return true;
  const area = String(lead.area ?? "").toLowerCase();
  return area.includes(areaFilter.toLowerCase());
}

function leadMatchesFocus(lead: LeadRow, focus: "crane" | "transport" | "combined") {
  const services = Array.isArray(lead.services) ? lead.services.join(" ").toLowerCase() : "";
  const industry = String(lead.industry ?? "").toLowerCase();

  const craneMatch =
    services.includes("crane") ||
    services.includes("contract lift") ||
    services.includes("lifting") ||
    industry.includes("steel") ||
    industry.includes("glazing") ||
    industry.includes("construction");

  const transportMatch =
    services.includes("transport") ||
    services.includes("hiab") ||
    services.includes("haulage") ||
    services.includes("container") ||
    services.includes("delivery") ||
    industry.includes("modular") ||
    industry.includes("container") ||
    industry.includes("plant");

  if (focus === "crane") return craneMatch;
  if (focus === "transport") return transportMatch;
  return craneMatch || transportMatch || isLeadOpen(lead.status);
}

function rankLeads(leads: LeadRow[]) {
  return [...leads].sort((a, b) => {
    const aOverdue = daysUntil(a.next_follow_up_on);
    const bOverdue = daysUntil(b.next_follow_up_on);

    const aDueRank = aOverdue !== null && aOverdue <= 0 ? 1 : 0;
    const bDueRank = bOverdue !== null && bOverdue <= 0 ? 1 : 0;

    if (bDueRank !== aDueRank) return bDueRank - aDueRank;

    const weightedDiff = weightedValueForLead(b) - weightedValueForLead(a);
    if (weightedDiff !== 0) return weightedDiff;

    return probabilityForLead(b) - probabilityForLead(a);
  });
}

function buildSocialStudioHref({
  focusLabel,
  area,
  availabilityNote,
  objective,
}: {
  focusLabel: string;
  area: string;
  availabilityNote: string;
  objective: string;
}) {
  const params = new URLSearchParams();
  params.set("service_focus", focusLabel);
  params.set("area", area === "all" ? "across the UK" : area);
  params.set("availability_note", availabilityNote);
  params.set("objective", objective);
  params.set("tone", "direct");
  params.set("industry", "construction");
  return `/sales-hub/social-studio?${params.toString()}`;
}

function buildCampaignsHref({
  focusLabel,
  area,
}: {
  focusLabel: string;
  area: string;
}) {
  const params = new URLSearchParams();
  params.set("service_focus", focusLabel);
  params.set("area", area === "all" ? "across the UK" : area);
  params.set("goal", "availability");
  params.set("tone", "direct");
  params.set("channel", "email");
  return `/sales-hub/campaigns?${params.toString()}`;
}

export default async function SalesAvailabilityPage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManage = !!access.user && canCreateCustomers(access);
  const currentUsername = fromAuthEmail(user?.email ?? null);

  const selectedWindow = Math.max(1, Math.min(21, Number(searchParams?.window ?? "7") || 7));
  const selectedArea = String(searchParams?.area ?? "all").trim() || "all";
  const selectedFocus = String(searchParams?.focus ?? "all").trim() || "all";

  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endDate = addDays(startDate, selectedWindow - 1);

  const [
    { data: cranes, error: cranesError },
    { data: vehicles, error: vehiclesError },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportJobsError },
    { data: leads, error: leadsError },
  ] = await Promise.all([
    supabase
      .from("cranes")
      .select("id, name, model, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("jobs")
      .select("id, crane_id, status, archived, job_date, start_date, end_date, site_name")
      .eq("archived", false)
      .not("crane_id", "is", null),
    supabase
      .from("transport_jobs")
      .select("id, vehicle_id, status, archived, transport_date, delivery_date, collection_address, delivery_address, load_description")
      .eq("archived", false)
      .not("vehicle_id", "is", null),
    supabase
      .from("sales_leads")
      .select(`
        id,
        company_name,
        contact_name,
        email,
        phone,
        area,
        industry,
        status,
        services,
        do_not_contact,
        archived,
        assigned_to_username,
        opportunity_value,
        probability_percent,
        expected_close_date,
        next_follow_up_on
      `)
      .eq("archived", false)
      .order("company_name", { ascending: true }),
  ]);

  const blockingJobStatuses = new Set(["provisional", "confirmed", "in_progress", "completed"]);
  const blockingTransportStatuses = new Set(["planned", "dispatched", "in_progress", "completed"]);

  const craneAvailability: AvailabilityAsset[] = ((cranes ?? []) as CraneRow[]).map((crane) => {
    const bookings = ((jobs ?? []) as JobRow[]).filter((job) => {
      if (String(job.crane_id ?? "") !== crane.id) return false;
      if (!blockingJobStatuses.has(String(job.status ?? "").toLowerCase())) return false;

      const jobStart = job.start_date || job.job_date;
      const jobEnd = job.end_date || job.start_date || job.job_date;
      return overlapsDateRange(jobStart, jobEnd, startDate, endDate);
    });

    const firstBooked = bookings
      .map((job) => job.start_date || job.job_date)
      .filter(Boolean)
      .sort()[0] || null;

    return {
      id: crane.id,
      name: crane.name,
      subtitle: [crane.model, crane.capacity].filter(Boolean).join(" • ") || "Crane",
      status: String(crane.status ?? "available"),
      firstBookedOn: firstBooked,
      bookingCount: bookings.length,
      availableDays: bookings.length === 0 ? selectedWindow : Math.max(0, selectedWindow - bookings.length),
    };
  });

  const vehicleAvailability: AvailabilityAsset[] = ((vehicles ?? []) as VehicleRow[]).map((vehicle) => {
    const bookings = ((transportJobs ?? []) as TransportJobRow[]).filter((job) => {
      if (String(job.vehicle_id ?? "") !== vehicle.id) return false;
      if (!blockingTransportStatuses.has(String(job.status ?? "").toLowerCase())) return false;

      const jobStart = job.transport_date;
      const jobEnd = job.delivery_date || job.transport_date;
      return overlapsDateRange(jobStart, jobEnd, startDate, endDate);
    });

    const firstBooked = bookings
      .map((job) => job.transport_date)
      .filter(Boolean)
      .sort()[0] || null;

    return {
      id: vehicle.id,
      name: vehicle.name || vehicle.reg_number || "Vehicle",
      subtitle:
        [vehicle.vehicle_type, vehicle.capacity, vehicle.reg_number].filter(Boolean).join(" • ") || "Vehicle",
      status: String(vehicle.status ?? "active"),
      firstBookedOn: firstBooked,
      bookingCount: bookings.length,
      availableDays: bookings.length === 0 ? selectedWindow : Math.max(0, selectedWindow - bookings.length),
    };
  });

  const freeCranes = craneAvailability.filter(
    (item) => item.bookingCount === 0 && item.status.toLowerCase() === "available"
  );

  const freeVehicles = vehicleAvailability.filter(
    (item) => item.bookingCount === 0 && item.status.toLowerCase() === "active"
  );

  const allLeads = ((leads ?? []) as LeadRow[])
    .filter((lead) => !lead.do_not_contact)
    .filter((lead) => isLeadOpen(lead.status))
    .filter((lead) => leadMatchesArea(lead, selectedArea));

  const craneLeads = rankLeads(allLeads.filter((lead) => leadMatchesFocus(lead, "crane"))).slice(0, 8);
  const transportLeads = rankLeads(allLeads.filter((lead) => leadMatchesFocus(lead, "transport"))).slice(0, 8);
  const combinedLeads = rankLeads(allLeads.filter((lead) => leadMatchesFocus(lead, "combined"))).slice(0, 8);

  const availabilityNote =
    selectedWindow === 1
      ? "today"
      : `within the next ${selectedWindow} days`;

  const sellingPlays: SellingPlay[] = [
    {
      key: "crane",
      title: "Crane availability push",
      focusLabel: "mobile crane hire",
      summary: `${freeCranes.length} crane${freeCranes.length === 1 ? "" : "s"} currently unbooked ${availabilityNote}.`,
      message: `We currently have crane availability ${availabilityNote} and should target open crane-related leads with a direct availability push.`,
      leads: craneLeads,
      socialStudioHref: buildSocialStudioHref({
        focusLabel: "mobile crane hire",
        area: selectedArea,
        availabilityNote,
        objective: "availability",
      }),
      campaignsHref: buildCampaignsHref({
        focusLabel: "mobile crane hire",
        area: selectedArea,
      }),
    },
    {
      key: "transport",
      title: "Transport / HIAB availability push",
      focusLabel: "HIAB transport and heavy haulage",
      summary: `${freeVehicles.length} vehicle${freeVehicles.length === 1 ? "" : "s"} currently unbooked ${availabilityNote}.`,
      message: `We currently have transport availability ${availabilityNote} and should target leads likely to need HIAB, haulage or delivery support.`,
      leads: transportLeads,
      socialStudioHref: buildSocialStudioHref({
        focusLabel: "HIAB transport and heavy haulage",
        area: selectedArea,
        availabilityNote,
        objective: "availability",
      }),
      campaignsHref: buildCampaignsHref({
        focusLabel: "HIAB transport and heavy haulage",
        area: selectedArea,
      }),
    },
    {
      key: "combined",
      title: "Full package push",
      focusLabel: "cranes and transport support",
      summary: `Use current fleet gaps to promote AnnS as a one-stop lifting and transport solution.`,
      message: `This is the best angle when both crane and transport capacity exist and you want to sell AnnS as the complete package rather than a single asset.`,
      leads: combinedLeads,
      socialStudioHref: buildSocialStudioHref({
        focusLabel: "cranes and transport support",
        area: selectedArea,
        availabilityNote,
        objective: "awareness",
      }),
      campaignsHref: buildCampaignsHref({
        focusLabel: "cranes and transport support",
        area: selectedArea,
      }),
    },
  ].filter((play) => {
    if (selectedFocus === "all") return true;
    return play.key === selectedFocus;
  });

  const areaOptions = Array.from(
    new Set(
      allLeads
        .map((lead) => String(lead.area ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Availability-Driven Selling</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Turn open fleet availability into targeted sales actions, outreach angles and lead priorities.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>
              Campaigns
            </a>
            <a href="/sales-hub/social-studio" style={secondaryBtn}>
              Social Studio
            </a>
          </div>
        </div>

        {cranesError ? <div style={errorCard}>{cranesError.message}</div> : null}
        {vehiclesError ? <div style={errorCard}>{vehiclesError.message}</div> : null}
        {jobsError ? <div style={errorCard}>{jobsError.message}</div> : null}
        {transportJobsError ? <div style={errorCard}>{transportJobsError.message}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Free cranes" value={String(freeCranes.length)} />
          <StatCard label="Free vehicles" value={String(freeVehicles.length)} />
          <StatCard label="Open leads in scope" value={String(allLeads.length)} />
          <StatCard label="Sales manager" value={currentUsername || "Unknown"} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Filters</h2>

          <form method="get" action="/sales-hub/availability" style={filterGrid}>
            <div>
              <label style={labelStyle}>Availability window</label>
              <select name="window" defaultValue={String(selectedWindow)} style={inputStyle}>
                <option value="3">Next 3 days</option>
                <option value="5">Next 5 days</option>
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
                <option value="21">Next 21 days</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Area</label>
              <select name="area" defaultValue={selectedArea} style={inputStyle}>
                <option value="all">All areas</option>
                {areaOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Selling focus</label>
              <select name="focus" defaultValue={selectedFocus} style={inputStyle}>
                <option value="all">All plays</option>
                <option value="crane">Crane only</option>
                <option value="transport">Transport only</option>
                <option value="combined">Combined package</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" as const }}>
              <button type="submit" style={primaryBtn}>
                Refresh dashboard
              </button>
              <a href="/sales-hub/availability" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>

          <div style={rangeNote}>
            Looking at availability from <strong>{formatDateUK(toDateOnlyString(startDate))}</strong> to{" "}
            <strong>{formatDateUK(toDateOnlyString(endDate))}</strong>.
          </div>
        </section>

        <div style={twoColGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Crane availability</h2>

            {!craneAvailability.length ? (
              <div style={mutedBox}>No cranes found.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {craneAvailability.map((item) => (
                  <div key={item.id} style={assetCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" as const }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{item.name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>{item.subtitle}</div>
                      </div>

                      <div style={miniBadge}>
                        {item.bookingCount === 0 ? "Available" : `${item.bookingCount} booking${item.bookingCount === 1 ? "" : "s"}`}
                      </div>
                    </div>

                    <div style={metaRow}>
                      <div>Status: {item.status}</div>
                      <div>Next booked: {item.firstBookedOn ? formatDateUK(item.firstBookedOn) : "No bookings"}</div>
                      <div>Free days in window: {item.availableDays}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Vehicle availability</h2>

            {!vehicleAvailability.length ? (
              <div style={mutedBox}>No vehicles found.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {vehicleAvailability.map((item) => (
                  <div key={item.id} style={assetCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" as const }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{item.name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>{item.subtitle}</div>
                      </div>

                      <div style={miniBadge}>
                        {item.bookingCount === 0 ? "Available" : `${item.bookingCount} booking${item.bookingCount === 1 ? "" : "s"}`}
                      </div>
                    </div>

                    <div style={metaRow}>
                      <div>Status: {item.status}</div>
                      <div>Next booked: {item.firstBookedOn ? formatDateUK(item.firstBookedOn) : "No bookings"}</div>
                      <div>Free days in window: {item.availableDays}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Selling plays</h2>

          <div style={{ display: "grid", gap: 14 }}>
            {sellingPlays.map((play) => (
              <div key={play.key} style={playCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{play.title}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>{play.summary}</div>
                  </div>

                  <div style={miniBadge}>{play.focusLabel}</div>
                </div>

                <div style={messageBox}>{play.message}</div>

                <div style={actionRow}>
                  <a href={play.socialStudioHref} style={primaryLinkBtn}>
                    Create social post
                  </a>
                  <a href={play.campaignsHref} style={secondaryBtn}>
                    Build campaign
                  </a>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={subHeading}>Best leads to target now</div>

                  {!play.leads.length ? (
                    <div style={mutedBox}>No matching open leads found for this play.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {play.leads.map((lead) => (
                        <div key={lead.id} style={leadCard}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
                            <div>
                              <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                                {lead.contact_name || "No contact"} • {lead.status || "New"} •{" "}
                                {lead.assigned_to_username || "Unassigned"}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                                {lead.area || "No area"} • {lead.industry || "No industry"} • Weighted{" "}
                                {formatMoneyGBP(weightedValueForLead(lead))}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                                Next follow-up: {formatDateUK(lead.next_follow_up_on)}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
                              <a href={`/sales-hub/leads/${lead.id}`} style={miniLinkBtn}>
                                Open lead
                              </a>
                              {canManage ? (
                                <a href={`/sales-hub/leads/${lead.id}/outreach`} style={miniDarkLinkBtn}>
                                  Outreach
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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

const filterGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: CSSProperties = {
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

const primaryBtn: CSSProperties = {
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

const primaryLinkBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
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

const miniLinkBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniDarkLinkBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const errorCard: CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 16,
};

const rangeNote: CSSProperties = {
  marginTop: 12,
  fontSize: 14,
  opacity: 0.8,
};

const assetCard: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const metaRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  marginTop: 10,
  fontSize: 13,
  opacity: 0.8,
};

const playCard: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const miniBadge: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 12,
};

const actionRow: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
  alignItems: "center",
};

const subHeading: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  marginBottom: 10,
};

const messageBox: CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
  fontSize: 14,
};

const leadCard: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const mutedBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.82,
  fontWeight: 700,
};
