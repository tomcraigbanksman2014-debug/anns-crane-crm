import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { getAccessContext } from "../../../lib/access";
import { cleanDiaryPayload } from "../../../lib/shaunDiary";

async function requireOffice() {
  const access = await getAccessContext();
  if (!access.user || (access.role !== "admin" && access.role !== "staff")) return null;
  return access;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireOffice();
  if (!access) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const payload = cleanDiaryPayload(await req.json());
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("shaun_diary_entries").update(payload).eq("id", params.id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ entry: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to update diary entry." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireOffice();
  if (!access) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shaun_diary_entries").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
