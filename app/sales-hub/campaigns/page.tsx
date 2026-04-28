import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import ServerSubmitButton from "../../components/ServerSubmitButton";
import { getCustomerActivityRollups } from "../../lib/customerActivity";

type LeadRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
  industry: string | null;
  lead_source: string | null;
  status: string | null;
  services: string[] | null;
  assigned_to_username: string | null;
  archived: boolean | null;
  do_not_contact: boolean | null;
  opportunity_value: number | null;
  probability_percent: number | null;
  expected_close_date: string | null;
  next_follow_up_on: string | null;
  updated_at: string | null;
};

type CustomerRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archived: boolean | null;
  created_at: string | null;
};

type CustomerRollup = {
  client_id: string;
  last_activity_date: string | null;
  crm_job_count: number | null;
  crm_transport_job_count: number | null;
  crm_quote_count: number | null;
  crm_correspondence_count: number | null;
  imported_history_count: number | null;
};

type SupplierRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  address: string | null;
  notes: string | null;
  archived: boolean | null;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  goal: string;
  tone: string;
  service_focus: string | null;
  availability_note: string | null;
  custom_cta: string | null;
  subject_hint: string | null;
  body_hint: string | null;
  is_active: boolean;
};

const SALES_LEAD_SELECT = `
  id,
  company_name,
  contact_name,
  email,
  phone,
  area,
  industry,
  lead_source,
  status,
  services,
  assigned_to_username,
  archived,
  do_not_contact,
  opportunity_value,
  probability_percent,
  expected_close_date,
  next_follow_up_on,
  updated_at
`;

const SALES_LEAD_BATCH_SIZE = 1000;

const GOAL_OPTIONS = [
  { value: "introduction", label: "General introduction" },
  { value: "recent_customer_thank_you", label: "Recent customer thank-you" },
  { value: "supplier_cross_hire", label: "Supplier / cross-hire request" },
  { value: "dormant_recovery", label: "Dormant customer recovery" },
  { value: "quote_follow_up", label: "Quote follow-up" },
  { value: "cross_sell", label: "Cross-sell services" },
  { value: "availability", label: "Availability notice" },
  { value: "follow_up", label: "General follow up" },
  { value: "reactivation", label: "General reactivation" },
];

async function fetchAllActiveSalesLeads(supabase: any) {
  const rows: LeadRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sales_leads")
      .select(SALES_LEAD_SELECT)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + SALES_LEAD_BATCH_SIZE - 1);

    if (error) return { data: null, error };

    const batch = ((data ?? []) as LeadRow[]).filter(Boolean);
    rows.push(...batch);

    if (batch.length < SALES_LEAD_BATCH_SIZE) break;
    from += SALES_LEAD_BATCH_SIZE;
  }

  return { data: rows, error: null };
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function daysBetween(from: string | null | undefined, to = new Date()) {
  if (!from) return null;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return null;
  const diff = to.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function moneyGBP(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  });
}

function probabilityForLead(lead: LeadRow) {
  const manual = Number(lead.probability_percent);
  if (Number.isFinite(manual)) return Math.max(0, Math.min(100, manual));

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

function getActivityInfo(lastActivityDate: string | null | undefined) {
  const days = daysBetween(lastActivityDate);

  if (days == null) {
    return {
      key: "no_activity",
      label: "No activity",
      bg: "rgba(0,0,0,0.08)",
      color: "#111",
    };
  }

  if (days <= 30) {
    return {
      key: "active",
      label: "Last 30 days",
      bg: "rgba(0,160,80,0.14)",
      color: "#0b6b34",
    };
  }

  if (days <= 90) {
    return {
      key: "recent",
      label: "31–90 days",
      bg: "rgba(255,180,0,0.16)",
      color: "#8a6200",
    };
  }

  return {
    key: "dormant",
    label: "Dormant",
    bg: "rgba(180,0,0,0.12)",
    color: "#8a1f1f",
  };
}

function customerMatchesSuggestedGroup(customer: CustomerRow, rollup: CustomerRollup | null, group: string) {
  if (group === "all") return true;

  const days = daysBetween(rollup?.last_activity_date ?? null);
  const jobCount = Number(rollup?.crm_job_count ?? 0);
  const transportCount = Number(rollup?.crm_transport_job_count ?? 0);
  const quoteCount = Number(rollup?.crm_quote_count ?? 0);

  if (group === "recent_30") return days !== null && days <= 30;
  if (group === "dormant_90") return days === null || days >= 90;
  if (group === "dormant_180") return days === null || days >= 180;
  if (group === "dormant_365") return days === null || days >= 365;
  if (group === "quote_follow_up") return quoteCount > 0;
  if (group === "transport_cross_sell") return transportCount > 0 && jobCount <= 0;
  if (group === "crane_cross_sell") return jobCount > 0 && transportCount <= 0;

  return true;
}

function fillTokens(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

function defaultSubject(goal: string, serviceFocus: string) {
  if (goal === "recent_customer_thank_you") return "Thank you from AnnS Crane Hire";
  if (goal === "supplier_cross_hire") return serviceFocus ? `Cross-hire request – ${serviceFocus}` : "Cross-hire request from AnnS Crane Hire";
  if (goal === "dormant_recovery") return "Checking in from AnnS Crane Hire";
  if (goal === "quote_follow_up") return "Following up on our quote";
  if (goal === "cross_sell") return "More ways AnnS Crane Hire can support you";
  if (goal === "availability") return serviceFocus ? `${serviceFocus} availability from AnnS Crane Hire` : "Availability from AnnS Crane Hire";
  if (goal === "follow_up") return "Following up from AnnS Crane Hire";
  if (goal === "reactivation") return "Checking in from AnnS Crane Hire";
  return serviceFocus ? `${serviceFocus} support from AnnS Crane Hire` : "Introduction from AnnS Crane Hire";
}

function defaultBody(goal: string, audience: "lead" | "customer" | "supplier") {
  if (goal === "recent_customer_thank_you") {
    return `Hi {{contact_name}},

Thank you for using AnnS Crane Hire recently. We really appreciate the work.

I also wanted to keep our wider services on your radar for any future requirements. We support mobile crane hire, contract lifts, CPA hire, spider cranes, HIAB transport, low loaders, machinery moves, container moves, mats and lifting personnel.

If you have anything else coming up, we would be happy to help again.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
  }

  if (goal === "supplier_cross_hire") {
    return `Hi {{contact_name}},

I hope you are well.

I am getting in touch from AnnS Crane Hire as we may have a cross-hire requirement for {{service_focus}}.

{{availability_note}}

If you can help, please send over availability, rates and any details you need from us.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
  }

  if (goal === "dormant_recovery") {
    return `Hi {{contact_name}},

I hope you are well.

I wanted to check back in as we have not worked together for a little while and see whether you have any upcoming lifting, crane hire or transport requirements we may be able to support.

We can support mobile crane hire, contract lifts, CPA hire, HIAB transport, low loaders, spider cranes and wider lifting or transport requirements.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
  }

  if (goal === "quote_follow_up") {
    return `Hi {{contact_name}},

I wanted to follow up on the quote and check whether the job is still live or if you need anything amended.

If the dates or details have changed, I would be happy to update this for you and confirm availability.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
  }

  if (goal === "cross_sell") {
    return `Hi {{contact_name}},

I wanted to get in touch to make sure you are aware of the wider services AnnS Crane Hire can provide.

Alongside {{service_focus}}, we can also support mobile crane hire, contract lifts, CPA hire, spider cranes, HIAB transport, low loaders, machinery movements, container moves, mats and lifting personnel.

If any of this would be useful on upcoming work, please keep us in mind.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
  }

  if (goal === "availability") {
    return `Hi {{contact_name}},

I wanted to let you know that we currently have availability for {{service_focus}}.

{{availability_note}}

If this could help with any upcoming or short-notice work, I would be happy to send over availability and pricing.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
  }

  if (audience === "supplier") {
    return `Hi {{contact_name}},

I am getting in touch from AnnS Crane Hire to check whether you may be able to support us with {{service_focus}}.

{{availability_note}}

Please let me know if you have availability and what rate would apply.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
  }

  return `Hi {{contact_name}},

I hope you are well.

I am reaching out from AnnS Crane Hire to introduce our business and see whether we may be able to support {{company_name}}.

We support customers across the UK with {{service_focus}}, including mobile crane hire, contract lifts, HIAB transport, low loaders, spider cranes and specialist lifting support.

If it would be useful, I would be happy to have a quick call or send over more information.

Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
}

function buildPreview(args: {
  audience: "lead" | "customer" | "supplier";
  target: {
    company_name: string | null;
    contact_name: string | null;
    industry?: string | null;
    category?: string | null;
  };
  template: TemplateRow | null;
  channel: string;
  goal: string;
  tone: string;
  serviceFocus: string;
  availabilityNote: string;
}) {
  const tokenValues = {
    company_name: String(args.target.company_name ?? ""),
    contact_name: String(args.target.contact_name ?? args.target.company_name ?? "there"),
    service_focus: args.serviceFocus || "crane hire and transport support",
    availability_note: args.availabilityNote || "",
    cta: "If this would be useful, please let me know and I’d be happy to help.",
    area: "",
    industry: String(args.target.industry ?? args.target.category ?? ""),
    tone: args.tone,
  };

  const subjectTemplate =
    args.template?.subject_hint?.trim() || defaultSubject(args.goal, args.serviceFocus);

  const bodyTemplate =
    args.template?.body_hint?.trim() || defaultBody(args.goal, args.audience);

  return {
    subject: fillTokens(subjectTemplate, tokenValues).trim(),
    body: fillTokens(bodyTemplate, tokenValues).trim(),
  };
}

function goalLabel(goal: string) {
  return GOAL_OPTIONS.find((item) => item.value === goal)?.label ?? goal;
}

type CampaignsPageProps = {
  searchParams?: {
    owner?: string;
    service?: string;
    area?: string;
    industry?: string;
    status?: string;
    customer_activity?: string;
    customer_group?: string;
    customer_imported?: string;
    supplier_category?: string;
    supplier_search?: string;
    template_id?: string;
    channel?: string;
    goal?: string;
    tone?: string;
    service_focus?: string;
    availability_note?: string;
    success?: string;
    error?: string;
  };
};

export default async function SalesCampaignsPage({
  searchParams,
}: CampaignsPageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentUsername = fromAuthEmail(user?.email ?? null);
  const canManage = !!access.user && canCreateCustomers(access);

  const [
    { data: leads, error: leadsError },
    { data: customers, error: customersError },
    { data: suppliers, error: suppliersError },
    { data: templates, error: templatesError },
    { data: campaigns, error: campaignsError },
    { data: campaignLeadLinks },
    { data: campaignCustomerLinks },
    { data: campaignSupplierLinks },
  ] = await Promise.all([
    fetchAllActiveSalesLeads(supabase),
    supabase
      .from("clients")
      .select("id, company_name, contact_name, email, phone, notes, archived, created_at")
      .eq("archived", false)
      .order("company_name", { ascending: true }),
    supabase
      .from("suppliers")
      .select("id, company_name, contact_name, email, phone, category, address, notes, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),
    supabase
      .from("sales_templates")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("sales_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("sales_campaign_leads").select("campaign_id, lead_id"),
    supabase.from("sales_campaign_customers").select("campaign_id, client_id"),
    supabase.from("sales_campaign_suppliers").select("campaign_id, supplier_id"),
  ]);

  const allLeads = (leads ?? []) as LeadRow[];
  const allCustomers = (customers ?? []) as CustomerRow[];
  const allSuppliers = (suppliers ?? []) as SupplierRow[];
  const activeTemplates = (templates ?? []) as TemplateRow[];

  const customerRollupById = await getCustomerActivityRollups(
    supabase,
    allCustomers.map((customer) => String(customer.id ?? "")).filter(Boolean)
  );

  const selectedOwner = clean(searchParams?.owner) || "all";
  const selectedService = clean(searchParams?.service) || "all";
  const selectedArea = clean(searchParams?.area) || "all";
  const selectedIndustry = clean(searchParams?.industry) || "all";
  const selectedStatus = clean(searchParams?.status) || "all";
  const selectedCustomerActivity = clean(searchParams?.customer_activity) || "all";
  const selectedCustomerGroup = clean(searchParams?.customer_group) || "all";
  const selectedCustomerImported = clean(searchParams?.customer_imported) || "all";
  const selectedSupplierCategory = clean(searchParams?.supplier_category) || "all";
  const selectedSupplierSearch = clean(searchParams?.supplier_search);
  const selectedTemplateId = clean(searchParams?.template_id) || String(activeTemplates[0]?.id ?? "");
  const selectedTemplate = activeTemplates.find((item) => String(item.id) === selectedTemplateId) || null;
  const selectedChannel = clean(searchParams?.channel) || String(selectedTemplate?.channel ?? "email");
  const selectedGoal = clean(searchParams?.goal) || String(selectedTemplate?.goal ?? "introduction");
  const selectedTone = clean(searchParams?.tone) || String(selectedTemplate?.tone ?? "professional");
  const selectedServiceFocus =
    clean(searchParams?.service_focus) ||
    String(selectedTemplate?.service_focus ?? "") ||
    (selectedGoal === "supplier_cross_hire" ? "crane, low loader or HIAB cross-hire" : "crane hire and transport support");
  const selectedAvailabilityNote =
    clean(searchParams?.availability_note) || String(selectedTemplate?.availability_note ?? "");

  const ownerOptions = Array.from(
    new Set(
      allLeads
        .map((lead) => String(lead.assigned_to_username ?? "").trim())
        .filter(Boolean)
        .concat(currentUsername ? [currentUsername] : [])
    )
  ).sort((a, b) => a.localeCompare(b));

  const serviceOptions = Array.from(
    new Set(
      allLeads.flatMap((lead) =>
        Array.isArray(lead.services)
          ? lead.services.map((item) => String(item).trim()).filter(Boolean)
          : []
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  const areaOptions = Array.from(
    new Set(allLeads.map((lead) => String(lead.area ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const industryOptions = Array.from(
    new Set(allLeads.map((lead) => String(lead.industry ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const supplierCategoryOptions = Array.from(
    new Set(allSuppliers.map((supplier) => String(supplier.category ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredLeads = allLeads.filter((lead) => {
    if (lead.do_not_contact) return false;
    if (selectedOwner !== "all" && String(lead.assigned_to_username ?? "").trim() !== selectedOwner) return false;
    if (
      selectedService !== "all" &&
      !(Array.isArray(lead.services) && lead.services.some((item) => String(item).trim() === selectedService))
    ) {
      return false;
    }
    if (selectedArea !== "all" && String(lead.area ?? "").trim() !== selectedArea) return false;
    if (selectedIndustry !== "all" && String(lead.industry ?? "").trim() !== selectedIndustry) return false;
    if (selectedStatus !== "all" && String(lead.status ?? "").trim() !== selectedStatus) return false;
    return true;
  });

  const filteredCustomers = allCustomers.filter((customer) => {
    const rollup = customerRollupById.get(String(customer.id)) ?? null;
    const activity = getActivityInfo(rollup?.last_activity_date ?? null);
    const importedCount = Number(rollup?.imported_history_count ?? 0);

    if (selectedCustomerActivity !== "all" && activity.key !== selectedCustomerActivity) return false;
    if (!customerMatchesSuggestedGroup(customer, rollup, selectedCustomerGroup)) return false;
    if (selectedCustomerImported === "with_imported" && importedCount <= 0) return false;
    if (selectedCustomerImported === "without_imported" && importedCount > 0) return false;
    return true;
  });

  const filteredSuppliers = allSuppliers.filter((supplier) => {
    if (selectedSupplierCategory !== "all" && String(supplier.category ?? "").trim() !== selectedSupplierCategory) return false;

    if (selectedSupplierSearch) {
      const haystack = [
        supplier.company_name,
        supplier.contact_name,
        supplier.email,
        supplier.phone,
        supplier.category,
        supplier.address,
        supplier.notes,
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(selectedSupplierSearch.toLowerCase())) return false;
    }

    return true;
  });

  const leadCountByCampaign = new Map<string, number>();
  for (const link of campaignLeadLinks ?? []) {
    const key = String((link as any).campaign_id ?? "");
    if (!key) continue;
    leadCountByCampaign.set(key, (leadCountByCampaign.get(key) ?? 0) + 1);
  }

  const customerCountByCampaign = new Map<string, number>();
  for (const link of campaignCustomerLinks ?? []) {
    const key = String((link as any).campaign_id ?? "");
    if (!key) continue;
    customerCountByCampaign.set(key, (customerCountByCampaign.get(key) ?? 0) + 1);
  }

  const supplierCountByCampaign = new Map<string, number>();
  for (const link of campaignSupplierLinks ?? []) {
    const key = String((link as any).campaign_id ?? "");
    if (!key) continue;
    supplierCountByCampaign.set(key, (supplierCountByCampaign.get(key) ?? 0) + 1);
  }

  const leadPreviews = filteredLeads.slice(0, 2).map((lead) => ({
    type: "lead" as const,
    name: lead.company_name,
    subtitle: `${lead.contact_name || "No contact"} • ${lead.status || "New"}`,
    preview: buildPreview({
      audience: "lead",
      target: lead,
      template: selectedTemplate,
      channel: selectedChannel,
      goal: selectedGoal,
      tone: selectedTone,
      serviceFocus: selectedServiceFocus,
      availabilityNote: selectedAvailabilityNote,
    }),
  }));

  const customerPreviews = filteredCustomers.slice(0, 2).map((customer) => ({
    type: "customer" as const,
    name: customer.company_name,
    subtitle: `${customer.contact_name || "No contact"} • ${
      getActivityInfo(customerRollupById.get(String(customer.id))?.last_activity_date ?? null).label
    }`,
    preview: buildPreview({
      audience: "customer",
      target: customer,
      template: selectedTemplate,
      channel: selectedChannel,
      goal: selectedGoal,
      tone: selectedTone,
      serviceFocus: selectedServiceFocus,
      availabilityNote: selectedAvailabilityNote,
    }),
  }));

  const supplierPreviews = filteredSuppliers.slice(0, 2).map((supplier) => ({
    type: "supplier" as const,
    name: supplier.company_name,
    subtitle: `${supplier.contact_name || "No contact"} • ${supplier.category || "Supplier"}`,
    preview: buildPreview({
      audience: "supplier",
      target: supplier,
      template: selectedTemplate,
      channel: selectedChannel,
      goal: selectedGoal,
      tone: selectedTone,
      serviceFocus: selectedServiceFocus,
      availabilityNote: selectedAvailabilityNote,
    }),
  }));

  const previews = [...leadPreviews, ...customerPreviews, ...supplierPreviews].slice(0, 5);

  const stats = {
    totalLeads: filteredLeads.length,
    totalCustomers: filteredCustomers.length,
    totalSuppliers: filteredSuppliers.length,
    templates: activeTemplates.length,
    activeCampaigns: (campaigns ?? []).filter((item: any) => String(item.status ?? "") === "Active").length,
    draftCampaigns: (campaigns ?? []).filter((item: any) => String(item.status ?? "") === "Draft").length,
  };

  const createDisabled =
    !canManage ||
    (selectedGoal === "supplier_cross_hire"
      ? filteredSuppliers.length === 0
      : filteredLeads.length === 0 && filteredCustomers.length === 0 && filteredSuppliers.length === 0);

  return (
    <ClientShell>
      <div style={{ width: "min(1450px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Campaign Execution</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Build targeted campaigns for leads, returning customers and supplier cross-hire requests.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>← Sales Hub</a>
            <a href="/sales-hub/templates" style={secondaryBtn}>Template Library</a>
          </div>
        </div>

        {searchParams?.success ? <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div> : null}
        {searchParams?.error ? <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {customersError ? <div style={errorCard}>{customersError.message}</div> : null}
        {suppliersError ? <div style={errorCard}>{suppliersError.message}</div> : null}
        {templatesError ? <div style={errorCard}>{templatesError.message}</div> : null}
        {campaignsError ? <div style={errorCard}>{campaignsError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Filtered leads" value={String(stats.totalLeads)} />
          <StatCard label="Filtered customers" value={String(stats.totalCustomers)} />
          <StatCard label="Filtered suppliers" value={String(stats.totalSuppliers)} />
          <StatCard label="Templates" value={String(stats.templates)} />
          <StatCard label="Draft campaigns" value={String(stats.draftCampaigns)} />
          <StatCard label="Active campaigns" value={String(stats.activeCampaigns)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Targeting and message settings</h2>

          <form method="get" action="/sales-hub/campaigns" style={filterGrid}>
            <div>
              <label style={labelStyle}>Campaign type</label>
              <select name="goal" defaultValue={selectedGoal} style={inputStyle}>
                {GOAL_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Channel</label>
              <select name="channel" defaultValue={selectedChannel} style={inputStyle}>
                <option value="email">Email</option>
                <option value="text">Text</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Tone</label>
              <select name="tone" defaultValue={selectedTone} style={inputStyle}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="direct">Direct</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Template</label>
              <select name="template_id" defaultValue={selectedTemplateId} style={inputStyle}>
                <option value="">No template</option>
                {activeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Service focus</label>
              <input
                name="service_focus"
                defaultValue={selectedServiceFocus}
                style={inputStyle}
                placeholder="e.g. low loader, HIAB, Grove 80t"
              />
            </div>

            <div>
              <label style={labelStyle}>Availability / request note</label>
              <input
                name="availability_note"
                defaultValue={selectedAvailabilityNote}
                style={inputStyle}
                placeholder="e.g. needed next Tuesday in South Wales"
              />
            </div>

            <div>
              <label style={labelStyle}>Lead owner</label>
              <select name="owner" defaultValue={selectedOwner} style={inputStyle}>
                <option value="all">All owners</option>
                {ownerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Lead service</label>
              <select name="service" defaultValue={selectedService} style={inputStyle}>
                <option value="all">All services</option>
                {serviceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Lead area</label>
              <select name="area" defaultValue={selectedArea} style={inputStyle}>
                <option value="all">All areas</option>
                {areaOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Lead industry</label>
              <select name="industry" defaultValue={selectedIndustry} style={inputStyle}>
                <option value="all">All industries</option>
                {industryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Lead status</label>
              <select name="status" defaultValue={selectedStatus} style={inputStyle}>
                <option value="all">All statuses</option>
                <option value="New">New</option>
                <option value="To Contact">To Contact</option>
                <option value="Contacted">Contacted</option>
                <option value="Quoted">Quoted</option>
                <option value="Follow Up">Follow Up</option>
                <option value="Dormant">Dormant</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Customer activity</label>
              <select name="customer_activity" defaultValue={selectedCustomerActivity} style={inputStyle}>
                <option value="all">All customers</option>
                <option value="active">Last 30 days</option>
                <option value="recent">31–90 days</option>
                <option value="dormant">Dormant</option>
                <option value="no_activity">No activity</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Suggested customer group</label>
              <select name="customer_group" defaultValue={selectedCustomerGroup} style={inputStyle}>
                <option value="all">All matching customers</option>
                <option value="recent_30">Completed/active in last 30 days</option>
                <option value="dormant_90">Dormant 90+ days</option>
                <option value="dormant_180">Dormant 180+ days</option>
                <option value="dormant_365">Dormant 365+ days</option>
                <option value="quote_follow_up">Customers with quote history</option>
                <option value="transport_cross_sell">Transport customers to cross-sell cranes</option>
                <option value="crane_cross_sell">Crane customers to cross-sell transport</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Imported history</label>
              <select name="customer_imported" defaultValue={selectedCustomerImported} style={inputStyle}>
                <option value="all">All customers</option>
                <option value="with_imported">With imported history</option>
                <option value="without_imported">Without imported history</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Supplier category</label>
              <select name="supplier_category" defaultValue={selectedSupplierCategory} style={inputStyle}>
                <option value="all">All supplier categories</option>
                {supplierCategoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Supplier search</label>
              <input
                name="supplier_search"
                defaultValue={selectedSupplierSearch}
                style={inputStyle}
                placeholder="e.g. low loader, HIAB, crane"
              />
            </div>

            <div>
              <button type="submit" style={primaryBtn}>Apply filters</button>
            </div>
          </form>
        </section>

        <div style={twoColumnGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Message preview</h2>

            {previews.length === 0 ? (
              <div style={mutedBox}>No preview available for the current filters.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {previews.map((item) => (
                  <div key={`${item.type}-${item.name}`} style={previewCard}>
                    <div style={{ fontWeight: 900 }}>{item.name}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                      {item.type.toUpperCase()} • {item.subtitle}
                    </div>
                    {selectedChannel === "email" ? (
                      <div style={{ marginTop: 10 }}>
                        <div style={miniLabel}>Subject</div>
                        <div style={{ fontWeight: 800 }}>{item.preview.subject}</div>
                      </div>
                    ) : null}
                    <div style={{ marginTop: 10 }}>
                      <div style={miniLabel}>Body</div>
                      <pre style={previewBody}>{item.preview.body}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Recent campaigns</h2>

            {!campaigns?.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No campaigns created yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {(campaigns ?? []).map((campaign: any) => {
                  const currentCampaignId = String(campaign?.id ?? "");
                  const leadCount = leadCountByCampaign.get(currentCampaignId) ?? 0;
                  const customerCount = customerCountByCampaign.get(currentCampaignId) ?? 0;
                  const supplierCount = supplierCountByCampaign.get(currentCampaignId) ?? 0;

                  return (
                    <a key={currentCampaignId} href={`/sales-hub/campaigns/${currentCampaignId}/runner`} style={recentCard}>
                      <div style={{ fontWeight: 900 }}>{campaign.name}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        {campaign.channel} • {goalLabel(String(campaign.goal ?? ""))} • {campaign.status}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        {leadCount} linked leads • {customerCount} linked customers • {supplierCount} linked suppliers
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Create campaign</h2>

          {!canManage ? (
            <div style={mutedBox}>You do not have permission to create campaigns.</div>
          ) : createDisabled ? (
            <div style={mutedBox}>No targets match the current filters.</div>
          ) : (
            <form method="post" action="/api/sales-campaigns/create">
              <input type="hidden" name="template_id" value={selectedTemplateId} />
              <input type="hidden" name="channel" value={selectedChannel} />
              <input type="hidden" name="goal" value={selectedGoal} />
              <input type="hidden" name="tone" value={selectedTone} />
              <input type="hidden" name="service_focus" value={selectedServiceFocus} />
              <input type="hidden" name="availability_note" value={selectedAvailabilityNote} />
              <input type="hidden" name="all_lead_ids" value={filteredLeads.map((lead) => String(lead.id)).join(",")} />
              <input type="hidden" name="all_customer_ids" value={filteredCustomers.map((customer) => String(customer.id)).join(",")} />
              <input type="hidden" name="all_supplier_ids" value={filteredSuppliers.map((supplier) => String(supplier.id)).join(",")} />

              <div style={createGrid}>
                <div>
                  <label style={labelStyle}>Campaign name</label>
                  <input
                    name="name"
                    defaultValue={`${goalLabel(selectedGoal)} ${new Date().toLocaleDateString("en-GB")}`}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    name="description"
                    defaultValue={`Targeted ${selectedChannel} campaign for ${selectedServiceFocus}`}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={selectionGrid}>
                <div>
                  <div style={miniLabel}>Select leads to include</div>

                  {filteredLeads.length ? (
                    <label style={checkboxHeader}>
                      <input type="checkbox" name="select_all_leads" value="1" />
                      Include all filtered leads
                    </label>
                  ) : null}

                  {!filteredLeads.length ? (
                    <div style={mutedBox}>No leads match the current filters.</div>
                  ) : (
                    <div style={leadList}>
                      {filteredLeads.map((lead) => (
                        <label key={lead.id} style={leadRow}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <input type="checkbox" name="lead_ids" value={lead.id} style={checkboxInput} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                              <div style={smallText}>{lead.contact_name || "No contact"} • {lead.status || "New"} • {lead.email || lead.phone || "No contact detail"}</div>
                              <div style={smallText}>{lead.area || "No area"} • {lead.industry || "No industry"} • Weighted {moneyGBP(weightedValueForLead(lead))}</div>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={miniLabel}>Select customers to include</div>

                  {filteredCustomers.length ? (
                    <label style={checkboxHeader}>
                      <input type="checkbox" name="select_all_customers" value="1" />
                      Include all filtered customers
                    </label>
                  ) : null}

                  {!filteredCustomers.length ? (
                    <div style={mutedBox}>No customers match the current filters.</div>
                  ) : (
                    <div style={leadList}>
                      {filteredCustomers.map((customer) => {
                        const rollup = customerRollupById.get(String(customer.id)) ?? null;
                        const activity = getActivityInfo(rollup?.last_activity_date ?? null);
                        const importedCount = Number(rollup?.imported_history_count ?? 0);
                        const liveJobs = Number(rollup?.crm_job_count ?? 0) + Number(rollup?.crm_transport_job_count ?? 0);
                        return (
                          <label key={customer.id} style={leadRow}>
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <input type="checkbox" name="customer_ids" value={customer.id} style={checkboxInput} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900 }}>{customer.company_name}</div>
                                <div style={smallText}>{customer.contact_name || "No contact"} • {customer.email || customer.phone || "No contact detail"}</div>
                                <div style={smallText}>
                                  <span style={{ ...activityBadge, background: activity.bg, color: activity.color }}>{activity.label}</span>
                                  {fmtDate(rollup?.last_activity_date ?? null)} • {liveJobs} jobs • {importedCount} imported
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div style={miniLabel}>Select suppliers to include</div>

                  {filteredSuppliers.length ? (
                    <label style={checkboxHeader}>
                      <input type="checkbox" name="select_all_suppliers" value="1" />
                      Include all filtered suppliers
                    </label>
                  ) : null}

                  {!filteredSuppliers.length ? (
                    <div style={mutedBox}>No suppliers match the current filters.</div>
                  ) : (
                    <div style={leadList}>
                      {filteredSuppliers.map((supplier) => (
                        <label key={supplier.id} style={leadRow}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <input type="checkbox" name="supplier_ids" value={supplier.id} style={checkboxInput} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900 }}>{supplier.company_name}</div>
                              <div style={smallText}>{supplier.contact_name || "No contact"} • {supplier.email || supplier.phone || "No contact detail"}</div>
                              <div style={smallText}>{supplier.category || "No category"} • {supplier.address || "No address"}</div>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <ServerSubmitButton style={primaryBtn} pendingText="Creating campaign…">
                  Create campaign from selected targets
                </ServerSubmitButton>
              </div>
            </form>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const twoColumnGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16,
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

const createGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const selectionGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  marginTop: 16,
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

const successCard: CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};

const errorCard: CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const mutedBox: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.8,
};

const previewCard: CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const previewBody: CSSProperties = {
  margin: 0,
  marginTop: 4,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: 1.45,
  background: "rgba(255,255,255,0.58)",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.07)",
};

const recentCard: CSSProperties = {
  display: "block",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.08)",
  color: "#111",
  textDecoration: "none",
};

const leadList: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 420,
  overflow: "auto",
  paddingRight: 4,
};

const leadRow: CSSProperties = {
  display: "block",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.08)",
  cursor: "pointer",
};

const checkboxInput: CSSProperties = {
  width: 18,
  height: 18,
  marginTop: 2,
};

const checkboxHeader: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
  fontSize: 13,
  fontWeight: 700,
};

const miniLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.72,
  marginBottom: 6,
};

const smallText: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.72,
};

const activityBadge: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontWeight: 800,
  marginRight: 8,
};
