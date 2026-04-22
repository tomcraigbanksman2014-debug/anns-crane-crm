import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../../lib/audit";

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

async function deleteDocument(jobId: string, documentId: string, user: any) {
  const admin = getAdminClient();

  const { data: doc, error: docError } = await admin
    .from("job_documents")
    .select("id, job_id, file_name, file_path, document_type")
    .eq("id", documentId)
    .eq("job_id", jobId)
    .single();

  if (docError || !doc) {
    throw new Error("Document not found.");
  }

  const { error: storageError } = await admin.storage
    .from("job-documents")
    .remove([doc.file_path]);

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { error: deleteError } = await admin
    .from("job_documents")
    .delete()
    .eq("id", documentId)
    .eq("job_id", jobId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: user.email ? user.email.split("@")[0] : null,
    action: "job_document_deleted",
    entity_type: "job_document",
    entity_id: documentId,
    meta: {
      job_id: jobId,
      file_name: doc.file_name,
      file_path: doc.file_path,
      document_type: doc.document_type,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string; documentId: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const wantsJson = String(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json");

    await deleteDocument(params.id, params.documentId, user);

    if (wantsJson) {
      return NextResponse.json({ ok: true });
    }

    const redirectUrl = new URL(`/jobs/${params.id}/lift-plan?deleted=1`, req.url);
    return NextResponse.redirect(redirectUrl, 303);
  } catch (e: any) {
    const wantsJson = String(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
    if (wantsJson) {
      return NextResponse.json(
        { error: e?.message ?? "Could not delete document." },
        { status: 400 }
      );
    }

    const redirectUrl = new URL(`/jobs/${params.id}/lift-plan?delete_error=${encodeURIComponent(e?.message ?? "Could not delete document.")}`, req.url);
    return NextResponse.redirect(redirectUrl, 303);
  }
}
