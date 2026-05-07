import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import ServerSubmitButton from "../../components/ServerSubmitButton";
import { canCreateCustomers, getAccessContext } from "../../lib/access";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

export const dynamic = "force-dynamic";

type ServicePreset = {
  key: string;
  label: string;
  serviceFocus: string;
  defaultAvailabilityNote: string;
  keywords: string[];
};

type CustomerMatch = {
  clientId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  matchCount: number;
  lastJobDate: string | null;
  matchSummary: string;
};

type PageProps = {
  searchParams?: {
    service_key?: string;
    custom_keywords?: string;
    date_from?: string;
    date_to?: string;
    tone?: string;
    availability_note?: string;
  };
};

const SERVICE_PRESETS: ServicePreset[] = [
  {
    key: "low_loader",
    label: "Low loader / step frame",
    serviceFocus: "low loader transport",
    defaultAvailabilityNote:
      "This is ideal for plant, machinery, containers, site-to-site moves and heavy or awkward loads that need planning properly.",
    keywords: [
      "low loader",
      "lowloader",
      "low-loader",
      "step frame",
      "semi low loader",
      "semi-low loader",
      "plant move",
      "machinery move",
    ],
  },
  {
    key: "hiab",
    label: "HIAB transport",
    serviceFocus: "HIAB transport",
    defaultAvailabilityNote:
      "This is ideal for loads that need collecting, delivering, lifting, placing or positioning without needing a separate crane on site.",
    keywords: [
      "hiab",
      "lorry mounted crane",
      "lorry-mounted crane",
      "mounted crane",
      "rigid hiab",
      "artic hiab",
    ],
  },
  {
    key: "artic_hiab",
    label: "Artic HIAB",
    serviceFocus: "artic HIAB transport",
    defaultAvailabilityNote:
      "This is ideal for longer loads, container moves or anything that needs lifting, shifting and placing with an artic HIAB.",
    keywords: [
      "artic hiab",
      "articulated hiab",
      "artic",
      "extendable trailer",
      "long load",
    ],
  },
  {
    key: "rigid_hiab",
    label: "Rigid HIAB",
    serviceFocus: "rigid HIAB transport",
    defaultAvailabilityNote:
      "This is ideal for local deliveries, steel, containers and materials that need lifting, placing or moving with a rigid HIAB.",
    keywords: ["rigid hiab", "rigid", "hiab"],
  },
  {
    key: "jekko_spider_crane",
    label: "Jekko / spider crane",
    serviceFocus: "Jekko / spider crane hire",
    defaultAvailabilityNote:
      "Our Jekko / spider crane is ideal for restricted-access lifting, tight sites, internal lifts, glazing, machinery positioning and awkward areas where larger cranes are not practical.",
    keywords: [
      "spider",
      "jekko",
      "spx",
      "tracked crane",
      "restricted access",
      "tight access",
      "internal lift",
    ],
  },
  {
    key: "mobile_crane",
    label: "Mobile crane up to 100t",
    serviceFocus: "mobile crane hire up to 100 tonnes",
    defaultAvailabilityNote:
      "Our mobile crane fleet covers planned and short-notice lifting requirements up to 100 tonnes, with CPA crane hire and contract lift support available where required.",
    keywords: [
      "mobile crane",
      "crane hire",
      "cpa",
      "all terrain",
      "city crane",
      "grove",
      "liebherr",
      "demag",
      "terex",
      "100t",
      "100 t",
      "100 tonne",
      "100 ton",
      "tadano",
      "bocker",
      "böcker",
    ],
  },
  {
    key: "contract_lift",
    label: "Contract lift",
    serviceFocus: "contract lift support",
    defaultAvailabilityNote:
      "This is ideal where you need the lift planned and managed properly, with the right paperwork, personnel and supervision in place.",
    keywords: [
      "contract lift",
      "appointed person",
      "lift supervisor",
      "lift plan",
      "method statement",
      "risk assessment",
    ],
  },
  {
    key: "abnormal_load",
    label: "Abnormal load / escort work",
    serviceFocus: "abnormal load transport",
    defaultAvailabilityNote:
      "This is useful for oversized, awkward or movement-order controlled loads where transport planning and escort support may be required.",
    keywords: [
      "abnormal",
      "escort",
      "movement order",
      "wide load",
      "oversized",
      "police escort",
      "self escort",
    ],
  },
  {
    key: "hk40",
    label: "HK40",
    serviceFocus: "HK40 crane hire",
    defaultAvailabilityNote:
      "Our HK40 is a strong option for city work, restricted sites and projects where a compact truck-mounted crane can keep the job moving efficiently.",
    keywords: ["hk40", "hk 40", "bocker", "böcker"],
  },
  {
    key: "grove_80t",
    label: "Grove 80t",
    serviceFocus: "80t mobile crane hire",
    defaultAvailabilityNote:
      "Our 80t mobile crane is available for planned and short-notice lifting requirements where extra capacity or reach is needed.",
    keywords: ["grove", "80t", "80 t", "80 tonne", "80 ton", "gmk4080"],
  },
  {
    key: "custom",
    label: "Custom keyword search",
    serviceFocus: "specialist crane and transport support",
    defaultAvailabilityNote:
      "If you have anything coming up that needs lifting, shifting, moving or positioning, reply and I can confirm availability and pricing.",
    keywords: [],
  },
];

const CANCELLED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "late_cancelled",
  "late cancelled",
  "lost",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function dateOnly(value: unknown) {
  const text = clean(value);
  if (!text) return "";

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match?.[1]) return match[1];

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("en-GB");
}

function isCancelled(value: unknown) {
  return CANCELLED_STATUSES.has(lower(value));
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => clean(value)).filter(Boolean))
  );
}

function keywordsFromInput(value: string) {
  return uniqueStrings(value.split(/[,\n]/g));
}

function matchKeywords(text: string, keywords: string[]) {
  const haystack = lower(text);

  return keywords.filter((keyword) => {
    const needle = lower(keyword);
    return needle && haystack.includes(needle);
  });
}

function inDateRange(date: string, from: string, to: string) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function latestDate(current: string | null, next: string) {
  if (!next) return current;
  if (!current) return next;
  return next > current ? next : current;
}


function serviceGroupForText(value: unknown) {
  const text = String(value ?? "").toLowerCase();

  if (
    text.includes("jekko") ||
    text.includes("spider") ||
    text.includes("restricted-access") ||
    text.includes("restricted access") ||
    text.includes("tight access") ||
    text.includes("internal lift") ||
    text.includes("internal lifting") ||
    text.includes("glazing") ||
    text.includes("machinery positioning") ||
    text.includes("larger crane is not practical") ||
    text.includes("awkward areas where larger cranes")
  ) {
    return "spider";
  }

  if (text.includes("hk40") || text.includes("hk 40")) return "hk40";

  if (
    text.includes("mobile crane") ||
    text.includes("crane hire up to") ||
    text.includes("up to 100") ||
    text.includes("100t") ||
    text.includes("100 t") ||
    text.includes("100 tonne") ||
    text.includes("100 ton") ||
    text.includes("80t") ||
    text.includes("80 t") ||
    text.includes("80 tonne") ||
    text.includes("80 ton") ||
    text.includes("all terrain") ||
    text.includes("city crane") ||
    text.includes("cpa crane") ||
    text.includes("planned and short-notice lifting")
  ) {
    return "mobile";
  }

  if (text.includes("low loader") || text.includes("lowloader") || text.includes("step frame")) return "low_loader";
  if (text.includes("hiab")) return "hiab";
  if (text.includes("abnormal") || text.includes("escort") || text.includes("movement order")) return "abnormal";
  if (text.includes("contract lift")) return "contract_lift";

  return null;
}

function noteConflictsWithPreset(note: string, preset: ServicePreset) {
  const noteGroup = serviceGroupForText(note);
  const presetGroup = serviceGroupForText(`${preset.label} ${preset.serviceFocus}`);

  if (!noteGroup || !presetGroup) return false;

  return noteGroup !== presetGroup;
}

function getSelectedPreset(key: string) {
  if (key === "spider_crane") {
    return SERVICE_PRESETS.find((preset) => preset.key === "jekko_spider_crane") ?? SERVICE_PRESETS[0];
  }

  return SERVICE_PRESETS.find((preset) => preset.key === key) ?? SERVICE_PRESETS[0];
}

async function fetchAllRows(supabase: any, table: string, select: string) {
  const rows: any[] = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + batchSize - 1);

    if (error) return { data: rows, error };

    const batch = (data ?? []).filter(Boolean);
    rows.push(...batch);

    if (batch.length < batchSize) break;

    from += batchSize;
  }

  return { data: rows, error: null };
}

async function buildEquipmentHistoryMatches(args: {
  supabase: any;
  keywords: string[];
  dateFrom: string;
  dateTo: string;
}) {
  const { supabase, keywords, dateFrom, dateTo } = args;

  const [
    clientsResult,
    transportJobsResult,
    craneJobsResult,
    vehiclesResult,
    cranesResult,
    equipmentResult,
    jobEquipmentResult,
  ] = await Promise.all([
    fetchAllRows(
      supabase,
      "clients",
      "id, company_name, contact_name, email, phone, archived"
    ),
    fetchAllRows(
      supabase,
      "transport_jobs",
      "id, client_id, transport_number, job_type, vehicle_id, collection_address, delivery_address, load_description, notes, status, archived, transport_date, delivery_date"
    ),
    fetchAllRows(
      supabase,
      "jobs",
      "id, job_number, client_id, equipment_id, crane_id, site_name, site_address, hire_type, lift_type, notes, status, archived, job_date, start_date, end_date"
    ),
    fetchAllRows(supabase, "vehicles", "id, name, reg_number"),
    fetchAllRows(supabase, "cranes", "id, name, reg_number, fleet_number"),
    fetchAllRows(supabase, "equipment", "id, name, asset_number"),
    fetchAllRows(
      supabase,
      "job_equipment",
      "id, job_id, crane_id, equipment_id, item_name, source_type, notes"
    ),
  ]);

  const errors = [
    clientsResult.error,
    transportJobsResult.error,
    craneJobsResult.error,
    vehiclesResult.error,
    cranesResult.error,
    equipmentResult.error,
    jobEquipmentResult.error,
  ]
    .filter(Boolean)
    .map((error: any) => String(error?.message ?? error));

  const clientById = new Map<string, any>();
  for (const client of clientsResult.data ?? []) {
    const id = clean(client?.id);
    if (!id || Boolean(client?.archived)) continue;
    clientById.set(id, client);
  }

  const vehicleById = new Map<string, any>();
  for (const vehicle of vehiclesResult.data ?? []) {
    vehicleById.set(clean(vehicle?.id), vehicle);
  }

  const craneById = new Map<string, any>();
  for (const crane of cranesResult.data ?? []) {
    craneById.set(clean(crane?.id), crane);
  }

  const equipmentById = new Map<string, any>();
  for (const equipment of equipmentResult.data ?? []) {
    equipmentById.set(clean(equipment?.id), equipment);
  }

  const jobEquipmentByJobId = new Map<string, any[]>();
  for (const item of jobEquipmentResult.data ?? []) {
    const jobId = clean(item?.job_id);
    if (!jobId) continue;

    const existing = jobEquipmentByJobId.get(jobId) ?? [];
    existing.push(item);
    jobEquipmentByJobId.set(jobId, existing);
  }

  const matchByClientId = new Map<string, CustomerMatch>();

  function ensure(clientId: string) {
    const client = clientById.get(clientId);
    if (!client) return null;

    const email = clean(client.email);
    if (!email) return null;

    const existing = matchByClientId.get(clientId);
    if (existing) return existing;

    const row: CustomerMatch = {
      clientId,
      companyName: clean(client.company_name) || "Customer",
      contactName: clean(client.contact_name),
      email,
      phone: clean(client.phone),
      matchCount: 0,
      lastJobDate: null,
      matchSummary: "",
    };

    matchByClientId.set(clientId, row);
    return row;
  }

  function addMatch(clientId: string, date: string, label: string, matched: string[]) {
    const row = ensure(clientId);
    if (!row) return;

    row.matchCount += 1;
    row.lastJobDate = latestDate(row.lastJobDate, date);

    const matchedText = matched.length
      ? `Matched: ${matched.join(", ")}`
      : "Matched selected service";

    const line = `${label}${date ? ` (${fmtDate(date)})` : ""} — ${matchedText}`;
    const existingLines = row.matchSummary ? row.matchSummary.split("\n") : [];

    if (!existingLines.includes(line)) {
      row.matchSummary = [...existingLines, line].slice(0, 4).join("\n");
    }
  }

  for (const job of transportJobsResult.data ?? []) {
    const clientId = clean(job?.client_id);
    if (!clientId || !clientById.has(clientId)) continue;
    if (Boolean(job?.archived) || isCancelled(job?.status)) continue;

    const date = dateOnly(job?.delivery_date) || dateOnly(job?.transport_date);
    if (!inDateRange(date, dateFrom, dateTo)) continue;

    const vehicle = vehicleById.get(clean(job?.vehicle_id));

    const text = [
      job?.transport_number,
      job?.job_type,
      job?.collection_address,
      job?.delivery_address,
      job?.load_description,
      job?.notes,
      vehicle?.name,
      vehicle?.reg_number,
    ].join(" ");

    const matched = matchKeywords(text, keywords);
    if (!matched.length) continue;

    addMatch(
      clientId,
      date,
      `Transport ${clean(job?.transport_number) || clean(job?.job_type) || "job"}`,
      matched
    );
  }

  for (const job of craneJobsResult.data ?? []) {
    const clientId = clean(job?.client_id);
    if (!clientId || !clientById.has(clientId)) continue;
    if (Boolean(job?.archived) || isCancelled(job?.status)) continue;

    const date =
      dateOnly(job?.end_date) ||
      dateOnly(job?.start_date) ||
      dateOnly(job?.job_date);

    if (!inDateRange(date, dateFrom, dateTo)) continue;

    const crane = craneById.get(clean(job?.crane_id));
    const equipment = equipmentById.get(clean(job?.equipment_id));
    const allocations = jobEquipmentByJobId.get(clean(job?.id)) ?? [];

    const allocationText = allocations
      .map((item) => {
        const allocatedCrane = craneById.get(clean(item?.crane_id));
        const allocatedEquipment = equipmentById.get(clean(item?.equipment_id));

        return [
          item?.item_name,
          item?.source_type,
          item?.notes,
          allocatedCrane?.name,
          allocatedCrane?.reg_number,
          allocatedCrane?.fleet_number,
          allocatedEquipment?.name,
          allocatedEquipment?.asset_number,
        ].join(" ");
      })
      .join(" ");

    const text = [
      job?.job_number,
      job?.site_name,
      job?.site_address,
      job?.hire_type,
      job?.lift_type,
      job?.notes,
      crane?.name,
      crane?.reg_number,
      crane?.fleet_number,
      equipment?.name,
      equipment?.asset_number,
      allocationText,
    ].join(" ");

    const matched = matchKeywords(text, keywords);
    if (!matched.length) continue;

    addMatch(
      clientId,
      date,
      `Crane ${clean(job?.job_number) || clean(job?.hire_type) || "job"}`,
      matched
    );
  }

  return {
    matches: Array.from(matchByClientId.values()).sort((a, b) => {
      const dateCompare = clean(b.lastJobDate).localeCompare(clean(a.lastJobDate));
      if (dateCompare !== 0) return dateCompare;
      return b.matchCount - a.matchCount;
    }),
    errors,
  };
}

export default async function EquipmentHistoryCampaignPage({ searchParams }: PageProps) {
  const access = await getAccessContext();

  if (!access.user) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>Not authenticated.</div>
        </div>
      </ClientShell>
    );
  }

  if (!canCreateCustomers(access)) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>
            You do not have permission to create equipment history campaigns.
          </div>
        </div>
      </ClientShell>
    );
  }

  const selectedPreset = getSelectedPreset(clean(searchParams?.service_key) || "mobile_crane");
  const customKeywords = clean(searchParams?.custom_keywords);
  const keywords =
    selectedPreset.key === "custom"
      ? keywordsFromInput(customKeywords)
      : selectedPreset.keywords;

  const dateFrom = dateOnly(searchParams?.date_from);
  const dateTo = dateOnly(searchParams?.date_to);
  const selectedTone = clean(searchParams?.tone) || "direct";
  const rawAvailabilityNote = clean(searchParams?.availability_note);
  const availabilityNote =
    rawAvailabilityNote && !noteConflictsWithPreset(rawAvailabilityNote, selectedPreset)
      ? rawAvailabilityNote
      : selectedPreset.defaultAvailabilityNote;

  const admin = createSupabaseAdminClient();

  const { matches, errors } = keywords.length
    ? await buildEquipmentHistoryMatches({
        supabase: admin,
        keywords,
        dateFrom,
        dateTo,
      })
    : { matches: [], errors: ["Enter at least one keyword for custom search."] };

  const allCustomerIds = matches.map((match) => match.clientId).join(",");
  const defaultCampaignName = `${selectedPreset.label} availability ${new Date().toLocaleDateString("en-GB")}`;

  return (
    <ClientShell>
      <div style={{ width: "min(1250px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Equipment history campaign</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create an availability email campaign for customers who have actually used a selected service or asset before.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>← Sales Hub</a>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>Campaigns</a>
          </div>
        </div>

        {errors.length ? <div style={errorBox}>{errors.join(" | ")}</div> : null}

        <section style={panelStyle}>
          <h2 style={sectionTitle}>Targeting</h2>

          <form
            method="get"
            action="/sales-hub/equipment-history-campaign"
            style={filterGrid}
          >
            <div>
              <label style={labelStyle}>Service / equipment history</label>
              <select
                name="service_key"
                defaultValue={selectedPreset.key}
                style={inputStyle}
              >
                {SERVICE_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Custom keywords</label>
              <input
                name="custom_keywords"
                defaultValue={customKeywords}
                style={inputStyle}
                placeholder="Only used for custom search, comma separated"
              />
            </div>

            <div>
              <label style={labelStyle}>Date from</label>
              <input
                type="date"
                name="date_from"
                defaultValue={dateFrom}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Date to</label>
              <input
                type="date"
                name="date_to"
                defaultValue={dateTo}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Tone</label>
              <select name="tone" defaultValue={selectedTone} style={inputStyle}>
                <option value="direct">Direct</option>
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Availability note</label>
              <textarea
                name="availability_note"
                defaultValue={availabilityNote}
                rows={3}
                style={textareaStyle}
              />
            </div>

            <div>
              <button type="submit" style={primaryBtn}>
                Find matching customers
              </button>
            </div>
          </form>
        </section>

        <div style={statsGrid}>
          <StatCard label="Matching customers" value={String(matches.length)} />
          <StatCard label="Service focus" value={selectedPreset.serviceFocus} />
          <StatCard label="Keywords" value={keywords.join(", ") || "—"} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Create campaign</h2>

          {matches.length === 0 ? (
            <div style={mutedBox}>
              No customers with email addresses match this equipment/service history yet.
            </div>
          ) : (
            <form method="post" action="/api/sales-campaigns/create">
              <input type="hidden" name="template_id" value="" />
              <input type="hidden" name="channel" value="email" />
              <input type="hidden" name="goal" value="availability" />
              <input type="hidden" name="tone" value={selectedTone} />
              <input type="hidden" name="service_focus" value={selectedPreset.serviceFocus} />
              <input type="hidden" name="availability_note" value={availabilityNote} />
              <input type="hidden" name="select_all_customers" value="1" />
              <input type="hidden" name="all_customer_ids" value={allCustomerIds} />

              <div style={createGrid}>
                <div>
                  <label style={labelStyle}>Campaign name</label>
                  <input
                    name="name"
                    defaultValue={defaultCampaignName}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    name="description"
                    defaultValue={`Availability campaign for customers with previous ${selectedPreset.serviceFocus} history.`}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={infoBox}>
                This creates a normal Sales Hub email campaign with these customers linked. You will still generate drafts, send a test email, and use Microsoft campaign sending from the campaign runner. Suppression and unsubscribe checks still apply.
              </div>

              <div style={{ marginTop: 14 }}>
                <ServerSubmitButton
                  style={primaryBtn}
                  pendingText="Creating campaign…"
                >
                  Create availability campaign for {matches.length} customer{matches.length === 1 ? "" : "s"}
                </ServerSubmitButton>
              </div>
            </form>
          )}
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Matching customers</h2>

          {matches.length === 0 ? (
            <div style={mutedBox}>No matches to show.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Last match</th>
                    <th style={thStyle}>Matches</th>
                    <th style={thStyle}>Why included</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match) => (
                    <tr key={match.clientId}>
                      <td style={tdStyle}>
                        <a href={`/customers/${match.clientId}`} style={linkStyle}>
                          {match.companyName}
                        </a>
                        <div style={smallText}>
                          {match.contactName || match.phone || "No contact name"}
                        </div>
                      </td>
                      <td style={tdStyle}>{match.email}</td>
                      <td style={tdStyle}>{fmtDate(match.lastJobDate)}</td>
                      <td style={tdStyle}>{match.matchCount}</td>
                      <td style={tdStyle}>
                        <pre style={summaryStyle}>{match.matchSummary}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 900 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 20,
          fontWeight: 1000,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
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

const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
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

const createGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const statCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
  fontWeight: 900,
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

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 92,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
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
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const infoBox: CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 800,
};

const mutedBox: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.8,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 900,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid rgba(0,0,0,0.12)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  color: "#475569",
};

const tdStyle: CSSProperties = {
  padding: "11px 8px",
  borderBottom: "1px solid rgba(0,0,0,0.07)",
  verticalAlign: "top",
};

const linkStyle: CSSProperties = {
  color: "#0f172a",
  fontWeight: 1000,
};

const smallText: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.72,
};

const summaryStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.45,
};
