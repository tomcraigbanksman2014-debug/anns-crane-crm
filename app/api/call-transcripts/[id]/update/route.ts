import { NextResponse } from "next/server";
import { cleanText, requireMasterCallTranscriptUser, safeArrayOfText } from "../../../../lib/callTranscripts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireMasterCallTranscriptUser();
  if (auth.ok === false) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));

    const detectedPhoneNumbers = Array.isArray(body.detected_phone_numbers)
      ? safeArrayOfText(body.detected_phone_numbers)
      : cleanText(body.detected_phone_numbers)
        ? [cleanText(body.detected_phone_numbers) as string]
        : [];

    const payload = {
      summary: cleanText(body.summary),
      job_requirements: cleanText(body.job_requirements),
      action_points: safeArrayOfText(body.action_points),
      detected_contact_name: cleanText(body.detected_contact_name),
      detected_phone_numbers: detectedPhoneNumbers,
      detected_site_address: cleanText(body.detected_site_address),
      detected_job_date: cleanText(body.detected_job_date),
      detected_job_type: cleanText(body.detected_job_type) || "unknown",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await auth.admin
      .from("call_transcripts")
      .update(payload)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, transcript: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not update call summary." }, { status: 500 });
  }
}
