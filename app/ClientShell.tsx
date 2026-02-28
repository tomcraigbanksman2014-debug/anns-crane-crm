"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // ✅ Prevent any "flash" while Next is hydrating the route
  if (!pathname) return null;

  // ✅ No shell on login (and also no shell on / just in case)
  const isAuthPage = pathname === "/login" || pathname === "/";

  const isActive = (href: string) => pathname === href;

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        gap: 16,
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRadius: 14,
          background: "#111827",
          color: "white",
          padding: 14,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 10 }}>
          <div style={{ fontSize: 14, opacity: 0.85 }}>Anns Crane CRM</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Office Control</div>
        </div>

        <nav style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <NavItem href="/dashboard" label="Dashboard" active={isActive("/dashboard")} />
          <NavItem href="/customers" label="Customers" active={isActive("/customers")} />
          <NavItem href="/bookings" label="Bookings" active={isActive("/bookings")} />
          <NavItem href="/equipment" label="Equipment" active={isActive("/equipment")} />
          <NavItem href="/calendar" label="Calendar" active={isActive("/calendar")} />
          <NavItem href="/settings" label="Settings" active={isActive("/settings")} />
        </nav>

        <div style={{ marginTop: "auto", padding: 10, opacity: 0.7, fontSize: 12 }}>
          v1 • Enterprise UI
        </div>
      </aside>

      {/* Main */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <header
          style={{
            borderRadius: 14,
            background: "rgba(255,255,255,0.65)",
            border: "1px solid rgba(0,0,0,0.06)",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {pathname === "/dashboard" ? "Dashboard" : "CRM"}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                height: 34,
                width: 34,
                borderRadius: 999,
                background: "#111827",
                opacity: 0.9,
              }}
              title="User"
            />
          </div>
        </header>

        {/* Content area */}
        <main
          style={{
            marginTop: 16,
            flex: 1,
            minHeight: 0,
            borderRadius: 14,
            background: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(0,0,0,0.06)",
            overflow: "auto",
            padding: 18,
            boxSizing: "border-box",
          }}
        >
          {children}
        </main>
      </section>
    </div>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: "white",
        padding: "10px 12px",
        borderRadius: 12,
        background: active ? "rgba(255,255,255,0.16)" : "transparent",
        border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 14,
      }}
    >
      <span
        style={{
          height: 10,
          width: 10,
          borderRadius: 999,
          background: active ? "#ffffff" : "rgba(255,255,255,0.35)",
        }}
      />
      {label}
    </Link>
  );
}
