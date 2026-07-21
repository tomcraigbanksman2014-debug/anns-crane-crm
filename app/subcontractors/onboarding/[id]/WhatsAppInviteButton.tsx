"use client";

import { useState } from "react";

export default function WhatsAppInviteButton({ inviteId, whatsappUrl }: { inviteId: string; whatsappUrl: string }) {
  const [opening, setOpening] = useState(false);

  async function openWhatsApp() {
    setOpening(true);
    const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    try {
      await fetch(`/api/subcontractors/onboarding/${encodeURIComponent(inviteId)}/delivery-event`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp" }),
        keepalive: true,
      });
    } catch {
      // WhatsApp still opens if delivery tracking cannot be recorded.
    } finally {
      setOpening(false);
      if (!popup) window.location.href = whatsappUrl;
    }
  }

  return (
    <button type="button" onClick={openWhatsApp} disabled={opening} style={buttonStyle}>
      {opening ? "Opening WhatsApp…" : "Send by WhatsApp"}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  minHeight: 42,
  padding: "9px 13px",
  borderRadius: 10,
  border: "none",
  background: "#25D366",
  color: "#073b1b",
  fontWeight: 900,
  cursor: "pointer",
};
