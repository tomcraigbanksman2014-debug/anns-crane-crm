import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getComplianceSummary } from "../../lib/utils/qualificationCompliance";

export async function GET() {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const [{ data: operators }, { data: required }, { data: quals }] = await Promise.all([
      supabase
        .from("operators")
        .select("id, full_name, role, archived, status")
        .order("full_name", { ascending: true }),

      supabase
        .from("operator_required_qualifications")
        .select("*")
        .eq("is_active", true)
        .order("role", { ascending: true })
        .order("qualification_name", { ascending: true }),

      supabase
        .from("operator_qualifications")
        .select("operator_id, qualification_name, expiry_date"),
    ]);

    const result: any[] = [];

    for (const op of operators ?? []) {
      if (op.archived === true) continue;
      if (String(op.status ?? "").toLowerCase() !== "active") continue;

      const roleName = String(op.role ?? "").trim().toLowerCase();

      const requiredForRole =
        (required ?? [])
          .filter((r: any) => String(r.role ?? "").trim().toLowerCase() === roleName)
          .map((r: any) => r.qualification_name);

      const current = (quals ?? []).filter((q: any) => q.operator_id === op.id);

      const summary = getComplianceSummary(requiredForRole, current);

      if (summary.missing > 0 || summary.expired > 0 || summary.expiring > 0) {
        result.push({
          operator_id: op.id,
          operator_name: op.full_name,
          role: op.role,
          ...summary,
        });
      }
    }

    return NextResponse.json({
      count: result.length,
      operators: result,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load operator compliance." },
      { status: 500 }
    );
  }
}
