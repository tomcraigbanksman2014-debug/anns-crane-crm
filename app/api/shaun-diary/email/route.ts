import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { getAccessContext } from "../../../lib/access";
import { formatDiarySummary, type ShaunDiaryEntry } from "../../../lib/shaunDiary";
import { sendShaunDiaryEmail } from "../../../lib/shaunDiaryEmail";

export async function POST(req: NextRequest) {
  const access = await getAccessContext();
  if (!access.user || (access.role !== "admin" && access.role !== "staff")) return NextResponse.json({ error:"Unauthorised" }, { status:401 });
  try {
    const body = await req.json();
    const to = String(body?.to || "").trim();
    const start = new Date(String(body?.start || ""));
    const end = new Date(String(body?.end || ""));
    if (!to.includes("@") || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Recipient, start and end are required.");
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("shaun_diary_entries").select("*").gte("start_at", start.toISOString()).lt("start_at", end.toISOString()).order("start_at");
    if (error) throw new Error(error.message);
    const heading = `Shaun's diary: ${start.toLocaleDateString("en-GB")} to ${new Date(end.getTime()-1).toLocaleDateString("en-GB")}`;
    const summary = formatDiarySummary((data ?? []) as ShaunDiaryEntry[], heading);
    await sendShaunDiaryEmail({ admin, to, subject: heading, summary });
    return NextResponse.json({ ok:true });
  } catch (error:any) {
    return NextResponse.json({ error:error?.message || "Unable to send diary email." }, { status:400 });
  }
}
