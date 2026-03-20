"use client";

import { useState } from "react";
import AddCorrespondenceForm from "./AddCorrespondenceForm";

type EntryType = "call" | "email" | "note";

type Props = {
  customerId: string;
  phone?: string | null;
  email?: string | null;
};

export default function CustomerQuickActions({
  customerId,
  phone,
  email,
}: Props) {
  const [selectedType, setSelectedType] = useState<EntryType>("note");
  const [selectedSubject, setSelectedSubject] = useState("Note");

  function choose(type: EntryType) {
    if (type === "call") {
      setSelectedType("call");
      setSelectedSubject("Phone call");
      return;
    }

    if (type === "email") {
      setSelectedType("email");
      setSelectedSubject("Email");
      return;
    }

    setSelectedType("note");
    setSelectedSubject("Note");
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={cardStyle}>
        <h2 style={sectionTitle}>Quick actions</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" onClick={() => choose("call")} style={actionBtnStyle}>
            📞 Call customer
          </button>

          {phone ? (
            <a href={`tel:${phone}`} style={linkBtnStyle}>
              Dial {phone}
            </a>
          ) : null}

          <button type="button" onClick={() => choose("email")} style={actionBtnStyle}>
            ✉ Email customer
          </button>

          {email ? (
            <a href={`mailto:${email}`} style={linkBtnStyle}>
              Open email to {email}
            </a>
          ) : null}

          <button type="button" onClick={() => choose("note")} style={actionBtnStyle}>
            📝 Add note
          </button>
        </div>
      </section>

      <AddCorrespondenceForm
        customerId={customerId}
        initialType={selectedType}
        initialSubject={selectedSubject}
      />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const actionBtnStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.55)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const linkBtnStyle: React.CSSProperties = {
  display: "block",
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.35)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 700,
};
