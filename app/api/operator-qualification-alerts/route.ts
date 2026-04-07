import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import {
  compareQualificationExpiryAsc,
  getQualificationStatus,
} from "../../lib/utils/qualificationStatus";

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function GET() {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

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

    const rows = (data ?? []).filter((row: any) => {
      const operator = asArray(row.operators)[0];
      if (!operator) return false;
      if (String(operator.status ?? "").toLowerCase() !== "active") return false;
      if (operator.archived === true) return false;
      return true;
    });

    const expired = rows
      .filter((row: any) => getQualificationStatus(row.expiry_date) === "expired")
      .sort(compareQualificationExpiryAsc);

    const expiringSoon = rows
      .filter((row: any) => getQualificationStatus(row.expiry_date) === "expiring")
      .sort(compareQualificationExpiryAsc);

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
