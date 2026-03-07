import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  meta: any;
  created_at: string | null;
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function prettyMeta(meta: any) {
  if (!meta) return "—";
  try {
    const text = JSON.stringify(meta);
    return text.length > 160 ? text.slice(0, 160) + "…" : text;
  } catch {
    return "—";
  }
}

function actionTone(action: string | null): React.CSSProperties {
  const a = (action ?? "").toLowerCase();

  if (a === "create") {
    return {
      background: "rgba(0,180,120,0.12)",
      border: "1px solid rgba(0,180,120,0.24)",
      color: "#0b7a4b",
    };
  }

  if (a === "update" || a === "reset_password") {
    return {
      background: "rgba(0,120,255,0.12)",
      border: "1px solid rgba(0,120,255,0.24)",
      color: "#0b57d0",
    };
  }

  if (a === "delete") {
    return {
      background: "rgba(255,0,0,0.10)",
      border: "1px solid rgba(255,0,0,0.22)",
      color: "#b00020",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    border: "1px solid rgba(0,0,0,0.10)",
    color: "#111",
  };
}

function Pill
