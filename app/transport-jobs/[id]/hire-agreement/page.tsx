import ClientShell from "../../../ClientShell";
import HireAgreementPack from "../../../components/HireAgreementPack";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function timeRange(collectionTime: string | null | undefined, deliveryTime: string | null | undefined) {
  const parts = [collectionTime, deliveryTime].filter(Boolean);
  if (parts.length === 2) return `${parts[0]} to ${parts[1]}`;
  return parts[0] ?? "";
}

function dateText(job: any) {
  const start = fmtDate(job?.transport_date);
  const end = fmtDate(job?.delivery_date);
  const range = start && end && start !== end ? `${start} to ${end}` : start || end;
  const times = timeRange(job?.collection_time, job?.delivery_time);
  return [range, times].filter(Boolean).join("\n");
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

function vehicleName(job: any) {
  const vehicle = first(job?.vehicles);
  return [vehicle?.name, vehicle?.reg_number].filter(Boolean).join(" - ") || job?.job_type || "Transport";
}

function commercialLines(job: any) {
  const raw = Array.isArray(job?.commercial_breakdown) ? job.commercial_breakdown : Array.isArray(job?.commercial_breakdown?.lines) ? job.commercial_breakdown.lines : [];
  const lines = raw
    .filter((line: any) => String(line?.line_type ?? "sell").toLowerCase() !== "cost")
    .map((line: any, index: number) => ({
      id: String(line?.id ?? `line-${index + 1}`),
      qty: String(line?.quantity ?? line?.qty ?? "1x"),
      description: String(line?.description ?? line?.item ?? "Transport charge"),
      rate: money(line?.amount ?? line?.total ?? line?.value) || String(line?.rate ?? ""),
    }))
    .filter((line: any) => line.description || line.rate);

  if (lines.length) return lines;

  const defaultRate = money(job?.invoice_subtotal ?? job?.price ?? job?.agreed_sell_rate);
  if (defaultRate) {
    return [{ id: "default-rate", qty: "1x", description: "Transport charge", rate: defaultRate }];
  }

  return [{ id: "default-rate", qty: "1x", description: "Transport charge", rate: "" }];
}

const transportAdditionalTerms = `ALL WORK IS SUBJECT TO CPA OR RHA TERMS AND CONDITIONS, ADDITIONAL TERMS BELOW:
# INSURANCE & CONDITIONS OF HIRE
If the quotation is for *Crane Hire Only*, it is the Hirer's responsibility to provide:
• Hired-In Plant Insurance
• Goods on the Hook Insurance
• Appointed Person
• Slinger / Banksman
If required, Anns Crane Hire Ltd can provide the above services and insurances. Price available upon application.

### TRANSPORT
• ANNS CRANE HIRE HAVE GOODS IN TRANSIT INSURNCE TO THE VALUE OF £500,000.00 PER EVENT
• Please note for transport quotes for hiab hire, curb side collection & delivery only is included as standard under CPA conditions. If a contract lift is required please let us know so this can be priced accordingly.

## Additional Charges
• *Sling damage, tyre damage, and punctures* are chargeable to the Hirer.
• Waiting / loading / unloading delays may be chargeable where applicable.`;

export default async function TransportHireAgreementPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: job, error } = await supabase
    .from("transport_jobs")
    .select(`
      *,
      clients:client_id (id, company_name, contact_name, phone, email),
      vehicles:vehicle_id (id, name, reg_number),
      operators:operator_id (id, full_name, phone, email),
      jobs:linked_job_id (id, job_number, site_name, site_address)
    `)
    .eq("id", params.id)
    .single();

  const client = first((job as any)?.clients);
  const operator = first((job as any)?.operators);
  const contactName = client?.contact_name ?? "";
  const contactDetails = [client?.email, client?.phone].filter(Boolean).join(" / ");
  const supplyText = [
    (job as any)?.load_description ? `Transport of ${(job as any).load_description}` : "Transport service",
    `Vehicle: ${vehicleName(job)}`,
    operator?.full_name ? `Driver/operator: ${operator.full_name}` : null,
    (job as any)?.notes ? `Notes: ${(job as any).notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <ClientShell>
      <div style={{ width: "min(1500px, 100%)", margin: "0 auto" }}>
        {error ? <div style={errorBox}>Unable to load transport job: {error.message}</div> : null}
        {!job ? (
          <div style={errorBox}>Transport job not found.</div>
        ) : (
          <HireAgreementPack
            kind="transport"
            jobLabel={`transport job ${(job as any)?.transport_number ?? params.id}`}
            backHref={`/transport-jobs/${params.id}`}
            initialFields={[
              { key: "issueDate", label: "Agreement date", value: todayLabel() },
              { key: "client", label: "Client", value: client?.company_name ?? "" },
              { key: "projectDate", label: "Date & time of project", value: dateText(job), multiline: true },
              { key: "contactName", label: "Contact name", value: contactName },
              { key: "contactDetails", label: "Email / tel", value: contactDetails },
              { key: "collectionAddress", label: "Collection address", value: (job as any)?.collection_address ?? "", multiline: true },
              { key: "deliveryAddress", label: "Delivery address", value: (job as any)?.delivery_address ?? "", multiline: true },
              { key: "hireType", label: "Hire type", value: "Hiab Transport, curb side collection, loading & unloading with hiab – RHA terms & conditions." },
              { key: "poNumber", label: "Purchase order no", value: (job as any)?.purchase_order_number ?? (job as any)?.po_number ?? "" },
              { key: "paymentTerms", label: "Payment terms", value: "30 days from month end" },
            ]}
            initialSupply={supplyText}
            initialRateLines={commercialLines(job)}
            initialAdditionalTerms={transportAdditionalTerms}
            termsImageUrls={[
              "/hire-agreement-terms/transport-rha-terms-page-1.png",
              "/hire-agreement-terms/transport-rha-terms-page-2.png",
              "/hire-agreement-terms/transport-rha-terms-page-3.png",
            ]}
            termsLabel="RHA carriage terms"
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
