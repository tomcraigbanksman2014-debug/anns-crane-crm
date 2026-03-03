import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

function safeQ(q: string) {
  return q.trim().slice(0, 80);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = safeQ(url.searchParams.get("q") ?? "");
  if (!q) return NextResponse.json({ results: [] });

  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const like = `%${q}%`;

  const [clientsRes, equipmentRes, bookingsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, created_at")
      .or(`company_name.ilike.${like},contact_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(8),

    supabase
      .from("equipment")
      .select("id, name, asset_number, type, capacity, status, created_at")
      .or(`name.ilike.${like},asset_number.ilike.${like},type.ilike.${like},capacity.ilike.${like},status.ilike.${like}`)
      .limit(8),

    supabase
      .from("bookings")
      .select(`
        id, start_date, end_date, location, status, invoice_status, total_invoice,
        clients:client_id ( id, company_name, contact_name ),
        equipment:equipment_id ( id, name, asset_number, capacity )
      `)
      .or(`location.ilike.${like},status.ilike.${like},invoice_status.ilike.${like}`)
      .limit(8),
  ]);

  // Normalize into one list
  const results: Array<{
    type: "customer" | "equipment" | "booking";
    id: string;
    title: string;
    subtitle: string;
    href: string;
  }> = [];

  if (clientsRes.data) {
    for (const c of clientsRes.data) {
      results.push({
        type: "customer",
        id: c.id,
        title: c.company_name ?? "(No company)",
        subtitle: `${c.contact_name ?? "-"} • ${c.phone ?? "-"} • ${c.email ?? "-"}`,
        href: `/customers/${c.id}`,
      });
    }
  }

  if (equipmentRes.data) {
    for (const e of equipmentRes.data) {
      results.push({
        type: "equipment",
        id: e.id,
        title: e.name ?? "(No name)",
        subtitle: `${e.asset_number ?? "-"} • ${e.type ?? "-"} • ${e.capacity ?? "-"} • ${e.status ?? "-"}`,
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
        subtitle: `${client?.company_name ?? "-"} • ${eq?.name ?? "-"} • ${b.location ?? "-"}`,
        href: `/bookings/${b.id}`,
      });
    }
  }

  return NextResponse.json({ results });
}
