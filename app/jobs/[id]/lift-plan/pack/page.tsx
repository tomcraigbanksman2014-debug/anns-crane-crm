import type { CSSProperties, ReactNode } from "react";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  getPrimaryCraneContext,
  matchCraneJobEquipmentProfile,
} from "../../../../lib/ai/matchEquipmentProfile";
import { getPackAppendixAssets, type PackAppendixAsset } from "../../../../lib/ai/packAppendixAssets";
import PrintPackButton from "./PrintPackButton";

type StringMap = Record<string, string | null>;

function flatten<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function val(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function calcDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return "—";
  const a = new Date(start);
  const b = new Date(end || start);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const diff = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return `${diff} day${diff === 1 ? "" : "s"}`;
}

function craneLabel(crane: any, allocation: any) {
  const parts = [crane?.name, crane?.make, crane?.model].filter(Boolean);
  return parts.join(" ").trim() || crane?.name || allocation?.item_name || "—";
}

function formatCapacity(profile: any, crane: any) {
  if (profile?.maxCapacityKg) {
    const kg = Number(profile.maxCapacityKg);
    const tonnes =
      profile?.maxCapacityTonnes ??
      (Number.isFinite(kg) ? Number((kg / 1000).toFixed(1)) : null);

    const kgText = Number.isFinite(kg) ? `${kg.toLocaleString("en-GB")} kg` : "";
    const tonneText = tonnes ? `${tonnes} t` : "";

    return [kgText, tonneText].filter(Boolean).join(" / ");
  }
  return crane?.capacity || "—";
}

function percentageUtilisation(loadWeight: any, capacityKg: any) {
  const load = Number(loadWeight || 0);
  const cap = Number(capacityKg || 0);
  if (!load || !cap) return "—";
  return `${Math.round((load / cap) * 100)}%`;
}

function splitLines(value: string | null | undefined) {
  if (!value) return [];
  return String(value)
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function para(value: string | null | undefined, fallback: string) {
  return value && String(value).trim() ? String(value) : fallback;
}

function sentenceCase(value: string | null | undefined, fallback: string) {
  return para(value, fallback).trim();
}

function tidyWhitespace(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortBoomConfiguration(
  override: string | null | undefined,
  liftPlanConfiguration: string | null | undefined,
  equipmentProfile: any
) {
  if (override && override.trim()) return override.trim();

  const source = tidyWhitespace(liftPlanConfiguration).toLowerCase();

  if (!source) {
    if (equipmentProfile?.machineType === "truck_crane") return "Main boom";
    if (equipmentProfile?.machineType === "crane") return "Main boom";
    if (equipmentProfile?.machineType === "spider") return "Main boom";
    return "Planned configuration";
  }

  if (source.includes("main boom") && source.includes("jib")) return "Main boom + jib";
  if (source.includes("main boom")) return "Main boom";
  if (source.includes("fly jib")) return "Main boom + fly jib";
  if (source.includes("jib")) return "Boom + jib";
  if (source.includes("platform") || source.includes("basket")) return "Lifting mode only";
  return liftPlanConfiguration?.trim() || "Planned configuration";
}

function shortBoomLength(
  override: string | null | undefined,
  equipmentProfile: any,
  craneName: string
) {
  if (override && override.trim()) return override.trim();

  if (equipmentProfile?.maxBoomLengthM) {
    return `${equipmentProfile.maxBoomLengthM} m max boom`;
  }

  if (equipmentProfile?.maxHydraulicOutreachM) {
    if (String(craneName).toLowerCase().includes("ak 46")) {
      return "44.0 m max extension";
    }
    return `${equipmentProfile.maxHydraulicOutreachM} m hydraulic outreach`;
  }

  return "Planned per selected chart";
}

function fallbackScope(clientName: string, projectName: string, liftPlan: any, loadWeight: string) {
  const loadText = liftPlan?.load_description || "the planned load";
  return `Works comprise the lifting operation for ${clientName} at ${projectName}. The planned load is ${loadText} with a stated load weight of ${loadWeight}. All lifting activities are to be carried out under the control of the appointed lifting team in accordance with the approved lift plan, site controls and current legislation.`;
}

function fallbackCommunication(siteContact: string) {
  return `Communication will be maintained using clear agreed hand signals in accordance with BS 7121, with two-way radio communication used if visibility or site layout requires it. The designated signaller will remain in control of crane movements and liaise with ${siteContact || "the site representative"} where necessary.`;
}

function coverAddress(job: any) {
  return [job?.site_name, job?.site_address].filter(Boolean).join(", ");
}

function existingAppendixAssets(profileId: string | null | undefined) {
  return getPackAppendixAssets(profileId);
}

function formatOutreachReference(profile: any) {
  if (profile?.maxHydraulicOutreachM && profile?.maxRadiusM) {
    return `${profile.maxHydraulicOutreachM} m / ${profile.maxRadiusM} m radius`;
  }
  if (profile?.maxHydraulicOutreachM) return `${profile.maxHydraulicOutreachM} m`;
  if (profile?.maxBoomLengthM && profile?.maxRadiusM) {
    return `${profile.maxBoomLengthM} m boom / ${profile.maxRadiusM} m radius`;
  }
  if (profile?.maxBoomLengthM) return `${profile.maxBoomLengthM} m`;
  if (profile?.maxRadiusM) return `${profile.maxRadiusM} m radius`;
  return "—";
}

function formatJibReference(profile: any) {
  if (profile?.maxJibOutreachM) return `${profile.maxJibOutreachM} m`;
  if (profile?.maxRadiusM) return `${profile.maxRadiusM} m radius`;
  return "—";
}

function PageShell({
  children,
  sectionTitle,
  breakAfter = true,
}: {
  children: ReactNode;
  sectionTitle: string;
  breakAfter?: boolean;
}) {
  return (
    <section
      style={{
        ...pageStyle,
        pageBreakAfter: breakAfter ? "always" : "auto",
        breakAfter: breakAfter ? "page" : "auto",
      }}
    >
      <PageHeader sectionTitle={sectionTitle} />
      <div style={pageBody}>{children}</div>
      <PageFooter />
    </section>
  );
}

function PageHeader({ sectionTitle }: { sectionTitle: string }) {
  return (
    <div style={pageHeader}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/icon.png" alt="AnnS Crane Hire logo" style={logoStyle} />
        <div>
          <div style={{ fontWeight: 900, letterSpacing: 0.5 }}>ANNS – LIFTING PLAN – V1</div>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Anns Crane Hire Ltd</div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, opacity: 0.7 }}>April 2026</div>
        <div style={{ fontWeight: 800 }}>{sectionTitle}</div>
      </div>
    </div>
  );
}

function PageFooter() {
  return (
    <div style={pageFooter}>
      Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk
    </div>
  );
}

function InfoTable({ rows }: { rows: Array<[string, any]> }) {
  return (
    <div style={infoTable}>
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} style={{ display: "contents" }}>
          <div style={infoLabel}>{label}</div>
          <div style={infoValue}>{val(value)}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={sectionTitleStyle}>{children}</h2>;
}

function BoxedParagraph({
  title,
  children,
  compact = false,
}: {
  title?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ ...boxed, ...(compact ? compactBoxed : null) }}>
      {title ? <div style={boxedTitle}>{title}</div> : null}
      <div style={boxedBody}>{children}</div>
    </div>
  );
}

function TwoColumnBoxes({
  leftTitle,
  leftBody,
  rightTitle,
  rightBody,
}: {
  leftTitle: string;
  leftBody: ReactNode;
  rightTitle: string;
  rightBody: ReactNode;
}) {
  return (
    <div style={twoColGrid}>
      <BoxedParagraph title={leftTitle}>{leftBody}</BoxedParagraph>
      <BoxedParagraph title={rightTitle}>{rightBody}</BoxedParagraph>
    </div>
  );
}

function CheckboxTable({
  left,
  right,
}: {
  left: string[];
  right: string[];
}) {
  const rows = Math.max(left.length, right.length);
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>PRE-LIFT CHECK POINTS</th>
          <th style={thStyle}>Y</th>
          <th style={thStyle}>N</th>
          <th style={thStyle}>ERECTION / COMPLETION CHECKS</th>
          <th style={thStyle}>Y</th>
          <th style={thStyle}>N</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            <td style={tdStyle}>{left[i] ?? ""}</td>
            <td style={tickCell}></td>
            <td style={tickCell}></td>
            <td style={tdStyle}>{right[i] ?? ""}</td>
            <td style={tickCell}></td>
            <td style={tickCell}></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlankTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: number;
}) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} style={thStyle}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            {headers.map((header, idx) => (
              <td key={`${header}-${idx}`} style={tdStyle}></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SignatureRow({
  title,
  name,
}: {
  title: string;
  name?: string | null;
}) {
  return (
    <div style={signatureBox}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 12, borderBottom: "1px solid #333", minHeight: 22 }} />
      <div style={{ marginTop: 6, fontSize: 12 }}>
        Name: {name || "________________"} &nbsp;&nbsp; Date: ________________
      </div>
    </div>
  );
}

function AppendixPage({
  asset,
  index,
}: {
  asset: PackAppendixAsset;
  index: number;
}) {
  return (
    <PageShell sectionTitle={`Appendix ${index}`}>
      <SectionTitle>{asset.title}</SectionTitle>
      {asset.description ? <div style={{ marginBottom: 12, opacity: 0.82 }}>{asset.description}</div> : null}
      <div style={appendixFrame}>
        <img src={asset.publicPath} alt={asset.title} style={appendixImage} />
      </div>
    </PageShell>
  );
}

export default async function CraneLiftPlanPackPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job }, { data: liftPlan }] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_date,
        end_date,
        start_time,
        end_time,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        hire_type,
        lift_type,
        notes,
        clients:client_id (
          company_name
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
      .single(),
    supabase.from("lift_plans").select("*").eq("job_id", params.id).maybeSingle(),
  ]);

  const sections: StringMap =
    ((liftPlan as any)?.pack_sections as Record<string, string | null> | null) ?? {};
  const client = flatten((job as any)?.clients)[0] ?? null;
  const primary = getPrimaryCraneContext(job as any);
  const crane = primary?.crane ?? flatten((job as any)?.cranes)[0] ?? null;
  const allocation = primary?.allocation ?? null;
  const operator =
    primary?.operator ??
    flatten((job as any)?.main_operator)[0] ??
    flatten((job as any)?.operators)[0] ??
    null;

  const equipmentProfile = matchCraneJobEquipmentProfile({
    ...(job as any),
    cranes: crane ? [crane] : flatten((job as any)?.cranes),
    job_equipment: (job as any)?.job_equipment ?? [],
  });

  const appendixAssets = existingAppendixAssets(equipmentProfile?.id);

  const clientName = client?.company_name || "the client";
  const projectName =
    sections.cover_project ||
    (job as any)?.site_name ||
    `Job ${(job as any)?.job_number ?? ""}`.trim();
  const appointedPerson = liftPlan?.appointed_person || liftPlan?.approved_by || "Shaun Robinson";
  const liftSupervisor = liftPlan?.lift_supervisor || appointedPerson;
  const craneName = craneLabel(crane, allocation);
  const craneCapacity = formatCapacity(equipmentProfile, crane);
  const loadWeight = liftPlan?.load_weight ? `${liftPlan.load_weight} kg` : "—";
  const boomConfig = shortBoomConfiguration(
    sections.boom_configuration,
    liftPlan?.crane_configuration,
    equipmentProfile
  );
  const boomLength = shortBoomLength(sections.boom_length, equipmentProfile, craneName);
  const utilisation = percentageUtilisation(liftPlan?.load_weight, equipmentProfile?.maxCapacityKg);
  const scopeFallback = fallbackScope(clientName, projectName, liftPlan, loadWeight);
  const communicationFallback = fallbackCommunication((job as any)?.contact_name || "");
  const methodStatementLines = splitLines(liftPlan?.method_statement);
  const riskLines = splitLines(liftPlan?.risk_assessment);
  const hazardLines = splitLines(liftPlan?.site_hazards);
  const controlLines = splitLines(liftPlan?.control_measures);
  const ppeLines = splitLines(liftPlan?.ppe_required);
  const emergencyContacts = splitLines(sections.emergency_contacts || "").join("\n");
  const equipmentList = splitLines(sections.equipment_list || "").join("\n");
  const toolboxNotes = splitLines(sections.toolbox_notes || "").join("\n");

  const outreachRef = formatOutreachReference(equipmentProfile);
  const jibRef = formatJibReference(equipmentProfile);

  return (
    <div style={wrapper}>
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          body { background: white !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="print-hide" style={toolbar}>
        <a href={`/jobs/${params.id}/lift-plan`} style={buttonStyle}>
          ← Back to lift plan
        </a>
        <PrintPackButton />
      </div>

      <PageShell sectionTitle="Cover Sheet">
        <div style={coverHero}>
          <div>
            <div style={coverTitle}>ANNS – LIFTING PLAN – V1</div>
            <div style={coverSubtitle}>April 2026</div>
          </div>
          <div style={coverCompany}>
            <div>Anns Crane Hire Ltd</div>
            <div>6 Bay St, Port Tennant, Swansea, SA1 8LB</div>
            <div>01792 641653 • info@annscranehire.co.uk</div>
          </div>
        </div>

        <InfoTable
          rows={[
            ["Client", clientName],
            ["Project", projectName],
            ["Start Date", fmtDate((job as any)?.start_date ?? (job as any)?.job_date)],
            [
              "Duration",
              calcDuration(
                (job as any)?.start_date ?? (job as any)?.job_date,
                (job as any)?.end_date ?? (job as any)?.job_date
              ),
            ],
            ["Site Address", coverAddress(job)],
            ["Site Contact", (job as any)?.contact_name],
            ["Appointed Person", appointedPerson],
            ["Prepared by", "ANNS CRANE HIRE LTD"],
            [
              "Lift Classification",
              sections.lift_classification || (job as any)?.hire_type || "Basic",
            ],
            ["Crane(s)", craneName],
            ["Boom configuration", boomConfig],
            ["Boom length", boomLength],
          ]}
        />
      </PageShell>

      <PageShell sectionTitle="Table of Contents">
        <SectionTitle>Table of Contents</SectionTitle>
        <div style={tocGrid}>
          {[
            "1. Introduction",
            "2. Appointed Person Declaration",
            "3. Client Responsibilities and General Conditions",
            "4. The Contract Lift and Arrival on Site",
            "5. Brief Scope of Works",
            "6. Lifting Personnel",
            "7. On Site Communication",
            "8. Weather Conditions",
            "9. Site Access and Egress",
            "10. Ground Conditions",
            "11. Overhead Obstructions and Slewing Restrictions",
            "12. Traffic and Pedestrian Management",
            "13. Lifting Equipment to be used & Certification",
            "14. Crane Details",
            "15. Variation from Method Statement",
            "16. Toolbox Talk Attendance",
            "17. Crane Set-up Procedure",
            "18. Lifting Procedure",
            "19. De-Rig Procedure",
            "20. Emergency Procedure",
            "21. Risk Assessments",
            "22. Check Lists and Sign Offs",
          ].map((item) => (
            <div key={item} style={tocItem}>
              {item}
            </div>
          ))}
          {appendixAssets.length ? (
            <div style={tocItem}>Appendix – Selected machine specification and chart pages</div>
          ) : null}
        </div>
      </PageShell>

      <PageShell sectionTitle="1. Introduction">
        <SectionTitle>1. Introduction</SectionTitle>
        <BoxedParagraph title="Method Statement – CPA Contract Lift">
          {sentenceCase(
            sections.introduction,
            `This Method Statement has been prepared using information provided by ${clientName}, together with the site-specific details and lifting information recorded within the CRM. The operation is to be carried out in accordance with the approved lifting plan, current legislation, BS 7121, LOLER, PUWER and the relevant manufacturer guidance for the selected crane.`
          )}
        </BoxedParagraph>

        <TwoColumnBoxes
          leftTitle="Site Inspection"
          leftBody={sentenceCase(
            null,
            `A pre-lift planning review must confirm access and egress, crane standing area, ground conditions, exclusion zones, overhead obstructions, public interface, delivery positions and any site-specific restrictions before lifting operations commence.`
          )}
          rightTitle="Roles and Responsibilities"
          rightBody={sentenceCase(
            null,
            `The Appointed Person is responsible for the lift planning. The Lift Supervisor is responsible for implementing the plan on site. The Slinger/Signaller is responsible for directing the lift and ensuring correct attachment of lifting accessories. The crane operator must only operate within the approved configuration and under the agreed signalling method.`
          )}
        />

        <BoxedParagraph title="Job Planning Snapshot" compact>
          Client: {clientName}{"\n"}
          Project: {projectName}{"\n"}
          Crane: {craneName}{"\n"}
          Lift Type: {(job as any)?.lift_type || "—"}{"\n"}
          Site Contact: {(job as any)?.contact_name || "—"}{"\n"}
          Job Notes: {(job as any)?.notes || "—"}
        </BoxedParagraph>
      </PageShell>

      <PageShell sectionTitle="2–5. Planning & Scope">
        <SectionTitle>2. Appointed Person Declaration</SectionTitle>
        <InfoTable
          rows={[
            ["Name", appointedPerson],
            ["Prepared for job", `#${(job as any)?.job_number ?? "—"}`],
            ["Prepared by", "ANNS CRANE HIRE LTD"],
            ["Approved by", liftPlan?.approved_by],
            ["Approved at", fmtDateTime(liftPlan?.approved_at)],
          ]}
        />

        <SectionTitle>3. Client Responsibilities and General Conditions</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(
            sections.client_responsibilities,
            `The client shall provide accurate load information, safe and suitable access, a suitable crane standing area, traffic and pedestrian controls where required, and details of any restrictions, underground services, permits or other site conditions that may affect the lifting operation. The client remains responsible for the structural integrity of the load and any client-supplied lifting points.`
          )}
        </BoxedParagraph>

        <SectionTitle>4. The Contract Lift and Arrival on Site</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(
            sections.contract_lift_arrival,
            `Upon arrival, the crane and lifting personnel will report to the agreed site contact, complete any required induction and proceed to the planned lifting position under supervision. No lifting activity will commence until the Lift Supervisor has confirmed that the crane is correctly positioned, the exclusion zone is in place, communication is agreed, and the site remains suitable for the planned operation.`
          )}
        </BoxedParagraph>

        <SectionTitle>5. Brief Scope of Works</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(sections.scope_of_works || liftPlan?.load_description, scopeFallback)}
        </BoxedParagraph>
      </PageShell>

      <PageShell sectionTitle="6–12. Site Controls">
        <SectionTitle>6. Lifting Personnel</SectionTitle>
        <InfoTable
          rows={[
            ["Appointed Person", appointedPerson],
            ["Lift Supervisor", liftSupervisor],
            ["Crane Operator", liftPlan?.crane_operator || operator?.full_name],
            ["Client / Site Contact", (job as any)?.contact_name],
          ]}
        />

        <SectionTitle>7. On Site Communication</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(sections.communication, communicationFallback)}
        </BoxedParagraph>

        <SectionTitle>8. Weather Conditions</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(
            sections.weather_conditions || liftPlan?.weather_limitations || equipmentProfile?.weatherNote,
            `Lifting operations must not proceed in unsafe wind, lightning, heavy rain or poor visibility. Final permissible wind speed is to be confirmed against the relevant crane chart, selected configuration, load characteristics and the prevailing site conditions before the lift proceeds.`
          )}
        </BoxedParagraph>

        <TwoColumnBoxes
          leftTitle="9. Site Access and Egress"
          leftBody={sentenceCase(
            sections.site_access_egress,
            `The client must ensure that the crane, support vehicles and lifting personnel have clear and safe access to and egress from the site at all times. Access routes must remain suitable for the crane size, weight and turning requirements.`
          )}
          rightTitle="10. Ground Conditions"
          rightBody={sentenceCase(
            sections.ground_conditions || liftPlan?.ground_conditions,
            `Ground conditions are to be confirmed on arrival. The crane must only be set up on firm, level ground capable of supporting the crane, the load and the outrigger reactions. Additional ground protection must be used where required.`
          )}
        />

        <TwoColumnBoxes
          leftTitle="11. Overhead Obstructions and Slewing Restrictions"
          leftBody={sentenceCase(
            sections.overhead_obstructions || liftPlan?.site_hazards,
            `All overhead obstructions, structures, plant, services and slewing restrictions must be identified and controlled before lifting operations commence.`
          )}
          rightTitle="12. Traffic and Pedestrian Management"
          rightBody={sentenceCase(
            sections.traffic_pedestrian_management || liftPlan?.exclusion_zone_details,
            `The lifting area is to be clearly cordoned off using barriers and signage. Only authorised personnel are permitted within the lifting zone during operations.`
          )}
        />
      </PageShell>

      <PageShell sectionTitle="13. Equipment & Certification">
        <SectionTitle>13. Lifting Equipment to be used & Certification</SectionTitle>
        <InfoTable
          rows={[
            ["Sling type", liftPlan?.sling_type],
            ["Lifting accessories", liftPlan?.lifting_accessories],
            [
              "LOLER / certification",
              sections.lifting_equipment_certification ||
                "All lifting tackle must hold current certification and be inspected before use.",
            ],
          ]}
        />
      </PageShell>

      <PageShell sectionTitle="14. Crane Details">
        <SectionTitle>14. Crane Details</SectionTitle>
        <InfoTable
          rows={[
            ["Crane type", craneName],
            [
              "Crane gross weight",
              crane?.capacity
                ? `${crane?.capacity}`
                : "See selected machine profile / manufacturer information",
            ],
            ["Gross weight of load", loadWeight],
            [
              "Gross weight of lifting accessories",
              liftPlan?.lifting_accessories ? "Included within planned lift accessories." : "—",
            ],
            ["Boom configuration", boomConfig],
            ["Boom / outreach reference", outreachRef],
            ["Jib / max outreach", jibRef],
            ["Max capacity", craneCapacity],
            ["Crane utilisation %", utilisation],
          ]}
        />

        <BoxedParagraph title="Crane specifications">
          {sentenceCase(
            sections.crane_details,
            equipmentProfile?.summary ||
              "Selected crane profile to be checked against the current manufacturer specification and load chart."
          )}
        </BoxedParagraph>

        <BoxedParagraph title="Configuration / outrigger note">
          {equipmentProfile?.configurationNote || "The crane is to be configured and rigged only in the arrangement approved for the planned lift."}
          {"\n\n"}
          {equipmentProfile?.outriggersNote || "Outriggers are to be deployed as required by the selected duty and site restrictions on suitable support mats / spreaders."}
        </BoxedParagraph>

        <BoxedParagraph title="Load chart note">
          Final radius, boom length, hook block weight, accessories, outrigger arrangement, ground conditions and any partial set-up restrictions must be checked against the current applicable chart before the lift proceeds.
        </BoxedParagraph>
      </PageShell>

      <PageShell sectionTitle="15–16. Variation & Toolbox">
        <SectionTitle>15. Variation from Method Statement</SectionTitle>
        <BlankTable
          headers={["Variation Details", "Time / Date", "AP Contact", "Initials"]}
          rows={5}
        />

        <div style={avoidBreak}>
          <SectionTitle>16. Toolbox Talk Attendance</SectionTitle>
          <CheckboxTable
            left={[
              "Crane test certificates",
              "Crane thorough examination report",
              "Operator weekly inspection form",
              "Test certificates / thorough exam reports for lifting accessories",
              "Toolbox talk delivered and recorded",
              "Appropriate PPE",
            ]}
            right={[
              "Working area cordoned off",
              "Crane set in correct location",
              "Crane limits & load indicator OK",
              "Rigging fitted as detailed",
              "Weather within acceptable limits",
              "Site cleared",
            ]}
          />
        </div>
      </PageShell>

      <PageShell sectionTitle="17. Crane Set-up Procedure">
        <SectionTitle>17. Crane Set-up Procedure</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(
            sections.crane_setup_procedure || liftPlan?.crane_configuration || equipmentProfile?.configurationNote,
            `The crane is to be rigged and configured in accordance with the manufacturer’s instructions, the selected chart and the approved lift arrangement.`
          )}
        </BoxedParagraph>
        <BoxedParagraph compact>
          {sentenceCase(
            liftPlan?.outrigger_setup || equipmentProfile?.outriggersNote,
            `Outriggers are to be deployed as required by the selected configuration and the site restrictions. Suitable mats / spreaders are to be used where necessary.`
          )}
        </BoxedParagraph>
      </PageShell>

      <PageShell sectionTitle="18–19. Lifting & De-Rig Procedure">
        <SectionTitle>18. Lifting Procedure</SectionTitle>
        <BoxedParagraph>
          {sections.lifting_procedure
            ? sections.lifting_procedure
            : methodStatementLines.length
            ? methodStatementLines.join("\n")
            : "1. Brief all personnel and confirm communication method.\n2. Establish exclusion zone and position the crane.\n3. Inspect lifting accessories and connect as planned.\n4. Take up slack and complete a controlled test lift.\n5. Hoist, slew and land the load under the direction of the designated signaller.\n6. Remove lifting accessories and prepare for the next operation."}
        </BoxedParagraph>

        <SectionTitle>19. De-Rig Procedure</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(
            sections.de_rig_procedure,
            `On completion of the lifting operation, the crane operator and lifting team will remove lifting accessories, de-rig the crane in accordance with the manufacturer’s instructions, recover mats and barriers, and leave the site in a safe and tidy condition.`
          )}
        </BoxedParagraph>
      </PageShell>

      <PageShell sectionTitle="20–21. Emergency & Risk">
        <SectionTitle>20. Emergency Procedure</SectionTitle>
        <BoxedParagraph>
          {sentenceCase(
            sections.emergency_procedure || liftPlan?.emergency_procedures,
            `In the event of an emergency, lifting operations are to stop immediately. The load must be made safe where possible, the exclusion zone maintained, and the site emergency procedures followed. No lifting operation is to recommence until the situation has been resolved and the area declared safe.`
          )}
        </BoxedParagraph>

        <SectionTitle>21. Risk Assessments</SectionTitle>
        <TwoColumnBoxes
          leftTitle="Risk assessment summary"
          leftBody={
            sections.risk_assessment_summary
              ? sections.risk_assessment_summary
              : riskLines.length
              ? riskLines.join("\n")
              : "Key risks include load drop, crane instability, collision with structures or persons, communication failure, ground failure, adverse weather and unauthorised access to the lifting zone."
          }
          rightTitle="Site hazards"
          rightBody={
            hazardLines.length
              ? hazardLines.join("\n")
              : "Overhead obstructions, restricted access, uneven ground, adjacent traffic, and any site-specific hazards identified at planning stage or on arrival."
          }
        />

        <TwoColumnBoxes
          leftTitle="Control measures"
          leftBody={
            controlLines.length
              ? controlLines.join("\n")
              : "Establish exclusion zone, use competent personnel, inspect equipment, monitor weather, maintain communication, and follow the approved lift plan and manufacturer guidance."
          }
          rightTitle="PPE required"
          rightBody={
            ppeLines.length
              ? ppeLines.join("\n")
              : "Hard hat, hi-vis clothing, safety footwear, gloves and any additional PPE required for the specific load / site conditions."
          }
        />
      </PageShell>

      <PageShell sectionTitle="22. Check Lists & Sign Offs">
        <SectionTitle>22. Check Lists and Sign Offs</SectionTitle>
        <InfoTable
          rows={[
            ["Lift plan complete", yesNo(liftPlan?.lift_plan_complete)],
            ["RAMS complete", yesNo(liftPlan?.rams_complete)],
            ["Approved by", liftPlan?.approved_by],
            ["Approved at", fmtDateTime(liftPlan?.approved_at)],
            ["Approval notes", liftPlan?.approval_notes],
          ]}
        />

        <div style={avoidBreak}>
          <div style={subHeading}>Attendance Record</div>
          <BlankTable headers={["Name", "Employer", "Signature"]} rows={4} />
        </div>

        <div style={avoidBreak}>
          <div style={subHeading}>Delegation of Duties</div>
          <InfoTable
            rows={[
              ["Appointed Person", appointedPerson],
              ["Lift Supervisor", liftSupervisor],
              ["Crane Operator", liftPlan?.crane_operator || operator?.full_name],
            ]}
          />
        </div>

        <div style={signatureGrid}>
          <SignatureRow title="Appointed Person signature" name={appointedPerson} />
          <SignatureRow title="Lift Supervisor signature" name={liftSupervisor} />
          <SignatureRow title="Crane Operator signature" name={liftPlan?.crane_operator || operator?.full_name} />
          <SignatureRow title="Client completion sign-off" name={(job as any)?.contact_name} />
        </div>

        {toolboxNotes ? (
          <BoxedParagraph title="Toolbox / sign-off notes">{toolboxNotes}</BoxedParagraph>
        ) : null}

        {emergencyContacts ? (
          <BoxedParagraph title="Emergency contacts">{emergencyContacts}</BoxedParagraph>
        ) : null}

        {equipmentList ? (
          <BoxedParagraph title="Equipment list">{equipmentList}</BoxedParagraph>
        ) : null}
      </PageShell>

      <PageShell sectionTitle="Wind Speed Record Sheet" breakAfter={true}>
        <SectionTitle>Wind speed record sheet</SectionTitle>
        <InfoTable
          rows={[
            ["Project", projectName],
            ["Lift Supervisor", liftSupervisor],
            ["Date", fmtDate((job as any)?.start_date ?? (job as any)?.job_date)],
          ]}
        />
        <div style={{ height: 8 }} />
        <BlankTable headers={["Time", "Wind Speed", "OK To Work (Y / N)", "Notes"]} rows={12} />
      </PageShell>

      {appendixAssets.map((asset, index) => (
        <AppendixPage key={asset.publicPath} asset={asset} index={index + 1} />
      ))}
    </div>
  );
}

const wrapper: CSSProperties = {
  background: "#f5f5f5",
  color: "#111",
  minHeight: "100vh",
  padding: 24,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
};

const toolbar: CSSProperties = {
  maxWidth: "190mm",
  margin: "0 auto 16px auto",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const buttonStyle: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.95)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.12)",
};

const pageStyle: CSSProperties = {
  width: "190mm",
  minHeight: "277mm",
  margin: "0 auto 16px auto",
  background: "#fff",
  boxSizing: "border-box",
  padding: 16,
  boxShadow: "0 0 0 1px rgba(0,0,0,0.16)",
  display: "flex",
  flexDirection: "column",
};

const pageHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  paddingBottom: 10,
  borderBottom: "1px solid #bcbcbc",
};

const pageBody: CSSProperties = {
  paddingTop: 12,
  flex: 1,
};

const pageFooter: CSSProperties = {
  paddingTop: 10,
  marginTop: "auto",
  borderTop: "1px solid #bcbcbc",
  fontSize: 11,
  textAlign: "center",
  color: "#555",
};

const logoStyle: CSSProperties = {
  width: 54,
  height: 54,
  objectFit: "contain",
};

const coverHero: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 18,
};

const coverTitle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1.1,
};

const coverSubtitle: CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  color: "#555",
};

const coverCompany: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  textAlign: "right",
};

const sectionTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 10,
  fontSize: 24,
  fontWeight: 900,
};

const subHeading: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginTop: 14,
  marginBottom: 8,
};

const infoTable: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr",
  borderTop: "1px solid #333",
  borderLeft: "1px solid #333",
  breakInside: "avoid",
};

const infoLabel: CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #333",
  borderBottom: "1px solid #333",
  fontWeight: 700,
  background: "#f6f6f6",
};

const infoValue: CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #333",
  borderBottom: "1px solid #333",
  fontWeight: 600,
};

const boxed: CSSProperties = {
  border: "1px solid #333",
  padding: 12,
  marginBottom: 12,
  breakInside: "avoid",
};

const compactBoxed: CSSProperties = {
  padding: 10,
};

const boxedTitle: CSSProperties = {
  fontWeight: 900,
  marginBottom: 6,
};

const boxedBody: CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const tocGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
};

const tocItem: CSSProperties = {
  paddingBottom: 6,
  borderBottom: "1px dotted #aaa",
  fontWeight: 700,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  breakInside: "avoid",
};

const thStyle: CSSProperties = {
  border: "1px solid #333",
  textAlign: "left",
  padding: "7px 8px",
  fontSize: 13,
  background: "#f6f6f6",
};

const tdStyle: CSSProperties = {
  border: "1px solid #333",
  padding: "8px",
  height: 28,
  verticalAlign: "top",
};

const tickCell: CSSProperties = {
  ...tdStyle,
  width: 24,
  minWidth: 24,
  padding: 0,
};

const avoidBreak: CSSProperties = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const signatureGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 14,
};

const signatureBox: CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  breakInside: "avoid",
};

const appendixFrame: CSSProperties = {
  border: "1px solid #333",
  padding: 8,
  minHeight: 620,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "#fff",
};

const appendixImage: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  objectFit: "contain",
  maxHeight: 620,
};
