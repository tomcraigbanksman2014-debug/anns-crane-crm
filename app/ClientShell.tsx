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

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "operator" | "">("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data, error } = await supabase.auth.getUser();

      if (!mounted) return;

      const user = data.user;

      if (error || !user) {
        window.location.href = "/login";
        return;
      }

      const email = String(user.email ?? "").toLowerCase();
      const masterAdminEmail = String(
        process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? ""
      )
        .trim()
        .toLowerCase();

      const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;
      const userRole = isMaster
        ? "admin"
        : ((user.user_metadata?.role as "admin" | "staff" | "operator" | "") ?? "");

      setUsername(fromAuthEmail(user.email ?? null));
      setRole(userRole);
      setLoading(false);
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session?.user) {
        window.location.href = "/login";
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const officeNav = useMemo<NavItem[]>(
    () => [
      { label: "Dashboard", href: "/" },
      { label: "Bookings", href: "/bookings" },
      { label: "Jobs", href: "/jobs" },
      { label: "Timesheets", href: "/timesheets" },
      { label: "My Jobs", href: "/operator/jobs" },
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
      { label: "My Jobs", href: "/operator/jobs" },
      { label: "Timesheets", href: "/timesheets" },
      { label: "Settings", href: "/settings" },
    ],
    []
  );

  const nav = role
