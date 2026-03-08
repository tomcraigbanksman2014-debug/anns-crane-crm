"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "./lib/supabase/browser";

function NavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "12px 14px",
        borderRadius: 12,
        textDecoration: "none",
        fontWeight: 900,
        color: active ? "#111" : "rgba(17,17,17,0.82)",
        background: active ? "rgba(255,255,255,0.72)" : "transparent",
        border: active ? "1px solid rgba(0,0,0,0.08)" : "1px solid transparent",
      }}
    >
      {label}
    </Link>
  );
}

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = createSupabaseBrowserClient();

  const [role, setRole] = useState<string>("");
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!mounted || !user) return;

      setRole((user.user_metadata as any)?.role ?? "");
      setUsername(user.email ? user.email.split("@")[0] : "");
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const isLogin =
    pathname?.startsWith("/login") || pathname?.startsWith("/change-password");

  if (isLogin) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "linear-gradient(135deg, rgba(235,245,255,1) 0%, rgba(225,238,255,1) 45%, rgba(243,247,255,1) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 1280 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <img
              src="/logo.png"
              alt="AnnS Crane Hire"
              style={{ maxWidth: 260, width: "100%", height: "auto", objectFit: "contain" }}
            />
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(235,245,255,1) 0%, rgba(225,238,255,1) 45%, rgba(243,247,255,1) 100%)",
      }}
    >
      <div
        style={{
          width: "min(1440px, 98vw)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 18,
          padding: 18,
        }}
      >
        <aside
          style={{
            background: "rgba(255,255,255,0.22)",
            border: "1px solid rgba(255,255,255,0.45)",
            borderRadius: 18,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            padding: 18,
            alignSelf: "start",
            position: "sticky",
            top: 18,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <img
              src="/logo.png"
              alt="AnnS Crane Hire"
              style={{ width: "100%", maxWidth: 180, height: "auto", objectFit: "contain" }}
            />
          </div>

          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.45)",
              border: "1px solid rgba(0,0,0,0.08)",
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.72 }}>Signed in as</div>
            <div style={{ fontWeight: 900, marginTop: 4 }}>{username || "User"}</div>
            <div style={{ fontSize: 12, opacity: 0.72, marginTop: 2 }}>{role || "staff"}</div>
          </div>

          <nav style={{ display: "grid", gap: 8 }}>
            <NavItem href="/dashboard" label="Dashboard" active={pathname === "/dashboard"} />
            <NavItem href="/bookings" label="Bookings" active={pathname?.startsWith("/bookings") ?? false} />
            <NavItem href="/customers" label="Customers" active={pathname?.startsWith("/customers") ?? false} />
            <NavItem href="/equipment" label="Equipment" active={pathname?.startsWith("/equipment") ?? false} />
            <NavItem href="/calendar" label="Calendar" active={pathname?.startsWith("/calendar") ?? false} />
            <NavItem href="/planner" label="Planner" active={pathname?.startsWith("/planner") ?? false} />
            <NavItem href="/settings" label="Settings" active={pathname?.startsWith("/settings") ?? false} />
            {role === "admin" && (
              <>
                <NavItem
                  href="/admin/users"
                  label="Staff Accounts"
                  active={pathname?.startsWith("/admin/users") ?? false}
                />
                <NavItem
                  href="/admin/audit"
                  label="Audit Log"
                  active={pathname?.startsWith("/admin/audit") ?? false}
                />
              </>
            )}
          </nav>

          <button
            onClick={signOut}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(255,255,255,0.55)",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
