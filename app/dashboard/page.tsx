import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type SearchItem =
  | { type: "customer"; id: string; title: string; subtitle: string; href: string }
  | { type: "equipment"; id: string; title: string; subtitle: string; href: string }
  | { type: "booking"; id: string; title: string; subtitle: string; href: string }
  | { type: "audit"; id: string; title: string; subtitle: string; href: string };

function safeQ(q: string) {
  return q.trim().slice(0, 120);
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = safeQ(url.searchParams.get("q") ?? "");
  if (!q) return NextResponse.json({ results: [] });

  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const like = `%${q}%`;
  const uuid = isUuid(q) ? q : null;

  const [clientsRes, equipmentRes, bookingsRes, auditRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, notes, created_at")
      .or(
        [
          uuid ? `id.eq.${uuid}` : null,
          `company_name.ilike.${like}`,
          `contact_name.ilike.${like}`,
          `phone.ilike.${like}`,
          `email.ilike.${like}`,
          `notes.ilike.${like}`,
        ]
          .filter(Boolean)
          .join(",")
      )
      .limit(10),

    supabase
      .from("equipment")
      .select("id, name, asset_number, type, capacity, status, notes, created_at")
      .or(
        [
          uuid ? `id.eq.${uuid}` : null,
          `name.ilike.${like}`,
          `asset_number.ilike.${like}`,
          `type.ilike.${like}`,
          `capacity.ilike.${like}`,
          `status.ilike.${like}`,
          `notes.ilike.${like}`,
        ]
          .filter(Boolean)
          .join(",")
      )
      .limit(10),

    supabase
      .from("bookings")
      .select(`
        id, start_date, end_date, location, status, invoice_status, total_invoice, hire_price,
        clients:client_id ( id, company_name, contact_name, phone, email ),
        equipment:equipment_id ( id, name, asset_number, type, capacity )
      `)
      .or(
        [
          uuid ? `id.eq.${uuid}` : null,
          `location.ilike.${like}`,
          `status.ilike.${like}`,
          `invoice_status.ilike.${like}`,
        ]
          .filter(Boolean)
          .join(",")
      )
      .order("start_date", { ascending: false })
      .limit(10),

    supabase
      .from("audit_log")
      .select("id, action, entity_type, entity_id, meta, created_at")
      .or(
        [
          uuid ? `id.eq.${uuid}` : null,
          uuid ? `entity_id.eq.${uuid}` : null,
          `action.ilike.${like}`,
          `entity_type.ilike.${like}`,
          `meta::text.ilike.${like}`,
        ]
          .filter(Boolean)
          .join(",")
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const results: SearchItem[] = [];

  if (clientsRes.data) {
    for (const c of clientsRes.data as any[]) {
      results.push({
        type: "customer",
        id: c.id,
        title: c.company_name ?? "(No company)",
        subtitle: `${c.contact_name ?? "-"} • ${c.phone ?? "-"} • ${c.email ?? "-"}${c.notes ? " • notes" : ""}`,
        href: `/customers/${c.id}`,
      });
    }
  }

  if (equipmentRes.data) {
    for (const e of equipmentRes.data as any[]) {
      results.push({
        type: "equipment",
        id: e.id,
        title: e.name ?? "(No name)",
        subtitle: `${e.asset_number ?? "-"} • ${e.type ?? "-"} • ${e.capacity ?? "-"} • ${e.status ?? "-"}${
          e.notes ? " • notes" : ""
        }`,
        href: `/equipment/${e.id}`,
      });
    }
  }

  if (bookingsRes.data) {
    for (const b of bookingsRes.data as any[]) {
      const client = b.clients?.[0];
      const eq = b.equipment?.[0];
      results.push({
        type: "booking",
        id: b.id,
        title: `${b.start_date} → ${b.end_date} • ${b.status ?? "-"}`,
        subtitle: `${client?.company_name ?? "-"} • ${eq?.name ?? "-"} • ${b.location ?? "-"} • ${b.invoice_status ?? "-"}`,
        href: `/bookings/${b.id}`,
      });
    }
  }

  if (auditRes.data) {
    for (const a of auditRes.data as any[]) {
      const metaText = a.meta ? JSON.stringify(a.meta) : "";
      results.push({
        type: "audit",
        id: a.id,
        title: `${a.action} • ${a.entity_type}`,
        subtitle: `${a.created_at}${a.entity_id ? ` • ${a.entity_id}` : ""}${metaText ? ` • ${metaText.slice(0, 80)}…` : ""}`,
        href: `/admin/audit`,
      });
    }
  }

  return NextResponse.json({ results });
}
