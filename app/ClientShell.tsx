"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "./lib/supabase/browser";

function NavItem({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
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
  const [isOperatorLinked, setIsOperatorLinked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 900);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!mounted || !user) return;

      const email = String(user.email ?? "").trim().toLowerCase();
      const authUsername = email.includes("@") ? email.split("@")[0] : email;

      const masterAdminEmail = String(
        process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? ""
      )
        .trim()
        .toLowerCase();

      const isMaster =
        !!email && !!masterAdminEmail && email === masterAdminEmail;

      const nextRole = isMaster ? "admin" : ((user.user_metadata as any)?.role ?? "");
      setRole(nextRole);
      setUsername(authUsername || "user");

      if (isMaster || nextRole === "admin") {
        setIsOperatorLinked(false);
        return;
      }

      const { data: operators } = await supabase
        .from("operators")
        .select("id, full_name, email, status")
        .eq("status", "active");

      const match =
        (operators ?? []).find((op: any) => {
          const operatorEmail = String(op.email ?? "").trim().toLowerCase();
          const operatorName = String(op.full_name ?? "").trim().toLowerCase();

          return (
            operatorEmail === email ||
            operatorName === authUsername ||
            (!!authUsername && operatorEmail.startsWith(`${authUsername}@`))
          );
        }) ?? null;

      if (!mounted) return;
      setIsOperatorLinked(!!match);
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
          minHeight: "100dvh",
          width: "100%",
          background:
            "linear-gradient(135deg, rgba(235,245,255,1) 0%, rgba(225,238,255,1) 45%, rgba(243,247,255,1) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: "100%", maxWidth: 1280 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <img
              src="/logo.png"
              alt="AnnS Crane Hire"
              style={{
                maxWidth: 220,
                width: "100%",
                height: "auto",
                objectFit: "contain",
              }}
            />
          </div>
          {children}
        </div>
      </div>
    );
  }

  const operatorOnly = isOperatorLinked && role !== "admin";

  const navItems = useMemo(() => {
    if (operatorOnly) {
      return [
        {
          href: "/operator/jobs",
          label: "My Jobs",
          active: pathname?.startsWith("/operator/jobs") ?? false,
        },
      ];
    }

    const items = [
      { href: "/dashboard", label: "Dashboard", active: pathname === "/dashboard" },
      { href: "/bookings", label: "Bookings", active: pathname?.startsWith("/bookings") ?? false },
      { href: "/jobs", label: "Jobs", active: pathname?.startsWith("/jobs") ?? false },
      { href: "/timesheets", label: "Timesheets", active: pathname?.startsWith("/timesheets") ?? false },
      { href: "/operator/jobs", label: "My Jobs", active: pathname?.startsWith("/operator/jobs") ?? false },
      { href: "/quotes", label: "Quotes", active: pathname?.startsWith("/quotes") ?? false },
      { href: "/customers", label: "Customers", active: pathname?.startsWith("/customers") ?? false },
      { href: "/equipment", label: "Equipment", active: pathname?.startsWith("/equipment") ?? false },
      { href: "/calendar", label: "Calendar", active: pathname?.startsWith("/calendar") ?? false },
      { href: "/planner", label: "Planner", active: pathname?.startsWith("/planner") ?? false },
      { href: "/settings", label: "Settings", active: pathname?.startsWith("/settings") ?? false },
    ];

    if (role === "admin") {
      items.push(
        { href: "/admin/users", label: "Staff Accounts", active: pathname?.startsWith("/admin/users") ?? false },
        { href: "/admin/audit", label: "Audit Log", active: pathname?.startsWith("/admin/audit") ?? false }
      );
    }

    return items;
  }, [operatorOnly, pathname, role]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        background:
          "linear-gradient(135deg, rgba(235,245,255,1) 0%, rgba(225,238,255,1) 45%, rgba(243,247,255,1) 100%)",
        overflowX: "hidden",
      }}
    >
      {isMobile ? (
        <>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
              padding: 12,
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(235,245,255,0.96)",
              backdropFilter: "blur(10px)",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <img
                src="/logo.png"
                alt="AnnS Crane Hire"
                style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.1 }}>
                  AnnS Crane CRM
                </div>
                <div style={{ fontSize: 12, opacity: 0.72 }}>
                  {operatorOnly ? "operator" : role || "staff"}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.10)",
                background: "rgba(255,255,255,0.75)",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Menu
            </button>
          </div>

          {mobileMenuOpen && (
            <>
              <div
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 80,
                  background: "rgba(0,0,0,0.28)",
                }}
              />
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: "86vw",
                  maxWidth: 320,
                  zIndex: 90,
                  background: "rgba(240,247,255,0.98)",
                  backdropFilter: "blur(10px)",
                  borderRight: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                  padding: 16,
                  overflowY: "auto",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <img
                    src="/logo.png"
                    alt="AnnS Crane Hire"
                    style={{
                      width: "100%",
                      maxWidth: 140,
                      height: "auto",
                      objectFit: "contain",
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Signed in as</div>
                  <div style={{ fontWeight: 900, marginTop: 4 }}>{username || "User"}</div>
                  <div style={{ fontSize: 12, opacity: 0.72, marginTop: 2 }}>
                    {operatorOnly ? "operator" : role || "staff"}
                  </div>
                </div>

                <nav style={{ display: "grid", gap: 8 }}>
                  {navItems.map((item) => (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={item.active}
                      onClick={() => setMobileMenuOpen(false)}
                    />
                  ))}
                </nav>

                <button
                  onClick={signOut}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.10)",
                    background: "rgba(255,255,255,0.85)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}

          <main style={{ width: "100%", minWidth: 0, padding: 12 }}>{children}</main>
        </>
      ) : (
        <div
          style={{
            width: "min(1440px, 98vw)",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "280px minmax(0, 1fr)",
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
                style={{
                  width: "100%",
                  maxWidth: 180,
                  height: "auto",
                  objectFit: "contain",
                }}
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
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 2 }}>
                {operatorOnly ? "operator" : role || "staff"}
              </div>
            </div>

            <nav style={{ display: "grid", gap: 8 }}>
              {navItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={item.active}
                />
              ))}
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

          <main style={{ minWidth: 0 }}>{children}</main>
        </div>
      )}
    </div>
  );
}
