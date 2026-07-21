"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type Customer = {
  id?: string;
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export default function CustomerForm({
  mode,
  customer,
}: {
  mode: "create" | "edit";
  customer?: Customer | null;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [companyName, setCompanyName] = useState(customer?.company_name ?? "");
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "edit" && customer) {
      setCompanyName(customer.company_name ?? "");
      setContactName(customer.contact_name ?? "");
      setPhone(customer.phone ?? "");
      setEmail(customer.email ?? "");
      setNotes(customer.notes ?? "");
    }
  }, [mode, customer]);

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
      const payload = {
        company_name,
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };

      if (mode === "create") {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        if (!token) {
          throw new Error("Not authenticated");
        }

        const res = await fetch("/api/customers/create", {
          method: "POST",
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

        router.push("/customers");
        router.refresh();
        return;
      }

      if (!customer?.id) {
        throw new Error("Missing customer ID");
      }

      const { error: updErr } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", customer.id);

      if (updErr) throw new Error(updErr.message);

      router.push(`/customers/${customer.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={card}>
      <h1 style={{ margin: 0, fontSize: 32 }}>
        {mode === "create" ? "Add customer" : "Edit customer"}
      </h1>

      <p style={{ marginTop: 6, opacity: 0.8 }}>
        {mode === "create" ? "Create a new customer record." : "Update customer details."}
      </p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={grid12}>
        <Field span={12} label="Company name *">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            style={input}
            placeholder="e.g. Ann Crane Hire Ltd"
          />
        </Field>

        <Field span={12} label="Contact name">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            style={input}
            placeholder="e.g. Tom Craig"
          />
        </Field>

        <Field span={6} label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={input}
            placeholder="e.g. 01792..."
          />
        </Field>

        <Field span={6} label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
            placeholder="e.g. admin@..."
          />
        </Field>

        <Field span={12} label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={textarea}
            placeholder="Notes"
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Save customer"}
        </button>

        <a href="/customers" style={secondaryBtn}>
          Cancel
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span: number;
}) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  width: "min(1150px, 95vw)",
  margin: "0 auto",
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const grid12: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 12,
  marginTop: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const input: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 140,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
