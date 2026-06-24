"use client";

import { useEffect, useState, type CSSProperties } from "react";

type SuggestionPayload = {
  customer?: { company_name?: string | null } | null;
  has_crane_history?: boolean;
  has_transport_history?: boolean;
  job?: Record<string, string | null | undefined>;
  transport?: Record<string, string | null | undefined>;
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function setFieldValue(form: HTMLFormElement | null, name: string, value: string) {
  if (!form || !name || !value) return false;

  const field = form.elements.namedItem(name);
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return false;
}

const JOB_LABELS: Record<string, string> = {
  contact_name: "usual site contact",
  contact_phone: "usual site phone",
  invoice_email: "usual invoice email",
  site_address: "usual site address",
  site_name: "usual site name",
  hire_type: "usual CPA / contract preference",
  lift_type: "usual lift type",
  primary_equipment_selection: "usual crane",
  price_mode: "usual pricing mode",
  price_per_day: "usual day rate",
  notes: "usual notes",
};

const TRANSPORT_LABELS: Record<string, string> = {
  collection_contact_name: "usual pickup / site contact",
  collection_contact_phone: "usual pickup / site number",
  delivery_contact_name: "usual delivery contact",
  delivery_contact_phone: "usual delivery number",
  invoice_email: "usual invoice email",
  collection_address: "usual collection address",
  delivery_address: "usual delivery address",
  vehicle_id: "usual vehicle",
  price_mode: "usual pricing mode",
  price_per_day: "usual day rate",
  notes: "usual notes",
  service_type: "usual service type",
};

export default function SmartCustomerSuggestions({
  customerFieldId = "client_id",
  kind = "job",
}: {
  customerFieldId?: string;
  kind?: "job" | "transport";
}) {
  const [customerId, setCustomerId] = useState("");
  const [payload, setPayload] = useState<SuggestionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const element = document.getElementById(customerFieldId) as HTMLSelectElement | HTMLInputElement | null;
    if (!element) return;

    function update() {
      const next = clean(element?.value);
      setCustomerId(next === "other" ? "" : next);
      setPayload(null);
      setMessage("");
    }

    update();
    element.addEventListener("change", update);
    element.addEventListener("input", update);

    return () => {
      element.removeEventListener("change", update);
      element.removeEventListener("input", update);
    };
  }, [customerFieldId]);

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/customers/${encodeURIComponent(customerId)}/smart-defaults`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Could not load smart suggestions.");
        if (!cancelled) setPayload(json);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error?.message || "Could not load smart suggestions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!customerId) return null;

  const group = kind === "transport" ? payload?.transport : payload?.job;
  const labels = kind === "transport" ? TRANSPORT_LABELS : JOB_LABELS;
  const entries = Object.entries(group ?? {}).filter(([, value]) => clean(value));

  function applyOne(key: string, value: string) {
    const form = document.getElementById(customerFieldId)?.closest("form") as HTMLFormElement | null;
    const applied = setFieldValue(form, key, value);
    setMessage(applied ? `Applied ${labels[key] ?? key}.` : `Suggestion found, but this form field is not on this page.`);
  }

  function applyAll() {
    const form = document.getElementById(customerFieldId)?.closest("form") as HTMLFormElement | null;
    let appliedCount = 0;

    for (const [key, value] of entries) {
      if (setFieldValue(form, key, clean(value))) appliedCount += 1;
    }

    setMessage(appliedCount ? `Applied ${appliedCount} smart suggestion${appliedCount === 1 ? "" : "s"}.` : "No matching form fields were found.");
  }

  return (
    <section style={panelStyle}>
      <div style={topLine}>
        <div>
          <div style={titleStyle}>Smart customer suggestions</div>
          <div style={helpStyle}>
            {loading
              ? "Checking this customer’s previous jobs..."
              : entries.length
                ? `Based on previous ${kind === "transport" ? "transport" : "crane"} jobs for ${payload?.customer?.company_name ?? "this customer"}.`
                : "No previous matching suggestions found yet."}
          </div>
        </div>
        {entries.length ? (
          <button type="button" onClick={applyAll} style={applyAllBtn}>Apply all</button>
        ) : null}
      </div>

      {entries.length ? (
        <div style={suggestionGrid}>
          {entries.map(([key, value]) => (
            <button key={key} type="button" onClick={() => applyOne(key, clean(value))} style={suggestionBtn}>
              <span style={suggestionLabel}>{labels[key] ?? key.replace(/_/g, " ")}</span>
              <span style={suggestionValue}>{clean(value)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {message ? <div style={messageStyle}>{message}</div> : null}
    </section>
  );
}

const panelStyle: CSSProperties = {
  border: "1px solid #dbeafe",
  borderRadius: 16,
  background: "#eff6ff",
  padding: 14,
  display: "grid",
  gap: 12,
};

const topLine: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
};

const helpStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#334155",
};

const suggestionGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

const suggestionBtn: CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 12,
  background: "#ffffff",
  padding: "10px 12px",
  textAlign: "left",
  cursor: "pointer",
};

const suggestionLabel: CSSProperties = {
  display: "block",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#1d4ed8",
  fontWeight: 900,
};

const suggestionValue: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "#0f172a",
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const applyAllBtn: CSSProperties = {
  border: "1px solid #1d4ed8",
  borderRadius: 12,
  background: "#1d4ed8",
  color: "#fff",
  padding: "9px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const messageStyle: CSSProperties = {
  fontSize: 13,
  color: "#1e3a8a",
  fontWeight: 800,
};
