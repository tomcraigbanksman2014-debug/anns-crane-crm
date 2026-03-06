import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
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

function dueDateFrom(startAt?: string | null) {
  if (!startAt) return "-";
  const d = new Date(startAt);
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-GB");
}

function invoiceNumberFrom(id: string) {
  return `SI-${id.slice(0, 6).toUpperCase()}`;
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

  const draw = (
    text: string,
    x: number,
    y: number,
    size = 10,
    isBold = false
  ) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? bold : font,
    });
  };

  const left = 36;
  const right = 560;

  // Header block
  let y = 805;
  draw("ANNS CRANE HIRE LTD", left, y, 12, true);
  y -= 14;
  draw("6 Bay Street", left, y);
  y -= 12;
  draw("Swansea, SA1 8LB", left, y);
  y -= 12;
  draw("United Kingdom", left, y);
  y -= 12;
  draw("Telephone: 01792 641 653", left, y);
  y -= 12;
  draw("Mobile 01792 641653", left, y);
  y -= 12;
  draw("Email info@annscranehire.co.uk", left, y);
  y -= 12;
  draw("Registered in England and Wales No. 15895379 , VAT Registration Number GB 475188652", left, y, 8);
  y -= 10;
  draw("Registered Address 6 Bay Street, Swansea, SA1 8LB", left, y, 8);

  // Finance / bank block
  let fy = 805;
  draw("The debt represented by this invoice has been", 310, fy, 8);
  fy -= 10;
  draw("purchased by, and assigned to, Ultimate Finance Ltd", 310, fy, 8);
  fy -= 10;
  draw("and is to be paid to: Ultimate Finance Ltd", 310, fy, 8);
  fy -= 10;
  draw("First Floor, Equinox North, Great Park Road, Bradley", 310, fy, 8);
  fy -= 10;
  draw("Stoke, Bristol, BS32 4QL T: 01454 207 050", 310, fy, 8);
  fy -= 10;
  draw("They alone can give you a valid discharge of this", 310, fy, 8);
  fy -= 10;
  draw("debt.", 310, fy, 8);
  fy -= 14;
  draw("PLEASE DO NOT SEND ANY PAYMENTS", 310, fy, 8, true);
  fy -= 10;
  draw("DIRECTLY TO ANNS CRANE HIRE LIMITED", 310, fy, 8, true);
  fy -= 14;
  draw("BANK DETAILS: Sort Code - 30-15-99", 310, fy, 8);
  fy -= 10;
  draw("Account Number – 13622760", 310, fy, 8);
  fy -= 10;
  draw("IBAN – GB87 LOYD 3015 9913 6227 60", 310, fy, 8);
  fy -= 10;
  draw("Swift - LOYDGB21021", 310, fy, 8);
  fy -= 10;
  draw("Vat No - 475188652", 310, fy, 8);

  // Divider
  page.drawLine({
    start: { x: left, y: 655 },
    end: { x: right, y: 655 },
    thickness: 1,
  });

  // Invoice title + summary
  draw("SALES INVOICE", left, 635, 16, true);
  draw(`Invoice Date  ${invoiceDate}`, 360, 635, 9);
  draw(`Due Date      ${dueDate}`, 360, 621, 9);
  draw(`Invoice Number ${invoiceNumber}`, 360, 607, 9);
  draw(`Reference ${equip?.name ?? "Booking"} - ${booking.location ?? "-"}`, 360, 593, 9);

  // Invoice to
  draw("Invoice To:", left, 605, 10, true);
  draw(client?.contact_name ?? "-", left, 591, 9);
  draw(client?.company_name ?? "-", left, 579, 9, true);
  draw(client?.email ?? "-", left, 567, 9);
  draw(client?.phone ?? "-", left, 555, 9);

  // Table headers
  const tableTop = 520;
  draw("Code", left, tableTop, 9, true);
  draw("Description", 90, tableTop, 9, true);
  draw("Qty/Hrs", 360, tableTop, 9, true);
  draw("Price/Rate", 420, tableTop, 9, true);
  draw("VAT %", 495, tableTop, 9, true);
  draw("Net", 540, tableTop, 9, true);

  page.drawLine({
    start: { x: left, y: tableTop - 6 },
    end: { x: right, y: tableTop - 6 },
    thickness: 1,
  });

  // Main line item
  let rowY = 495;
  draw("CONTRACT", left, rowY, 9);
  draw(
    `${equip?.name ?? "CONTRACT LIFT"} ${booking.location ? " - " + booking.location : ""}`,
    90,
    rowY,
    9
  );
  draw("1.00", 365, rowY, 9);
  draw(money(hire), 430, rowY, 9);
  draw("20.00", 500, rowY, 9);
  draw(money(hire), 540, rowY, 9);

  rowY -= 14;
  draw(
    `${fmtDate(booking.start_at || booking.start_date)} ${booking.start_at ? booking.start_at.slice(11, 16) : ""} to ${fmtDate(booking.end_at || booking.end_date)} ${booking.end_at ? booking.end_at.slice(11, 16) : ""}`,
    90,
    rowY,
    8
  );

  rowY -= 14;
  draw(
    `${equip?.type ?? ""}${equip?.capacity ? " / " + equip.capacity : ""}${equip?.asset_number ? " / " + equip.asset_number : ""}`,
    90,
    rowY,
    8
  );

  // Totals
  const totalsY = 210;
  draw(`Total Net ${money(hire)}`, 420, totalsY + 36, 10);
  draw(`Total VAT ${money(vat)}`, 420, totalsY + 22, 10);
  draw(`TOTAL £${money(total)}`, 420, totalsY, 12, true);

  draw("VAT Rate", 420, totalsY - 28, 9, true);
  draw("Net", 480, totalsY - 28, 9, true);
  draw("VAT", 530, totalsY - 28, 9, true);

  draw("Standard 20.00%", 420, totalsY - 42, 8);
  draw(`£${money(hire)}`, 480, totalsY - 42, 8);
  draw(`£${money(vat)}`, 530, totalsY - 42, 8);

  // Notes / footer
  draw("Notes:", left, 170, 10, true);
  draw(
    `${equip?.name ?? "Booking"}${booking.location ? " - " + booking.location : ""}`,
    left,
    156,
    9
  );

  draw("Terms and Conditions:", left, 130, 10, true);
  draw(
    "We reserve the right to charge interest on late paid invoices at the rate of 8% above bank base rates under the Late",
    left,
    116,
    8
  );
  draw(
    "Payment of Commercial Debts (Interest) Act 1998.",
    left,
    106,
    8
  );
  draw(
    "Queries raised more than 7 days after the invoice date will not be considered.",
    left,
    94,
    8
  );

  draw("Page 1 of 1", 510, 40, 8);

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoiceNumber}.pdf"`,
    },
  });
}
