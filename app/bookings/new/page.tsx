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
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toLocaleDateString("en-GB");
}

function quoteToBookingStatus(value: string | undefined) {
  const raw = safeDecode(value).trim().toLowerCase();

  if (raw === "accepted") return "confirmed";
  return "draft";
}

async function createBooking(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const payload: Record<string, any> = {
    client_id: clean(formData.get("client_id")) || null,
    site_name: clean(formData.get("site_name")) || null,
    site_address: clean(formData.get("site_address")) || null,
    contact_name: clean(formData.get("contact_name")) || null,
    contact_phone: clean(formData.get("contact_phone")) || null,
    start_date: clean(formData.get("start_date")) || null,
    start_time: clean(formData.get("start_time")) || null,
    notes: clean(formData.get("notes")) || null,
    hire_type: clean(formData.get("hire_type")) || null,
    status: clean(formData.get("status")) || "draft",
    quote_id: clean(formData.get("quote_id")) || null,
    quote_amount: Number(formData.get("quote_amount") ?? 0) || 0,
    created_at: new Date().toISOString(),
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

  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, archived")
    .eq("archived", false)
    .order("company_name", { ascending: true });

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
  const defaultStatus = quoteToBookingStatus(searchParams?.quote_status);
  const errorMessage = searchParams?.error ? safeDecode(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(920px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>New Booking</h1>
          <p style={{ opacity: 0.8, marginTop: 6 }}>
            Create a booking. Quote values will prefill when opened from a quote.
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
            <input type="hidden" name="quote_amount" value={prefilledAmount || "0"} />

            <div style={fieldWrap}>
              <label style={labelStyle}>Customer</label>
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
                <label style={labelStyle}>Start date</label>
                <input name="start_date" type="date" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Start time</label>
                <input name="start_time" type="time" style={inputStyle} />
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Hire type</label>
                <input name="hire_type" style={inputStyle} placeholder="CPA / Contract lift / etc." />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" style={inputStyle} defaultValue={defaultStatus}>
                  <option value="draft">draft</option>
                  <option value="confirmed">confirmed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Notes</label>
              <textarea
                name="notes"
                rows={6}
                style={textareaStyle}
                defaultValue={prefilledNotes}
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
  fontWeight: 700,
  opacity: 0.86,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
