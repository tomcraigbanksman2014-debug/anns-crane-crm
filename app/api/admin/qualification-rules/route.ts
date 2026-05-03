import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { requireAdminApi } from "../../../lib/routeGuards";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseUnit(value: unknown) {
  const unit = clean(value).toLowerCase();
  if (unit === "days" || unit === "months" || unit === "years") return unit;
  return null;
}

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("operator_required_qualifications")
      .select("*")
      .order("role", { ascending: true })
      .order("qualification_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rules: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load qualification rules." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    const supabase = createSupabaseServerClient();

    const body = await req.json().catch(() => null);

    const role = clean(body?.role);
    const qualificationName = clean(body?.qualification_name);
    const validityUnit = normaliseUnit(body?.validity_unit);
    const validityValueRaw = Number(body?.validity_value ?? 0);
    const warningDaysRaw = Number(body?.warning_days ?? 30);
    const isActive = body?.is_active !== false;

    if (!role || !qualificationName) {
      return NextResponse.json(
        { error: "Role and qualification name are required." },
        { status: 400 }
      );
    }

    const payload = {
      role,
      qualification_name: qualificationName,
      validity_value: Number.isFinite(validityValueRaw) && validityValueRaw > 0 ? validityValueRaw : null,
      validity_unit: validityUnit,
      warning_days: Number.isFinite(warningDaysRaw) && warningDaysRaw >= 0 ? warningDaysRaw : 30,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("operator_required_qualifications")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create qualification rule." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    const supabase = createSupabaseServerClient();

    const body = await req.json().catch(() => null);

    const ruleId = clean(body?.id);
    const role = clean(body?.role);
    const qualificationName = clean(body?.qualification_name);
    const validityUnit = normaliseUnit(body?.validity_unit);
    const validityValueRaw = Number(body?.validity_value ?? 0);
    const warningDaysRaw = Number(body?.warning_days ?? 30);
    const isActive = body?.is_active !== false;

    if (!ruleId || !role || !qualificationName) {
      return NextResponse.json(
        { error: "Rule id, role and qualification name are required." },
        { status: 400 }
      );
    }

    const payload = {
      role,
      qualification_name: qualificationName,
      validity_value: Number.isFinite(validityValueRaw) && validityValueRaw > 0 ? validityValueRaw : null,
      validity_unit: validityUnit,
      warning_days: Number.isFinite(warningDaysRaw) && warningDaysRaw >= 0 ? warningDaysRaw : 30,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("operator_required_qualifications")
      .update(payload)
      .eq("id", ruleId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update qualification rule." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    const supabase = createSupabaseServerClient();

    const body = await req.json().catch(() => null);
    const ruleId = clean(body?.id);

    if (!ruleId) {
      return NextResponse.json({ error: "Rule id is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("operator_required_qualifications")
      .delete()
      .eq("id", ruleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not delete qualification rule." },
      { status: 500 }
    );
  }
}
