import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { getAccessContext } from "../../../lib/access";
import { diaryTypeLabel, type ShaunDiaryEntry } from "../../../lib/shaunDiary";

export const dynamic = "force-dynamic";

function wrap(text: string, max = 92) {
  const words = String(text || "").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

export async function GET(req: NextRequest) {
  const access = await getAccessContext();
  if (!access.user || (access.role !== "admin" && access.role !== "staff")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("shaun_diary_entries").select("*").gte("start_at", start).lt("start_at", end).order("start_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const entries = (data ?? []) as ShaunDiaryEntry[];

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const margin = 42;

  const addPage = () => { page = pdf.addPage([595.28, 841.89]); y = 790; };
  const draw = (text: string, size = 10, isBold = false, x = margin) => {
    if (y < 55) addPage();
    page.drawText(text, { x, y, size, font: isBold ? bold : font, color: rgb(0.08,0.11,0.16) });
    y -= size + 5;
  };

  draw("AnnS Crane Hire", 18, true);
  draw("Shaun Robinson — Diary Schedule", 16, true);
  draw(`${new Date(start).toLocaleDateString("en-GB")} to ${new Date(new Date(end).getTime()-1).toLocaleDateString("en-GB")}`, 10);
  y -= 10;

  if (!entries.length) draw("No diary entries scheduled.", 11);
  for (const entry of entries) {
    const s = new Date(entry.start_at); const e = new Date(entry.end_at);
    const date = s.toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
    const time = entry.all_day ? "All day" : `${s.toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})} - ${e.toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})}`;
    draw(date, 12, true);
    draw(`${time}  |  ${entry.title}`, 11, true, margin + 10);
    draw(`Type: ${diaryTypeLabel(entry.entry_type)}`, 9, false, margin + 10);
    if (entry.location) wrap(`Location: ${entry.location}`).forEach(line => draw(line, 9, false, margin + 10));
    if (entry.contact_name || entry.contact_phone) draw(`Contact: ${[entry.contact_name, entry.contact_phone].filter(Boolean).join(" — ")}`, 9, false, margin + 10);
    if (entry.notes) wrap(`Notes: ${entry.notes}`).forEach(line => draw(line, 9, false, margin + 10));
    y -= 9;
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Shaun-Diary-${start.slice(0,10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
