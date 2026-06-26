import { NextResponse } from "next/server";
import { cleanText, requireMasterCallTranscriptUser } from "../../../../lib/callTranscripts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireMasterCallTranscriptUser();
  if (auth.ok === false) return auth.response;

  const body = await req.json().catch(() => ({}));
  const clientId = cleanText(body.client_id);

  if (!clientId) {
    return NextResponse.json({ error: "Select a customer to link." }, { status: 400 });
  }

  const { data: client, error: clientError } = await auth.admin
    .from("clients")
    .select("id, company_name")
    .eq("id", clientId)
    .single();

  if (clientError || !client?.id) {
    return NextResponse.json({ error: clientError?.message || "Customer not found." }, { status: 404 });
  }

  const { data, error } = await auth.admin
    .from("call_transcripts")
    .update({
      matched_client_id: client.id,
      matched_client_name: client.company_name ?? null,
      match_confidence: "manual",
      match_reason: "Manually linked by Tom.",
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, transcript: data });
}
