"use client";

import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function OperatorSignOutButton() {
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button type="button" onClick={signOut} style={btnStyle}>
      Sign out
    </button>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};
