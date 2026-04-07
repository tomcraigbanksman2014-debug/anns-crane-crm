import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseStatus(value: unknown) {
  const status = clean(value).toLowerCase();
  if (["available", "on_hire", "maintenance", "inactive"].includes(status)) {
    return status;
  }
  return "available";
}

export async function GET() {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { data, error } = await supabase
      .from("cranes")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ cranes: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load cranes." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;
    const body = await req.json().catch(() => null);

    const name = clean(body?.name);
    const regNumber = clean(body?.reg_number) || null;
    const fleetNumber = clean(body?.fleet_number) || null;
    const make = clean(body?.make) || null;
    const model = clean(body?.model) || null;
    const capacity = clean(body?.capacity) || null;
    const status = normaliseStatus(body?.status);

    if (!name) {
      return NextResponse.json(
        { error: "Crane name is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cranes")
      .insert({
        name,
        reg_number: regNumber,
        fleet_number: fleetNumber,
        make,
        model,
        capacity,
        status,
        archived: false,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ crane: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create crane." },
      { status: 500 }
    );
  }
}
