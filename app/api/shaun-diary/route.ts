import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { getAccessContext } from "../../lib/access";
import { cleanDiaryPayload } from "../../lib/shaunDiary";

export const dynamic = "force-dynamic";

async function requireOffice() {
  const access = await getAccessContext();
  if (!access.user || (access.role !== "admin" && access.role !== "staff")) return null;
  return access;
}

export async function GET(req: NextRequest) {
  const access = await requireOffice();
  if (!access) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const admin = createSupabaseAdminClient();
  let query = admin.from("shaun_diary_entries").select("*").order("start_at", { ascending: true });
  if (start) query = query.gte("end_at", start);
  if (end) query = query.lte("start_at", end);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const access = await requireOffice();
  if (!access) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const payload = cleanDiaryPayload(await req.json());
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("shaun_diary_entries")
      .insert({ ...payload, created_by: access.user.id, created_by_email: access.user.email ?? null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to create diary entry." }, { status: 400 });
  }
}
