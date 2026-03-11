"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignoffForm({
  jobId,
  initialCustomerSignatureName,
  initialOperatorSignatureName,
  initialSignedOffAt,
}: {
  jobId: string;
  initialCustomerSignatureName?: string | null;
  initialOperatorSignatureName?: string | null;
  initialSignedOffAt?: string | null;
}) {
  const router = useRouter();
  const [customerSignatureName, setCustomerSignatureName] = useState(
    initialCustomerSignatureName ?? ""
  );
  const [operatorSignatureName, setOperatorSignatureName] = useState(
    initialOperatorSignatureName ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true);
    setMsg("");

    try {
      const res = await fetch(`/api/jobs/${jobId}/signoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_signature_name: customerSignatureName,
          operator_signature_name: operatorSignatureName,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not save signatures.");
        return;
      }

      setMsg("Sign-off saved.");
      router.refresh();
    } catch {
      setMsg("Could not save signatures.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 22 }}>Job Sign-Off</h2>

      <div style={gridStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Customer signature name</label>
          <input
            value={customerSignatureName}
            onChange={(e) => setCustomerSignatureName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Operator signature name</label>
          <input
            value={operatorSignatureName}
            onChange={(e) => setOperatorSignatureName(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginTop: 10, opacity: 0.72, fontSize: 13 }}>
        Signed off at: {initialSignedOffAt ? new Date(initialSignedOffAt).toLocaleString("en-GB") : "—"}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" onClick={save} disabled={saving} style={saveBtn}>
          {saving ? "Saving..." : "Save Sign-Off"}
        </button>
      </div>

      {msg ? <div style={msgStyle}>{msg}</div> : null}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.78,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
};

const msgStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  fontWeight: 700,
};
