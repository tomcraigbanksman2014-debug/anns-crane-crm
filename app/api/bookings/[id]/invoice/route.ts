import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, PDFFont } from "pdf-lib";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function money(n: any) {
  const num = Number(n ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB");
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dueDateFrom(startAt?: string | null) {
  if (!startAt) return "-";
  const d = new Date(startAt);
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-GB");
}

function invoiceNumberFrom(id: string) {
  return `SI-${id.slice(0, 6).toUpperCase()}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, size);

    if (width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(`
      id,
      start_at,
      end_at,
      start_date,
      end_date,
      location,
      status,
      hire_price,
      vat,
      total_invoice,
      payment_received,
      invoice_status,
      created_at,
      clients:client_id (
        id,
        company_name,
        contact_name,
        phone,
        email
      ),
      equipment:equipment_id (
        id,
        name,
        asset_number,
        type,
        capacity
      )
    `)
    .eq("id", params.id)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const client = first<any>(booking.clients);
  const equip = first<any>(booking.equipment);

  const invoiceDate = fmtDate(booking.created_at || booking.start_at || booking.start_date);
  const dueDate = dueDateFrom(booking.start_at || booking.created_at);
  const invoiceNumber = invoiceNumberFrom(booking.id);

  const hire = Number(booking.hire_price ?? 0);
  const vat = Number(booking.vat ?? 0);
  const total = Number(booking.total_invoice ?? hire + vat);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const left = 38;
  const right = 557;
  const pageWidth = 595.28;

  function drawText(
    text: string,
    x: number,
    y: number,
    size = 10,
    isBold = false
  ) {
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? bold : font,
    });
  }

  function drawWrappedBlock(
    lines: string[],
    x: number,
    y: number,
    size = 9,
    lineGap = 11,
    boldIndexes: number[] = []
  ) {
    let yy = y;
    lines.forEach((line, idx) => {
      drawText(line, x, yy, size, boldIndexes.includes(idx));
      yy -= lineGap;
    });
    return yy;
  }

  // ---------- TOP BLOCKS ----------
  let leftY = 805;
  const companyLines = [
    "ANNS CRANE HIRE LTD",
    "6 Bay Street",
    "Swansea, SA1 8LB",
    "United Kingdom",
    "Telephone: 01792 641 653",
    "Mobile 07442158882",
    "Email info@annscranehire.co.uk",
    "Registered in England and Wales No. 15895379, VAT Registration Number GB 475188652",
    "Registered Address 6 Bay Street, Swansea, SA1 8LB",
  ];

  drawText(companyLines[0], left, leftY, 12, true);
  leftY -= 16;
  drawWrappedBlock(companyLines.slice(1, 7), left, leftY, 9, 12);
  leftY -= 72;

  const regLine1 = wrapText(companyLines[7], font, 8, 235);
  const regLine2 = wrapText(companyLines[8], font, 8, 235);
  leftY = 733;
  drawWrappedBlock(regLine1, left, leftY, 8, 10);
  leftY -= regLine1.length * 10;
  drawWrappedBlock(regLine2, left, leftY, 8, 10);

  let rightY = 805;
  const financeText = [
    "The debt represented by this invoice has been purchased by, and assigned to, Ultimate Finance Ltd and is to be paid to: Ultimate Finance Ltd",
    "First Floor, Equinox North, Great Park Road, Bradley Stoke, Bristol, BS32 4QL T: 01454 207 050",
    "They alone can give you a valid discharge of this debt.",
    "PLEASE DO NOT SEND ANY PAYMENTS",
    "DIRECTLY TO ANNS CRANE HIRE LIMITED",
    "BANK DETAILS: Sort Code - 30-15-99",
    "Account Number - 13622760",
    "IBAN - GB87 LOYD 3015 9913 6227 60",
    "Swift - LOYDGB21021",
    "Vat No - 475188652",
  ];

  for (let i = 0; i < financeText.length; i++) {
    const lines = wrapText(financeText[i], i >= 5 ? font : font, i >= 5 ? 8 : 8, 178);
    rightY = drawWrappedBlock(
      lines,
      315,
      rightY,
      8,
      10,
      i === 3 || i === 4 ? [0] : []
    );
    rightY -= 4;
  }

  // ---------- DIVIDER ----------
  page.drawLine({
    start: { x: left, y: 610 },
    end: { x: right, y: 610 },
    thickness: 1,
  });

  // ---------- TITLE ----------
  drawText("SALES INVOICE", left, 585, 16, true);

  // ---------- INVOICE META ----------
  drawText(`Invoice Date`, 360, 580, 9, true);
  drawText(invoiceDate, 445, 580, 9);

  drawText(`Due Date`, 360, 566, 9, true);
  drawText(dueDate, 445, 566, 9);

  drawText(`Invoice Number`, 360, 552, 9, true);
  drawText(invoiceNumber, 445, 552, 9);

  drawText(`Reference`, 360, 538, 9, true);
  const refText = `${equip?.name ?? "Booking"}${booking.location ? " - " + booking.location : ""}`;
  const refLines = wrapText(refText, font, 9, 140);
  drawWrappedBlock(refLines, 445, 538, 9, 10);

  // ---------- INVOICE TO ----------
  drawText("Invoice To:", left, 538, 10, true);
  drawText(client?.contact_name ?? "-", left, 522, 9);
  drawText(client?.company_name ?? "-", left, 508, 9, true);
  drawText(client?.email ?? "-", left, 494, 9);
  drawText(client?.phone ?? "-", left, 480, 9);

  // ---------- TABLE ----------
  const tableTop = 420;
  drawText("Code", left, tableTop, 9, true);
  drawText("Description", 90, tableTop, 9, true);
  drawText("Qty/Hrs", 360, tableTop, 9, true);
  drawText("Price/Rate", 430, tableTop, 9, true);
  drawText("VAT %", 500, tableTop, 9, true);
  drawText("Net", 540, tableTop, 9, true);

  page.drawLine({
    start: { x: left, y: tableTop - 6 },
    end: { x: right, y: tableTop - 6 },
    thickness: 1,
  });

  let rowY = 392;
  drawText("CONTRACT", left, rowY, 9);

  const desc1 = `${equip?.name ?? "Contract Lift"}${booking.location ? " - " + booking.location : ""}`;
  drawText(desc1, 90, rowY, 9);

  drawText("1.00", 368, rowY, 9);
  drawText(money(hire), 438, rowY, 9);
  drawText("20.00", 505, rowY, 9);
  drawText(money(hire), 540, rowY, 9);

  rowY -= 18;
  const timeLine =
    booking.start_at && booking.end_at
      ? `${fmtDateTime(booking.start_at)} to ${fmtDateTime(booking.end_at)}`
      : `${fmtDate(booking.start_date)} to ${fmtDate(booking.end_date)}`;
  const timeLines = wrapText(timeLine, font, 8, 240);
  rowY = drawWrappedBlock(timeLines, 90, rowY, 8, 10);

  const equipLine = `${equip?.type ?? ""}${equip?.capacity ? " / " + equip.capacity : ""}${equip?.asset_number ? " / " + equip.asset_number : ""}`;
  rowY -= 6;
  drawText(equipLine || "-", 90, rowY, 8);

  // ---------- TOTALS ----------
  page.drawLine({
    start: { x: 410, y: 230 },
    end: { x: right, y: 230 },
    thickness: 1,
  });

  drawText("Total Net", 430, 205, 10, true);
  drawText(`£${money(hire)}`, 520, 205, 10);

  drawText("Total VAT", 430, 190, 10, true);
  drawText(`£${money(vat)}`, 520, 190, 10);

  drawText("TOTAL", 430, 168, 12, true);
  drawText(`£${money(total)}`, 510, 168, 12, true);

  drawText("VAT Rate", 430, 138, 9, true);
  drawText("Net", 490, 138, 9, true);
  drawText("VAT", 535, 138, 9, true);

  drawText("Standard 20.00%", 430, 124, 8);
  drawText(`£${money(hire)}`, 490, 124, 8);
  drawText(`£${money(vat)}`, 535, 124, 8);

  // ---------- NOTES ----------
  drawText("Notes:", left, 150, 10, true);
  const notesLine = `${equip?.name ?? "Booking"}${booking.location ? " - " + booking.location : ""}`;
  drawText(notesLine, left, 136, 9);

  drawText("Terms and Conditions:", left, 112, 10, true);
  const terms = [
    "We reserve the right to charge interest on late paid invoices at the rate of 8% above bank base rates under the Late Payment of Commercial Debts (Interest) Act 1998.",
    "Queries raised more than 7 days after the invoice date will not be considered.",
  ];

  let termsY = 98;
  for (const term of terms) {
    const lines = wrapText(term, font, 8, pageWidth - 80);
    termsY = drawWrappedBlock(lines, left, termsY, 8, 10);
    termsY -= 4;
  }

  drawText("Page 1 of 1", 510, 36, 8);

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoiceNumber}.pdf"`,
    },
  });
}
