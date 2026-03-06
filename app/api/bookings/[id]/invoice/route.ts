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
    hour12: false,
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

  const left = 30;
  const right = 560;

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

  function drawWrapped(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size = 9,
    isBold = false,
    lineGap = 11
  ) {
    const lines = wrapText(text, isBold ? bold : font, size, maxWidth);
    let yy = y;
    for (const line of lines) {
      drawText(line, x, yy, size, isBold);
      yy -= lineGap;
    }
    return yy;
  }

  // -------------------------
  // TOP LEFT HEADER BLOCK
  // -------------------------
  let yLeft = 805;
  drawText("ANNS CRANE HIRE LTD", left, yLeft, 12, true);
  yLeft -= 18;

  const leftLines = [
    "6 Bay Street",
    "Swansea, SA1 8LB",
    "United Kingdom",
    "Telephone: 01792 641 653",
    "Mobile 07442158882",
    "Email info@annscranehire.co.uk",
  ];

  for (const line of leftLines) {
    drawText(line, left, yLeft, 9);
    yLeft -= 14;
  }

  yLeft -= 2;

  yLeft = drawWrapped(
    "Registered in England and Wales No. 15895379, VAT Registration Number GB 475188652",
    left,
    yLeft,
    250,
    7.5,
    false,
    9
  );

  yLeft -= 3;

  drawWrapped(
    "Registered Address 6 Bay Street, Swansea, SA1 8LB",
    left,
    yLeft,
    250,
    7.5,
    false,
    9
  );

  // -------------------------
  // TOP RIGHT FINANCE BLOCK
  // -------------------------
  let yRight = 805;

  yRight = drawWrapped(
    "The debt represented by this invoice has been purchased by, and assigned to, Ultimate Finance Ltd and is to be paid to: Ultimate Finance Ltd",
    300,
    yRight,
    255,
    8,
    false,
    10
  );
  yRight -= 4;

  yRight = drawWrapped(
    "First Floor, Equinox North, Great Park Road, Bradley Stoke, Bristol, BS32 4QL T: 01454 207 050",
    300,
    yRight,
    255,
    8,
    false,
    10
  );
  yRight -= 4;

  yRight = drawWrapped(
    "They alone can give you a valid discharge of this debt.",
    300,
    yRight,
    255,
    8,
    false,
    10
  );
  yRight -= 6;

  yRight = drawWrapped(
    "PLEASE DO NOT SEND ANY PAYMENTS",
    300,
    yRight,
    255,
    8,
    true,
    10
  );
  yRight = drawWrapped(
    "DIRECTLY TO ANNS CRANE HIRE LIMITED",
    300,
    yRight,
    255,
    8,
    true,
    10
  );
  yRight -= 6;

  const bankLines = [
    "BANK DETAILS: Sort Code - 30-15-99",
    "Account Number - 13622760",
    "IBAN - GB87 LOYD 3015 9913 6227 60",
    "Swift - LOYDGB21021",
    "Vat No - 475188652",
  ];

  for (const line of bankLines) {
    drawText(line, 300, yRight, 8);
    yRight -= 14;
  }

  // Divider
  page.drawLine({
    start: { x: left, y: 575 },
    end: { x: right, y: 575 },
    thickness: 1,
  });

  // -------------------------
  // TITLE + META
  // -------------------------
  drawText("SALES INVOICE", left, 545, 16, true);

  drawText("Invoice Date", 360, 538, 9, true);
  drawText(invoiceDate, 445, 538, 9);

  drawText("Due Date", 360, 522, 9, true);
  drawText(dueDate, 445, 522, 9);

  drawText("Invoice Number", 360, 506, 9, true);
  drawText(invoiceNumber, 445, 506, 9);

  drawText("Reference", 360, 490, 9, true);
  drawWrapped(
    `${equip?.name ?? "Booking"}${booking.location ? " - " + booking.location : ""}`,
    445,
    490,
    105,
    9,
    false,
    10
  );

  // -------------------------
  // INVOICE TO
  // -------------------------
  drawText("Invoice To:", left, 485, 10, true);
  drawText(client?.contact_name ?? "-", left, 468, 9);
  drawText(client?.company_name ?? "-", left, 452, 9, true);
  drawText(client?.email ?? "-", left, 436, 9);
  drawText(client?.phone ?? "-", left, 420, 9);

  // -------------------------
  // TABLE
  // -------------------------
  const tableTop = 360;
  drawText("Code", left, tableTop, 9, true);
  drawText("Description", 85, tableTop, 9, true);
  drawText("Qty/Hrs", 365, tableTop, 9, true);
  drawText("Price/Rate", 430, tableTop, 9, true);
  drawText("VAT %", 505, tableTop, 9, true);
  drawText("Net", 540, tableTop, 9, true);

  page.drawLine({
    start: { x: left, y: tableTop - 6 },
    end: { x: right, y: tableTop - 6 },
    thickness: 1,
  });

  let rowY = 330;
  drawText("CONTRACT", left, rowY, 9);
  drawText(
    `${equip?.name ?? "Contract Lift"}${booking.location ? " - " + booking.location : ""}`,
    85,
    rowY,
    9
  );
  drawText("1.00", 372, rowY, 9);
  drawText(money(hire), 438, rowY, 9);
  drawText("20.00", 510, rowY, 9);
  drawText(money(hire), 540, rowY, 9);

  rowY -= 18;
  const timeLine =
    booking.start_at && booking.end_at
      ? `${fmtDateTime(booking.start_at)} to ${fmtDateTime(booking.end_at)}`
      : `${fmtDate(booking.start_date)} to ${fmtDate(booking.end_date)}`;

  rowY = drawWrapped(timeLine, 85, rowY, 250, 8, false, 10);
  rowY -= 4;

  drawText(
    `${equip?.type ?? ""}${equip?.capacity ? " / " + equip.capacity : ""}${equip?.asset_number ? " / " + equip.asset_number : ""}` || "-",
    85,
    rowY,
    8
  );

  // -------------------------
  // TOTALS
  // -------------------------
  page.drawLine({
    start: { x: 400, y: 130 },
    end: { x: right, y: 130 },
    thickness: 1,
  });

  drawText("Total Net", 430, 102, 10, true);
  drawText(`£${money(hire)}`, 515, 102, 10);

  drawText("Total VAT", 430, 84, 10, true);
  drawText(`£${money(vat)}`, 515, 84, 10);

  drawText("TOTAL", 430, 58, 12, true);
  drawText(`£${money(total)}`, 505, 58, 12, true);

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoiceNumber}.pdf"`,
    },
  });
}
