"use client";

import { useState } from "react";

export default function CopyInviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const input = document.getElementById("onboarding-link") as HTMLInputElement | null;
      input?.select();
      document.execCommand("copy");
      setCopied(true);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}>
      <input id="onboarding-link" value={link} readOnly style={inputStyle} />
      <button type="button" onClick={copy} style={buttonStyle}>{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}

const inputStyle: React.CSSProperties = { minWidth: 0, width: "100%", minHeight: 42, padding: "9px 11px", borderRadius: 10, border: "1px solid rgba(0,0,0,.14)", boxSizing: "border-box" };
const buttonStyle: React.CSSProperties = { minHeight: 42, padding: "9px 13px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
