export type AbnormalTransportRowLike = {
  abnormal_load_enabled?: boolean | null;
  abnormal_load_category?: string | null;
  load_length_m?: number | string | null;
  load_width_m?: number | string | null;
  load_height_m?: number | string | null;
  load_weight_t?: number | string | null;
  transport_length_m?: number | string | null;
  transport_width_m?: number | string | null;
  transport_height_m?: number | string | null;
  transport_gross_weight_t?: number | string | null;
  axle_weight_notes?: string | null;
  collection_contact_name?: string | null;
  collection_contact_phone?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  preferred_move_window?: string | null;
  trailer_type?: string | null;
  tractor_unit_type?: string | null;
  escort_required?: boolean | null;
  escort_details?: string | null;
  route_notes?: string | null;
  restriction_notes?: string | null;
  police_notes?: string | null;
  council_notes?: string | null;
  bridge_notes?: string | null;
  submission_status?: string | null;
  movement_order_reference?: string | null;
  movement_order_submitted_at?: string | null;
  approval_status?: string | null;
  approval_notes?: string | null;
  submitted_by_name?: string | null;
  checklist_dimensions_confirmed?: boolean | null;
  checklist_weight_confirmed?: boolean | null;
  checklist_route_checked?: boolean | null;
  checklist_trailer_checked?: boolean | null;
  checklist_escort_checked?: boolean | null;
  checklist_site_access_checked?: boolean | null;
  checklist_customer_approved?: boolean | null;
  checklist_supplier_booked?: boolean | null;
  checklist_movement_order_submitted?: boolean | null;
  checklist_approval_received?: boolean | null;
  transport_number?: string | null;
  job_type?: string | null;
  collection_address?: string | null;
  delivery_address?: string | null;
  transport_date?: string | null;
  delivery_date?: string | null;
  collection_time?: string | null;
  delivery_time?: string | null;
  client_name?: string | null;
  load_description?: string | null;
  supplier_cost?: number | string | null;
  agreed_sell_rate?: number | string | null;
  supplier_name?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

function fmtMeasure(value: unknown, suffix: string) {
  const n = num(value);
  return n > 0 ? `${n} ${suffix}` : "—";
}

export function isAbnormalLoadTransport(row: AbnormalTransportRowLike | null | undefined) {
  return bool(row?.abnormal_load_enabled);
}

export function abnormalLoadCategoryLabel(value: string | null | undefined) {
  const raw = clean(value).toLowerCase();
  if (raw === "abnormal_load") return "Abnormal load";
  if (raw === "heavy_haulage") return "Heavy haulage";
  if (raw === "escorted_movement") return "Escorted movement";
  if (raw === "modular_movement") return "Modular / cabin movement";
  return raw ? raw.replace(/_/g, " ") : "Abnormal load";
}

export function movementStatusLabel(value: string | null | undefined) {
  const raw = clean(value).toLowerCase();
  if (raw === "not_started") return "Not started";
  if (raw === "drafting") return "Drafting";
  if (raw === "ready_to_submit") return "Ready to submit";
  if (raw === "submitted") return "Submitted";
  if (raw === "awaiting_approval") return "Awaiting approval";
  if (raw === "approved") return "Approved";
  if (raw === "amendments_required") return "Amendments required";
  if (raw === "completed") return "Completed";
  return raw ? raw.replace(/_/g, " ") : "Not started";
}

export function approvalStatusLabel(value: string | null | undefined) {
  const raw = clean(value).toLowerCase();
  if (raw === "not_started") return "Not started";
  if (raw === "not_required") return "Not required";
  if (raw === "awaiting_approval") return "Awaiting approval";
  if (raw === "approved") return "Approved";
  if (raw === "rejected") return "Rejected";
  if (raw === "restricted") return "Approved with restrictions";
  return raw ? raw.replace(/_/g, " ") : "Not started";
}

export function buildAbnormalLoadReadiness(row: AbnormalTransportRowLike | null | undefined) {
  if (!isAbnormalLoadTransport(row)) {
    return {
      enabled: false,
      tone: "neutral" as const,
      label: "Standard transport job",
      ready: true,
      missingCritical: [] as string[],
      missingRecommended: [] as string[],
      checklistMissing: [] as string[],
      score: 100,
    };
  }

  const critical: Array<[string, boolean]> = [
    ["Load length", num(row?.load_length_m) > 0],
    ["Load width", num(row?.load_width_m) > 0],
    ["Load height", num(row?.load_height_m) > 0],
    ["Load weight", num(row?.load_weight_t) > 0],
    ["Overall transport length", num(row?.transport_length_m) > 0],
    ["Overall transport width", num(row?.transport_width_m) > 0],
    ["Overall transport height", num(row?.transport_height_m) > 0],
    ["Overall gross weight", num(row?.transport_gross_weight_t) > 0],
    ["Collection address", !!clean(row?.collection_address)],
    ["Delivery address", !!clean(row?.delivery_address)],
    ["Trailer type", !!clean(row?.trailer_type)],
  ];

  const recommended: Array<[string, boolean]> = [
    ["Collection contact", !!clean(row?.collection_contact_name)],
    ["Delivery contact", !!clean(row?.delivery_contact_name)],
    ["Preferred move window", !!clean(row?.preferred_move_window || row?.collection_time)],
    ["Route notes", !!clean(row?.route_notes)],
    ["Restriction notes", !!clean(row?.restriction_notes)],
  ];

  const checklist: Array<[string, boolean]> = [
    ["Dimensions confirmed", bool(row?.checklist_dimensions_confirmed)],
    ["Weight confirmed", bool(row?.checklist_weight_confirmed)],
    ["Route checked", bool(row?.checklist_route_checked)],
    ["Trailer checked", bool(row?.checklist_trailer_checked)],
    ["Site access checked", bool(row?.checklist_site_access_checked)],
    ["Customer approved", bool(row?.checklist_customer_approved)],
    ["Supplier booked", bool(row?.checklist_supplier_booked)],
    ["Movement order submitted", bool(row?.checklist_movement_order_submitted)],
    ["Approval / permit received", bool(row?.checklist_approval_received)],
  ];

  if (bool(row?.escort_required)) {
    checklist.splice(4, 0, ["Escort checked", bool(row?.checklist_escort_checked)]);
  }

  const missingCritical = critical.filter(([, ok]) => !ok).map(([label]) => label);
  const missingRecommended = recommended.filter(([, ok]) => !ok).map(([label]) => label);
  const checklistMissing = checklist.filter(([, ok]) => !ok).map(([label]) => label);

  const totalChecks = critical.length + recommended.length + checklist.length;
  const completedChecks =
    critical.filter(([, ok]) => ok).length +
    recommended.filter(([, ok]) => ok).length +
    checklist.filter(([, ok]) => ok).length;

  const score = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  if (missingCritical.length > 0) {
    return {
      enabled: true,
      tone: "red" as const,
      label: "Not ready to submit",
      ready: false,
      missingCritical,
      missingRecommended,
      checklistMissing,
      score,
    };
  }

  if (missingRecommended.length > 0 || checklistMissing.length > 0) {
    return {
      enabled: true,
      tone: "amber" as const,
      label: "Part ready / needs checking",
      ready: false,
      missingCritical,
      missingRecommended,
      checklistMissing,
      score,
    };
  }

  return {
    enabled: true,
    tone: "green" as const,
    label: "Ready to submit",
    ready: true,
    missingCritical,
    missingRecommended,
    checklistMissing,
    score,
  };
}

export function buildMovementOrderSummary(row: AbnormalTransportRowLike | null | undefined) {
  if (!row) return "";

  const lines: string[] = [];
  const push = (label: string, value: unknown) => {
    const text = clean(value);
    if (text) lines.push(`${label}: ${text}`);
  };

  lines.push(`Movement Order Summary`);
  lines.push(`======================`);
  push("Transport job", row.transport_number);
  push("Customer", row.client_name);
  push("Category", abnormalLoadCategoryLabel(row.abnormal_load_category));
  push("Job type", row.job_type);
  push("Collection date", row.transport_date);
  push("Delivery date", row.delivery_date);
  push("Collection time", row.collection_time);
  push("Delivery time", row.delivery_time);
  push("Collection address", row.collection_address);
  push("Delivery address", row.delivery_address);
  push("Collection contact", [clean(row.collection_contact_name), clean(row.collection_contact_phone)].filter(Boolean).join(" • "));
  push("Delivery contact", [clean(row.delivery_contact_name), clean(row.delivery_contact_phone)].filter(Boolean).join(" • "));
  push("Load description", row.load_description);
  lines.push("");
  lines.push(`Load Details`);
  lines.push(`------------`);
  push("Load dimensions", [fmtMeasure(row.load_length_m, "m"), fmtMeasure(row.load_width_m, "m"), fmtMeasure(row.load_height_m, "m")].join(" x "));
  push("Load weight", fmtMeasure(row.load_weight_t, "t"));
  push("Overall transport dimensions", [fmtMeasure(row.transport_length_m, "m"), fmtMeasure(row.transport_width_m, "m"), fmtMeasure(row.transport_height_m, "m")].join(" x "));
  push("Overall gross weight", fmtMeasure(row.transport_gross_weight_t, "t"));
  push("Axle weights / notes", row.axle_weight_notes);
  push("Trailer type", row.trailer_type);
  push("Tractor unit", row.tractor_unit_type);
  push("Preferred move window", row.preferred_move_window);
  push("Escort required", bool(row.escort_required) ? "Yes" : "No");
  push("Escort details", row.escort_details);
  lines.push("");
  lines.push(`Route & Submission`);
  lines.push(`------------------`);
  push("Route notes", row.route_notes);
  push("Restrictions", row.restriction_notes);
  push("Police notes", row.police_notes);
  push("Council notes", row.council_notes);
  push("Bridge notes", row.bridge_notes);
  push("Submission status", movementStatusLabel(row.submission_status));
  push("Movement order reference", row.movement_order_reference);
  push("Submitted by", row.submitted_by_name);
  push("Submitted at", row.movement_order_submitted_at);
  push("Approval status", approvalStatusLabel(row.approval_status));
  push("Approval notes", row.approval_notes);
  push("Supplier", row.supplier_name);
  if (num(row.supplier_cost) > 0) {
    push("Supplier / PO cost", `£${num(row.supplier_cost).toFixed(2)}`);
  }
  if (num(row.agreed_sell_rate) > 0) {
    push("Charge to customer", `£${num(row.agreed_sell_rate).toFixed(2)}`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
