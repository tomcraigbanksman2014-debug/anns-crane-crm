"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type Customer = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export default function CustomerForm({
  mode,
  customer,
}: {
  mode: "create" | "edit";
  customer?: Customer | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [companyName, setCompanyName] = useState(customer?.company_name ?? "");
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // IMPORTANT: send the access token so Route Handlers can authenticate staff reliably
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const payload = {
        company_name: companyName.trim(),
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };

      if (!payload.company_name) throw new Error("Company name is required");

      const url =
        mode === "edit" && customer?.id
          ? `/api/customers/${customer.id}`
          : `/api/customers/create`;

      const method = mode === "edit" && customer?.id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save customer");
      }

      // Go back to customers list
      router.push("/customers");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save customer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={labelStyle}>
          Company name <span style={{ color: "#b00020" }}>*</span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            style={inputStyle}
            placeholder="Company name"
          />
        </label>

        <label style={labelStyle}>
          Contact name
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            style={inputStyle}
            placeholder="Contact name"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="Phone" />
          </label>

          <label style={labelStyle}>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="Email" />
          </label>
        </div>

        <label style={labelStyle}>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: 110, resize: "vertical" as const }}
            placeholder="Notes"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 14px",
            borderRadius: 12,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            background: "linear-gradient(180deg, #111, #000)",
            color: "white",
            fontWeight: 900,
          }}
        >
          {loading ? "Saving..." : "Save customer"}
        </button>

        {error && (
          <div
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              background: "rgba(255,0,0,0.10)",
              border: "1px solid rgba(255,0,0,0.25)",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  outline: "none",
  fontSize: 14,
};
