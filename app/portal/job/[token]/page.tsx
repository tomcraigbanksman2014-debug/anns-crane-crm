import { createSupabaseServerClient } from "../../../lib/supabase/server";

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

export default async function PortalJobPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job }, { data: docs }, { data: liftPlan }] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_time,
        end_time,
        site_name,
        site_address,
        status,
        invoice_number,
        invoice_total,
        signed_off_at,
        clients:client_id (
          company_name,
          contact_name
        ),
        equipment:equipment_id (
          name,
          capacity
        )
      `)
      .eq("portal_token", params.token)
      .single(),

    supabase
      .from("job_documents")
      .select("id, file_name, file_path, document_type, created_at")
      .eq("job_id", (
        await supabase.from("jobs").select("id").eq("portal_token", params.token).single()
      ).data?.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("lift_plans")
      .select("*")
      .eq("job_id", (
        await supabase.from("jobs").select("id").eq("portal_token", params.token).single()
      ).data?.id)
      .maybeSingle(),
  ]);

  if (!job) {
    return (
      <div style={{ maxWidth: 1000, margin: "40px auto", padding: 24 }}>
        Job portal link not found.
      </div>
    );
  }

  const client = Array.isArray((job as any).clients)
    ? (job as any).clients[0] ?? null
    : (job as any).clients ?? null;

  const equipment = Array.isArray((job as any).equipment)
    ? (job as any).equipment[0] ?? null
    : (job as any).equipment ?? null;

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 24,
        minHeight: "100vh",
        background: "#fff",
        color: "#111",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
      }}
    >
      <h1 style={{ marginTop: 0 }}>AnnS Crane Hire Customer Portal</h1>
      <p style={{ opacity: 0.8 }}>Job #{(job as any).job_number}</p>

      <div style={card}>
        <h2 style={sectionTitle}>Job Details</h2>
        <Row label="Customer" value={client?.company_name} />
        <Row label="Contact" value={client?.contact_name} />
        <Row label="Job date" value={fmtDate((job as any).job_date)} />
        <Row
          label="Time"
          value={
            (job as any).start_time || (job as any).end_time
              ? `${(job as any).start_time ?? "—"} - ${(job as any).end_time ?? "—"}`
              : "—"
          }
        />
        <Row label="Site name" value={(job as any).site_name} />
        <Row label="Site address" value={(job as any).site_address} />
        <Row label="Crane" value={equipment?.name} />
        <Row label="Capacity" value={equipment?.capacity} />
        <Row label="Status" value={(job as any).status} />
        <Row label="Signed off" value={fmtDateTime((job as any).signed_off_at)} />
      </div>

      <div style={card}>
        <h2 style={sectionTitle}>Invoice</h2>
        <Row label="Invoice number" value={(job as any).invoice_number} />
        <Row label="Invoice total" value={(job as any).invoice_total ? `£${Number((job as any).invoice_total).toFixed(2)}` : "—"} />
      </div>

      <div style={card}>
        <h2 style={sectionTitle}>Lift Plan Summary</h2>
        <Row label="Load description" value={liftPlan?.load_description} />
        <Row label="Load weight" value={liftPlan?.load_weight} />
        <Row label="Lift radius" value={liftPlan?.lift_radius} />
        <Row label="Lift height" value={liftPlan?.lift_height} />
        <Row label="Approved by" value={liftPlan?.approved_by} />
      </div>

      <div style={card}>
        <h2 style={sectionTitle}>Documents</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {(docs ?? []).length === 0 ? (
            <div>No documents available.</div>
          ) : (
            (docs ?? []).map((doc: any) => {
              const href = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${doc.file_path}`;
              return (
                <a
                  key={doc.id}
                  href={href}
                  target="_blank"
                  style={{
                    display: "block",
                    padding: 12,
                    borderRadius: 10,
                    textDecoration: "none",
                    color: "#111",
                    border: "1px solid rgba(0,0,0,0.12)",
                  }}
                >
                  <strong>{doc.file_name}</strong>
                  <div style={{ marginTop: 4, opacity: 0.72 }}>
                    {doc.document_type ?? "document"} • {fmtDateTime(doc.created_at)}
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ opacity: 0.72 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value || "—"}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
};
