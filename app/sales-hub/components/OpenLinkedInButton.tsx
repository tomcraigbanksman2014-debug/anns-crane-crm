"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

export default function OpenLinkedInButton({
  text,
  label = "Copy full post & open LinkedIn",
}: {
  text: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    try {
      window.open("https://www.linkedin.com/feed/", "_blank", "noopener,noreferrer");
    } finally {
      window.setTimeout(() => setBusy(false), 600);
    }
  }

  return (
    <button type="button" onClick={handleClick} style={buttonStyle} disabled={busy}>
      {busy ? "Opening LinkedIn…" : label}
    </button>
  );
}

const buttonStyle: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};
