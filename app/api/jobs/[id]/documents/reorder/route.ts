import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const documentIds = body?.document_ids;

    if (!isStringArray(documentIds)) {
      return NextResponse.json({ error: "No document order was provided." }, { status: 400 });
    }

    const uniqueDocumentIds = Array.from(new Set(documentIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueDocumentIds.length !== documentIds.length) {
      return NextResponse.json({ error: "The document order contains duplicate rows." }, { status: 400 });
    }

    if (uniqueDocumentIds.length === 0) {
      return NextResponse.json({ error: "No document order was provided." }, { status: 400 });
    }

    const { data: rows, error: rowsError } = await admin
      .from("job_documents")
      .select("id, job_id, file_name")
      .eq("job_id", params.id)
      .in("id", uniqueDocumentIds);

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 400 });
    }

    const foundIds = new Set((rows ?? []).map((row: any) => String(row.id)));
    const missingIds = uniqueDocumentIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json({ error: "One or more documents could not be found for this job." }, { status: 400 });
    }

    const baseTime = Date.now();
    for (let index = 0; index < uniqueDocumentIds.length; index += 1) {
      const { error: updateError } = await admin
        .from("job_documents")
        .update({ created_at: new Date(baseTime + index * 1000).toISOString() })
        .eq("job_id", params.id)
        .eq("id", uniqueDocumentIds[index]);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
    }

    try {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "job_document_order_updated",
        entity_type: "job_document",
        entity_id: params.id,
        meta: {
          job_id: params.id,
          document_ids: uniqueDocumentIds,
        },
      });
    } catch (auditError) {
      console.error("Could not write job document reorder audit log", auditError);
    }

    return NextResponse.json({ ok: true, count: uniqueDocumentIds.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save document order." },
      { status: 400 }
    );
  }
}
