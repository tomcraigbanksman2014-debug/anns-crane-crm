import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getComplianceSummary } from "../../lib/utils/qualificationCompliance";

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: operators } = await supabase
    .from("operators")
    .select("id, full_name, role, archived, status");

  const { data: required } = await supabase
    .from("operator_required_qualifications")
    .select("*");

  const { data: quals } = await supabase
    .from("operator_qualifications")
    .select("operator_id, qualification_name, expiry_date");

  const result: any[] = [];

  for (const op of operators ?? []) {
    if (op.archived || op.status !== "active") continue;

    const requiredForRole =
      required
        ?.filter(r => r.role.toLowerCase() === String(op.role ?? "").toLowerCase())
        .map(r => r.qualification_name) ?? [];

    const current =
      quals?.filter(q => q.operator_id === op.id) ?? [];

    const summary = getComplianceSummary(requiredForRole, current);

    if (summary.missing > 0 || summary.expired > 0) {
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
}
