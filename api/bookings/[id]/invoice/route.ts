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

function dueDateFrom(startAt?: string | null, days = 30) {
  if (!startAt) return "-";
  const d = new Date(startAt);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB");
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
      invoice_number,
      start_at,
      end_at,
      start_date,
      end_date,
      location,
      status,
      po_number,
      job_reference,
      operator_name,
      driver_notes,
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

  const { data: settings } = await supabase
    .from("app_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  let invoiceNumber = booking.invoice_number ?? null;

  if (!invoiceNumber) {
    const { data: issued, error: issueError } = await supabase.rpc(
      "issue_next_invoice_number",
      { p_booking_id: booking.id }
    );

    if (issueError) {
      return NextResponse.json(
        { error: issueError.message || "Could not issue invoice number" },
        { status: 400 }
      );
    }

    invoiceNumber = issued ?? null;
  }

  if (!invoiceNumber) {
    return NextResponse.json(
      { error: "Could not generate invoice number" },
      { status: 400 }
    );
  }

  const client = first<any>(booking.clients);
  const equip = first<any>(booking.equipment);

  const businessName = settings?.business_name || "ANNS CRANE HIRE LTD";
  const businessAddress =
    settings?.business_address || "6 Bay Street\nSwansea, SA1 8LB\nUnited Kingdom";
  const businessPhone = settings?.business_phone || "01792 641 653";
  const businessEmail = settings?.business_email || "info@annscranehire.co.uk";
  const vatNumber = settings?.vat_number || "GB 475188652";
  const companyNumber = settings?.company_number || "15895379";

  const paymentTermsDays = Number(settings?.payment_terms_days ?? 30);
  const bankName = settings?.bank_name || "Ultimate Finance Ltd";
  const bankSortCode = settings?.bank_sort_code || "30-15-99";
  const bankAccountNumber = settings?.bank_account_number || "13622760";
  const bankIban = settings?.bank_iban || "GB87 LOYD 3015 9913 6227 60";
  const bankSwift = settings?.bank_swift || "LOYDGB21021";
  const invoiceFooter =
    settings?.invoice_footer ||
    "We reserve the right to charge interest on late paid invoices at the rate of 8% above bank base rates under the Late Payment of Commercial Debts (Interest) Act 1998.\nQueries raised more than 7 days after the invoice date will not be considered.";

  const invoiceDate = fmtDate(booking.created_at || booking.start_at || booking.start_date);
  const dueDate = dueDateFrom(booking.start_at || booking.created_at, paymentTermsDays);

  const hire = Number(booking.hire_price ?? 0);
  const vat = Number(booking.vat ?? 0);
  const total = Number(booking.total_invoice ?? hire + vat);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const left = 30;
  const right = 560;

  function drawText(text: string, x: number, y: number, size = 10, isBold = false) {
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

  let yLeft = 805;
  drawText(businessName, left, yLeft, 12, true);
  yLeft -= 18;

  for (const line of String(businessAddress).split("\n")) {
    drawText(line, left, yLeft, 9);
    yLeft -= 14;
  }

  drawText(`Telephone: ${businessPhone}`, left, yLeft, 9);
  yLeft -= 14;
  drawText(`Email ${businessEmail}`, left, yLeft, 9);
  yLeft -= 16;

  yLeft = drawWrapped(
    `Registered in England and Wales No. ${companyNumber}, VAT Registration Number ${vatNumber}`,
    left,
    yLeft,
    250,
    7.5,
    false,
    9
  );

  let yRight = 805;
  yRight = drawWrapped(
    `Please make payment to ${bankName}`,
    300,
    yRight,
    255,
    8,
    false,
    10
  );
  yRight -= 8;

  const bankLines = [
    `BANK NAME: ${bankName}`,
    `SORT CODE: ${bankSortCode}`,
    `ACCOUNT NUMBER: ${bankAccountNumber}`,
    `IBAN: ${bankIban}`,
    `SWIFT: ${bankSwift}`,
    `VAT NO: ${vatNumber}`,
  ];

  for (const line of bankLines) {
    drawText(line, 300, yRight, 8);
    yRight -= 14;
  }

  page.drawLine({
    start: { x: left, y: 575 },
    end: { x: right, y: 575 },
    thickness: 1,
  });

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

  drawText("Invoice To:", left, 485, 10, true);
  drawText(client?.contact_name ?? "-", left, 468, 9);
  drawText(client?.company_name ?? "-", left, 452, 9, true);
  drawText(client?.email ?? "-", left, 436, 9);
  drawText(client?.phone ?? "-", left, 420, 9);

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

  let infoY = 245;
  drawText("PO Number:", left, infoY, 9, true);
  drawText(booking.po_number ?? "-", 110, infoY, 9);
  infoY -= 14;

  drawText("Job Ref:", left, infoY, 9, true);
  drawText(booking.job_reference ?? "-", 110, infoY, 9);
  infoY -= 14;

  drawText("Operator:", left, infoY, 9, true);
  drawText(booking.operator_name ?? "-", 110, infoY, 9);
  infoY -= 18;

  drawText("Driver Notes:", left, infoY, 9, true);
  infoY -= 12;
  infoY = drawWrapped(booking.driver_notes ?? "-", left, infoY, 300, 8, false, 10);

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
  drawText(`£${money(total)}`, 505, 58, 12);

  let footerY = 105;
  for (const para of String(invoiceFooter).split("\n")) {
    footerY = drawWrapped(para, left, footerY, 330, 8, false, 10);
    footerY -= 4;
  }

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoiceNumber}.pdf"`,
    },
  });
}
