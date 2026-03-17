import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import {
  compareQualificationExpiryAsc,
  getQualificationStatus,
} from "../../lib/utils/qualificationStatus";

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get("days") ?? 30);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 180)) : 30;

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
          email,
          status,
          archived
        )
      `)
      .order("expiry_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (data ?? [])
      .filter((row: any) => {
        const operator = asArray(row.operators)[0];
        if (!operator) return false;
        if (String(operator.status ?? "").toLowerCase() !== "active") return false;
        if (operator.archived === true) return false;

        const status = getQualificationStatus(row.expiry_date, days);
        return status === "expiring";
      })
      .sort(compareQualificationExpiryAsc);

    const grouped = rows.reduce((acc: Record<string, any>, row: any) => {
      const operator = asArray(row.operators)[0];
      const key = String(operator?.id ?? row.operator_id);

      if (!acc[key]) {
        acc[key] = {
          operator_id: operator?.id ?? row.operator_id,
          operator_name: operator?.full_name ?? "Operator",
          operator_email: operator?.email ?? null,
          qualifications: [],
        };
      }

      acc[key].qualifications.push({
        id: row.id,
        qualification_name: row.qualification_name ?? "Qualification",
        issuer: row.issuer ?? null,
        certificate_number: row.certificate_number ?? null,
        issue_date: row.issue_date ?? null,
        expiry_date: row.expiry_date ?? null,
        notes: row.notes ?? null,
      });

      return acc;
    }, {});

    return NextResponse.json({
      days,
      count: rows.length,
      operators: Object.values(grouped),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load qualification reminders." },
      { status: 500 }
    );
  }
}
