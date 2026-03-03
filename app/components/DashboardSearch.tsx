"use client";

import { useEffect, useMemo, useState } from "react";

type Result = {
  type: "customer" | "equipment" | "booking";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

function typePill(type: Result["type"]) {
  const map: Record<string, React.CSSProperties> = {
    customer: { background: "rgba(0,120,255,0.15)", border: "1px solid rgba(0,120,255,0.25)" },
    equipment: { background: "rgba(0,180,120,0.15)", border: "1px solid rgba(0,180,120,0.25)" },
    booking: { background: "rgba(255,140,0,0.15)", border: "1px solid rgba(255,140,0,0.25)" },
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
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setResults(data?.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [trimmed]);

  return (
    <div style={{ position: "relative", width: "min(560px, 92vw)" }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers, bookings, equipment…"
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.14)",
          outline: "none",
          background: "rgba(255,255,255,0.85)",
          fontSize: 15,
        }}
      />

      {open && (loading || results.length > 0 || trimmed) && (
        <div
          style={{
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
          }}
        >
          <div style={{ padding: 10, display: "flex", justifyContent: "space-between", opacity: 0.8, fontSize: 12 }}>
            <span>{loading ? "Searching…" : `${results.length} result(s)`}</span>
            <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>
              Close
            </button>
          </div>

          {!loading && trimmed && results.length === 0 && (
            <div style={{ padding: 12, opacity: 0.8 }}>No matches.</div>
          )}

          {results.map((r) => (
            <a
              key={`${r.type}:${r.id}`}
              href={r.href}
              style={{
                display: "block",
                padding: "12px 12px",
                textDecoration: "none",
                color: "#111",
                borderTop: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, ...typePill(r.type) }}>
                  {r.type.toUpperCase()}
                </span>
                <div style={{ fontWeight: 900 }}>{r.title}</div>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>{r.subtitle}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
