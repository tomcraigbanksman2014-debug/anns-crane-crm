import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  getPrimaryCraneContext,
  matchCraneJobEquipmentProfile,
} from "../../../../lib/ai/matchEquipmentProfile";
import PrintPackButton from "./PrintPackButton";

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
  const base = parts.join(" ").trim() || crane?.name || allocation?.item_name || "—";
  return base;
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

function Page({ children, breakAfter = true }: { children: React.ReactNode; breakAfter?: boolean }) {
  return (
    <section
      style={{
        ...pageStyle,
        pageBreakAfter: breakAfter ? "always" : "auto",
        breakAfter: breakAfter ? "page" : "auto",
      }}
    >
      {children}
    </section>
  );
}

function HeaderBand({ title }: { title: string }) {
  return (
    <div style={headerBand}>
      <div style={{ fontWeight: 900 }}>ANNS – LIFTING PLAN – V1</div>
      <div>{title}</div>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={sectionTitle}>{children}</h2>;
}

function BoxedParagraph({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={boxed}>
      {title ? <div style={boxedTitle}>{title}</div> : null}
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{children}</div>
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
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
            <td style={tdStyle}>{right[i] ?? ""}</td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
          </tr>
        ))}
      </tbody>
    </table>
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

  const projectName = (job as any)?.site_name || `Job ${(job as any)?.job_number ?? ""}`.trim();
  const appointedPerson = liftPlan?.appointed_person || liftPlan?.approved_by || "Shaun Robinson";
  const liftSupervisor = liftPlan?.lift_supervisor || appointedPerson;
  const craneName = craneLabel(crane, allocation);
  const craneCapacity = formatCapacity(equipmentProfile, crane);
  const loadWeight = liftPlan?.load_weight ? `${liftPlan.load_weight} kg` : "—";
  const grossAccessories = liftPlan?.lifting_accessories ? "Included within planned lift accessories." : "—";
  const boomConfig = liftPlan?.crane_configuration || "Main boom";
  const boomLength =
    equipmentProfile?.maxHydraulicOutreachM
      ? `${equipmentProfile.maxHydraulicOutreachM} m headline boom / outreach reference`
      : "To be confirmed against selected chart";
  const utilisation = percentageUtilisation(liftPlan?.load_weight, equipmentProfile?.maxCapacityKg);
  const scopeFallback = `Lifting operation for ${client?.company_name || "the client"} at ${projectName}. The planned load is ${liftPlan?.load_description || "to be confirmed"} with a stated load weight of ${loadWeight}. The crane will be set up, operated and supervised in accordance with the approved lifting plan, current legislation and site requirements.`;

  const methodStatementLines = splitLines(liftPlan?.method_statement);
  const riskLines = splitLines(liftPlan?.risk_assessment);
  const hazardLines = splitLines(liftPlan?.site_hazards);
  const controlLines = splitLines(liftPlan?.control_measures);
  const ppeLines = splitLines(liftPlan?.ppe_required);

  return (
    <div style={wrapper}>
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="print-hide" style={toolbar}>
        <a href={`/jobs/${params.id}/lift-plan`} style={buttonStyle}>← Back to lift plan</a>
        <PrintPackButton />
      </div>

      <Page>
        <HeaderBand title="April 2026" />
        <div style={{ textAlign: "center", marginTop: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>ANNS – LIFTING PLAN – V1</div>
          <div style={{ marginTop: 6 }}>April 2026</div>
          <div style={{ marginTop: 10, fontSize: 13 }}>
            Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB, tel: 01792 641653, e-mail: info@annscranehire.co.uk
          </div>
        </div>

        <InfoTable
          rows={[
            ["Client", client?.company_name],
            ["Project", projectName],
            ["Start Date", fmtDate((job as any)?.start_date ?? (job as any)?.job_date)],
            ["Duration", calcDuration((job as any)?.start_date ?? (job as any)?.job_date, (job as any)?.end_date ?? (job as any)?.job_date)],
            ["Site Address", (job as any)?.site_address],
            ["Site Contact", (job as any)?.contact_name],
            ["Appointed Person", appointedPerson],
            ["Prepared on behalf of:", "ANNS CRANE HIRE LTD"],
            ["Lift Classification", (job as any)?.hire_type || "Basic"],
            ["Crane(s)", craneName],
            ["Boom configuration", boomConfig],
            ["Boom length", boomLength],
          ]}
        />
      </Page>

      <Page>
        <HeaderBand title="Table of Contents" />
        <SectionTitle>Table of Contents</SectionTitle>
        <ol style={{ lineHeight: 1.8, paddingLeft: 22 }}>
          <li>Introduction</li>
          <li>Appointed Person Declaration</li>
          <li>Client Responsibilities and General Conditions</li>
          <li>The Contract Lift and Arrival on Site</li>
          <li>Brief Scope of Works</li>
          <li>Lifting Personnel</li>
          <li>On Site Communication</li>
          <li>Weather Conditions</li>
          <li>Site Access and Egress</li>
          <li>Ground Conditions</li>
          <li>Overhead Obstructions and Slewing Restrictions</li>
          <li>Traffic and Pedestrian Management</li>
          <li>Lifting Equipment to be used &amp; Certification</li>
          <li>Crane Details</li>
          <li>Variation from Method Statement</li>
          <li>Toolbox Talk Attendance</li>
          <li>Crane Set up Procedure</li>
          <li>Lifting Procedure</li>
          <li>De-Rig Procedure</li>
          <li>Emergency Procedure</li>
          <li>Risk Assessments</li>
          <li>Check Lists and Sign Offs</li>
        </ol>
      </Page>

      <Page>
        <HeaderBand title="1. Introduction" />
        <SectionTitle>1. Introduction</SectionTitle>
        <BoxedParagraph title="Method Statement – CPA Contract Lift">
          This Method Statement has been prepared based on information provided by our client, together with site-specific details held within the CRM and the selected lifting equipment profile. This lift is undertaken under CPA Contract Lift conditions where requested and is to be carried out in accordance with current legislation, BS 7121, LOLER, PUWER, and applicable manufacturer guidance.
        </BoxedParagraph>

        <BoxedParagraph title="Site Inspection">
          A site review and planning assessment must be completed by the Appointed Person before lifting operations commence. Particular consideration must be given to site access and egress, ground conditions, overhead obstructions, public interface, delivery vehicle positioning, exclusion zone requirements and any other environmental or logistical constraints that could affect the lift.
        </BoxedParagraph>

        <BoxedParagraph title="The Appointed Person">
          The Appointed Person who has prepared this lifting plan assumes responsibility for the planning of the lifting operation. The Lift Supervisor must be fully briefed on the contents of the plan before any lifting activities begin, and the Appointed Person must remain available should site conditions or operational requirements change.
        </BoxedParagraph>

        <BoxedParagraph title="The Lift Supervisor, Slinger/Signaller and Operator">
          The Lift Supervisor is responsible for implementing this lifting plan on site and ensuring all operatives are briefed. The Slinger/Signaller is responsible for correct attachment of lifting accessories, directing the lift and maintaining clear communication. The crane operator must only operate the crane within the approved configuration and in accordance with the instructions issued by the Lift Supervisor / designated signaller.
        </BoxedParagraph>
      </Page>

      <Page>
        <HeaderBand title="2–5. Planning & Scope" />
        <SectionTitle>2. Appointed Person Declaration</SectionTitle>
        <InfoTable
          rows={[
            ["Name", appointedPerson],
            ["Prepared for job", `#${(job as any)?.job_number ?? "—"}`],
            ["Prepared on behalf of", "ANNS CRANE HIRE LTD"],
            ["Approved by", liftPlan?.approved_by],
            ["Approved at", fmtDateTime(liftPlan?.approved_at)],
          ]}
        />

        <SectionTitle>3. Client Responsibilities and General Conditions</SectionTitle>
        <BoxedParagraph>
          The client shall ensure that accurate load information, safe access / egress, suitable crane standing area, traffic management, lighting where required, and site induction / emergency arrangements are in place. The client remains responsible for the integrity of the load and for providing accurate information regarding underground services, voids, restrictions, permits and any other conditions that may affect the lifting operation.
        </BoxedParagraph>

        <SectionTitle>4. The Contract Lift and Arrival on Site</SectionTitle>
        <BoxedParagraph>
          Upon arrival, the crane and associated lifting personnel will report to the agreed site contact, complete any required induction, and proceed to the designated lifting position under supervision. The crane will be rigged in accordance with the manufacturer’s instructions, the selected configuration and this lifting plan. No lifting operation will commence until the Lift Supervisor has confirmed that the site set-up, communications, exclusion zones and controls are in place.
        </BoxedParagraph>

        <SectionTitle>5. Brief Scope of Works</SectionTitle>
        <BoxedParagraph>{para(liftPlan?.load_description, scopeFallback)}</BoxedParagraph>
      </Page>

      <Page>
        <HeaderBand title="6–12. Site Controls" />
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
        <InfoTable
          rows={[
            ["Two-way Radios supplied by Anns Crane Hire Ltd", "No / if required by site"],
            ["Two-way Radios supplied by the Client", "No / if required by site"],
            ["Hand Signals", "Yes"],
          ]}
        />

        <SectionTitle>8. Weather Conditions</SectionTitle>
        <BoxedParagraph>
          {para(
            liftPlan?.weather_limitations,
            "Lifting operations must be suspended during adverse weather, including high winds, lightning, heavy rain or poor visibility. Final permissible wind speed must be checked against the selected crane chart, current configuration, the load characteristics, and prevailing site conditions."
          )}
        </BoxedParagraph>

        <SectionTitle>9. Site Access and Egress</SectionTitle>
        <BoxedParagraph>
          The client must ensure that the crane, support vehicles and lifting personnel have clear and safe access to and egress from the site at all times. Access routes must be suitable for the size and weight of the crane and any delivery / collection vehicles associated with the lift.
        </BoxedParagraph>

        <SectionTitle>10. Ground Conditions</SectionTitle>
        <BoxedParagraph>{para(liftPlan?.ground_conditions, "Ground conditions to be confirmed on arrival. The crane must only be set up on firm, level ground capable of supporting the crane, the load, and outrigger reactions. Additional ground protection is to be used where required.")}</BoxedParagraph>

        <SectionTitle>11. Overhead Obstructions and Slewing Restrictions</SectionTitle>
        <BoxedParagraph>{para(liftPlan?.site_hazards, "All overhead obstructions, structures, plant, power lines and slewing restrictions must be identified and controlled before lifting operations commence.")}</BoxedParagraph>

        <SectionTitle>12. Traffic and Pedestrian Management</SectionTitle>
        <BoxedParagraph>{para(liftPlan?.exclusion_zone_details, "The work area must be clearly cordoned off using barriers and signage. Only authorised personnel are permitted within the lifting zone. Client traffic and pedestrian management requirements must be implemented before works commence.")}</BoxedParagraph>
      </Page>

      <Page>
        <HeaderBand title="13–14. Equipment & Crane Details" />
        <SectionTitle>13. Lifting Equipment to be used &amp; Certification</SectionTitle>
        <InfoTable
          rows={[
            ["Sling type", liftPlan?.sling_type],
            ["Lifting accessories", liftPlan?.lifting_accessories],
            ["LOLER / certification", "All lifting tackle to hold current certification and be inspected before use"],
          ]}
        />

        <SectionTitle>14. Crane Details</SectionTitle>
        <InfoTable
          rows={[
            ["Crane type", craneName],
            ["Crane gross weight", crane?.capacity ? `${crane?.capacity}` : "See selected machine profile / manufacturer information"],
            ["Gross weight of load", loadWeight],
            ["Gross weight of lifting accessories", grossAccessories],
            ["Boom configuration", boomConfig],
            ["Boom / outreach reference", equipmentProfile?.maxHydraulicOutreachM ? `${equipmentProfile.maxHydraulicOutreachM} m` : "—"],
            ["Jib / max outreach", equipmentProfile?.maxJibOutreachM ? `${equipmentProfile.maxJibOutreachM} m` : "—"],
            ["Max capacity", craneCapacity],
            ["Crane utilisation %", utilisation],
          ]}
        />

        <BoxedParagraph title="Crane specifications">
          {equipmentProfile?.summary || "Selected crane profile to be checked against the current manufacturer specification and load chart."}
        </BoxedParagraph>

        <BoxedParagraph title="Load chart note">
          Final radius, boom length, hook block weight, accessories, outrigger arrangement, ground conditions and any partial set-up restrictions must be checked against the current applicable chart before the lift proceeds.
        </BoxedParagraph>
      </Page>

      <Page>
        <HeaderBand title="15–19. Procedure" />
        <SectionTitle>15. Variation from Method Statement</SectionTitle>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Variation Details</th>
              <th style={thStyle}>Time / Date</th>
              <th style={thStyle}>AP Contact</th>
              <th style={thStyle}>Initials</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
              </tr>
            ))}
          </tbody>
        </table>

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

        <SectionTitle>17. Crane Set up Procedure</SectionTitle>
        <BoxedParagraph>{para(liftPlan?.crane_configuration, "Crane to be rigged and configured in accordance with the manufacturer’s instructions, the selected chart and the planned lift arrangement.")}</BoxedParagraph>
        <BoxedParagraph>{para(liftPlan?.outrigger_setup, "Outriggers to be deployed as required by the selected configuration and site restrictions. Suitable mats / spreaders to be used where necessary.")}</BoxedParagraph>

        <SectionTitle>18. Lifting Procedure</SectionTitle>
        <BoxedParagraph>
          {methodStatementLines.length
            ? methodStatementLines.join("\n")
            : "1. Position crane and establish exclusion zone.\n2. Brief all personnel and confirm communication method.\n3. Inspect accessories and connect as planned.\n4. Take up slack and complete test lift.\n5. Hoist, slew and land load under direction of the designated signaller.\n6. Remove lifting accessories and prepare for next operation."}
        </BoxedParagraph>

        <SectionTitle>19. De-Rig Procedure</SectionTitle>
        <BoxedParagraph>
          On completion of the lifting operation, the crane operator and lifting team will remove lifting accessories, de-rig the crane in accordance with the manufacturer’s instructions, recover mats and barriers, and leave the site in a safe and tidy condition.
        </BoxedParagraph>
      </Page>

      <Page>
        <HeaderBand title="20–22. Emergency, Risk & Sign Off" />
        <SectionTitle>20. Emergency Procedure</SectionTitle>
        <BoxedParagraph>
          {para(
            liftPlan?.emergency_procedures,
            "In the event of an emergency, lifting operations will stop immediately. The load will be made safe where possible, the exclusion zone maintained, and the site emergency procedures followed. No lifting operation will recommence until the situation has been resolved and the area declared safe."
          )}
        </BoxedParagraph>

        <SectionTitle>21. Risk Assessments</SectionTitle>
        <BoxedParagraph title="Risk assessment summary">
          {riskLines.length
            ? riskLines.join("\n")
            : "Key risks include load drop, crane instability, collision with structures or persons, communication failure, ground failure, adverse weather and unauthorised access to the lifting zone."}
        </BoxedParagraph>

        <BoxedParagraph title="Site hazards">
          {hazardLines.length
            ? hazardLines.join("\n")
            : "Overhead obstructions, restricted access, uneven ground, adjacent traffic, and any site-specific hazards identified at planning stage or on arrival."}
        </BoxedParagraph>

        <BoxedParagraph title="Control measures">
          {controlLines.length
            ? controlLines.join("\n")
            : "Establish exclusion zone, use competent personnel, inspect equipment, monitor weather, maintain communication, and follow the approved lift plan and manufacturer guidance."}
        </BoxedParagraph>

        <BoxedParagraph title="PPE required">
          {ppeLines.length
            ? ppeLines.join("\n")
            : "Hard hat, hi-vis clothing, safety footwear, gloves and any additional PPE required for the specific load / site conditions."}
        </BoxedParagraph>

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

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Attendance Record</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Employer</th>
                <th style={thStyle}>Signature</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td style={tdStyle}></td>
                  <td style={tdStyle}></td>
                  <td style={tdStyle}></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Delegation of Duties</div>
          <InfoTable
            rows={[
              ["Appointed Person", appointedPerson],
              ["Lift Supervisor", liftSupervisor],
              ["Crane Operator", liftPlan?.crane_operator || operator?.full_name],
            ]}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Wind speed record sheet</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Wind Speed</th>
                <th style={thStyle}>OK To Work (Y / N)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td style={tdStyle}></td>
                  <td style={tdStyle}></td>
                  <td style={tdStyle}></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </div>
  );
}

const wrapper: CSSProperties = {
  background: "#fff",
  color: "#111",
  minHeight: "100vh",
  padding: 24,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
};

const toolbar: CSSProperties = {
  maxWidth: 1020,
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
  width: "210mm",
  minHeight: "297mm",
  margin: "0 auto 20px auto",
  border: "1px dashed rgba(0,0,0,0.35)",
  padding: 18,
  boxSizing: "border-box",
  background: "#fff",
};

const headerBand: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 12,
  marginBottom: 12,
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  marginBottom: 10,
  fontSize: 22,
};

const infoTable: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "190px 1fr",
  borderTop: "1px solid #333",
  borderLeft: "1px solid #333",
};

const infoLabel: CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #333",
  borderBottom: "1px solid #333",
  fontWeight: 700,
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
};

const boxedTitle: CSSProperties = {
  fontWeight: 800,
  marginBottom: 6,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  border: "1px solid #333",
  textAlign: "left",
  padding: "7px 8px",
  fontSize: 13,
};

const tdStyle: CSSProperties = {
  border: "1px solid #333",
  padding: "8px",
  height: 28,
  verticalAlign: "top",
};
