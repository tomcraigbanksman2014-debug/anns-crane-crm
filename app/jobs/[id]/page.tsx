import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import DocumentUploadForm from "./DocumentUploadForm";

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

async function updateJobStatus(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!id || !status) return;

  const supabase = createSupabaseServerClient();

  await supabase
    .from("jobs")
    .update({ status })
    .eq("id", id);
}

export default async function JobPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job, error }, { data: documents }] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        job_date,
        start_time,
        end_time,
        status,
        hire_type,
        lift_type,
        notes,
        created_at,
        updated_at,
        operator_id,
        clients:client_id (
          id,
          company_name,
          contact_name,
          phone,
          email
        ),
        equipment:equipment_id (
          id,
          name,
          asset_number,
          type,
          capacity,
          status
        ),
        operators:operator_id (
          id,
          full_name,
          phone,
          email,
          status
        ),
        bookings:booking_id (
          id
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("job_documents")
      .select("id, file_name, file_path, file_type, created_at")
      .eq("job_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  const client = Array.isArray((job as any)?.clients)
    ? (job as any).clients[0] ?? null
    : (job as any)?.clients ?? null;

  const equipment = Array.isArray((job as any)?.equipment)
    ? (job as any).equipment[0] ?? null
    : (job as any)?.equipment ?? null;

  const operator = Array.isArray((job as any)?.operators)
    ? (job as any).operators[0] ?? null
    : (job as any)?.operators ?? null;

  const booking = Array.isArray((job as any)?.bookings)
    ? (job as any).bookings[0] ?? null
    : (job as any)?.bookings ?? null;

  const docs = documents ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>
              Job #{(job as any)?.job_number ?? "—"}
            </h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View crane hire job details.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {job?.id ? (
              <a href={`/jobs/${job.id}/edit`} style={actionBtn}>
                Edit job
              </a>
            ) : null}
            <a href="/jobs" style={btnStyle}>
              ← Back
            </a>
          </div>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : !job ? (
          <div style={errorBox}>Job not found.</div>
        ) : (
          <>
            <div style={{ ...card, marginTop: 16 }}>
              <h2 style={sectionTitle}>Quick status update</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  ["draft", "Draft"],
                  ["confirmed", "Confirmed"],
                  ["in_progress", "In Progress"],
                  ["completed", "Completed"],
                  ["cancelled", "Cancelled"],
                ].map(([value, label]) => (
                  <form action={updateJobStatus} key={value}>
                    <input type="hidden" name="id" value={(job as any).id} />
                    <input type="hidden" name="status" value={value} />
                    <button
                      type="submit"
                      style={
                        (job as any).status === value
                          ? activeStatusBtn
                          : statusBtn
                      }
                    >
                      {label}
                    </button>
                  </form>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: 16 }}>
                <div style={card}>
                  <h2 style={sectionTitle}>Job details</h2>
                  <Row label="Job #" value={(job as any).job_number} />
                  <Row label="Status" value={(job as any).status} />
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
                  <Row label="Site contact" value={(job as any).contact_name} />
                  <Row label="Site phone" value={(job as any).contact_phone} />
                  <Row label="Hire type" value={(job as any).hire_type} />
                  <Row label="Lift type" value={(job as any).lift_type} />
                  <Row label="Created" value={fmtDateTime((job as any).created_at)} />
                  <Row label="Updated" value={fmtDateTime((job as any).updated_at)} />

                  <Block label="Notes" value={(job as any).notes} />
                </div>

                <div style={card}>
                  <h2 style={sectionTitle}>Documents</h2>

                  <DocumentUploadForm jobId={(job as any).id} />

                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    {docs.length === 0 ? (
                      <p style={{ margin: 0 }}>No documents uploaded yet.</p>
                    ) : (
                      docs.map((doc: any) => (
                        <DocumentRow
                          key={doc.id}
                          fileName={doc.file_name}
                          filePath={doc.file_path}
                          createdAt={doc.created_at}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 16 }}>
                <div style={card}>
                  <h2 style={sectionTitle}>Customer</h2>
                  <Row label="Company" value={client?.company_name} />
                  <Row label="Contact" value={client?.contact_name} />
                  <Row label="Phone" value={client?.phone} />
                  <Row label="Email" value={client?.email} />

                  {client?.id ? (
                    <div style={{ marginTop: 12 }}>
                      <a href={`/customers/${client.id}`} style={actionBtn}>
                        Open customer
                      </a>
                    </div>
                  ) : null}
                </div>

                <div style={card}>
                  <h2 style={sectionTitle}>Equipment</h2>
                  <Row label="Crane" value={equipment?.name} />
                  <Row label="Asset #" value={equipment?.asset_number} />
                  <Row label="Type" value={equipment?.type} />
                  <Row label="Capacity" value={equipment?.capacity} />
                  <Row label="Status" value={equipment?.status} />

                  {equipment?.id ? (
                    <div style={{ marginTop: 12 }}>
                      <a href={`/equipment/${equipment.id}`} style={actionBtn}>
                        Open equipment
                      </a>
                    </div>
                  ) : null}
                </div>

                <div style={card}>
                  <h2 style={sectionTitle}>Operator</h2>
                  <Row label="Operator" value={operator?.full_name} />
                  <Row label="Phone" value={operator?.phone} />
                  <Row label="Email" value={operator?.email} />
                  <Row label="Status" value={operator?.status} />
                </div>

                <div style={card}>
                  <h2 style={sectionTitle}>Linked records</h2>
                  <Row label="Booking linked" value={booking?.id ? "Yes" : "No"} />

                  {booking?.id ? (
                    <div style={{ marginTop: 12 }}>
                      <a href={`/bookings/${booking.id}`} style={actionBtn}>
                        Open booking
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ClientShell>
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
        padding: "8px 0",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function Block({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: "rgba(255,255,255,0.42)",
          border: "1px solid rgba(0,0,0,0.08)",
          whiteSpace: "pre-wrap",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function DocumentRow({
  fileName,
  filePath,
  createdAt,
}: {
  fileName: string;
  filePath: string;
  createdAt: string | null;
}) {
  const href = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${filePath}`;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: "rgba(255,255,255,0.42)",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 800 }}>{fileName}</div>
      <div style={{ fontSize: 13, opacity: 0.72, marginTop: 4 }}>
        Uploaded: {fmtDateTime(createdAt)}
      </div>
      <div style={{ marginTop: 8 }}>
        <a href={href} target="_blank" style={actionBtn}>
          Open document
        </a>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 22,
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const statusBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.45)",
  cursor: "pointer",
  fontWeight: 800,
  color: "#111",
};

const activeStatusBtn: React.CSSProperties = {
  ...statusBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
