"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function CustomerForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [company_name, setCompanyName] = useState("");
  const [contact_name, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;

      if (!token) {
        setError("Not authenticated");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/customers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_name,
          contact_name,
          phone,
          email,
          notes,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to save customer");
        setSaving(false);
        return;
      }

      router.push("/customers");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 32 }}>Add customer</h1>
      <p style={{ marginTop: 6, opacity: 0.8 }}>Create a new customer record.</p>

      <div style={panelStyle}>
        <label style={labelStyle}>
          Company name *
          <input value={company_name} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Contact name
          <input value={contact_name} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={labelStyle}>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textareaStyle} />
        </label>

        <button disabled={saving} type="submit" style={btnStyle}>
          {saving ? "Saving..." : "Save customer"}
        </button>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={{ marginTop: 10 }}>
          <a href="/customers" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>
            ← Back to customers
          </a>
        </div>
      </div>
    </form>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 800,
  marginBottom: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.7)",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.7)",
  outline: "none",
  minHeight: 110,
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  padding: "14px 12px",
  borderRadius: 12,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
