import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";
import { generateSocialPostsWithFallback } from "../../lib/ai/sales";

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  channel: string | null;
  goal: string | null;
  tone: string | null;
  service_focus: string | null;
  availability_note: string | null;
  created_at: string | null;
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

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function compactSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildHashtags(serviceFocus: string, area: string, industry: string) {
  const rawParts = [serviceFocus, area, industry, "AnnS Crane Hire", "Crane Hire", "Transport"]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const cleaned = rawParts.map((value) =>
    "#" +
    value
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  );

  return Array.from(new Set(cleaned)).slice(0, 6).join(" ");
}

function buildCTA(style: string, includePhone: boolean) {
  const phonePart = includePhone ? " Call 07442 158822." : "";

  if (style === "direct") {
    return `If you have anything coming up and need a reliable team, get in touch.${phonePart}`;
  }

  if (style === "availability") {
    return `If you need support and want to secure availability, message us now.${phonePart}`;
  }

  if (style === "story") {
    return `If you have a similar requirement coming up, we’d be happy to help.${phonePart}`;
  }

  return `If it would be useful to have a dependable crane and transport partner in place, let’s talk.${phonePart}`;
}

function generatePostVariants({
  serviceFocus,
  area,
  industry,
  tone,
  objective,
  availabilityNote,
  assetName,
  campaignName,
  sourceTemplate,
  includePhone,
}: {
  serviceFocus: string;
  area: string;
  industry: string;
  tone: string;
  objective: string;
  availabilityNote: string;
  assetName: string;
  campaignName: string;
  sourceTemplate: string;
  includePhone: boolean;
}) {
  const focus = compactSpaces(serviceFocus || "crane hire and transport support");
  const region = compactSpaces(area || "across the UK");
  const sector = compactSpaces(industry || "construction and related sectors");
  const asset = compactSpaces(assetName || "");
  const campaign = compactSpaces(campaignName || "");
  const availability = compactSpaces(availabilityNote || "");
  const hashtags = buildHashtags(focus, region, sector);

  const openerTone =
    tone === "direct"
      ? "Need a dependable lifting and transport partner?"
      : tone === "friendly"
      ? "A quick update from AnnS Crane Hire."
      : "Professional support matters when deadlines are tight.";

  const objectiveLine =
    objective === "availability"
      ? `We currently have ${focus}${availability ? ` ${availability}` : ""}.`
      : objective === "reactivation"
      ? `We’re speaking with businesses who may need ${focus} in the coming weeks.`
      : objective === "awareness"
      ? `We want to keep AnnS Crane Hire front of mind for businesses needing ${focus}.`
      : `We’re helping customers with ${focus} ${region}.`;

  const assetLine = asset ? `A good example is our ${asset}, which is available for the right project.` : "";
  const campaignLine = campaign ? `This ties in with our current ${campaign} push.` : "";
  const sectorLine = `We regularly support businesses in ${sector} and related industries ${region}.`;

  const directPost = compactSpaces(`
${openerTone}

At AnnS Crane Hire, we support customers with ${focus} ${region}.

${objectiveLine}
${assetLine}
${campaignLine}

We pride ourselves on being professional, responsive and easy to deal with.

${buildCTA("direct", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const availabilityPost = compactSpaces(`
Availability update from AnnS Crane Hire.

We currently have support available for ${focus}${availability ? ` ${availability}` : ""}.

If your project needs a professional team that can assist with crane and transport requirements ${region}, we’d be happy to help.

${assetLine}

${buildCTA("availability", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const storyPost = compactSpaces(`
One thing we know in this industry is that projects rarely stay simple.

That is why customers value a team that can support ${focus} with a practical and professional approach.

At AnnS Crane Hire, we work with businesses ${region} who need reliable support, clear communication and a service they can trust.

${assetLine}
${campaignLine}
${objectiveLine}

${buildCTA("story", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const relationshipPost = compactSpaces(`
At AnnS Crane Hire, we are not just looking to quote one-off jobs.

We want to build long-term working relationships with businesses that need ${focus} ${region}.

We know that reliability, communication and responsiveness matter just as much as the equipment itself.

${sectorLine}
${objectiveLine}

${buildCTA("relationship", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const templateInspiredPost = sourceTemplate
    ? compactSpaces(`
${sourceTemplate}

AnnS Crane Hire can support with ${focus} ${region}${availability ? `, with ${availability}` : ""}.

${assetLine}

${buildCTA("direct", includePhone)}

${hashtags}
    `).replace(/ \./g, ".")
    : "";

  const variants = [
    {
      key: "direct",
      title: "Direct sales post",
      description: "Best for straightforward lead generation.",
      body: directPost,
    },
    {
      key: "availability",
      title: "Availability update",
      description: "Best when you have short-notice fleet availability.",
      body: availabilityPost,
    },
    {
      key: "story",
      title: "Story / credibility post",
      description: "Best for building trust and authority.",
      body: storyPost,
    },
    {
      key: "relationship",
      title: "Partnership post",
      description: "Best for ongoing B2B relationship building.",
      body: relationshipPost,
    },
  ];

  if (templateInspiredPost) {
    variants.push({
      key: "template",
      title: "Template-inspired post",
      description: "Built from the selected LinkedIn template.",
      body: templateInspiredPost,
    });
  }

  return variants;
}

type SocialStudioPageProps = {
  searchParams?: {
    campaign_id?: string;
    template_id?: string;
    service_focus?: string;
    area?: string;
    industry?: string;
    tone?: string;
    objective?: string;
    availability_note?: string;
    asset_name?: string;
    include_phone?: string;
    generate?: string;
    success?: string;
    error?: string;
  };
};

export default async function SocialStudioPage({
  searchParams,
}: SocialStudioPageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManage = !!access.user && canCreateCustomers(access);
  const currentUsername = fromAuthEmail(user?.email ?? null);

  async function saveGeneratedTemplate(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/social-studio?error=You%20do%20not%20have%20permission%20to%20save%20templates.");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const tone = String(formData.get("tone") ?? "professional").trim() || "professional";
    const goal = String(formData.get("goal") ?? "introduction").trim() || "introduction";
    const serviceFocus = String(formData.get("service_focus") ?? "").trim() || null;
    const availabilityNote = String(formData.get("availability_note") ?? "").trim() || null;
    const bodyHint = String(formData.get("body_hint") ?? "").trim() || null;
    const customCta = String(formData.get("custom_cta") ?? "").trim() || null;

    if (!name || !bodyHint) {
      redirect("/sales-hub/social-studio?error=Template%20name%20and%20content%20are%20required.");
    }

    const { data: inserted, error } = await supabase
      .from("sales_templates")
      .insert({
        name,
        description,
        channel: "linkedin",
        goal,
        tone,
        service_focus: serviceFocus,
        availability_note: availabilityNote,
        custom_cta: customCta,
        body_hint: bodyHint,
        is_active: true,
        created_by_user_id: user?.id ?? null,
        created_by_username: fromAuthEmail(user?.email ?? null) || null,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      redirect(`/sales-hub/social-studio?error=${encodeURIComponent(error?.message || "Could not save template.")}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_social_template_created",
      entity_type: "sales_template",
      entity_id: inserted.id,
      meta: {
        channel: "linkedin",
        goal,
        tone,
        service_focus: serviceFocus,
      },
    });

    redirect("/sales-hub/social-studio?success=Social%20template%20saved.");
  }

  const [
    { data: campaigns, error: campaignsError },
    { data: templates, error: templatesError },
  ] = await Promise.all([
    supabase
      .from("sales_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("sales_templates")
      .select("*")
      .eq("is_active", true)
      .eq("channel", "linkedin")
      .order("name", { ascending: true })
      .limit(30),
  ]);

  const allCampaigns = (campaigns ?? []) as CampaignRow[];
  const allTemplates = (templates ?? []) as TemplateRow[];

  const selectedCampaignId = String(searchParams?.campaign_id ?? "").trim();
  const selectedTemplateId = String(searchParams?.template_id ?? "").trim();

  const selectedCampaign =
    allCampaigns.find((item) => String(item.id) === selectedCampaignId) || null;
  const selectedTemplate =
    allTemplates.find((item) => String(item.id) === selectedTemplateId) || null;

  const objective =
    String(searchParams?.objective ?? "").trim() ||
    String(selectedCampaign?.goal ?? selectedTemplate?.goal ?? "awareness");

  const tone =
    String(searchParams?.tone ?? "").trim() ||
    String(selectedCampaign?.tone ?? selectedTemplate?.tone ?? "professional");

  const serviceFocus =
    String(searchParams?.service_focus ?? "").trim() ||
    String(selectedCampaign?.service_focus ?? selectedTemplate?.service_focus ?? "") ||
    "crane hire and transport support";

  const availabilityNote =
    String(searchParams?.availability_note ?? "").trim() ||
    String(selectedCampaign?.availability_note ?? selectedTemplate?.availability_note ?? "");

  const area = String(searchParams?.area ?? "").trim() || "across the UK";
  const industry = String(searchParams?.industry ?? "").trim() || "construction";
  const assetName = String(searchParams?.asset_name ?? "").trim();
  const includePhone = String(searchParams?.include_phone ?? "yes").trim() !== "no";
  const shouldUseAI = String(searchParams?.generate ?? "").trim() === "yes";

  const generation = shouldUseAI
    ? await generateSocialPostsWithFallback({
        serviceFocus,
        area,
        industry,
        tone,
        objective,
        availabilityNote,
        assetName,
        campaignName: String(selectedCampaign?.name ?? ""),
        sourceTemplate: String(selectedTemplate?.body_hint ?? ""),
        includePhone,
      })
    : {
        variants: generatePostVariants({
          serviceFocus,
          area,
          industry,
          tone,
          objective,
          availabilityNote,
          assetName,
          campaignName: String(selectedCampaign?.name ?? ""),
          sourceTemplate: String(selectedTemplate?.body_hint ?? ""),
          includePhone,
        }),
        provider: "fallback" as const,
      };

  const variants = generation.variants;

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Social Content Studio</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Generate ready-to-use social posts from your sales campaigns, templates and current availability.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>
              Campaigns
            </a>
            <a href="/sales-hub/templates" style={secondaryBtn}>
              Templates
            </a>
          </div>
        </div>

        {searchParams?.success ? (
          <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div>
        ) : null}

        {searchParams?.error ? (
          <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div>
        ) : null}

        {campaignsError ? <div style={errorCard}>{campaignsError.message}</div> : null}
        {templatesError ? <div style={errorCard}>{templatesError.message}</div> : null}

        {shouldUseAI ? (
          <div style={generation.provider === "openai" ? successCard : errorCard}>
            {generation.provider === "openai"
              ? "AI-generated social posts ready."
              : "AI was unavailable, so the studio used the built-in fallback generator."}
          </div>
        ) : null}

        <div style={statsGrid}>
          <StatCard label="Available campaigns" value={String(allCampaigns.length)} />
          <StatCard label="LinkedIn templates" value={String(allTemplates.length)} />
          <StatCard label="Generated variants" value={String(variants.length)} />
          <StatCard
            label="Generation mode"
            value={shouldUseAI ? (generation.provider === "openai" ? "AI" : "Fallback") : "Preview"}
          />
          <StatCard label="Current editor" value={currentUsername || "Unknown"} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Post builder</h2>

          <form method="get" action="/sales-hub/social-studio" style={builderGrid}>
            <input type="hidden" name="generate" value="yes" />

            <div>
              <label style={labelStyle}>Campaign</label>
              <select name="campaign_id" defaultValue={selectedCampaignId} style={inputStyle}>
                <option value="">No campaign</option>
                {allCampaigns.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>LinkedIn template</label>
              <select name="template_id" defaultValue={selectedTemplateId} style={inputStyle}>
                <option value="">No template</option>
                {allTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Objective</label>
              <select name="objective" defaultValue={objective} style={inputStyle}>
                <option value="awareness">Awareness</option>
                <option value="availability">Availability</option>
                <option value="reactivation">Reactivation</option>
                <option value="introduction">Introduction</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Tone</label>
              <select name="tone" defaultValue={tone} style={inputStyle}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="direct">Direct</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Service focus</label>
              <input
                name="service_focus"
                defaultValue={serviceFocus}
                style={inputStyle}
                placeholder="e.g. mobile crane hire, HIAB transport"
              />
            </div>

            <div>
              <label style={labelStyle}>Availability note</label>
              <input
                name="availability_note"
                defaultValue={availabilityNote}
                style={inputStyle}
                placeholder="e.g. tomorrow, next week, short notice"
              />
            </div>

            <div>
              <label style={labelStyle}>Area / coverage</label>
              <input
                name="area"
                defaultValue={area}
                style={inputStyle}
                placeholder="e.g. Swansea, South Wales, across the UK"
              />
            </div>

            <div>
              <label style={labelStyle}>Industry / target audience</label>
              <input
                name="industry"
                defaultValue={industry}
                style={inputStyle}
                placeholder="e.g. steel erectors, glazing, contractors"
              />
            </div>

            <div>
              <label style={labelStyle}>Asset / crane / vehicle</label>
              <input
                name="asset_name"
                defaultValue={assetName}
                style={inputStyle}
                placeholder="e.g. Grove GMK4080-1, Marchetti MTK 35"
              />
            </div>

            <div>
              <label style={labelStyle}>Include phone CTA</label>
              <select name="include_phone" defaultValue={includePhone ? "yes" : "no"} style={inputStyle}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Generate posts
              </button>
              <a href="/sales-hub/social-studio" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Generated social posts</h2>

          <div style={{ display: "grid", gap: 14 }}>
            {variants.map((variant) => (
              <div key={variant.key} style={postCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{variant.title}</div>
                    <div style={{ marginTop: 4, opacity: 0.72, fontSize: 13 }}>{variant.description}</div>
                  </div>

                  <div style={miniBadge}>LinkedIn / social ready</div>
                </div>

                <div style={postBody}>{variant.body}</div>

                <div style={actionRow}>
                  {canManage ? (
                    <form action={saveGeneratedTemplate} style={inlineForm}>
                      <input
                        type="hidden"
                        name="name"
                        value={`${titleCase(serviceFocus)} ${titleCase(variant.title)}`}
                      />
                      <input
                        type="hidden"
                        name="description"
                        value={`Saved from Social Content Studio (${variant.title}).`}
                      />
                      <input type="hidden" name="tone" value={tone} />
                      <input type="hidden" name="goal" value={objective} />
                      <input type="hidden" name="service_focus" value={serviceFocus} />
                      <input type="hidden" name="availability_note" value={availabilityNote} />
                      <input type="hidden" name="custom_cta" value={includePhone ? "Call 07442 158822." : ""} />
                      <input type="hidden" name="body_hint" value={variant.body} />
                      <button type="submit" style={primaryBtn}>
                        Save as template
                      </button>
                    </form>
                  ) : (
                    <div style={mutedBox}>You do not have permission to save templates.</div>
                  )}

                  <a href="/sales-hub/templates" style={secondaryBtn}>
                    Open templates
                  </a>
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
  flexWrap: "wrap" as const,
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

const builderGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
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
  boxSizing: "border-box" as const,
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

const postCard: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const postBody: CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap" as const,
  lineHeight: 1.6,
  fontSize: 14,
};

const actionRow: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap" as const,
  marginTop: 14,
  alignItems: "center",
};

const inlineForm: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap" as const,
  alignItems: "center",
};

const miniBadge: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 12,
};

const mutedBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.76,
  fontWeight: 700,
};
