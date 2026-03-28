import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function clean(v: any) {
  const s = String(v ?? "").trim();
  return s || null;
}

function numOrNull(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function matchesOperatorLogin(authEmail: string, operator: any) {
  const email = String(authEmail ?? "").trim().toLowerCase();
  const username = email.includes("@") ? email.split("@")[0] : email;
  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorEmailUsername = operatorEmail.includes("@")
    ? operatorEmail.split("@")[0]
    : operatorEmail;
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();

  return (
    (!!operatorEmail && operatorEmail === email) ||
    (!!operatorEmailUsername && operatorEmailUsername === username) ||
    (!!operatorName && operatorName === username)
  );
}

async function resolveOperator() {
  const sessionClient = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser();

  if (userError || !user) {
    return { admin, user: null, operator: null, error: "Not signed in" };
  }

  const authEmail = String(user.email ?? "").trim().toLowerCase();

  const { data: operators, error: operatorsError } = await admin
    .from("operators")
    .select("id, full_name, email, status")
    .eq("status", "active");

  if (operatorsError) {
    return { admin, user, operator: null, error: operatorsError.message };
  }

  const operator =
    (operators ?? []).find((op: any) => matchesOperatorLogin(authEmail, op)) ??
    null;

  if (!operator) {
    return {
      admin,
      user,
      operator: null,
      error: "No operator record linked to this login.",
    };
  }

  return { admin, user, operator, error: null };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { admin, operator, error } = await resolveOperator();

    if (error || !operator) {
      return NextResponse.json(
        { error: error ?? "Not signed in" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const endLat = numOrNull(body?.end_lat);
    const endLng = numOrNull(body?.end_lng);
    const endAccuracy = numOrNull(body?.end_accuracy);
    const endSiteText = clean(body?.end_site_text);
    const endJobId = clean(body?.end_job_id);
    const endTransportJobId = clean(body?.end_transport_job_id);
    const endPhotoData = clean(body?.end_photo_data);
    const endSignatureData = clean(body?.end_signature_data);
    const endIssueType = clean(body?.end_issue_type);
    const endIssueNotes = clean(body?.end_issue_notes);

    if (endLat == null || endLng == null) {
      return NextResponse.json(
        { error: "End location is required." },
        { status: 400 }
      );
    }

    if (!endSiteText) {
      return NextResponse.json(
        { error: "End site is required." },
        { status: 400 }
      );
    }

    if (!endPhotoData) {
      return NextResponse.json(
        { error: "End photo is required." },
        { status: 400 }
      );
    }

    if (!endSignatureData) {
      return NextResponse.json(
        { error: "End signature is required." },
        { status: 400 }
      );
    }

    const allowedIssues = ["no_issues", "delay", "safety_issue", "damage", "other"];

    if (!allowedIssues.includes(String(endIssueType ?? ""))) {
      return NextResponse.json(
        { error: "Select an end of shift outcome." },
        { status: 400 }
      );
    }

    if (endIssueType === "other" && !endIssueNotes) {
      return NextResponse.json(
        { error: "Enter details for Other." },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await admin
      .from("operator_shift_sessions")
      .select("id, operator_id, status")
      .eq("id", params.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: existingError?.message ?? "Shift not found." },
        { status: 404 }
      );
    }

    if (String(existing.operator_id) !== String(operator.id)) {
      return NextResponse.json(
        { error: "This shift does not belong to you." },
        { status: 403 }
      );
    }

    if (String(existing.status) !== "started") {
      return NextResponse.json(
        { error: "Shift already ended." },
        { status: 400 }
      );
    }

    const { error: updateError } = await admin
      .from("operator_shift_sessions")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        end_lat: endLat,
        end_lng: endLng,
        end_accuracy: endAccuracy,
        end_site_text: endSiteText,
        end_job_id: endJobId,
        end_transport_job_id: endTransportJobId,
        end_photo_data: endPhotoData,
        end_signature_data: endSignatureData,
        end_issue_type: endIssueType,
        end_issue_notes: endIssueNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not end shift." },
      { status: 500 }
    );
  }
}
