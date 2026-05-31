import ClientShell from "../../../ClientShell";
import HireAgreementPack from "../../../components/HireAgreementPack";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type AgreementType = "cpa-hire" | "contract-lift";

function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function dateRange(start: string | null | undefined, end: string | null | undefined) {
  const a = fmtDate(start);
  const b = fmtDate(end);
  if (a && b && a !== b) return `${a} to ${b}`;
  return a || b || "";
}

function money(value: unknown) {
  const raw = String(value ?? "").replace(/£|,/g, "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `£${n.toFixed(2)} excluding VAT`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatCraneName(allocation: any) {
  const crane = first(allocation?.cranes);
  return [crane?.name, crane?.capacity].filter(Boolean).join(" ").trim() || allocation?.item_name || "Crane";
}

function uniqueLines(lines: string[]) {
  const seen = new Set<string>();
  return lines
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildSupply(job: any, agreementType: AgreementType) {
  const allocations = Array.isArray(job?.job_equipment) ? job.job_equipment : [];
  const craneLines = uniqueLines(
    allocations
      .filter((item: any) => String(item?.asset_type ?? "").toLowerCase() !== "vehicle")
      .map((item: any) => `1x ${formatCraneName(item)}`)
  );
  const operatorName = first(job?.operators)?.full_name ?? job?.operator_name;

  if (agreementType === "contract-lift") {
    const scope = String(job?.notes ?? "").trim() || "Full contract lift including planning, supervision, crane, operator and lifting accessories as agreed.";
    return [
      `Scope of Work: ${scope}`,
      `Location: ${[job?.site_name, job?.site_address].filter(Boolean).join(" - ")}`,
      `Date(s): ${dateRange(job?.start_date ?? job?.job_date, job?.end_date ?? job?.job_date)}`,
      ...craneLines,
      "Lifting Supervisor / appointed person duties as required under contract lift conditions",
      "All lifting accessories and rigging as agreed",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    ...(craneLines.length ? craneLines : ["1x Crane"]),
    operatorName ? `1x Operator - ${operatorName}` : "1x Operator",
  ].join("\n");
}

function commercialLines(job: any) {
  const raw = Array.isArray(job?.commercial_breakdown) ? job.commercial_breakdown : Array.isArray(job?.commercial_breakdown?.lines) ? job.commercial_breakdown.lines : [];
  const lines = raw
    .filter((line: any) => String(line?.line_type ?? "sell").toLowerCase() !== "cost")
    .map((line: any, index: number) => ({
      id: String(line?.id ?? `line-${index + 1}`),
      qty: String(line?.quantity ?? line?.qty ?? "1x"),
      description: String(line?.description ?? line?.item ?? "Rate"),
      rate: money(line?.amount ?? line?.total ?? line?.value) || String(line?.rate ?? ""),
    }))
    .filter((line: any) => line.description || line.rate);

  if (lines.length) return lines;

  const defaultRate = money(job?.invoice_subtotal ?? job?.price ?? job?.agreed_sell_rate);
  if (defaultRate) {
    return [
      {
        id: "default-rate",
        qty: "1x",
        description: "Hire charge",
        rate: defaultRate,
      },
    ];
  }

  return [
    {
      id: "default-rate",
      qty: "1x",
      description: "Rate",
      rate: "",
    },
  ];
}

const cpaAdditionalTerms = `INSURANCE: -
1. IF QUOTE IS FOR CRANE HIRE ONLY - It is the Hirers responsibility to cover Hire in Plant + Goods on the Hook insurance, Appointed Person and Slinger/Banksman. If required, we would be able to cover the above responsibilities, price on application.
2. CONTRACT LIFT - Damage Waiver included under contract lift conditions.
Conditions of Hire:
1. Hired in Plant Insurance requirements are covered under contract lift conditions. Anns Crane hire Ltd Liability for goods on the hook is limited to a maximum of £25,000. Additional available on request.
2. Sling, tyre damage and punctures are chargeable to hirer.
3. Any Site Rate/Bonus awards signed for on the crane hire time sheet will be charged plus the percentage of the Employers National Insurance Contribution (NIC). VAT will be charged at the prevailing rate if applicable.
4. All cranes, equipment and work are carried out under the CPA terms and conditions and Anns Crane Hire Ltd supplementary conditions. Copies available on request.
5. This quotation is valid for 30 days after which it may be subject to review.
6. Cancellations: Cranes up to 100t, up to 12pm the previous working day - no charge. After 12pm will be subject to full charge. Cranes over 100t, up to 2 working days - no charge. Within 2 days will be subject to 2/3rds charge.
7. The Client will ensure access / egress and ground conditions are suitable for the size of crane and will remain unrestricted for the duration of hire.
8. The rate quoted is the minimum price chargeable irrespective of hours worked.
9. Acceptance of services on site will be deemed acceptance of CPA terms and conditions which take precedence over any other conditions applicable.
10. The Client, by signing below, accepts the CPA T's & C's and Anns Crane Hire Ltd. Hire General Conditions and that no consequential losses/liquidated damages are covered under any circumstances, unless otherwise agreed in writing.
11. Excess hours Labour - 8 to 10 hrs - pro rata, over 12 hours will be double time
12. Rate may need to be reviewed if a cross hire is required due to dates changing or last-minute changes to requirements.`;

const contractLiftAdditionalTerms = `ALL WORK IS SUBJECT TO CPA OR RHA TERMS AND CONDITIONS, ADDITIONAL TERMS BELOW:
# INSURANCE & CONDITIONS OF HIRE
If the quotation is for *Crane Hire Only*, it is the Hirer's responsibility to provide:
• Hired-In Plant Insurance
• Goods on the Hook Insurance
• Appointed Person
• Slinger / Banksman
If required, Anns Crane Hire Ltd can provide the above services and insurances. Price available upon application.`;

export default async function JobHireAgreementPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { type?: string };
}) {
  const supabase = createSupabaseServerClient();
  const agreementType: AgreementType = searchParams?.type === "contract-lift" ? "contract-lift" : "cpa-hire";

  const { data: job, error } = await supabase
    .from("jobs")
    .select(`
      *,
      clients:client_id (id, company_name, contact_name, phone, email),
      operators:operator_id (id, full_name, phone, email),
      job_equipment (
        id,
        asset_type,
        item_name,
        agreed_sell_rate,
        cranes:crane_id (id, name, reg_number, capacity),
        operators:operator_id (id, full_name, phone, email)
      )
    `)
    .eq("id", params.id)
    .single();

  const client = first((job as any)?.clients);
  const contactName = client?.contact_name ?? (job as any)?.site_contact ?? "";
  const contactDetails = [client?.phone, client?.email].filter(Boolean).join(" / ");
  const siteAddress = [(job as any)?.site_name, (job as any)?.site_address].filter(Boolean).join("\n");
  const jobNumber = (job as any)?.job_number ?? params.id;
  const documentFileName = `${client?.company_name ?? "Customer"} - Job ${jobNumber} - ${agreementType === "contract-lift" ? "Contract Lift Hire Agreement" : "CPA Hire Agreement"}`;
  const termsImageUrls =
    agreementType === "contract-lift"
      ? [
          "/contract-lift-terms-page-1(1)%20(1).png",
          "/contract-lift-terms-page-2(1)%20(1).png",
          "/contract-lift-terms-page-3(1)%20(1).png",
        ]
      : [
          "/cpa-hire-terms-page-1(1).png",
          "/cpa-hire-terms-page-2(1).png",
          "/cpa-hire-terms-page-3(1)%20(1).png",
        ];

  return (
    <ClientShell>
      <div style={{ width: "min(1500px, 100%)", margin: "0 auto" }}>
        {error ? <div style={errorBox}>Unable to load job: {error.message}</div> : null}
        {!job ? (
          <div style={errorBox}>Job not found.</div>
        ) : (
          <HireAgreementPack
            kind={agreementType}
            jobLabel={`job ${jobNumber}`}
            backHref={`/jobs/${params.id}`}
            switchLinks={[
              { label: "CPA hire agreement", href: `/jobs/${params.id}/hire-agreement?type=cpa-hire`, active: agreementType === "cpa-hire" },
              { label: "Contract lift agreement", href: `/jobs/${params.id}/hire-agreement?type=contract-lift`, active: agreementType === "contract-lift" },
            ]}
            initialFields={[
              { key: "issueDate", label: "Agreement date", value: todayLabel() },
              { key: "client", label: "Client", value: client?.company_name ?? "" },
              { key: "projectDate", label: "Date & time of project", value: dateRange((job as any)?.start_date ?? (job as any)?.job_date, (job as any)?.end_date ?? (job as any)?.job_date) },
              { key: "contactName", label: "Contact name", value: contactName },
              { key: "contactDetails", label: "Tel / email", value: contactDetails },
              { key: "siteAddress", label: "Site location/address", value: siteAddress, multiline: true },
              {
                key: "hireType",
                label: "Hire type",
                value:
                  agreementType === "contract-lift"
                    ? "Contract lift (subject to CPA contract lift term and conditions)"
                    : "CPA Hire - CPA Terms and conditions apply",
              },
              { key: "poNumber", label: "Purchase order no", value: (job as any)?.purchase_order_number ?? (job as any)?.po_number ?? "" },
              { key: "paymentTerms", label: "Payment terms", value: "30 days" },
            ]}
            initialSupply={buildSupply(job, agreementType)}
            initialRateLines={commercialLines(job)}
            initialAdditionalTerms={agreementType === "contract-lift" ? contractLiftAdditionalTerms : cpaAdditionalTerms}
            termsImageUrls={termsImageUrls}
            termsLabel={agreementType === "contract-lift" ? "CPA contract lift terms" : "CPA model hire conditions"}
            documentFileName={documentFileName}
          />
        )}
      </div>
    </ClientShell>
  );
}

const errorBox = {
  border: "1px solid #fecaca",
  background: "#fee2e2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 12,
  marginBottom: 12,
  fontWeight: 800,
};
