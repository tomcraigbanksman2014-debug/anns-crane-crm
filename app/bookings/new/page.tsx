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

function quoteToBookingStatus(value: string | undefined) {
  const raw = safeDecode(value).trim().toLowerCase();
  if (raw === "accepted") return "Confirmed";
  if (raw === "sent") return "Provisional";
  return "Inquiry";
}

function combineDateTime(date: string | null, time: string | null) {
  if (!date || !time) return null;
  const iso = `${date}T${time}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function createBooking(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const clientId = clean(formData.get("client_id")) || null;
  const equipmentId = clean(formData.get("equipment_id")) || null;
  const startDate = clean(formData.get("start_date")) || null;
  const endDate = clean(formData.get("end_date")) || null;
  const startTime = clean(formData.get("start_time")) || null;
  const endTime = clean(formData.get("end_time")) || null;
  const location = clean(formData.get("location")) || null;
  const siteAddress = clean(formData.get("site_address")) || null;
  const status = clean(formData.get("status")) || "Inquiry";
  const hirePrice = Number(formData.get("hire_price") ?? 0) || 0;
  const paymentReceived = Number(formData.get("payment_received") ?? 0) || 0;
  const vatRate = Number(formData.get("vat_rate") ?? 20) || 0;
  const vat = Number(((hirePrice * vatRate) / 100).toFixed(2));
  const totalInvoice = Number((hirePrice + vat).toFixed(2));
  const invoiceStatus = clean(formData.get("invoice_status")) || "Not Invoiced";

  const quoteId = clean(formData.get("quote_id")) || "";
  const quoteAmount = clean(formData.get("quote_amount")) || "";
  const quoteSubject = clean(formData.get("quote_subject")) || "";
  const quoteNotes = clean(formData.get("quote_notes")) || "";

  if (!clientId || !equipmentId || !startDate || !endDate) {
    redirect(
      `/bookings/new?error=${encodeURIComponent(
        "Customer, equipment, start date and end date are required."
      )}`
    );
  }

  if (endDate < startDate) {
    redirect(
      `/bookings/new?error=${encodeURIComponent(
        "End date must be the same as or after start date."
      )}`
    );
  }

  const notesParts = [
    quoteSubject ? `Quote subject: ${quoteSubject}` : "",
    quoteAmount ? `Quote amount: £${quoteAmount}` : "",
    quoteId ? `Quote reference: ${quoteId}` : "",
    quoteNotes ? `Quote notes: ${quoteNotes}` : "",
  ].filter(Boolean);

  const bookingNotes = notesParts.join("\n");

  const payload: Record<string, any> = {
    client_id: clientId,
    equipment_id: equipmentId,
    start_date: startDate,
    end_date: endDate,
    start_at: combineDateTime(startDate, startTime),
    end_at: combineDateTime(endDate, endTime),
    location: location || siteAddress || null,
    status,
    hire_price: hirePrice || null,
    vat: hirePrice ? vat : null,
    total_invoice: hirePrice ? totalInvoice : null,
    payment_received: paymentReceived || 0,
    invoice_status: invoiceStatus,
    notes: bookingNotes || null,
    driver_notes: bookingNotes || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("bookings")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    redirect(`/bookings/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/bookings/${data.id}`);
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

export default async function NewBookingPage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();

  const [{ data: clients }, { data: equipment }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, asset_number, capacity, archived, status")
      .eq("archived", false)
      .eq("status", "active")
      .order("name", { ascending: true }),
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
  const defaultStatus = quoteToBookingStatus(searchParams?.quote_status);
  const errorMessage = searchParams?.error ? safeDecode(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(960px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>New Booking</h1>
          <p style={{ opacity: 0.8, marginTop: 6 }}>
            Create a booking using the live booking schema.
          </p>

          {quoteId ? (
            <div style={infoBox}>
              <div>
                Prefilled from quote. Customer: <strong>{prefilledCompany || "Selected customer"}</strong>
              </div>
              <div style={infoMetaStyle}>
                Quote status: {prefilledQuoteStatus || "—"} • Quote date: {formatDateLabel(prefilledQuoteDate)} • Valid until: {formatDateLabel(prefilledValidUntil)}
              </div>
            </div>
          ) : null}

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <form action={createBooking} style={{ display: "grid", gap: 14, marginTop: 18 }}>
            <input type="hidden" name="quote_id" value={quoteId} />
            <input type="hidden" name="quote_amount" value={prefilledAmount || ""} />
            <input type="hidden" name="quote_subject" value={prefilledSubject || ""} />
            <input type="hidden" name="quote_notes" value={prefilledNotes || ""} />

            <div style={twoCol}>
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
                <label style={labelStyle}>Equipment *</label>
                <select name="equipment_id" style={inputStyle} defaultValue="">
                  <option value="">— Select equipment —</option>
                  {(equipment ?? []).map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name ?? "Equipment"}
                      {item.asset_number ? ` (${item.asset_number})` : ""}
                      {item.capacity ? ` • ${item.capacity}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Location / site</label>
              <input
                name="location"
                style={inputStyle}
                defaultValue={prefilledSubject}
                placeholder="Site / location"
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Site address</label>
              <textarea
                name="site_address"
                rows={3}
                style={textareaStyle}
                placeholder="Optional address"
              />
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Start date *</label>
                <input name="start_date" type="date" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>End date *</label>
                <input name="end_date" type="date" style={inputStyle} />
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Start time</label>
                <input name="start_time" type="time" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>End time</label>
                <input name="end_time" type="time" style={inputStyle} />
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" style={inputStyle} defaultValue={defaultStatus}>
                  <option value="Inquiry">Inquiry</option>
                  <option value="Provisional">Provisional</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Invoice status</label>
                <select name="invoice_status" style={inputStyle} defaultValue="Not Invoiced">
                  <option value="Not Invoiced">Not Invoiced</option>
                  <option value="Part Paid">Part Paid</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>

            <div style={threeCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Hire price</label>
                <input
                  name="hire_price"
                  type="number"
                  step="0.01"
                  style={inputStyle}
                  defaultValue={prefilledAmount || ""}
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>VAT %</label>
                <input
                  name="vat_rate"
                  type="number"
                  step="0.01"
                  style={inputStyle}
                  defaultValue="20"
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Payment received</label>
                <input
                  name="payment_received"
                  type="number"
                  step="0.01"
                  style={inputStyle}
                  defaultValue="0"
                />
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Quote notes carried into booking notes</label>
              <textarea
                value={prefilledNotes}
                readOnly
                rows={5}
                style={{ ...textareaStyle, opacity: 0.8 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Create booking
              </button>
              <a href="/bookings" style={secondaryBtn}>
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

const threeCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
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
