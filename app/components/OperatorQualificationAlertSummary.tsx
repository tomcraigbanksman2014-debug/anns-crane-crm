"use client";

import { useEffect, useState } from "react";

type AlertItem = {
  id: string;
  operator_id: string;
  operator_name: string;
  qualification_name: string;
  expiry_date: string | null;
};

type AlertPayload = {
  expired_count: number;
  expiring_soon_count: number;
  expired: AlertItem[];
  expiring_soon: AlertItem[];
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

export default function OperatorQualificationAlertSummary() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<AlertPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/operator-qualification-alerts", {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);

        if (!cancelled && res.ok) {
          setPayload(json);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={panelStyle}>
        <div style={{ fontWeight: 1000, fontSize: 18 }}>Operator qualifications</div>
        <div style={{ marginTop: 12, opacity: 0.68 }}>Loading qualification alerts...</div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div style={panelStyle}>
        <div style={{ fontWeight: 1000, fontSize: 18 }}>Operator qualifications</div>
        <div style={{ marginTop: 12, opacity: 0.68 }}>
          Could not load qualification alerts.
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 1000, fontSize: 18 }}>Operator qualifications</div>
      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
        Expiry monitoring for operator certifications and tickets.
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <a href="/operators" style={cardStyle("bad")}>
          <div style={smallTitle}>Expired</div>
          <div style={bigValue}>{payload.expired_count ?? 0}</div>
          <div style={smallHelp}>Qualifications already expired</div>
        </a>

        <a href="/operators" style={cardStyle("warn")}>
          <div style={smallTitle}>Expiring in 30 days</div>
          <div style={bigValue}>{payload.expiring_soon_count ?? 0}</div>
          <div style={smallHelp}>Review operator renewals soon</div>
        </a>

        <a href="/operators" style={cardStyle("neutral")}>
          <div style={smallTitle}>Open operators</div>
          <div style={{ marginTop: 8, fontSize: 18, fontWeight: 1000 }}>
            Manage qualifications
          </div>
          <div style={smallHelp}>Update tickets and expiry dates</div>
        </a>
      </div>

      {payload.expired_count > 0 ? (
        <div style={alertBoxBad}>
          <div style={{ fontWeight: 900 }}>
            ⚠ {payload.expired_count} operator qualification
            {payload.expired_count === 1 ? "" : "s"} expired.
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {payload.expired.map((item) => (
              <a
                key={item.id}
                href={`/operators/${item.operator_id}/qualifications`}
                style={rowLink}
              >
                <div style={{ fontWeight: 900 }}>
                  {item.operator_name} • {item.qualification_name}
                </div>
                <div style={{ fontSize: 13, opacity: 0.78 }}>
                  Expired: {fmtDate(item.expiry_date)}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {payload.expiring_soon_count > 0 ? (
        <div style={alertBoxWarn}>
          <div style={{ fontWeight: 900 }}>
            ⚠ {payload.expiring_soon_count} operator qualification
            {payload.expiring_soon_count === 1 ? "" : "s"} expiring soon.
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {payload.expiring_soon.map((item) => (
              <a
                key={item.id}
                href={`/operators/${item.operator_id}/qualifications`}
                style={rowLink}
              >
                <div style={{ fontWeight: 900 }}>
                  {item.operator_name} • {item.qualification_name}
                </div>
                <div style={{ fontSize: 13, opacity: 0.78 }}>
                  Expires: {fmtDate(item.expiry_date)}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 16,
  minWidth: 0,
};

function cardStyle(tone: "warn" | "bad" | "neutral"): React.CSSProperties {
  const tones: Record<string, React.CSSProperties> = {
    warn: {
      background: "rgba(255,170,0,0.14)",
      border: "1px solid rgba(255,170,0,0.24)",
    },
    bad: {
      background: "rgba(255,0,0,0.12)",
      border: "1px solid rgba(255,0,0,0.22)",
    },
    neutral: {
      background: "rgba(255,255,255,0.35)",
      border: "1px solid rgba(0,0,0,0.12)",
    },
  };

  return {
    display: "block",
    padding: 16,
    borderRadius: 14,
    textDecoration: "none",
    color: "#111",
    minWidth: 0,
    ...tones[tone],
  };
}

const smallTitle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 900,
};

const bigValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 30,
  fontWeight: 1000,
};

const smallHelp: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.8,
};

const alertBoxBad: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,0,0,0.12)",
  border: "1px solid rgba(255,0,0,0.22)",
};

const alertBoxWarn: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
};

const rowLink: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
};
