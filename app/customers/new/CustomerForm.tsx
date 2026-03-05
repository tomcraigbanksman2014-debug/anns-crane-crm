"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type Props = {
  mode?: "create" | "edit";
  customer?: any; // optional, used if you later reuse this for edit
};

export default function CustomerForm({ mode = "create", customer }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [companyName, setCompanyName] = useState(customer?.company_name ?? "");
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const company_name = companyName.trim();
    if (!company_name) {
      setError("Company name is required.");
      return;
    }

    setSaving(true);
    try {
      // ✅ sanity check: ensure we actually have a session in the browser
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        setError("Not authenticated (no session). Please log in again.");
        return;
      }

      const payload = {
        company_name,
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };

      const endpoint =
        mode === "edit" && customer?.id
          ? `/api/customers/${customer.id}`
          : `/api/customers/create`;

      const method = mode === "edit" && customer?.id ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ IMPORTANT: sends Supabase auth cookies
        body: JSON.stringify(payload),
      });

      // If middleware redirected, you might get HTML not JSON
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          "Server returned non-JSON (often caused by redirect/middleware)."
        );
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save customer.");
      }

      // Success: go back to customers list
      router.push("/customers");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={labelStyle}>
          <div style={labelTopStyle}>
            Company name <span style={{ color: "#b00020" }}>*</span>
          </div>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company name"
            style={inputStyle}
            required
          />
        </label>

        <label style={labelStyle}>
          <div style={labelTopStyle}>Contact name</div>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact name"
            style={inputStyle}
          />
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <label style={labelStyle}>
            <div style={labelTopStyle}>Phone</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            <div style={labelTopStyle}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={inputStyle}
            />
          </label>
        </div>

        <label style={labelStyle}>
          <div style={labelTopStyle}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={6}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 6,
            padding: "12px 14px",
            borderRadius: 12,
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            background: "rgba(0,0,0,0.85)",
            color: "white",
            fontWeight: 900,
          }}
        >
          {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save customer"}
        </button>

        {error && (
          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 10,
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
  gap: 6,
};

const labelTopStyle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.14)",
  outline: "none",
  background: "rgba(255,255,255,0.85)",
  fontSize: 15,
};
