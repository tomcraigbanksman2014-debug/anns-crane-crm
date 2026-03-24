import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";
import { writeAuditLog } from "../../lib/audit";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function numberOrZero(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function generateTransportNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const stamp = `${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
  return `TR-${y}${m}${day}-${stamp}`;
}

const INVOICE_STATUSES = [
  "Not Invoiced",
  "Invoiced",
  "Part Paid",
  "Paid",
];

function buildTimeOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const mins = ["00", "15", "30", "45"];

  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    for (const mm of mins) {
      const value = `${hh}:${mm}`;
      options.push({ value, label: value });
    }
  }

  return options;
}

function parseDateTime(dateValue: string | null, timeValue: string | null) {
  if (!dateValue || !timeValue) return null;
  const iso = `${dateValue}T${timeValue}:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normaliseTransportStatus(
  input: string | null,
  fields: {
    clientId: string | null;
    vehicleId: string | null;
    operatorId: string | null;
    transportDate: string | null;
    collectionTime: string | null;
    deliveryDate: string | null;
    deliveryTime: string | null;
  }
) {
  const requested = String(input ?? "planned").trim().toLowerCase() || "planned";

  if (requested !== "confirmed") {
    return requested;
  }

  const canConfirm =
    !!fields.clientId &&
    !!fields.vehicleId &&
    !!fields.operatorId &&
    !!fields.transportDate &&
    !!fields.collectionTime &&
    !!fields.deliveryDate &&
    !!fields.deliveryTime;

  return canConfirm ? "confirmed" : "planned";
}

function countDaysInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    count += 1;
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
        notes: "Created from Other customer during transport job creation.",
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

async function createTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const transportNumber =
    clean(formData.get("transport_number")) || generateTransportNumber();

  const linkedJobId = clean(formData.get("linked_job_id")) || null;
  const linkedTransportJobId = clean(formData.get("linked_transport_job_id")) || null;

  const rawClientId = clean(formData.get("client_id")) || null;
  const otherCustomerCompanyName = clean(formData.get("other_customer_name")) || null;
  const otherCustomerContactName = clean(formData.get("other_customer_contact_name")) || null;
  const otherCustomerPhone = clean(formData.get("other_customer_phone")) || null;
  const otherCustomerEmail = clean(formData.get("other_customer_email")) || null;
  const otherCustomerAddress = clean(formData.get("other_customer_address")) || null;

  const vehicleId = clean(formData.get("vehicle_id")) || null;
  const operatorId = clean(formData.get("operator_id")) || null;

  const rawSupplierId = clean(formData.get("supplier_id"));
  const otherSupplierName = clean(formData.get("other_supplier_name"));
  const supplierReferenceInput = clean(formData.get("supplier_reference"));
  const supplierCost = numberOrNull(formData.get("supplier_cost"));
  const jobType = clean(formData.get("job_type")) || null;

  const supplierId =
    rawSupplierId && rawSupplierId !== "other" ? rawSupplierId : null;

  const supplierReference =
    rawSupplierId === "other"
      ? [otherSupplierName || null, supplierReferenceInput ? `Ref: ${supplierReferenceInput}` : null]
          .filter(Boolean)
          .join(" | ") || null
      : supplierReferenceInput || null;

  const clientResolution = await resolveClientId(supabase, rawClientId, {
    companyName: otherCustomerCompanyName,
    contactName: otherCustomerContactName,
    phone: otherCustomerPhone,
    email: otherCustomerEmail,
    address: otherCustomerAddress,
  });

  if (clientResolution.duplicateMessage) {
    redirect(`/transport-jobs/new?error=${encodeURIComponent(clientResolution.duplicateMessage)}`);
  }

  const clientId = clientResolution.clientId;

  const collectionAddress = clean(formData.get("collection_address")) || null;
  const deliveryAddress = clean(formData.get("delivery_address")) || null;
  const transportDate = clean(formData.get("transport_date")) || null;
  const collectionTime = clean(formData.get("collection_time")) || null;
  const deliveryDate =
    clean(formData.get("delivery_date")) || transportDate || null;
  const deliveryTime = clean(formData.get("delivery_time")) || null;
  const loadDescription = clean(formData.get("load_description")) || null;

  const status = normaliseTransportStatus(clean(formData.get("status")) || "planned", {
    clientId,
    vehicleId,
    operatorId,
    transportDate,
    collectionTime,
    deliveryDate,
    deliveryTime,
  });

  if (!clientId || !transportDate) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Customer and collection date are required."
      )}`
    );
  }

  if (rawSupplierId === "other" && !otherSupplierName) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Please enter the supplier name when Supplier is set to Other."
      )}`
    );
  }

  const collectionDateTime = parseDateTime(transportDate, collectionTime);
  const deliveryDateTime = parseDateTime(deliveryDate, deliveryTime);

  if (
    collectionDateTime &&
    deliveryDateTime &&
    deliveryDateTime.getTime() < collectionDateTime.getTime()
  ) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Delivery date/time cannot be before the collection date/time."
      )}`
    );
  }

  const pickupCoords = collectionAddress ? await geocodeAddress(collectionAddress) : null;
  const deliveryCoords = deliveryAddress ? await geocodeAddress(deliveryAddress) : null;

  const priceMode = clean(formData.get("price_mode")) || "full_job";
  const agreedSellRateInput = money(numberOrZero(formData.get("agreed_sell_rate")));
  const pricePerDay = money(numberOrZero(formData.get("price_per_day")));
  const dayCount = transportDate && deliveryDate ? countDaysInclusive(transportDate, deliveryDate) : 1;
  const calculatedSellRate =
    priceMode === "per_day"
      ? money(pricePerDay * Math.max(dayCount, 1))
      : agreedSellRateInput;

  const invoiceSubtotalRaw = money(numberOrZero(formData.get("invoice_subtotal")));
  const invoiceSubtotal = invoiceSubtotalRaw > 0 ? invoiceSubtotalRaw : calculatedSellRate;
  const invoiceVat = money(invoiceSubtotal * 0.2);
  const totalInvoice = money(invoiceSubtotal + invoiceVat);

  const invoiceStatus = clean(formData.get("invoice_status")) || "Not Invoiced";

  if (!INVOICE_STATUSES.includes(invoiceStatus)) {
    redirect(`/transport-jobs/new?error=${encodeURIComponent("Invalid invoice status.")}`);
  }

  const payload: Record<string, any> = {
    transport_number: transportNumber,
    linked_job_id: linkedJobId,
    linked_transport_job_id: linkedTransportJobId,
    client_id: clientId,
    vehicle_id: vehicleId,
    operator_id: operatorId,
    supplier_id: supplierId,
    supplier_reference: supplierReference,
    supplier_cost: supplierCost,
    job_type: jobType,
    collection_address: collectionAddress,
    delivery_address: deliveryAddress,
    collection_lat: pickupCoords?.lat ?? null,
    collection_lng: pickupCoords?.lng ?? null,
    delivery_lat: deliveryCoords?.lat ?? null,
    delivery_lng: deliveryCoords?.lng ?? null,
    transport_date: transportDate,
    collection_time: collectionTime,
    delivery_date: deliveryDate,
    delivery_time: deliveryTime,
    load_description: loadDescription,
    status,
    price_mode: priceMode,
    price_per_day: priceMode === "per_day" ? pricePerDay : null,
    price: calculatedSellRate,
    agreed_sell_rate: calculatedSellRate,
    invoice_status: invoiceStatus,
    invoice_number: clean(formData.get("invoice_number")) || null,
    invoice_created_at: clean(formData.get("invoice_created_at")) || null,
    invoice_due_at: clean(formData.get("invoice_due_at")) || null,
    invoice_notes: clean(formData.get("invoice_notes")) || null,
    invoice_subtotal: invoiceSubtotal,
    invoice_vat: invoiceVat,
    total_invoice: totalInvoice,
    notes: clean(formData.get("notes")) || null,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("transport_jobs")
    .insert(payload)
    .select("id, transport_number")
    .single();

  if (error || !data?.id) {
    redirect(`/transport-jobs/new?error=${encodeURIComponent(error?.message ?? "Could not create transport job.")}`);
  }

  await writeAuditLog({
    actor_user_id: null,
    actor_username: fromAuthEmail(null),
    action: "transport_job_created",
    entity_type: "transport_job",
    entity_id: data.id,
    meta: {
      transport_number: data.transport_number,
      price_mode: payload.price_mode,
      price_per_day: payload.price_per_day,
      agreed_sell_rate: payload.agreed_sell_rate,
      client_id: payload.client_id,
      vehicle_id: payload.vehicle_id,
      operator_id: payload.operator_id,
    },
  });

  redirect(`/transport-jobs/${data.id}`);
}

export default async function NewTransportJobPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const errorMessage = String(searchParams?.error ?? "");
  const timeOptions = buildTimeOptions();

  const [
    { data: clients },
    { data: jobs },
    { data: transportJobs },
    { data: vehicles },
    { data: operators },
    { data: suppliers },
  ] = await Promise.all([
    supabase.from("clients").select("id, company_name, archived").eq("archived", false).order("company_name", { ascending: true }),
    supabase.from("jobs").select("id, job_number, site_name, archived").eq("archived", false).order("created_at", { ascending: false }).limit(300),
    supabase.from("transport_jobs").select("id, transport_number, transport_date, delivery_date, archived").eq("archived", false).order("created_at", { ascending: false }).limit(300),
    supabase.from("vehicles").select("id, name, reg_number, status, archived").eq("archived", false).order("name", { ascending: true }),
    supabase.from("operators").select("id, full_name, status, archived").eq("archived", false).order("full_name", { ascending: true }),
    supabase.from("suppliers").select("id, company_name, category").order("company_name", { ascending: true }),
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>New Transport Job</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Create a transport job with pricing mode support.
              </p>
            </div>

            <a href="/transport-jobs" style={secondaryBtn}>
              ← Back
            </a>
          </div>

          {errorMessage ? <div style={errorBox}>{decodeURIComponent(errorMessage)}</div> : null}

          <form action={createTransportJob} style={{ marginTop: 18, display: "grid", gap: 18 }}>
            <section style={sectionCard}>
              <div style={sectionTitle}>Transport job details</div>

              <div style={gridStyle}>
                <SelectField
                  label="Linked crane job"
                  name="linked_job_id"
                  options={(jobs ?? []).map((j: any) => ({
                    value: j.id,
                    label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                  }))}
                />

                <SelectField
                  label="Linked transport job"
                  name="linked_transport_job_id"
                  options={(transportJobs ?? []).map((j: any) => ({
                    value: j.id,
                    label: `${j.transport_number ?? "Transport Job"}${j.transport_date ? ` • ${j.transport_date}` : ""}${j.delivery_date && j.delivery_date !== j.transport_date ? ` → ${j.delivery_date}` : ""}`,
                  }))}
                />

                <SelectField
                  id="client_id"
                  label="Customer"
                  name="client_id"
                  options={[
                    ...(clients ?? []).map((c: any) => ({
                      value: c.id,
                      label: c.company_name ?? "Customer",
                    })),
                    { value: "other", label: "Other / create new customer" },
                  ]}
                />

                <SelectField
                  label="Vehicle"
                  name="vehicle_id"
                  options={(vehicles ?? []).map((v: any) => ({
                    value: v.id,
                    label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                  }))}
                />

                <SelectField
                  label="Driver / Operator"
                  name="operator_id"
                  options={(operators ?? []).map((o: any) => ({
                    value: o.id,
                    label: o.full_name ?? "Operator",
                  }))}
                />

                <SelectField
                  label="Job type"
                  name="job_type"
                  defaultValue="haulage"
                  options={[
                    { value: "haulage", label: "haulage" },
                    { value: "delivery", label: "delivery" },
                    { value: "collection", label: "collection" },
                    { value: "ballast", label: "ballast" },
                    { value: "crane_support", label: "crane_support" },
                    { value: "on_site_hiab", label: "on_site_hiab" },
                  ]}
                />

                <Field id="transport_date" label="Collection date" name="transport_date" type="date" />
                <SelectField id="collection_time" label="Collection time" name="collection_time" options={timeOptions} />
                <Field id="delivery_date" label="Delivery date" name="delivery_date" type="date" />
                <SelectField id="delivery_time" label="Delivery time" name="delivery_time" options={timeOptions} />

                <SelectField
                  label="Status"
                  name="status"
                  defaultValue="planned"
                  options={[
                    { value: "planned", label: "planned" },
                    { value: "confirmed", label: "confirmed" },
                    { value: "in_progress", label: "in_progress" },
                    { value: "completed", label: "completed" },
                    { value: "cancelled", label: "cancelled" },
                  ]}
                />
              </div>

              <div style={newCustomerBox}>
                <h3 style={newCustomerHeading}>New customer details</h3>
                <p style={newCustomerHelp}>
                  Only used if Customer is set to <strong>Other / create new customer</strong>.
                  Duplicate checks will run against company name, phone and email.
                </p>

                <div style={gridStyle}>
                  <Field
                    id="other_customer_name"
                    label="New customer company name"
                    name="other_customer_name"
                    placeholder="Enter customer name"
                  />

                  <Field
                    id="other_customer_contact_name"
                    label="New customer contact name"
                    name="other_customer_contact_name"
                    placeholder="Contact name"
                  />

                  <Field
                    id="other_customer_phone"
                    label="New customer phone"
                    name="other_customer_phone"
                    placeholder="Phone"
                  />

                  <Field
                    id="other_customer_email"
                    label="New customer email"
                    name="other_customer_email"
                    type="email"
                    placeholder="Email"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>New customer address</label>
                  <textarea
                    id="other_customer_address"
                    name="other_customer_address"
                    rows={3}
                    style={textareaStyle}
                    placeholder="Customer address"
                  />
                </div>
              </div>

              <div style={twoCol}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Pickup / site address</label>
                  <textarea id="collection_address" name="collection_address" rows={3} style={textareaStyle} />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Delivery / work area address</label>
                  <textarea id="delivery_address" name="delivery_address" rows={3} style={textareaStyle} />
                </div>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Load / task description</label>
                <textarea id="load_description" name="load_description" rows={3} style={textareaStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Notes</label>
                <textarea name="notes" rows={4} style={textareaStyle} />
              </div>
            </section>

            <section style={sectionCard}>
              <div style={sectionTitle}>Pricing</div>

              <div style={gridStyle}>
                <SelectField
                  label="Price mode"
                  name="price_mode"
                  defaultValue="full_job"
                  options={[
                    { value: "full_job", label: "Full job price" },
                    { value: "per_day", label: "Price per day" },
                  ]}
                />

                <Field
                  id="agreed_sell_rate"
                  label="Full job price"
                  name="agreed_sell_rate"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />

                <Field
                  label="Price per day"
                  name="price_per_day"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />

                <Field
                  id="invoice_subtotal"
                  label="Invoice subtotal"
                  name="invoice_subtotal"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </div>
            </section>

            <section style={sectionCard}>
              <div style={sectionTitle}>Cross-hire / supplier details</div>

              <div style={gridStyle}>
                <SelectField
                  id="supplier_id"
                  label="Supplier"
                  name="supplier_id"
                  options={[
                    ...(suppliers ?? []).map((s: any) => ({
                      value: s.id,
                      label: s.company_name ?? "Supplier",
                    })),
                    { value: "other", label: "Other" },
                  ]}
                />

                <div id="other_supplier_wrap" style={{ display: "none" }}>
                  <Field
                    id="other_supplier_name"
                    label="Other supplier name"
                    name="other_supplier_name"
                    placeholder="Enter one-off cross-hire supplier"
                  />
                </div>

                <Field id="supplier_reference" label="Supplier reference" name="supplier_reference" />
                <Field id="supplier_cost" label="Supplier cost" name="supplier_cost" type="number" step="0.01" />
              </div>
            </section>

            <section id="invoice_details_section" style={sectionCard}>
              <div style={sectionTitle}>Invoice</div>

              <div style={gridStyle}>
                <SelectField
                  label="Invoice status"
                  name="invoice_status"
                  defaultValue="Not Invoiced"
                  options={INVOICE_STATUSES.map((value) => ({
                    value,
                    label: value,
                  }))}
                />

                <Field label="Invoice number" name="invoice_number" />
                <Field label="Invoice date" name="invoice_created_at" type="date" />
                <Field label="Due date" name="invoice_due_at" type="date" />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Invoice notes</label>
                <textarea name="invoice_notes" rows={4} style={textareaStyle} />
              </div>
            </section>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>Save transport job</button>
              <a href="/transport-jobs" style={secondaryBtn}>Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  type = "text",
  step,
  placeholder,
}: {
  id?: string;
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div style={fieldWrap}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input id={id} name={name} defaultValue={defaultValue} type={type} step={step} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

function SelectField({
  id,
  label,
  name,
  defaultValue,
  options,
}: {
  id?: string;
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={fieldWrap}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <select id={id} name={name} defaultValue={defaultValue} style={inputStyle}>
        <option value="">— Select —</option>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 12,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  marginTop: 12,
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
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const newCustomerBox: React.CSSProperties = {
  marginTop: 16,
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
