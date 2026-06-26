import { NextResponse } from "next/server";
import { cleanText, phoneLooksSame, requireMasterCallTranscriptUser } from "../../../lib/callTranscripts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireMasterCallTranscriptUser();
  if (auth.ok === false) return auth.response;

  const url = new URL(req.url);
  const q = cleanText(url.searchParams.get("q"));
  const phone = cleanText(url.searchParams.get("phone"));

  if (!q && !phone) {
    return NextResponse.json({ customers: [] });
  }

  const { data, error } = await auth.admin
    .from("clients")
    .select("id, company_name, contact_name, phone, email, archived")
    .or("archived.is.null,archived.eq.false")
    .order("company_name", { ascending: true })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const needle = String(q ?? "").toLowerCase();
  const customers = (data ?? [])
    .filter((client: any) => {
      if (phone && phoneLooksSame(phone, client.phone)) return true;
      if (!needle) return false;
      return [client.company_name, client.contact_name, client.phone, client.email]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(needle));
    })
    .slice(0, 25);

  return NextResponse.json({ customers });
}
