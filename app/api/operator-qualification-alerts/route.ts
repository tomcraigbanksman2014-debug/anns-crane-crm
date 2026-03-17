import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("operator_qualifications")
      .select(`
        id,
        operator_id,
        qualification_name,
        issuer,
        certificate_number,
        issue_date,
        expiry_date,
        notes,
        operators:operator_id (
          id,
          full_name,
          status,
          archived
        )
      `)
      .order("expiry_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const today = new Date();
    const todayIso = toIsoDate(today);

    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);
    const soonIso = toIsoDate(soon);

    const rows = (data ?? []).filter((row: any) => {
      const operator = asArray(row.operators)[0];
      if (!operator) return false;
      if (String(operator.status ?? "").toLowerCase() !== "active") return false;
      if (operator.archived === true) return false;
      return true;
    });

    const expired = rows.filter((row: any) => {
      const expiry = String(row.expiry_date ?? "").trim();
      return !!expiry && expiry < todayIso;
    });

    const expiringSoon = rows.filter((row: any) => {
      const expiry = String(row.expiry_date ?? "").trim();
      return !!expiry && expiry >= todayIso && expiry <= soonIso;
    });

    return NextResponse.json({
      expired_count: expired.length,
      expiring_soon_count: expiringSoon.length,
      expired: expired.slice(0, 12).map((row: any) => {
        const operator = asArray(row.operators)[0];
        return {
          id: row.id,
          operator_id: row.operator_id,
          operator_name: operator?.full_name ?? "Operator",
          qualification_name: row.qualification_name ?? "Qualification",
          expiry_date: row.expiry_date ?? null,
        };
      }),
      expiring_soon: expiringSoon.slice(0, 12).map((row: any) => {
        const operator = asArray(row.operators)[0];
        return {
          id: row.id,
          operator_id: row.operator_id,
          operator_name: operator?.full_name ?? "Operator",
          qualification_name: row.qualification_name ?? "Qualification",
          expiry_date: row.expiry_date ?? null,
        };
      }),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load qualification alerts." },
      { status: 500 }
    );
  }
}
