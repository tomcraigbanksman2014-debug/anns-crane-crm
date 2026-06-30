import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { requireMasterAdminApi } from "../../../../lib/routeGuards";
import { writeAuditLog } from "../../../../lib/audit";
import {
  buildCustomerBreakdownText,
  buildInternalCostText,
  calculatePackageTotals,
  numberFromAny,
  toCommercialBreakdownLines,
  type PackageCalculatorLine,
  type PackagePhase,
} from "../../../../lib/pricing/jobPackageCalculator";
import { buildQuoteNotes, getEmptyStructuredQuoteFields } from "../../../../quotes/quoteTemplate";

type Payload = {
  package_title?: string | null;
  client_id?: string | null;
  site_location?: string | null;
  scope?: string | null;
  notes?: string | null;
  payment_terms?: string | null;
  phases?: PackagePhase[];
  lines?: PackageCalculatorLine[];
  target_type?: "none" | "crane_job" | "transport_job" | "quote" | "new_quote";
  target_id?: string | null;
  quote_status?: "Draft" | "Sent";
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function appendInternalNote(existing: string | null | undefined, addition: string) {
  const oldText = clean(existing);
  const newText = clean(addition);
  if (!oldText) return newText;
  if (!newText) return oldText;
  return `${oldText}\n\n${newText}`;
}

function firstPhaseDate(phases: PackagePhase[]) {
  const found = phases.find((phase) => clean(phase.work_date));
  return clean(found?.work_date).slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function phaseSummary(phases: PackagePhase[]) {
  return phases
    .map((phase) => {
      const route = [phase.from_location, phase.to_location].map(clean).filter(Boolean).join(" → ");
      const bits = [
        clean(phase.title),
        clean(phase.work_date),
        route,
        clean(phase.loads) ? `${clean(phase.loads)} load(s)/visit(s)` : "",
        clean(phase.notes),
      ].filter(Boolean);
      return bits.length ? `- ${bits.join(" | ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function uniqueClean(values: unknown[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function routeReturnText(notes: string | null | undefined) {
  const match = clean(notes).match(/(?:^|→\s*)return\s+([^|]+)/i);
  return match?.[1] ? clean(match[1]) : "";
}

function buildCustomerRouteSummary(phases: PackagePhase[]) {
  const transportPhases = phases.filter((phase) => phase.job_kind === "transport");

  return transportPhases
    .map((phase, index) => {
      const from = clean(phase.from_location);
      const to = clean(phase.to_location);
      const route = [from, to].filter(Boolean).join(" → ");
      const returnTo = routeReturnText(phase.notes);
      const suffix = returnTo ? ` → return ${returnTo}` : "";
      const loadText = clean(phase.loads) ? ` (${clean(phase.loads)} load/visit)` : "";
      return route ? `Route ${index + 1}: ${route}${suffix}${loadText}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildCustomerProjectDateText(phases: PackagePhase[]) {
  const dates = uniqueClean(phases.map((phase) => clean(phase.work_date).slice(0, 10)));
  if (dates.length === 0) return "Date TBC — time as agreed with site.";
  return `${dates.join(", ")} — time as agreed with site.`;
}

function phaseKindMap(phases: PackagePhase[]) {
  return new Map(phases.map((phase) => [phase.id, phase.job_kind]));
}

function buildStructuredQuotePayload(input: {
  packageTitle: string;
  customer: any;
  siteLocation: string;
  scope: string;
  notes: string;
  paymentTerms: string;
  phases: PackagePhase[];
  lines: PackageCalculatorLine[];
  sellSubtotal: number;
}) {
  const fields = getEmptyStructuredQuoteFields();
  const contactName = clean(input.customer?.contact_name);
  const contactPhone = clean(input.customer?.phone);
  const customerRoutes = buildCustomerRouteSummary(input.phases);
  const fallbackLocation = clean(input.siteLocation || input.customer?.address);
  const workLocation = customerRoutes || fallbackLocation;
  const uniqueDates = uniqueClean(input.phases.map((phase) => clean(phase.work_date).slice(0, 10)));
  const kindByPhase = phaseKindMap(input.phases);
  const equipmentItems = uniqueClean(
    input.lines
      .filter((line) => line.line_type === "sell" && line.show_on_quote !== false)
      .filter((line) => kindByPhase.get(clean(line.phase_id)) !== "transport")
      .map((line) => line.item)
  );

  fields.contactName = contactName;
  fields.contactPhone = contactPhone;
  fields.projectDateTime = buildCustomerProjectDateText(input.phases);
  fields.siteLocation = workLocation;
  fields.hireType = "Full package / mixed crane and transport works";
  fields.toSupply = "Crane / transport / lifting support package as priced.";
  fields.scopeOfWork = input.scope;
  fields.workLocation = workLocation;
  fields.workDates = uniqueDates.join(", ");
  fields.duration = "As agreed with site.";
  fields.workingHours = "As agreed with site and subject to final RAMS / lift plan requirements.";
  fields.costSummary = `Total package cost: £${input.sellSubtotal.toFixed(2)} + VAT`;
  fields.breakdown = buildCustomerBreakdownText(input.lines, input.phases);
  fields.additionalEquipment = equipmentItems.length ? equipmentItems.map((item) => `- ${item}`).join("\n") : "Included as listed in the breakdown above.";
  fields.includedItems = "Items listed in the breakdown above are included. Anything not listed is excluded unless confirmed in writing.";
  fields.additionalNotes = input.notes;
  fields.paymentTerms = input.paymentTerms || fields.paymentTerms;

  return {
    subject: input.packageTitle,
    notes: buildQuoteNotes(fields),
    amount: input.sellSubtotal,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await requireMasterAdminApi();
    if (auth.response) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Payload;
    const admin = createSupabaseAdminClient();

    const targetType = body.target_type ?? "none";
    const targetId = clean(body.target_id);
    const clientId = clean(body.client_id);
    const packageTitle = clean(body.package_title) || "Full package quote";
    const siteLocation = clean(body.site_location);
    const scope = clean(body.scope) || "Full package works as priced.";
    const notes = clean(body.notes);
    const paymentTerms = clean(body.payment_terms) || "30 days from Month End";
    const phases = Array.isArray(body.phases) ? body.phases : [];
    const lines = Array.isArray(body.lines) ? body.lines : [];

    if (targetType === "none") {
      return NextResponse.json({ error: "Choose a save target first." }, { status: 400 });
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: "Add at least one calculator line." }, { status: 400 });
    }

    if (["crane_job", "transport_job", "quote"].includes(targetType) && !targetId) {
      return NextResponse.json({ error: "Target record is required." }, { status: 400 });
    }

    if (targetType === "new_quote" && !clientId) {
      return NextResponse.json({ error: "Customer is required before creating a quote." }, { status: 400 });
    }

    const totals = calculatePackageTotals(lines);
    const commercialBreakdown = toCommercialBreakdownLines(lines, phases);
    const costSubtotalFromCommercial = commercialBreakdown
      .filter((line) => line.line_type === "cost")
      .reduce((sum, line) => sum + numberFromAny(line.amount), 0);
    const costSubtotal = Math.round((costSubtotalFromCommercial || totals.costSubtotal) * 100) / 100;
    const vat = Math.round(totals.sellSubtotal * 0.2 * 100) / 100;
    const invoiceTotal = Math.round((totals.sellSubtotal + vat) * 100) / 100;
    const now = new Date().toISOString();
    const internalNote = [
      `Job calculator applied ${new Date().toLocaleString("en-GB")}`,
      `Package: ${packageTitle}`,
      `Sell subtotal: £${totals.sellSubtotal.toFixed(2)} + VAT`,
      `Cost subtotal: £${costSubtotal.toFixed(2)}`,
      `Gross profit: £${(totals.sellSubtotal - costSubtotal).toFixed(2)}`,
      `Margin: ${totals.sellSubtotal > 0 ? (((totals.sellSubtotal - costSubtotal) / totals.sellSubtotal) * 100).toFixed(1) : "0.0"}%`,
      phases.length ? `Phases:\n${phaseSummary(phases)}` : "",
      buildInternalCostText(lines, phases) ? `Internal costs:\n${buildInternalCostText(lines, phases)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (targetType === "crane_job") {
      const { data: existing, error: existingError } = await admin
        .from("jobs")
        .select("id, job_number, internal_notes")
        .eq("id", targetId)
        .single();

      if (existingError || !existing) {
        return NextResponse.json({ error: existingError?.message || "Crane job not found." }, { status: 404 });
      }

      const { error } = await admin
        .from("jobs")
        .update({
          commercial_breakdown: commercialBreakdown,
          price: totals.sellSubtotal,
          invoice_subtotal: totals.sellSubtotal,
          invoice_vat: vat,
          total_invoice: invoiceTotal,
          invoice_total: invoiceTotal,
          cross_hire_cost_total: costSubtotal,
          internal_notes: appendInternalNote(existing.internal_notes, internalNote),
          updated_at: now,
          updated_by: auth.ctx?.user?.id ?? null,
        })
        .eq("id", targetId);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await writeAuditLog({
        actor_user_id: auth.ctx?.user?.id ?? null,
        actor_username: fromAuthEmail(auth.ctx?.user?.email ?? null) || null,
        action: "job_calculator_applied",
        entity_type: "job",
        entity_id: targetId,
        meta: { package_title: packageTitle, sell_subtotal: totals.sellSubtotal, cost_subtotal: costSubtotal, job_number: existing.job_number ?? null },
      });

      return NextResponse.json({ ok: true, message: "Calculator applied to crane job.", id: targetId, href: `/jobs/${targetId}` });
    }

    if (targetType === "transport_job") {
      const { data: existing, error: existingError } = await admin
        .from("transport_jobs")
        .select("id, transport_number, internal_notes")
        .eq("id", targetId)
        .single();

      if (existingError || !existing) {
        return NextResponse.json({ error: existingError?.message || "Transport job not found." }, { status: 404 });
      }

      const { error } = await admin
        .from("transport_jobs")
        .update({
          commercial_breakdown: commercialBreakdown,
          price: totals.sellSubtotal,
          agreed_sell_rate: totals.sellSubtotal,
          invoice_subtotal: totals.sellSubtotal,
          invoice_vat: vat,
          total_invoice: invoiceTotal,
          invoice_total: invoiceTotal,
          supplier_cost: costSubtotal,
          internal_notes: appendInternalNote(existing.internal_notes, internalNote),
          updated_at: now,
          updated_by: auth.ctx?.user?.id ?? null,
        })
        .eq("id", targetId);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await writeAuditLog({
        actor_user_id: auth.ctx?.user?.id ?? null,
        actor_username: fromAuthEmail(auth.ctx?.user?.email ?? null) || null,
        action: "job_calculator_applied",
        entity_type: "transport_job",
        entity_id: targetId,
        meta: { package_title: packageTitle, sell_subtotal: totals.sellSubtotal, cost_subtotal: costSubtotal, transport_number: existing.transport_number ?? null },
      });

      return NextResponse.json({ ok: true, message: "Calculator applied to transport job.", id: targetId, href: `/transport-jobs/${targetId}` });
    }

    let customer: any = null;
    const resolvedClientId = clientId;
    if (resolvedClientId) {
      const { data } = await admin
        .from("clients")
        .select("id, company_name, contact_name, phone, email, address")
        .eq("id", resolvedClientId)
        .maybeSingle();
      customer = data ?? null;
    }

    const quotePayload = buildStructuredQuotePayload({
      packageTitle,
      customer,
      siteLocation,
      scope,
      notes,
      paymentTerms,
      phases,
      lines,
      sellSubtotal: totals.sellSubtotal,
    });

    if (targetType === "quote") {
      const { data: existing, error: existingError } = await admin
        .from("quotes")
        .select("id, subject, client_id")
        .eq("id", targetId)
        .single();

      if (existingError || !existing) {
        return NextResponse.json({ error: existingError?.message || "Quote not found." }, { status: 404 });
      }

      const { error } = await admin
        .from("quotes")
        .update({
          subject: quotePayload.subject,
          notes: quotePayload.notes,
          amount: quotePayload.amount,
        })
        .eq("id", targetId);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await writeAuditLog({
        actor_user_id: auth.ctx?.user?.id ?? null,
        actor_username: fromAuthEmail(auth.ctx?.user?.email ?? null) || null,
        action: "job_calculator_quote_updated",
        entity_type: "quote",
        entity_id: targetId,
        meta: { package_title: packageTitle, sell_subtotal: totals.sellSubtotal, previous_subject: existing.subject ?? null },
      });

      return NextResponse.json({ ok: true, message: "Calculator applied to quote.", id: targetId, href: `/quotes/${targetId}` });
    }

    if (targetType === "new_quote") {
      const { data, error } = await admin
        .from("quotes")
        .insert({
          client_id: resolvedClientId,
          status: body.quote_status === "Sent" ? "Sent" : "Draft",
          quote_date: firstPhaseDate(phases),
          valid_until: null,
          amount: quotePayload.amount,
          subject: quotePayload.subject,
          notes: quotePayload.notes,
          created_by: auth.ctx?.user?.id ?? null,
        })
        .select("id")
        .single();

      if (error || !data?.id) return NextResponse.json({ error: error?.message || "Could not create quote." }, { status: 400 });

      await writeAuditLog({
        actor_user_id: auth.ctx?.user?.id ?? null,
        actor_username: fromAuthEmail(auth.ctx?.user?.email ?? null) || null,
        action: "job_calculator_quote_created",
        entity_type: "quote",
        entity_id: data.id,
        meta: { package_title: packageTitle, sell_subtotal: totals.sellSubtotal, client_id: resolvedClientId },
      });

      return NextResponse.json({ ok: true, message: "New quote created from calculator.", id: data.id, href: `/quotes/${data.id}` });
    }

    return NextResponse.json({ error: "Unsupported save target." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not apply calculator." }, { status: 400 });
  }
}
