import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const [{ data: operators, error: operatorsError }, { data: vehicles, error: vehiclesError }] =
      await Promise.all([
        supabase
          .from("operators")
          .select("id, full_name, status, archived")
          .eq("status", "active")
          .eq("archived", false)
          .order("full_name", { ascending: true }),

        supabase
          .from("vehicles")
          .select("id, name, reg_number, status, archived")
          .eq("archived", false)
          .order("name", { ascending: true }),
      ]);

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    if (vehiclesError) {
      return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
    }

    return NextResponse.json({
      operators: operators ?? [],
      vehicles: vehicles ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
