import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { buildQuarterHourOptions } from "../../lib/timeOptions";

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

function numberOrZero(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function countBillableDays(startDate: string, endDate: string, excludeWeekends: boolean) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    const isWeekend = day === 0 || day === 6;

    if (!excludeWeekends || !isWeekend) {
      count += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function normaliseCompanyName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/limited/g, "ltd")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\bltd\b/g, " ltd ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalisePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D+/g, "").trim();
}

function normaliseEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

async function resolveClientId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  selectedClientId: string | null,
  otherCustomer: {
    companyName: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  }
) {
  if (selectedClientId && selectedClientId !== "other") {
    return { clientId: selectedClientId, duplicateMessage: "" };
  }

  if (!otherCustomer.companyName) {
    return { clientId: null, duplicateMessage: "Please enter the customer name when Customer is set to Other." };
  }

  const wantedCompany = normaliseCompanyName(otherCustomer.companyName);
  const wantedPhone = normalisePhone(otherCustomer.phone);
  const wantedEmail = normaliseEmail(otherCustomer.email);

  const { data: existingClients, error: existingClientsError } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, email, address, archived")
    .eq("archived", false)
    .order("company_name", { ascending: true });

  if (existingClientsError) {
    return { clientId: null, duplicateMessage: existingClientsError.message };
  }

  const rows = (existingClients ?? []).map((client: any) => ({
    ...client,
    normalisedCompany: normaliseCompanyName(client.company_name),
    normalisedPhone: normalisePhone(client.phone),
    normalisedEmail: normaliseEmail(client.email),
  }));

  const strongMatch =
    rows.find((client: any) => wantedEmail && client.normalisedEmail && client.normalisedEmail === wantedEmail) ||
    rows.find(
      (client: any) =>
        wantedCompany &&
        wantedPhone &&
        client.normalisedCompany === wantedCompany &&
        client.normalisedPhone === wantedPhone
    ) ||
    rows.find(
      (client: any) =>
        wantedCompany &&
        client.normalisedCompany === wantedCompany &&
        (
          (wantedPhone && client.normalisedPhone === wantedPhone) ||
          (wantedEmail && client.normalisedEmail === wantedEmail)
        )
    );

  if (strongMatch?.id) {
    return { clientId: strongMatch.id, duplicateMessage: "" };
  }

  const possibleMatches = rows.filter((client: any) => {
    if (wantedCompany && client.normalisedCompany === wantedCompany) return true;
    if (wantedPhone && client.normalisedPhone && client.normalisedPhone === wantedPhone) return true;
    if (wantedEmail && client.normalisedEmail && client.normalisedEmail === wantedEmail) return true;
    return false;
  });

  if (possibleMatches.length > 0) {
    const labels = possibleMatches
      .slice(0, 5)
      .map((client: any) => client.company_name || "Existing customer")
      .join(", ");

    return {
      clientId: null,
      duplicateMessage: `Possible duplicate customer found: ${labels}. Please select the existing customer from the dropdown instead of using Other.`,
    };
  }

  const { data: insertedClient, error: insertClientError } = await supabase
    .from("clients")
    .insert([
      {
        company_name: otherCustomer.companyName,
        contact_name: otherCustomer.contactName || null,
        phone: otherCustomer.phone || null,
        email: otherCustomer.email || null,
        address: otherCustomer.address || null,
        notes: "Created from Other customer during job creation.",
      },
    ])
    .select("id")
    .single();

  if (insertClientError || !insertedClient?.id) {
    return {
      clientId: null,
      duplicateMessage: insertClientError?.message || "Could not create customer.",
    };
  }

  return { clientId: insertedClient.id, duplicateMessage: "" };
}

async function createJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const primarySelection = clean(formData.get("primary_equipment_selection"));
  const otherItemName = clean(formData.get("other_item_name"));
  const rawClientId = clean(formData.get("client_id")) || null;
  const operatorId = clean(formData.get("operator_id")) || null;

  const otherCustomerCompanyName = clean(formData.get("other_customer_name")) || null;
  const otherCustomerContactName = clean(formData.get("other_customer_contact_name")) || null;
  const otherCustomerPhone = clean(formData.get("other_customer_phone")) || null;
  const otherCustomerEmail = clean(formData.get("other_customer_email")) || null;
  const otherCustomerAddress = clean(formData.get("other_customer_address")) || null;

  const startDate = clean(formData.get("start_date")) || null;
  const endDate = clean(formData.get("end_date")) || null;
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

  const clientResolution = await resolveClientId(supabase, rawClientId, {
    companyName: otherCustomerCompanyName,
    contactName: otherCustomerContactName,
    phone: otherCustomerPhone,
    email: otherCustomerEmail,
    address: otherCustomerAddress,
  });

  if (clientResolution.duplicateMessage) {
    redirect(`/jobs/new?error=${encodeURIComponent(clientResolution.duplicateMessage)}`);
  }

  const clientId = clientResolution.clientId;

  if (!clientId || !startDate || !endDate) {
    redirect(
      `/jobs/new?error=${encodeURIComponent(
        "Customer, job start date and job end date are required."
      )}`
    );
  }

  if (endDate < startDate) {
    redirect(
      `/jobs/new?error=${encodeURIComponent(
        "Job end date cannot be earlier than job start date."
      )}`
    );
  }

  if (primarySelection === "other" && !otherItemName) {
    redirect(
      `/jobs/new?error=${encodeURIComponent(
        "Please enter an item name when Primary equipment is set to Other."
      )}`
    );
  }

  const priceMode = clean(formData.get("price_mode")) || "full_job";
  const excludeWeekends = clean(formData.get("exclude_weekends")) === "on";
  const fullJobPrice = numberOrZero(formData.get("full_job_price"));
  const pricePerDay = numberOrZero(formData.get("price_per_day"));

  const billableDays = countBillableDays(startDate, endDate, excludeWeekends);

  const calculatedSubtotal =
    priceMode === "per_day"
      ? Number((pricePerDay * billableDays).toFixed(2))
      : Number(fullJobPrice.toFixed(2));

  const payload: Record<string, any> = {
    client_id: clientId,
    equipment_id: primaryEquipmentId,
    operator_id: operatorId,
    site_name: clean(formData.get("site_name")) || null,
    site_address: clean(formData.get("site_address")) || null,
    contact_name: clean(formData.get("contact_name")) || otherCustomerContactName || null,
    contact_phone: clean(formData.get("contact_phone")) || otherCustomerPhone || null,
    job_date: startDate,
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    hire_type: clean(formData.get("hire_type")) || null,
    lift_type: clean(formData.get("lift_type")) || null,
    status: clean(formData.get("status")) || "draft",
    notes: clean(formData.get("notes")) || null,
    price_mode: priceMode,
    price_per_day: priceMode === "per_day" ? pricePerDay : null,
    exclude_weekends: excludeWeekends,
    invoice_subtotal: calculatedSubtotal,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

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
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      agreed_sell_rate: calculatedSubtotal,
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
  const timeOptions = buildQuarterHourOptions();

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
            <div style={fieldWrap}>
              <label style={labelStyle}>Customer *</label>
              <select
                id="client_id"
                name="client_id"
                style={inputStyle}
                defaultValue={prefilledClientId}
              >
                <option value="">— Select customer —</option>
                {(clients ?? []).map((client: any) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name ?? "Customer"}
                  </option>
                ))}
                <option value="other">Other / create new customer</option>
              </select>
            </div>

            <section style={newCustomerBox}>
              <h3 style={newCustomerHeading}>New customer details</h3>
              <p style={newCustomerHelp}>
                Only used if Customer is set to <strong>Other / create new customer</strong>.
                Duplicate checks will run against company name, phone and email.
              </p>

              <div style={fieldWrap}>
                <label style={labelStyle}>New customer company name</label>
                <input
                  id="other_customer_name"
                  name="other_customer_name"
                  style={inputStyle}
                  defaultValue={prefilledClientId === "other" ? prefilledCompany : ""}
                  placeholder="Enter customer company name"
                />
              </div>

              <div style={twoCol}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>New customer contact name</label>
                  <input
                    id="other_customer_contact_name"
                    name="other_customer_contact_name"
                    style={inputStyle}
                    defaultValue={prefilledContactName}
                    placeholder="Contact name"
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>New customer phone</label>
                  <input
                    id="other_customer_phone"
                    name="other_customer_phone"
                    style={inputStyle}
                    defaultValue={prefilledContactPhone}
                    placeholder="Phone"
                  />
                </div>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>New customer email</label>
                <input
                  id="other_customer_email"
                  name="other_customer_email"
                  type="email"
                  style={inputStyle}
                  placeholder="Email"
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>New customer address</label>
                <textarea
                  id="other_customer_address"
                  name="other_customer_address"
                  rows={3}
                  style={textareaStyle}
                  placeholder="Customer address"
                />
              </div>
            </section>

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

            <div style={threeCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Job start date *</label>
                <input name="start_date" type="date" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Job end date *</label>
                <input name="end_date" type="date" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" style={inputStyle} defaultValue={defaultStatus}>
                  <option value="draft">draft</option>
                  <option value="provisional">provisional</option>
                  <option value="confirmed">confirmed</option>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                  <option value="late_cancelled">late_cancelled</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Start time</label>
                <select name="start_time" defaultValue="" style={inputStyle}>
                  <option value="">— Select —</option>
                  {timeOptions.map((option) => (
                    <option key={`start_time-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>End time</label>
                <select name="end_time" defaultValue="" style={inputStyle}>
                  <option value="">— Select —</option>
                  {timeOptions.map((option) => (
                    <option key={`end_time-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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

            <section style={pricingBox}>
              <h3 style={pricingHeading}>Pricing</h3>

              <div style={twoCol}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Price mode</label>
                  <select id="price_mode" name="price_mode" style={inputStyle} defaultValue="full_job">
                    <option value="full_job">Full job price</option>
                    <option value="per_day">Price per day</option>
                  </select>
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Exclude weekends on multi-day jobs</label>
                  <label style={checkboxRow}>
                    <input type="checkbox" name="exclude_weekends" />
                    Free up weekends and continue the job after
                  </label>
                </div>
              </div>

              <div style={twoCol}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Full job price</label>
                  <input
                    id="full_job_price"
                    name="full_job_price"
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    defaultValue={prefilledAmount || ""}
                    placeholder="0.00"
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Price per day</label>
                  <input
                    id="price_per_day"
                    name="price_per_day"
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    defaultValue=""
                    placeholder="0.00"
                  />
                </div>
              </div>
            </section>

            <section style={pricingBox}>
              <h3 style={pricingHeading}>Primary equipment</h3>

              <div style={fieldWrap}>
                <label style={labelStyle}>Primary equipment selection</label>
                <select name="primary_equipment_selection" style={inputStyle} defaultValue="">
                  <option value="">— None selected —</option>

                  {(cranes ?? []).map((crane: any) => (
                    <option key={`crane-${crane.id}`} value={`crane:${crane.id}`}>
                      {crane.name ?? "Crane"}
                      {crane.reg_number ? ` (${crane.reg_number})` : ""}
                      {crane.fleet_number ? ` • ${crane.fleet_number}` : ""}
                    </option>
                  ))}

                  {(equipment ?? []).map((asset: any) => (
                    <option key={`equipment-${asset.id}`} value={`equipment:${asset.id}`}>
                      {asset.name ?? "Equipment"}
                      {asset.asset_number ? ` (${asset.asset_number})` : ""}
                    </option>
                  ))}

                  <option value="other">Other</option>
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Other item name</label>
                <input
                  name="other_item_name"
                  style={inputStyle}
                  placeholder="Only required if Primary equipment = Other"
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Primary operator</label>
                <select name="operator_id" style={inputStyle} defaultValue="">
                  <option value="">— Unassigned —</option>
                  {(operators ?? []).map((operator: any) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.full_name ?? "Operator"}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <div style={fieldWrap}>
              <label style={labelStyle}>Notes</label>
              <textarea
                name="notes"
                rows={4}
                style={textareaStyle}
                defaultValue={prefilledNotes}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>Save job</button>
              <a href="/jobs" style={secondaryBtn}>Cancel</a>
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

const infoBox: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const infoMetaStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.75,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const threeCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const pricingBox: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const pricingHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const newCustomerBox: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const newCustomerHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const newCustomerHelp: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  opacity: 0.8,
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  minHeight: 42,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
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
