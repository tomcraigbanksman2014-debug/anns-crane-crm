"use client";

import { useEffect, useState } from "react";

export default function OperatorComplianceAlerts() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/operator-compliance")
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return null;

  if (data.count === 0) {
    return (
      <div style={box}>
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
              <b>{o.operator_name}</b> ({o.role})
            </div>

            <div style={{ fontSize: 13 }}>
              {o.missing > 0 && `Missing: ${o.missing} `}
              {o.expired > 0 && `• Expired: ${o.expired}`}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

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
