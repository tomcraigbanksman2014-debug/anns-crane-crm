import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

async function createQuote(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const payload = {
    client_id: clean(formData.get("client_id")) || null,
    subject: clean(formData.get("subject")) || null,
    status: clean(formData.get("status")) || "draft",
    quote_date: clean(formData.get("quote_date")) || null,
    valid_until: clean(formData.get("valid_until")) || null,
    amount: Number(formData.get("amount") ?? 0) || 0,
    notes: clean(formData.get("notes")) || null,
    archived: false,
  };

  const { data, error } = await supabase
    .from("quotes")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    redirect(`/quotes/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/quotes/${data.id}`);
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, archived")
    .eq("archived", false)
    .order("company_name", { ascending: true });

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(880px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>New Quote</h1>
          <p style={{ opacity: 0.8, marginTop: 6 }}>
            Create a customer quote.
          </p>

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <form action={createQuote} style={{ display: "grid", gap: 14, marginTop: 18 }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Customer</label>
              <select name="client_id" style={inputStyle} defaultValue="">
                <option value="">— Select customer —</option>
                {(clients ?? []).map((client: any) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name ?? "Customer"}
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Subject</label>
              <input name="subject" style={inputStyle} />
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" style={inputStyle} defaultValue="draft">
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                  <option value="accepted">accepted</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Amount</label>
                <input name="amount" type="number" step="0.01" style={inputStyle} />
              </div>
            </div>

            <div style={twoCol}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Quote date</label>
                <input name="quote_date" type="date" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Valid until</label>
                <input name="valid_until" type="date" style={inputStyle} />
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Notes</label>
              <textarea name="notes" rows={5} style={textareaStyle} />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Create quote
              </button>
              <a href="/quotes" style={secondaryBtn}>
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

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
