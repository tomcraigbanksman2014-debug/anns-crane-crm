"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "./lib/supabase/browser";

type NavItem = {
  label: string;
  href: string;
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function matchesOperatorLogin(authEmail: string, operator: any) {
  const email = String(authEmail ?? "").trim().toLowerCase();
  const username = email.includes("@") ? email.split("@")[0] : email;
  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorEmailUsername = operatorEmail.includes("@")
    ? operatorEmail.split("@")[0]
    : operatorEmail;
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();

  return (
    (!!operatorEmail && operatorEmail === email) ||
    (!!operatorEmailUsername && operatorEmailUsername === username) ||
    (!!operatorName && operatorName === username)
  );
}

function normaliseRole(value: unknown): "admin" | "staff" | "operator" | "" {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "admin" || role === "staff" || role === "operator") {
    return role;
  }
  return "";
}

function isOperatorArea(pathname: string) {
  return pathname.startsWith("/operator");
}

function isOfficeOnlyPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/search")) return true;
  if (pathname.startsWith("/quotes")) return true;
  if (pathname.startsWith("/customers")) return true;
  if (pathname.startsWith("/jobs")) return true;
  if (pathname.startsWith("/transport-jobs")) return true;
  if (pathname.startsWith("/planner")) return true;
  if (pathname.startsWith("/weekly-planner")) return true;
  if (pathname.startsWith("/transport-planner")) return true;
  if (pathname.startsWith("/transport-map")) return true;
  if (pathname.startsWith("/purchase-orders")) return true;
  if (pathname.startsWith("/suppliers")) return true;
  if (pathname.startsWith("/cranes")) return true;
  if (pathname.startsWith("/vehicles")) return true;
  if (pathname.startsWith("/equipment")) return true;
  if (pathname.startsWith("/operators")) return true;
  if (pathname.startsWith("/timesheets")) return true;
  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "operator" | "">("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function applyViewport() {
      setIsMobile(window.innerWidth <= 900);
    }

    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function resolveRoleForUser(user: any) {
      const email = String(user.email ?? "").trim().toLowerCase();
      const usernameFromEmail = fromAuthEmail(user.email ?? null).toLowerCase();

      const masterAdminEmail = String(
        process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? ""
      )
        .trim()
        .toLowerCase();

      const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;
      let resolvedRole: "admin" | "staff" | "operator" | "" = isMaster
        ? "admin"
        : normaliseRole(user.user_metadata?.role);

      if (!isMaster && resolvedRole !== "admin") {
        const { data: operators } = await supabase
          .from("operators")
          .select("id, full_name, email, status")
          .eq("status", "active");

        const matchedOperator =
          (operators ?? []).find((op: any) => matchesOperatorLogin(email, op)) ?? null;

        if (matchedOperator) {
          resolvedRole = "operator";
        }
      }

      return {
        resolvedRole,
        usernameFromEmail,
      };
    }

    async function load() {
      const { data, error } = await supabase.auth.getUser();

      if (!mounted) return;

      const user = data.user;

      if (error || !user) {
        window.location.href = "/login";
        return;
      }

      const mustChangePassword = Boolean(
        (user.user_metadata as any)?.must_change_password === true
      );

      if (mustChangePassword && pathname !== "/change-password") {
        window.location.href = "/change-password";
        return;
      }

      const { resolvedRole, usernameFromEmail } = await resolveRoleForUser(user);

      if (!mounted) return;

      if (!mustChangePassword && pathname === "/change-password") {
        window.location.href = resolvedRole === "operator" ? "/operator/jobs" : "/";
        return;
      }

      setUsername(usernameFromEmail);
      setRole(resolvedRole);
      setLoading(false);

      if (resolvedRole === "operator") {
        if (isOfficeOnlyPath(pathname) && !isOperatorArea(pathname)) {
          window.location.href = "/operator/jobs";
          return;
        }
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (!session?.user) {
        window.location.href = "/login";
        return;
      }

      const mustChangePassword = Boolean(
        (session.user.user_metadata as any)?.must_change_password === true
      );

      if (mustChangePassword && pathname !== "/change-password") {
        window.location.href = "/change-password";
        return;
      }

      if (!mustChangePassword && pathname === "/change-password") {
        const { resolvedRole } = await resolveRoleForUser(session.user);
        if (!mounted) return;
        window.location.href = resolvedRole === "operator" ? "/operator/jobs" : "/";
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const officeNav = useMemo<NavItem[]>(
    () => [
      { label: "Dashboard", href: "/" },
      { label: "Search", href: "/search" },

      { label: "Quotes", href: "/quotes" },
      { label: "Customers", href: "/customers" },

      { label: "Jobs", href: "/jobs" },
      { label: "Transport Jobs", href: "/transport-jobs" },

      { label: "Crane Planner", href: "/planner" },
      { label: "Weekly Planner", href: "/weekly-planner" },
      { label: "Transport Planner", href: "/transport-planner" },
      { label: "Transport Map", href: "/transport-map" },

      { label: "Purchase Orders", href: "/purchase-orders" },
      { label: "Suppliers", href: "/suppliers" },

      { label: "Cranes", href: "/cranes" },
      { label: "Vehicles", href: "/vehicles" },
      { label: "Equipment", href: "/equipment" },
      { label: "Operators", href: "/operators" },
      { label: "Timesheets", href: "/timesheets" },

      { label: "My Jobs", href: "/operator/jobs" },

      { label: "Settings", href: "/settings" },
      { label: "Qualification Rules", href: "/admin/qualification-rules" },
      { label: "Staff Accounts", href: "/admin/users" },
      { label: "Audit Log", href: "/admin/audit" },
    ],
    []
  );

  const operatorNav = useMemo<NavItem[]>(
    () => [{ label: "My Jobs", href: "/operator/jobs" }],
    []
  );

  const nav = role === "operator" ? operatorNav : officeNav;
  const showOperatorMenuButton = role !== "operator";

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading...</div>
      </div>
    );
  }

  if (role === "operator") {
    return (
      <div style={pageStyle}>
        <main style={operatorMainStyle}>{children}</main>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {isMobile ? (
        <div style={mobileHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 auto" }}>
            <img src="/logo.png" alt="AnnS Crane Hire" style={mobileLogo} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>AnnS Crane CRM</div>
              <div style={{ opacity: 0.72, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{role || "user"}</div>
            </div>
          </div>

          {showOperatorMenuButton ? (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              style={menuBtn}
            >
              Menu
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={shellStyle}>
        {isMobile && menuOpen ? (
          <div onClick={() => setMenuOpen(false)} style={mobileBackdropStyle} />
        ) : null}

        <aside
          style={{
            ...sidebarStyle,
            ...(isMobile ? mobileSidebarStyle : desktopSidebarStyle),
            ...(isMobile && menuOpen ? mobileSidebarOpenStyle : {}),
          }}
        >
          <div style={brandBox}>
            <img src="/logo.png" alt="AnnS Crane Hire" style={logoStyle} />
          </div>

          <div style={userBox}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Signed in as</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{username || "user"}</div>
            <div style={{ opacity: 0.7 }}>{role || "—"}</div>
          </div>

          <div style={navScrollerStyle}>
            <nav style={{ display: "grid", gap: 8 }}>
              {nav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    style={{
                      ...navItemStyle,
                      ...(active ? navItemActive : {}),
                    }}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </div>

          <button onClick={signOut} style={signOutBtn}>
            Sign out
          </button>
        </aside>

        <main
          style={{
            ...mainStyle,
            ...(isMobile ? mobileMainStyle : {}),
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#dfeaf5",
  width: "100%",
  maxWidth: "100%",
  overflowX: "hidden",
};

const loadingPageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#dfeaf5",
  display: "grid",
  placeItems: "center",
};

const loadingCardStyle: React.CSSProperties = {
  padding: 24,
  borderRadius: 16,
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
};

const shellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 18,
  padding: 18,
  position: "relative",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflowX: "hidden",
};

const sidebarStyle: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  background: "#dfeaf5",
  border: "1px solid rgba(0,0,0,0.08)",
  padding: 16,
  boxSizing: "border-box",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  display: "grid",
  gridTemplateRows: "auto auto 1fr auto",
  gap: 14,
  overflow: "hidden",
  zIndex: 20,
};

const desktopSidebarStyle: React.CSSProperties = {
  position: "sticky",
  top: 18,
  maxHeight: "calc(100vh - 36px)",
  borderRadius: 18,
};

const mobileSidebarStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: "min(320px, 86vw)",
  minWidth: "min(320px, 86vw)",
  maxHeight: "100vh",
  borderRadius: 0,
  transform: "translateX(-105%)",
  transition: "transform 0.22s ease",
};

const mobileSidebarOpenStyle: React.CSSProperties = {
  transform: "translateX(0)",
};

const mobileBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.28)",
  zIndex: 15,
};

const navScrollerStyle: React.CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  paddingRight: 4,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  maxWidth: "100%",
  overflowX: "hidden",
};

const mobileMainStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
};

const operatorMainStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "100vh",
  padding: 14,
  boxSizing: "border-box",
};

const brandBox: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  padding: 18,
  borderRadius: 14,
  background: "rgba(255,255,255,0.65)",
};

const logoStyle: React.CSSProperties = {
  width: 96,
  height: "auto",
  objectFit: "contain",
};

const userBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.65)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const navItemStyle: React.CSSProperties = {
  display: "block",
  padding: "12px 14px",
  borderRadius: 12,
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
};

const navItemActive: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(0,0,0,0.08)",
};

const signOutBtn: React.CSSProperties = {
  marginTop: 8,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 14,
  background: "rgba(255,255,255,0.65)",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  position: "sticky",
  top: 0,
  zIndex: 10,
  backdropFilter: "blur(8px)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflowX: "hidden",
};

const mobileLogo: React.CSSProperties = {
  width: 34,
  height: 34,
  objectFit: "contain",
};

const menuBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};
