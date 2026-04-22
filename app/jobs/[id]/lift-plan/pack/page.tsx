import type { CSSProperties } from "react";
import ClientShell from "../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import PackSectionsForm from "./edit/PackSelectionsForm";

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: string | null | undefined) {
  const d = parseDate(value);
  if (!d) return value || "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  const d = parseDate(value);
  if (!d) return value || "—";
  return d.toLocaleString("en-GB");
}

function asText(value: unknown, fallback = "Not specified") {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const text = value.trim();
    return text.length ? text : fallback;
  }
  if (Array.isArray(value)) {
    const items = value.map((entry) => asText(entry, "")).filter(Boolean);
    return items.length ? items.join(", ") : fallback;
  }
  if (typeof value === "object") {
    try {
      const text = JSON.stringify(value);
      return text === "{}" ? fallback : text;
    } catch {
      return fallback;
    }
  }
  return String(value);
}

function asMultilineList(value: unknown) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => asText(entry, "")).filter(Boolean);
  }
  return String(value)
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function fileNameLooksLikeImage(fileName: string | null | undefined) {
  const name = String(fileName ?? "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].some((ext) => name.endsWith(ext));
}

function isAppendixImageDocument(doc: any) {
  const type = String(doc?.document_type ?? "").toLowerCase();
  const mime = String(doc?.file_type ?? "").toLowerCase();
  const name = String(doc?.file_name ?? "");

  if (mime.startsWith("image/") || fileNameLooksLikeImage(name)) return true;
  return type === "site_drawing" || type === "photo";
}

function utilisationPercent(loadValue: unknown, capacityValue: unknown) {
  const load = Number(loadValue ?? 0);
  const cap = Number(capacityValue ?? 0);
  if (!Number.isFinite(load) || !Number.isFinite(cap) || cap <= 0 || load <= 0) return "—";

  const raw = (load / cap) * 100;
  if (raw < 0.1) return "<0.1%";
  if (raw < 1) return `${raw.toFixed(1)}%`;
  if (raw < 10) return `${raw.toFixed(1)}%`;
  return `${Math.round(raw)}%`;
}

async function getSignedAppendixUrls(paths: string[]) {
  const supabase = createSupabaseServerClient();
  if (!paths.length) return new Map<string, string>();

  const { data, error } = await supabase.storage
    .from("job-documents")
    .createSignedUrls(paths, 60 * 60);

  if (error || !data) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  data.forEach((row) => {
    if (row.path && row.signedUrl) {
      map.set(row.path, row.signedUrl);
    }
  });

  return map;
}

function equipmentLabel(row: any) {
  const crane = one(row?.cranes) as any;
  const parts = [
    crane?.name,
    crane?.make,
    crane?.model,
    crane?.capacity ? `${crane.capacity}t` : null,
  ].filter(Boolean);
  return parts.join(" ") || row?.item_name || "Selected crane";
}

function buildSectionValue(packSections: Record<string, unknown> | null | undefined, key: string, fallback: unknown) {
  const override = packSections?.[key];
  if (override == null) return asText(fallback);
  return asText(override);
}

function buildSectionList(packSections: Record<string, unknown> | null | undefined, key: string, fallback: unknown) {
  const override = packSections?.[key];
  const list = asMultilineList(override ?? fallback);
  return list.length ? list : ["Not specified"];
}

function renderBulletList(items: string[]) {
  return (
    <ul style={{ margin: "8px 0 0 18px", padding: 0, display: "grid", gap: 6 }}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

export default async function LiftPlanPackPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { saved?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: liftPlan, error: liftPlanError },
    { data: documents, error: documentsError },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        start_date,
        end_date,
        job_date,
        start_time,
        end_time,
        hire_type,
        lift_type,
        notes,
        clients:client_id (
          company_name,
          contact_name,
          phone,
          email
        ),
        cranes:crane_id (
          id,
          name,
          make,
          model,
          capacity,
          reg_number
        ),
        operators:operator_id (
          id,
          full_name
        ),
        main_operator:main_operator_id (
          id,
          full_name
        ),
        job_equipment (
          id,
          asset_type,
          source_type,
          item_name,
          start_date,
          end_date,
          start_time,
          end_time,
          crane_id,
          operator_id,
          cranes:crane_id (
            id,
            name,
            make,
            model,
            capacity,
            reg_number
          ),
          operators:operator_id (
            id,
            full_name
          )
        )
      `)
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("lift_plans").select("*").eq("job_id", params.id).maybeSingle(),
    supabase
      .from("job_documents")
      .select("id, file_name, file_path, file_type, document_type, created_at")
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  const errorMessage = jobError?.message || liftPlanError?.message || documentsError?.message || "";
  const client = one((job as any)?.clients) as any;
  const jobEquipment = Array.isArray((job as any)?.job_equipment) ? (job as any).job_equipment : [];
  const selectedJobEquipmentId = String((liftPlan as any)?.selected_job_equipment_id ?? "").trim();
  const selectedCraneId = String((liftPlan as any)?.selected_crane_id ?? "").trim();

  let selectedEquipmentRow =
    jobEquipment.find((row: any) => String(row?.id ?? "") === selectedJobEquipmentId) ?? null;

  if (!selectedEquipmentRow && selectedCraneId) {
    selectedEquipmentRow =
      jobEquipment.find((row: any) => {
        const crane = one(row?.cranes) as any;
        return String(crane?.id ?? row?.crane_id ?? "") === selectedCraneId;
      }) ?? null;
  }

  const crane =
    (one(selectedEquipmentRow?.cranes) as any) ??
    (one((job as any)?.cranes) as any) ??
    null;

  const operator =
    (one(selectedEquipmentRow?.operators) as any) ??
    (one((job as any)?.main_operator) as any) ??
    (one((job as any)?.operators) as any) ??
    null;

  const packSections = ((liftPlan as any)?.pack_sections as Record<string, unknown> | null) ?? null;
  const appendixDocuments = ((documents as any[]) ?? []).filter(isAppendixImageDocument);
  const signedUrls = await getSignedAppendixUrls(
    appendixDocuments.map((doc: any) => String(doc.file_path ?? "")).filter(Boolean)
  );

  const projectTitle = buildSectionValue(
    packSections,
    "cover_project",
    `${client?.company_name || "Client"} – ${(job as any)?.site_name || "Lift plan"}`
  );
  const liftClassification = buildSectionValue(
    packSections,
    "lift_classification",
    (job as any)?.lift_type || (job as any)?.hire_type || "Contract lift"
  );
  const boomConfiguration = buildSectionValue(
    packSections,
    "boom_configuration",
    (liftPlan as any)?.boom_configuration || "As selected for the planned lift"
  );
  const boomLength = buildSectionValue(
    packSections,
    "boom_length",
    (liftPlan as any)?.boom_length || "To suit site conditions and lift radius"
  );
  const introduction = buildSectionValue(
    packSections,
    "introduction",
    `This lift plan pack has been prepared for job #${(job as any)?.job_number ?? "—"} at ${(job as any)?.site_name ?? "the stated site"}. The documented method is based on the information currently held within the CRM and any uploaded appendix drawings.`
  );
  const clientResponsibilities = buildSectionList(packSections, "client_responsibilities", [
    "Provide safe and suitable access / egress for delivery and crane set-up.",
    "Ensure ground conditions are suitable for the intended crane and outrigger loadings.",
    "Maintain exclusion zones and keep non-essential personnel clear of the lifting area.",
    "Advise of any overhead obstructions, underground services, restricted access or permit requirements before the lift.",
  ]);
  const contractLiftArrival = buildSectionValue(
    packSections,
    "contract_lift_arrival",
    "AnnS Crane Hire Ltd will arrive on site, assess conditions against the planned method, brief personnel involved in the lift, and only proceed when the appointed person / operator is satisfied that conditions remain safe."
  );
  const scopeOfWorks = buildSectionValue(
    packSections,
    "scope_of_works",
    (liftPlan as any)?.sequence_of_operations ||
      (job as any)?.notes ||
      "Lift and place the designated load in accordance with the agreed site sequence and the operator / appointed person briefing."
  );
  const communication = buildSectionValue(
    packSections,
    "communication",
    (liftPlan as any)?.communication_plan ||
      "Communication to be maintained between the operator, slinger / signaller, appointed person, and site contact at all times during crane operations."
  );
  const weatherConditions = buildSectionValue(
    packSections,
    "weather_conditions",
    "Operations to be monitored for wind, rain, lightning, visibility and any other adverse conditions. Lifting operations must stop if conditions become unsafe."
  );
  const siteAccess = buildSectionValue(
    packSections,
    "site_access_egress",
    "Access route and crane set-up area to be kept suitable for the selected crane size, axle loading and outrigger deployment."
  );
  const groundConditions = buildSectionValue(
    packSections,
    "ground_conditions",
    "Ground bearing capacity and surface condition to be suitable for crane deployment. Mats / outrigger support to be used where required."
  );
  const overheadObstructions = buildSectionValue(
    packSections,
    "overhead_obstructions",
    "Overhead services, structures, trees and any slewing restrictions must be identified and controlled before lifting commences."
  );
  const trafficPedestrianManagement = buildSectionValue(
    packSections,
    "traffic_pedestrian_management",
    "The lifting area must be segregated from pedestrians and site traffic using suitable barriers, banksmen and agreed site controls."
  );
  const liftingEquipmentCertification = buildSectionValue(
    packSections,
    "lifting_equipment_certification",
    "All lifting accessories and crane certification must be in date and suitable for the load and lifting arrangement."
  );
  const craneDetails = buildSectionValue(
    packSections,
    "crane_details",
    `Selected crane: ${equipmentLabel(selectedEquipmentRow ?? { cranes: [crane] })}. Crane utilisation for the planned lift is ${utilisationPercent((liftPlan as any)?.load_weight, crane?.capacity)} based on the stored load weight and crane capacity.`
  );
  const craneSetupProcedure = buildSectionValue(
    packSections,
    "crane_setup_procedure",
    "Crane to position in the agreed set-up location, deploy outriggers as required, level correctly, install mats / spreaders where necessary, and complete pre-lift checks before operations begin."
  );
  const liftingProcedure = buildSectionValue(
    packSections,
    "lifting_procedure",
    (liftPlan as any)?.method_statement ||
      "The load will be slung using suitable certified accessories, lifted under the direction of the designated signaller, slewed within the agreed working area and landed in the agreed final position under controlled conditions."
  );
  const deRigProcedure = buildSectionValue(
    packSections,
    "de_rig_procedure",
    "On completion, the crane will be de-rigged safely, accessories checked and removed, and the site left clear of lifting gear and support materials."
  );
  const emergencyProcedure = buildSectionValue(
    packSections,
    "emergency_procedure",
    "In the event of an unsafe condition, incident or near miss, the operation must stop immediately, the area must be made safe, and site management / emergency services contacted where required."
  );
  const riskAssessmentSummary = buildSectionValue(
    packSections,
    "risk_assessment_summary",
    (liftPlan as any)?.risk_assessment ||
      "The principal risks relate to ground conditions, overhead obstructions, unsuitable access, inadequate exclusion zones, communication failure, weather conditions and incorrect load handling."
  );
  const emergencyContacts = buildSectionList(packSections, "emergency_contacts", [
    client?.contact_name ? `${client.contact_name}${client.phone ? ` – ${client.phone}` : ""}` : "",
    (job as any)?.contact_name ? `${(job as any).contact_name}${(job as any)?.contact_phone ? ` – ${(job as any).contact_phone}` : ""}` : "",
  ]);
  const equipmentList = buildSectionList(packSections, "equipment_list", [
    equipmentLabel(selectedEquipmentRow ?? { cranes: [crane] }),
    operator?.full_name ? `Operator: ${operator.full_name}` : "",
    "Certified lifting accessories to suit the lift.",
  ]);
  const toolboxNotes = buildSectionValue(
    packSections,
    "toolbox_notes",
    "All personnel involved in the lift to receive a site-specific briefing before work starts. Any deviation from the agreed method must be referred back to supervision before proceeding."
  );

  const savedMessage =
    String(searchParams?.saved ?? "").trim() === "1" ? "Pack edits saved." : "";
  const formError = String(searchParams?.error ?? "").trim();

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={toolbar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Full lift plan pack</h1>
            <div style={{ marginTop: 6, opacity: 0.78 }}>
              Review the final pack, edit the pack sections on this page, then print the full pack.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/jobs/${params.id}/lift-plan`} style={secondaryBtn}>
              ← Back to lift plan
            </a>
            <form action={`/api/jobs/${params.id}/lift-plan/pack-selections`} method="post" style={{ display: "contents" }}>
              <button type="submit" style={primaryBtn}>
                Save pack edits
              </button>
              <a href={`/jobs/${params.id}/lift-plan/pack?print=1`} target="_blank" style={secondaryBtn}>
                Print full pack
              </a>

              <div style={{ display: "none" }}>
                {[
                  ["cover_project", projectTitle],
                  ["lift_classification", liftClassification],
                  ["boom_configuration", boomConfiguration],
                  ["boom_length", boomLength],
                  ["introduction", introduction],
                  ["client_responsibilities", clientResponsibilities.join("\n")],
                  ["contract_lift_arrival", contractLiftArrival],
                  ["scope_of_works", scopeOfWorks],
                  ["communication", communication],
                  ["weather_conditions", weatherConditions],
                  ["site_access_egress", siteAccess],
                  ["ground_conditions", groundConditions],
                  ["overhead_obstructions", overheadObstructions],
                  ["traffic_pedestrian_management", trafficPedestrianManagement],
                  ["lifting_equipment_certification", liftingEquipmentCertification],
                  ["crane_details", craneDetails],
                  ["crane_setup_procedure", craneSetupProcedure],
                  ["lifting_procedure", liftingProcedure],
                  ["de_rig_procedure", deRigProcedure],
                  ["emergency_procedure", emergencyProcedure],
                  ["risk_assessment_summary", riskAssessmentSummary],
                  ["emergency_contacts", emergencyContacts.join("\n")],
                  ["equipment_list", equipmentList.join("\n")],
                  ["toolbox_notes", toolboxNotes],
                ].map(([name, value]) => (
                  <input key={name} type="hidden" name={name} defaultValue={String(value ?? "")} />
                ))}
              </div>
            </form>
          </div>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
        {savedMessage ? <div style={successBox}>{savedMessage}</div> : null}
        {formError ? <div style={errorBox}>{formError}</div> : null}

        <PackSectionsForm jobId={params.id} initialSections={packSections as any} />

        <div style={packSheet}>
          <section style={page}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={brandRow}>
                <div>
                  <div style={smallMuted}>AnnS Crane Hire Ltd</div>
                  <h2 style={{ margin: "6px 0 0", fontSize: 34 }}>Lift Plan Pack</h2>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={smallMuted}>Job number</div>
                  <div style={heroValue}>#{(job as any)?.job_number ?? "—"}</div>
                </div>
              </div>

              <div style={heroGrid}>
                <InfoCard title="Project" value={projectTitle} />
                <InfoCard title="Client" value={client?.company_name || "—"} />
                <InfoCard title="Site" value={(job as any)?.site_name || "—"} />
                <InfoCard title="Address" value={(job as any)?.site_address || "—"} />
                <InfoCard
                  title="Planned dates"
                  value={`${formatDate((job as any)?.start_date ?? (job as any)?.job_date)} to ${formatDate(
                    (job as any)?.end_date ?? (job as any)?.job_date
                  )}`}
                />
                <InfoCard
                  title="Planned times"
                  value={`${(job as any)?.start_time || "—"} to ${(job as any)?.end_time || "—"}`}
                />
                <InfoCard title="Lift classification" value={liftClassification} />
                <InfoCard title="Selected crane" value={equipmentLabel(selectedEquipmentRow ?? { cranes: [crane] })} />
              </div>
            </div>
          </section>

          <section style={page}>
            <SectionBlock title="1. Introduction">
              <Paragraph>{introduction}</Paragraph>
            </SectionBlock>

            <SectionBlock title="2. Client responsibilities">
              {renderBulletList(clientResponsibilities)}
            </SectionBlock>

            <SectionBlock title="3. Contract lift / arrival on site">
              <Paragraph>{contractLiftArrival}</Paragraph>
            </SectionBlock>

            <SectionBlock title="4. Scope of works">
              <Paragraph>{scopeOfWorks}</Paragraph>
            </SectionBlock>

            <SectionBlock title="5. Communication">
              <Paragraph>{communication}</Paragraph>
            </SectionBlock>

            <SectionBlock title="6. Weather conditions">
              <Paragraph>{weatherConditions}</Paragraph>
            </SectionBlock>
          </section>

          <section style={page}>
            <SectionBlock title="7. Site access and egress">
              <Paragraph>{siteAccess}</Paragraph>
            </SectionBlock>

            <SectionBlock title="8. Ground conditions">
              <Paragraph>{groundConditions}</Paragraph>
            </SectionBlock>

            <SectionBlock title="9. Overhead obstructions / restrictions">
              <Paragraph>{overheadObstructions}</Paragraph>
            </SectionBlock>

            <SectionBlock title="10. Traffic and pedestrian management">
              <Paragraph>{trafficPedestrianManagement}</Paragraph>
            </SectionBlock>

            <SectionBlock title="11. Lifting equipment & certification">
              <Paragraph>{liftingEquipmentCertification}</Paragraph>
            </SectionBlock>

            <SectionBlock title="12. Crane details">
              <Paragraph>{craneDetails}</Paragraph>
              <div style={statGrid}>
                <InfoCard title="Crane reg" value={crane?.reg_number || "—"} />
                <InfoCard title="Boom configuration" value={boomConfiguration} />
                <InfoCard title="Boom length" value={boomLength} />
                <InfoCard title="Utilisation" value={utilisationPercent((liftPlan as any)?.load_weight, crane?.capacity)} />
              </div>
            </SectionBlock>
          </section>

          <section style={page}>
            <SectionBlock title="13. Crane set-up procedure">
              <Paragraph>{craneSetupProcedure}</Paragraph>
            </SectionBlock>

            <SectionBlock title="14. Lifting procedure">
              <Paragraph>{liftingProcedure}</Paragraph>
            </SectionBlock>

            <SectionBlock title="15. De-rig procedure">
              <Paragraph>{deRigProcedure}</Paragraph>
            </SectionBlock>

            <SectionBlock title="16. Emergency procedure">
              <Paragraph>{emergencyProcedure}</Paragraph>
            </SectionBlock>
          </section>

          <section style={page}>
            <SectionBlock title="17. Risk assessment summary">
              <Paragraph>{riskAssessmentSummary}</Paragraph>
            </SectionBlock>

            <SectionBlock title="18. Emergency contacts">
              {renderBulletList(emergencyContacts)}
            </SectionBlock>

            <SectionBlock title="19. Equipment list">
              {renderBulletList(equipmentList)}
            </SectionBlock>

            <SectionBlock title="20. Toolbox / sign-off notes">
              <Paragraph>{toolboxNotes}</Paragraph>
            </SectionBlock>

            <SectionBlock title="Recorded job details">
              <div style={statGrid}>
                <InfoCard title="Site contact" value={(job as any)?.contact_name || client?.contact_name || "—"} />
                <InfoCard title="Contact phone" value={(job as any)?.contact_phone || client?.phone || "—"} />
                <InfoCard title="Operator" value={operator?.full_name || "—"} />
                <InfoCard title="Lift plan last updated" value={formatDateTime((liftPlan as any)?.updated_at)} />
              </div>
            </SectionBlock>
          </section>

          {appendixDocuments.map((doc: any, index: number) => {
            const signedUrl = signedUrls.get(String(doc.file_path ?? ""));
            return (
              <section style={page} key={doc.id}>
                <SectionBlock title={`Appendix page ${index + 1}`}>
                  <div style={{ marginBottom: 10, fontWeight: 800 }}>{doc.file_name || `Appendix ${index + 1}`}</div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
                    {String(doc.document_type ?? "").replaceAll("_", " ") || "uploaded appendix"} • uploaded{" "}
                    {formatDateTime(doc.created_at)}
                  </div>

                  {signedUrl ? (
                    <div style={imageFrame}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signedUrl}
                        alt={doc.file_name || `Appendix ${index + 1}`}
                        style={{ width: "100%", height: "auto", display: "block" }}
                      />
                    </div>
                  ) : (
                    <div style={appendixFallback}>
                      Preview unavailable for this appendix image.
                    </div>
                  )}
                </SectionBlock>
              </section>
            );
          })}
        </div>
      </div>
    </ClientShell>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={infoCard}>
      <div style={smallMuted}>{title}</div>
      <div style={{ marginTop: 6, fontWeight: 900, lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={sectionTitle}>{title}</div>
      <div style={sectionBody}>{children}</div>
    </div>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{children}</p>;
}

const toolbar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const successBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,160,80,0.14)",
  border: "1px solid rgba(0,160,80,0.18)",
  color: "#0b6b34",
  fontWeight: 700,
};

const errorBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.18)",
  color: "#8b0000",
  fontWeight: 700,
};

const packSheet: CSSProperties = {
  display: "grid",
  gap: 18,
};

const page: CSSProperties = {
  background: "#fff",
  color: "#111",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 10px 28px rgba(0,0,0,0.10)",
  display: "grid",
  gap: 20,
};

const brandRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const statGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const infoCard: CSSProperties = {
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};

const heroValue: CSSProperties = {
  fontSize: 26,
  fontWeight: 1000,
};

const smallMuted: CSSProperties = {
  fontSize: 12,
  opacity: 0.68,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const sectionTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 1000,
};

const sectionBody: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.65,
};

const imageFrame: CSSProperties = {
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const appendixFallback: CSSProperties = {
  padding: 20,
  borderRadius: 12,
  border: "1px dashed rgba(0,0,0,0.16)",
  background: "#fafafa",
};
