import { NextResponse } from "next/server";
import { cleanText, requireMasterCallTranscriptUser } from "../../../../lib/callTranscripts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireMasterCallTranscriptUser();
  if (auth.ok === false) return auth.response;

  const body = await req.json().catch(() => ({}));

  const companyName = cleanText(body.company_name);
  const contactName = cleanText(body.contact_name);
  const phone = cleanText(body.phone);
  const email = cleanText(body.email);
  const notes = cleanText(body.notes);

  if (!companyName) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }

  const { data: client, error: createError } = await auth.admin
    .from("clients")
    .insert({
      company_name: companyName,
      contact_name: contactName,
      phone,
      email,
      notes,
      archived: false,
    })
    .select("id, company_name")
    .single();

  if (createError || !client?.id) {
    return NextResponse.json({ error: createError?.message || "Failed to create customer." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("call_transcripts")
    .update({
      matched_client_id: client.id,
      matched_client_name: client.company_name ?? null,
      match_confidence: "manual",
      match_reason: "New customer created from call transcript by Tom.",
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, customer: client, transcript: data });
}
