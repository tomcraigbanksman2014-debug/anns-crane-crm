"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  customer?: Customer;
}) {
  const router = useRouter();

  const [companyName, setCompanyName] = useState(customer?.company_name ?? "");
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!companyName.trim()) {
      setMsg("Company name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/customers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          id: customer?.id ?? null,
          company_name: companyName.trim(),
          contact_name: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Save failed");
        return;
      }

      router.replace("/customers");
      router.refresh();
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label style={labelStyle}>Company name *</label>
      <input
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        placeholder="Company name"
        style={inputStyle}
      />

      <label style={labelStyle}>Contact name</label>
      <input
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        placeholder="Contact name"
        style={inputStyle}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={inputStyle}
          />
        </div>
      </div>

      <label style={labelStyle}>Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        rows={5}
        style={{ ...inputStyle, resize: "vertical" }}
      />

      <button
        type="submit"
        disabled={loading || !companyName.trim()}
        style={{
          width: "100%",
          marginTop: 14,
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
        {loading
          ? "Saving..."
          : mode === "create"
          ? "Save customer"
          : "Update customer"}
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
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginTop: 10,
  marginBottom: 6,
  fontWeight: 800,
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 16,
  background: "rgba(255,255,255,0.85)",
};
