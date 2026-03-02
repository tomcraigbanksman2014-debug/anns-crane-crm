"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../../ClientShell";

export default function NewCustomerPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/customers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Failed to create customer");
        return;
      }

      router.replace("/customers");
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 92vw)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Add Customer</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Create a new customer record.</p>
          </div>

          <a
            href="/customers"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              color: "#111",
              fontWeight: 800,
            }}
          >
            ← Back
          </a>
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.18)",
            padding: 18,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.4)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          <Field label="Company name *">
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Construction Ltd"
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Contact name">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. John Smith"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <Field label="Phone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 07xxx xxxxxx"
                style={inputStyle}
              />
            </Field>

            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. accounts@acme.co.uk"
                type="email"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <button
            type="submit"
            disabled={loading || !companyName.trim()}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "white",
              fontSize: 15,
              cursor: loading || !companyName.trim() ? "not-allowed" : "pointer",
              opacity: loading || !companyName.trim() ? 0.7 : 1,
              fontWeight: 800,
            }}
          >
            {loading ? "Saving..." : "Save customer"}
          </button>

          {msg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {msg}
            </div>
          )}
        </form>
      </div>
    </ClientShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, marginBottom: 6, opacity: 0.9 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
};
