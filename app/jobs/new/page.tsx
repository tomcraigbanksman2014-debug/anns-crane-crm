import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function safeDecode(value: string | undefined) {
  const raw = String(value ?? "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function formatDateLabel(value: string | undefined) {
  const raw = safeDecode(value).trim();
  if (!raw) return "—";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("en-GB");
}

function quoteToJobStatus(value: string | undefined) {
  const raw = safeDecode(value).trim().toLowerCase();
  if (raw === "accepted") return "confirmed";
  return "draft";
}

async function createJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const primarySelection = clean(formData.get("primary_equipment_selection"));
  const otherItemName = clean(formData.get("other_item_name"));
  const operatorId = clean(formData.get("operator_id")) || null;
  const jobDate = clean(formData.get("job_date")) || null;
  const startTime = clean(formData.get("start_time")) || null;
  const endTime = clean(formData.get("end_time")) || null;

  let primaryEquipmentId: string | null = null;
  let selectedCraneId: string | null = null;
  let allocationAssetType: "equipment" | "crane" | "other" | null = null;

  if (primarySelection.startsWith("equipment:")) {
    primaryEquipmentId = primarySelection.replace("equipment:", "") || null;
    allocationAssetType = primaryEquipmentId ? "equipment" : null;
  } else if (primarySelection.startsWith("crane:")) {
    selectedCraneId = primarySelection.replace("crane:", "") || null;
    allocationAssetType = selectedCraneId ? "crane" : null;
  } else if (primarySelection === "other") {
    allocationAssetType = otherItemName ? "other" : null;
  }

  const payload: Record<string, any> = {
    client_id: clean(formData.get("client_id")) || null,
    equipment_id: primaryEquipmentId,
    operator_id: operatorId,
    site_name: clean(formData.get("site_name")) || null,
    site_address: clean(formData.get("site_address")) || null,
    contact_name: clean(formData.get("contact_name")) || null,
    contact_phone: clean(formData.get("contact_phone")) || null,
    job_date: jobDate,
    start_time: startTime,
    end_time: endTime,
    hire_type: clean(formData.get("hire_type")) || null,
    lift_type: clean(formData.get("lift_type")) || null,
    status: clean(formData.get("status")) || "draft",
    notes: clean(formData.get("notes")) || null,
    invoice_subtotal: Number(formData.get("quote_amount") ?? 0) || 0,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!payload.client_id || !payload.job_date) {
    redirect(
      `/jobs/new?error=${encodeURIComponent("Customer and job date are required.")}`
    );
  }

  if (primarySelection === "other" && !otherItemName) {
    redirect(
      `/jobs/new?error=${encodeURIComponent(
        "Please enter an item name when Primary equipment is set to Other."
      )}`
    );
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    redirect(
      `/jobs/new?error=${encodeURIComponent(
        error?.message || "Failed to create job."
      )}`
    );
  }

  if (allocationAssetType) {
    const allocationPayload: Record<string, any> = {
      job_id: data.id,
      asset_type: allocationAssetType,
      operator_id: operatorId,
      start_date: jobDate,
      end_date: jobDate,
      start_time: startTime,
      end_time: endTime,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (allocationAssetType === "equipment") {
      allocationPayload.equipment_id = primaryEquipmentId;
    }

    if (allocationAssetType === "crane") {
      allocationPayload.crane_id = selectedCraneId;
    }

    if (allocationAssetType === "other") {
      allocationPayload.item_name = otherItemName;
    }

    const { error: allocationError } = await supabase
      .from("job_equipment")
      .insert(allocationPayload);

    if (allocationError) {
      await supabase.from("jobs").delete().eq("id", data.id);
      redirect(`/jobs/new?error=${encodeURIComponent(allocationError.message)}`);
    }
  }

  redirect(`/jobs/${data.id}`);
}

type PageProps = {
  searchParams?: {
    quote_id?: string;
    client_id?: string;
    company?: string;
    subject?: string;
    amount?: string;
    notes?: string;
    quote_status?: string;
    quote_date?: string;
    valid_until?: string;
    contact_name?: string;
    contact_phone?: string;
    error?: string;
  };
};

export default async function NewJobPage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();

  const [{ data: clients }, { data: equipment }, { data: cranes }, { data: operators }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, company_name, archived")
        .eq("archived", false)
        .order("company_name", { ascending: true }),

      supabase
        .from("equipment")
        .select("id, name, asset_number, archived, status")
        .eq("archived", false)
        .eq("status", "active")
        .order("name", { ascending: true }),

      supabase
        .from("cranes")
        .select("id, name, reg_number, fleet_number, archived, status")
        .eq("archived", false)
        .eq("status", "available")
        .order("name", { ascending: true }),

      supabase
        .from("operators")
        .select("id, full_name, archived, status")
        .eq("archived", false)
        .eq("status", "active")
        .order("full_name", { ascending: true }),
    ]);

  const quoteId = String(searchParams?.quote_id ?? "");
  const prefilledClientId = String(searchParams?.client_id ?? "");
  const prefilledCompany = safeDecode(searchParams?.company);
  const prefilledSubject = safeDecode(searchParams?.subject);
  const prefilledAmount = safeDecode(searchParams?.amount);
  const prefilledNotes = safeDecode(searchParams?.notes);
  const prefilledQuoteStatus = safeDecode(searchParams?.quote_status);
  const prefilledQuoteDate = safeDecode(searchParams?.quote_date);
  const prefilledValidUntil = safeDecode(searchParams?.valid_until);
  const prefilledContactName = safeDecode(searchParams?.contact_name);
  const prefilledContactPhone = safeDecode(searchParams?.contact_phone);
  const defaultStatus = quoteToJobStatus(searchParams?.quote_status);
  const errorMessage = searchParams?.error ? safeDecode(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>New Job</h1>
          <p style={{ opacity: 0.8, marginTop: 6 }}>
            Create a crane job using the live jobs schema.
          </p>

          {quoteId ? (
            <div style={infoBox}>
              <div>
                Prefilled from quote. Customer:{" "}
                <strong>{prefilledCompany || "Selected customer"}</strong>
              </div>
              <div style={infoMetaStyle}>
                Quote status: {prefilledQuoteStatus || "—"} • Quote date:{" "}
                {formatDateLabel(prefilledQuoteDate)} • Valid until:{" "}
                {formatDateLabel(prefilledValidUntil)}
              </div>
            </div>
          ) : null}

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <form action={createJob} style={{ display: "grid", gap: 14, marginTop: 18 }}>
            <input type="hidden" name="quote_amount" value={prefilledAmount || "0"} />

            <div style={fieldWrap}>
              <label style={labelStyle}>Customer *</label>
              <select name="client_id" style={inputStyle} defaultValue={prefilledClientId}>
                <option value="">— Select customer —</option>
                {(clients ?? []).map((client: any) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name ?? "Customer"}
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Site name</label>
              <input
                name="site_name"
                style={inputStyle}
                defaultValue={prefilledSubject}
                placeholder="Site or job title"
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Site address</label>
              <textarea
                name="site_address"
                rows={3}
                style={textareaStyle}
                placeholder="Site address"
              />
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Contact name</label>
                <input
                  name="contact_name"
                  style={inputStyle}
                  defaultValue={prefilledContactName}
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Contact phone</label>
                <input
                  name="contact_phone"
                  style={inputStyle}
                  defaultValue={prefilledContactPhone}
                />
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Job date *</label>
                <input name="job_date" type="date" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" style={inputStyle} defaultValue={defaultStatus}>
                  <option value="draft">draft</option>
                  <option value="confirmed">confirmed</option>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Start time</label>
                <input name="start_time" type="time" step={900} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>End time</label>
                <input name="end_time" type="time" step={900} style={inputStyle} />
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Hire type</label>
                <input
                  name="hire_type"
                  style={inputStyle}
                  placeholder="CPA / Contract lift / etc."
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Lift type</label>
                <input name="lift_type" style={inputStyle} placeholder="Lift type" />
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Primary equipment</label>
                <select
                  name="primary_equipment_selection"
                  style={inputStyle}
                  defaultValue=""
                >
                  <option value="">— Optional —</option>

                  {(cranes ?? []).length ? (
                    <optgroup label="Cranes">
                      {(cranes ?? []).map((item: any) => (
                        <option key={item.id} value={`crane:${item.id}`}>
                          {item.name ?? "Crane"}
                          {item.fleet_number ? ` (${item.fleet_number})` : ""}
                          {item.reg_number ? ` - ${item.reg_number}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}

                  {(equipment ?? []).length ? (
                    <optgroup label="Equipment">
                      {(equipment ?? []).map((item: any) => (
                        <option key={item.id} value={`equipment:${item.id}`}>
                          {item.name ?? "Equipment"}
                          {item.asset_number ? ` (${item.asset_number})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}

                  <optgroup label="Other">
                    <option value="other">Other</option>
                  </optgroup>
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Primary operator</label>
                <select name="operator_id" style={inputStyle} defaultValue="">
                  <option value="">— Optional —</option>
                  {(operators ?? []).map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.full_name ?? "Operator"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Other item name</label>
              <input
                name="other_item_name"
                style={inputStyle}
                placeholder="Use this if you selected Other above"
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Notes</label>
              <textarea
                name="notes"
                rows={6}
                style={textareaStyle}
                defaultValue={[
                  prefilledNotes ? `Quote notes: ${prefilledNotes}` : "",
                  prefilledAmount ? `Quote amount: £${prefilledAmount}` : "",
                  quoteId ? `Quote reference: ${quoteId}` : "",
                ]
                  .filter(Boolean)
                  .join("\n")}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Create job
              </button>
              <a href="/jobs" style={secondaryBtn}>
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </ClientShell>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
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

const infoBox: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const infoMetaStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.78,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
