import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function updateTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/transport-jobs?error=${encodeURIComponent("Transport job id missing.")}`);
  }

  const payload = {
    linked_job_id: clean(formData.get("linked_job_id")) || null,
    client_id: clean(formData.get("client_id")) || null,
    vehicle_id: clean(formData.get("vehicle_id")) || null,
    operator_id: clean(formData.get("operator_id")) || null,
    job_type: clean(formData.get("job_type")) || null,
    collection_address: clean(formData.get("collection_address")) || null,
    delivery_address: clean(formData.get("delivery_address")) || null,
    transport_date: clean(formData.get("transport_date")) || null,
    collection_time: clean(formData.get("collection_time")) || null,
    delivery_time: clean(formData.get("delivery_time")) || null,
    load_description: clean(formData.get("load_description")) || null,
    status: clean(formData.get("status")) || "planned",
    price: Number(formData.get("price") ?? 0) || 0,
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("transport_jobs").update(payload).eq("id", id);

  if (error) {
    redirect(`/transport-jobs/${id}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/transport-jobs/${id}?success=${encodeURIComponent("Transport job updated.")}`);
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function TransportJobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authEmail = String(user?.email ?? "").trim().toLowerCase();
  const authUsername = authEmail.includes("@")
    ? authEmail.split("@")[0]
    : authEmail;

  const [
    { data: item, error },
    { data: clients },
    { data: jobs },
    { data: vehicles },
    { data: operators },
  ] = await Promise.all([
    supabase
      .from("transport_jobs")
      .select(`
        *,
        clients:client_id (
          company_name
        ),
        vehicles:vehicle_id (
          name,
          reg_number
        ),
        operators:operator_id (
          id,
          full_name,
          email
        ),
        jobs:linked_job_id (
          id,
          job_number,
          site_name
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
    supabase.from("jobs").select("id, job_number, site_name").order("created_at", { ascending: false }).limit(300),
    supabase.from("vehicles").select("id, name, reg_number").order("name", { ascending: true }),
    supabase.from("operators").select("id, full_name").eq("status", "active").order("full_name", { ascending: true }),
  ]);

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  const client = first((item as any)?.clients);
  const vehicle = first((item as any)?.vehicles);
  const driver = first((item as any)?.operators);
  const linkedJob = first((item as any)?.jobs);

  const isAssignedDriver =
    !!driver &&
    (
      String(driver.email ?? "").trim().toLowerCase() === authEmail ||
      String(driver.full_name ?? "").trim().toLowerCase() === authUsername
    );

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, marginBottom: 0, fontSize: 32, lineHeight: 1.1 }}>
                {(item as any)?.transport_number ?? "Transport Job"}
              </h1>
              <p style={{ opacity: 0.8, marginTop: 10 }}>
                {isAssignedDriver
                  ? "View your assigned transport allocation."
                  : "View and update transport allocation details."}
              </p>
            </div>

            <div style={headerButtons}>
              <a href="/transport-jobs" style={secondaryBtn}>
                ← Back to transport jobs
              </a>
              <a href="/transport-map" style={secondaryBtn}>
                Open control map
              </a>
            </div>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {error ? <div style={errorBox}>{error.message}</div> : null}

          {!item ? (
            <div style={errorBox}>Transport job not found.</div>
          ) : isAssignedDriver ? (
            <div style={pageGridResponsive}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Transport job details</h2>

                <div style={{ display: "grid", gap: 14 }}>
                  <div style={gridStyle}>
                    <ReadField label="Reference" value={(item as any).transport_number ?? "—"} />
                    <ReadField
                      label="Linked crane job"
                      value={linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
                    />
                    <ReadField label="Customer" value={client?.company_name ?? "—"} />
                    <ReadField
                      label="Vehicle"
                      value={`${vehicle?.name ?? "—"}${vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}`}
                    />
                    <ReadField label="Driver" value={driver?.full_name ?? "—"} />
                    <ReadField label="Job type" value={(item as any).job_type ?? "—"} />
                    <ReadField label="Transport date" value={(item as any).transport_date ?? "—"} />
                    <ReadField label="Collection time" value={(item as any).collection_time ?? "—"} />
                    <ReadField label="Delivery time" value={(item as any).delivery_time ?? "—"} />
                    <ReadField label="Status" value={(item as any).status ?? "—"} />
                    <ReadField label="Price" value={fmtMoney((item as any).price)} />
                  </div>

                  <ReadArea label="Collection address" value={(item as any).collection_address ?? "—"} />
                  <ReadArea label="Delivery address" value={(item as any).delivery_address ?? "—"} />
                  <ReadArea label="Load description" value={(item as any).load_description ?? "—"} />
                  <ReadArea label="Notes" value={(item as any).notes ?? "—"} />
                </div>
              </section>

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Quick summary</h2>

                <InfoRow label="Customer" value={client?.company_name ?? "—"} />
                <InfoRow label="Vehicle" value={vehicle?.name ?? "—"} />
                <InfoRow label="Driver" value={driver?.full_name ?? "—"} />
                <InfoRow label="Linked crane job" value={linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"} />
                <InfoRow label="Status" value={(item as any).status ?? "—"} />
                <InfoRow label="Price" value={fmtMoney((item as any).price)} />

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a href="/transport-map" style={miniLinkBtn}>
                    Open control map
                  </a>

                  {linkedJob?.id ? (
                    <a href={`/jobs/${linkedJob.id}`} style={miniLinkBtn}>
                      Open linked crane job
                    </a>
                  ) : null}

                  {(item as any).vehicle_id ? (
                    <a href={`/vehicles/${(item as any).vehicle_id}`} style={miniLinkBtn}>
                      Open vehicle
                    </a>
                  ) : null}
                </div>
              </section>
            </div>
          ) : (
            <div style={pageGridResponsive}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Transport job details</h2>

                <form action={updateTransportJob} style={{ display: "grid", gap: 14 }}>
                  <input type="hidden" name="id" value={(item as any).id} />

                  <div style={gridStyle}>
                    <Field
                      label="Reference"
                      name="transport_number_readonly"
                      defaultValue={(item as any).transport_number ?? ""}
                      disabled
                    />
                    <SelectField
                      label="Linked crane job"
                      name="linked_job_id"
                      defaultValue={(item as any).linked_job_id ?? ""}
                      options={(jobs ?? []).map((j: any) => ({
                        value: j.id,
                        label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                      }))}
                    />
                    <SelectField
                      label="Customer"
                      name="client_id"
                      defaultValue={(item as any).client_id ?? ""}
                      options={(clients ?? []).map((c: any) => ({
                        value: c.id,
                        label: c.company_name ?? "Customer",
                      }))}
                    />
                    <SelectField
                      label="Vehicle"
                      name="vehicle_id"
                      defaultValue={(item as any).vehicle_id ?? ""}
                      options={(vehicles ?? []).map((v: any) => ({
                        value: v.id,
                        label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                      }))}
                    />
                    <SelectField
                      label="Driver"
                      name="operator_id"
                      defaultValue={(item as any).operator_id ?? ""}
                      options={(operators ?? []).map((o: any) => ({
                        value: o.id,
                        label: o.full_name ?? "Driver",
                      }))}
                    />
                    <SelectField
                      label="Job type"
                      name="job_type"
                      defaultValue={(item as any).job_type ?? ""}
                      options={[
                        { value: "haulage", label: "haulage" },
                        { value: "delivery", label: "delivery" },
                        { value: "collection", label: "collection" },
                        { value: "ballast", label: "ballast" },
                        { value: "crane_support", label: "crane_support" },
                      ]}
                    />
                    <Field label="Transport date" name="transport_date" type="date" defaultValue={(item as any).transport_date ?? ""} />
                    <Field label="Collection time" name="collection_time" type="time" defaultValue={(item as any).collection_time ?? ""} />
                    <Field label="Delivery time" name="delivery_time" type="time" defaultValue={(item as any).delivery_time ?? ""} />
                    <SelectField
                      label="Status"
                      name="status"
                      defaultValue={(item as any).status ?? "planned"}
                      options={[
                        { value: "planned", label: "planned" },
                        { value: "confirmed", label: "confirmed" },
                        { value: "in_progress", label: "in_progress" },
                        { value: "completed", label: "completed" },
                        { value: "cancelled", label: "cancelled" },
                      ]}
                    />
                    <Field label="Price" name="price" type="number" defaultValue={String((item as any).price ?? 0)} />
                  </div>

                  <FullWidthField label="Collection address" name="collection_address" defaultValue={(item as any).collection_address ?? ""} />
                  <FullWidthField label="Delivery address" name="delivery_address" defaultValue={(item as any).delivery_address ?? ""} />
                  <FullWidthField label="Load description" name="load_description" defaultValue={(item as any).load_description ?? ""} />
                  <FullWidthField label="Notes" name="notes" defaultValue={(item as any).notes ?? ""} />

                  <div>
                    <button type="submit" style={primaryBtn}>
                      Update transport job
                    </button>
                  </div>
                </form>
              </section>

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Quick summary</h2>

                <InfoRow label="Customer" value={client?.company_name ?? "—"} />
                <InfoRow label="Vehicle" value={vehicle?.name ?? "—"} />
                <InfoRow label="Driver" value={driver?.full_name ?? "—"} />
                <InfoRow label="Linked crane job" value={linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"} />
                <InfoRow label="Status" value={(item as any).status ?? "—"} />
                <InfoRow label="Price" value={fmtMoney((item as any).price)} />

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a href="/transport-map" style={miniLinkBtn}>
                    Open control map
                  </a>

                  {linkedJob?.id ? (
                    <a href={`/jobs/${linkedJob.id}`} style={miniLinkBtn}>
                      Open linked crane job
                    </a>
                  ) : null}

                  {(item as any).vehicle_id ? (
                    <a href={`/vehicles/${(item as any).vehicle_id}`} style={miniLinkBtn}>
                      Open vehicle
                    </a>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  disabled = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        style={inputStyle}
        disabled={disabled}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FullWidthField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={3}
        style={textareaStyle}
      />
    </div>
  );
}

function ReadField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <div style={readValueStyle}>{value}</div>
    </div>
  );
}

function ReadArea({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <div style={readAreaStyle}>{value}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoRow}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const headerButtons: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const pageGridResponsive: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
  minWidth: 0,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const infoRow: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
};

const infoValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
  wordBreak: "break-word",
};

const miniLinkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.72)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
};

const readValueStyle: React.CSSProperties = {
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.66)",
  boxSizing: "border-box",
  fontWeight: 700,
  wordBreak: "break-word",
};

const readAreaStyle: React.CSSProperties = {
  minHeight: 84,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.66)",
  boxSizing: "border-box",
  fontWeight: 700,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
