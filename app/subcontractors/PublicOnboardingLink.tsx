"use client";

import { useMemo, useState } from "react";

export default function PublicOnboardingLink() {
  const [copied, setCopied] = useState(false);
  const link = useMemo(() => {
    if (typeof window === "undefined") return "/subcontractor-onboarding";
    return `${window.location.origin}/subcontractor-onboarding`;
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy the subcontractor onboarding link", link);
    }
  }

  const whatsappMessage = encodeURIComponent(
    `Apply to join the AnnS Crane Hire subcontractor network using this link: ${link}`
  );

  return (
    <div style={cardStyle}>
      <div>
        <div style={{ fontWeight: 950, fontSize: 17 }}>Single public onboarding link</div>
        <div style={{ marginTop: 4, opacity: 0.76, lineHeight: 1.45 }}>
          Share this same link in WhatsApp groups, messages or social media. Every applicant receives their own private application record.
        </div>
        <div style={linkStyle}>{link}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={copyLink} style={primaryButton}>
          {copied ? "Copied" : "Copy public link"}
        </button>
        <a
          href={`https://wa.me/?text=${whatsappMessage}`}
          target="_blank"
          rel="noreferrer"
          style={whatsappButton}
        >
          Share on WhatsApp
        </a>
        <a href="/subcontractor-onboarding" target="_blank" rel="noreferrer" style={secondaryButton}>
          Open form
        </a>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
  borderRadius: 14,
  background: "rgba(37,99,235,.09)",
  border: "1px solid rgba(37,99,235,.20)",
};

const linkStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "9px 11px",
  borderRadius: 9,
  background: "rgba(255,255,255,.76)",
  border: "1px solid rgba(0,0,0,.08)",
  fontSize: 13,
  fontWeight: 800,
  overflowWrap: "anywhere",
};

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const whatsappButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#166534",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
};

const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,.84)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,.10)",
};
