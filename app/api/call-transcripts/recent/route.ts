import { NextResponse } from "next/server";
import { requireMasterCallTranscriptUser } from "../../../lib/callTranscripts";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireMasterCallTranscriptUser();
  if (auth.ok === false) return auth.response;

  const { data, error } = await auth.admin
    .from("call_transcripts")
    .select("id, created_at, call_direction, phone_number, summary, matched_client_id, matched_client_name, match_confidence, match_reason, detected_customer_name, detected_contact_name")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ transcripts: data ?? [] });
}
