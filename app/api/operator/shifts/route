
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function clean(v: any) {
  const s = String(v ?? "").trim();
  return s || null;
}

function numOrNull(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safetyList(value: any) {
  return Array.isArray(value) ? value.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
}

function matchesOperatorLogin(authEmail: string, operator: any) {
  const email = String(authEmail ?? "").trim().toLowerCase();
  const username = email.includes("@") ? email.split("@")[0] : email;

  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorEmailUsername = operatorEmail.includes("@") ? operatorEmail.split("@")[0] : operatorEmail;
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();

  return (
    (!!operatorEmail && operatorEmail === email) ||
    (!!operatorEmailUsername && operatorEmailUsername === username) ||
    (!!operatorName && operatorName === username)
  );
}

async function resolveOperator() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase, user: null, operator: null, error: "Not signed in" };
  }

  const authEmail = String(user.email ?? "").trim().toLowerCase();
  const { data: operators, error: operatorsError } = await supabase
    .from("operators")
    .select("id, full_name, email, status")
    .eq("status", "active");

  if (operatorsError) {
    return { supabase, user, operator: null, error: operatorsError.message };
  }

  const operator = (operators ?? []).find((op: any) => matchesOperatorLogin(authEmail, op)) ?? null;
  if (!operator) {
    return { supabase, user, operator: null, error: "No operator record linked to this login." };
  }

  return { supabase, user, operator, error: null };
}

export async function POST(req: Request) {
  const { supabase, user, operator, error } = await resolveOperator();
  if (error || !user || !operator) {
    return NextResponse.json({ error: error ?? "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const startLat = numOrNull(body?.start_lat);
  const startLng = numOrNull(body?.start_lng);
  const startAccuracy = numOrNull(body?.start_accuracy);
  const startSiteText = clean(body?.start_site_text);
  const startJobId = clean(body?.start_job_id);
  const startTransportJobId = clean(body?.start_transport_job_id);
  const startPhotoData = clean(body?.start_photo_data);
  const startSignatureData = clean(body?.start_signature_data);
  const startSafety = safetyList(body?.start_safety);

  if (startLat == null || startLng == null) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }

  if (!startSiteText) {
    return NextResponse.json({ error: "Site is required." }, { status: 400 });
  }

  if (!startPhotoData) {
    return NextResponse.json({ error: "Start photo is required." }, { status: 400 });
  }

  if (!startSignatureData) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }

  if (startSafety.length < 3) {
    return NextResponse.json({ error: "Complete all safety checks first." }, { status: 400 });
  }

  const { data: active } = await supabase
    .from("operator_shift_sessions")
    .select("id")
    .eq("operator_id", operator.id)
    .eq("status", "started")
    .order("started_at", { ascending: false })
    .limit(1);

  if ((active ?? []).length > 0) {
    return NextResponse.json({ error: "A shift is already active." }, { status: 400 });
  }

  const { data: created, error: createError } = await supabase
    .from("operator_shift_sessions")
    .insert({
      operator_id: operator.id,
      user_id: user.id,
      status: "started",
      start_lat: startLat,
      start_lng: startLng,
      start_accuracy: startAccuracy,
      start_site_text: startSiteText,
      start_job_id: startJobId,
      start_transport_job_id: startTransportJobId,
      start_photo_data: startPhotoData,
      start_signature_data: startSignatureData,
      start_safety: startSafety,
      updated_at: new Date().toISOString(),
    })
    .select("id, started_at, start_site_text")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, shift: created });
}
