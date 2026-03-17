"use client";

import { useEffect, useState } from "react";

export default function OperatorComplianceAlerts() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/operator-compliance", { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!cancelled) {
        setData(json);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  if (data.count === 0) {
    return (
      <div style={okBox}>
        ✅ All operators compliant
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 900 }}>
        ⚠ Operator compliance issues ({data.count})
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {data.operators.slice(0, 8).map((o: any) => (
          <a
            key={o.operator_id}
            href={`/operators/${o.operator_id}/qualifications`}
            style={row}
          >
            <div>
              <b>{o.operator_name}</b> ({o.role || "No role"})
            </div>

            <div style={{ fontSize: 13 }}>
              {o.missing > 0 ? `Missing: ${o.missing}` : ""}
              {o.missing > 0 && (o.expired > 0 || o.expiring > 0) ? " • " : ""}
              {o.expired > 0 ? `Expired: ${o.expired}` : ""}
              {o.expired > 0 && o.expiring > 0 ? " • " : ""}
              {o.expiring > 0 ? `Expiring: ${o.expiring}` : ""}
            </div>

            {Array.isArray(o.missingList) && o.missingList.length > 0 ? (
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                Missing items: {o.missingList.join(", ")}
              </div>
            ) : null}
          </a>
        ))}
      </div>
    </div>
  );
}

const okBox: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.20)",
  fontWeight: 900,
};

const box: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.20)",
};

const row: React.CSSProperties = {
  display: "block",
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.5)",
  textDecoration: "none",
  color: "#111",
};
