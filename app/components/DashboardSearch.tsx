"use client";

import { useEffect, useMemo, useState } from "react";

type Result = {
  type: "customer" | "job" | "transport" | "quote" | "booking" | "equipment" | "audit";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

function typePill(type: Result["type"]) {
  const map: Record<Result["type"], React.CSSProperties> = {
    customer: {
      background: "rgba(0,120,255,0.15)",
      border: "1px solid rgba(0,120,255,0.25)",
    },
    job: {
      background: "rgba(170,0,255,0.10)",
      border: "1px solid rgba(170,0,255,0.20)",
    },
    transport: {
      background: "rgba(0,180,120,0.15)",
      border: "1px solid rgba(0,180,120,0.25)",
    },
    quote: {
      background: "rgba(255,170,0,0.15)",
      border: "1px solid rgba(255,170,0,0.25)",
    },
    booking: {
      background: "rgba(255,140,0,0.15)",
      border: "1px solid rgba(255,140,0,0.25)",
    },
    equipment: {
      background: "rgba(120,120,120,0.12)",
      border: "1px solid rgba(120,120,120,0.20)",
    },
    audit: {
      background: "rgba(255,0,0,0.12)",
      border: "1px solid rgba(255,0,0,0.22)",
    },
  };
  return map[type];
}

export default function DashboardSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const trimmed = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    let t: any;

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&type=all&limit=8`
        );
        const data = await res.json();
        setResults(data?.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [trimmed]);

  return (
    <div style={{ position: "relative", width: "min(620px, 92vw)" }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers, jobs, transport, bookings, quotes, equipment…"
        style={inputStyle}
      />

      {open && (loading || results.length > 0 || trimmed) && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <span>{loading ? "Searching…" : `${results.length} result(s)`}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={closeBtn}
            >
              Close
            </button>
          </div>

          {!loading && trimmed && (
            <a
              href={`/search?q=${encodeURIComponent(trimmed)}&type=all`}
              style={viewAllLink}
            >
              Open full search results
            </a>
          )}

          {!loading && trimmed && results.length === 0 ? (
            <div style={emptyStyle}>No matches.</div>
          ) : null}

          {results.map((r) => (
            <a
              key={`${r.type}:${r.id}`}
              href={r.href}
              onClick={() => setOpen(false)}
              style={itemLink}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 999,
                    fontWeight: 900,
                    ...typePill(r.type),
                  }}
                >
                  {r.type.toUpperCase()}
                </span>
                <div style={{ fontWeight: 900 }}>{r.title}</div>
              </div>

              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                {r.subtitle}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.14)",
  outline: "none",
  background: "rgba(255,255,255,0.85)",
  fontSize: 15,
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  left: 0,
  right: 0,
  zIndex: 50,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
  overflow: "hidden",
};

const panelHeaderStyle: React.CSSProperties = {
  padding: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  opacity: 0.8,
  fontSize: 12,
};

const closeBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontWeight: 800,
};

const viewAllLink: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  borderTop: "1px solid rgba(0,0,0,0.06)",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  background: "rgba(255,255,255,0.55)",
};

const emptyStyle: React.CSSProperties = {
  padding: 12,
  opacity: 0.8,
};

const itemLink: React.CSSProperties = {
  display: "block",
  padding: "12px 12px",
  textDecoration: "none",
  color: "#111",
  borderTop: "1px solid rgba(0,0,0,0.06)",
};
