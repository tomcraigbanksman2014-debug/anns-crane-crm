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

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = createSupabaseBrowserClient();

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "operator" | "">("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      const email = String(user.email ?? "").toLowerCase();
      const masterAdminEmail = String(process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? "")
        .trim()
        .toLowerCase();

      const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;
      const userRole = isMaster
        ? "admin"
        : ((user.user_metadata?.role as "admin" | "staff" | "operator" | "") ?? "");

      setUsername(fromAuthEmail(user.email ?? null));
      setRole(userRole);
    }

    load();
  }, [supabase]);

  const officeNav = useMemo<NavItem[]>(
    () => [
      { label: "Dashboard", href: "/" },
      { label: "Bookings", href: "/bookings" },
      { label: "Jobs", href: "/jobs" },
      { label: "Timesheets", href: "/timesheets" },
      { label: "My Jobs", href: "/my-jobs" },
      { label: "Quotes", href: "/quotes" },
      { label: "Customers", href: "/customers" },
      { label: "Equipment", href: "/equipment" },
      { label: "Operators", href: "/operators" },
      { label: "Suppliers", href: "/suppliers" },
      { label: "Purchase Orders", href: "/purchase-orders" },
      { label: "Calendar", href: "/calendar" },
      { label: "Planner", href: "/planner" },
      { label: "Settings", href: "/settings" },
      { label: "Staff Accounts", href: "/admin/users" },
      { label: "Audit Log", href: "/admin/audit" },
    ],
    []
  );

  const operatorNav = useMemo<NavItem[]>(
    () => [
      { label: "My Jobs", href: "/my-jobs" },
      { label: "Timesheets", href: "/timesheets" },
      { label: "Settings", href: "/settings" },
    ],
    []
  );

  const nav = role === "operator" ? operatorNav : officeNav;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div style={pageStyle}>
      <div style={mobileHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo.png" alt="AnnS Crane Hire" style={mobileLogo} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 1000 }}>AnnS Crane CRM</div>
            <div style={{ opacity: 0.72 }}>{role || "user"}</div>
          </div>
        </div>

        <button type="button" onClick={() => setMenuOpen((v) => !v)} style={menuBtn}>
          Menu
        </button>
      </div>

      <div style={shellStyle}>
        <aside
          style={{
            ...sidebarStyle,
            ...(menuOpen ? mobileSidebarOpen : {}),
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

          <button onClick={signOut} style={signOutBtn}>
            Sign out
          </button>
        </aside>

        <main style={mainStyle}>{children}</main>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#dfeaf5",
};

const shellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 18,
  padding: 18,
};

const sidebarStyle: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(255,255,255,0.45)",
  borderRadius: 18,
  padding: 16,
  boxSizing: "border-box",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  display: "grid",
  gap: 14,
  position: "sticky",
  top: 18,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const brandBox: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  padding: 18,
  borderRadius: 14,
  background: "rgba(255,255,255,0.35)",
};

const logoStyle: React.CSSProperties = {
  width: 96,
  height: "auto",
  objectFit: "contain",
};

const userBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.35)",
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
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const signOutBtn: React.CSSProperties = {
  marginTop: 8,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.68)",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileHeader: React.CSSProperties = {
  display: "none",
  justifyContent: "space-between",
  alignItems: "center",
  padding: 14,
  background: "rgba(255,255,255,0.35)",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
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
  background: "rgba(255,255,255,0.72)",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileSidebarOpen: React.CSSProperties = {};

if (typeof window !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = `
    @media (max-width: 900px) {
      .__oai-mobile-header-fix { display:block; }
    }
  `;
}

const responsiveStyles = `
@media (max-width: 900px) {
  .oai-mobile-header {
    display: flex !important;
  }
}
`;
