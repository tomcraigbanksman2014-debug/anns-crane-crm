import { NextResponse } from "next/server";
import { requireOfficeUserApi } from "../../../../lib/routeGuards";
import { sendShaunPush } from "../../../../lib/shaunDiaryPush";
export async function POST() {
  const auth = await requireOfficeUserApi(); if (auth.response) return auth.response;
  try { const sent = await sendShaunPush({ title: "AnnS CRM — Shaun's Diary", body: "Notifications are enabled and working.", tag: "shaun-diary-test" }); return NextResponse.json({ ok: true, sent }); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Unable to send test notification." }, { status: 500 }); }
}
