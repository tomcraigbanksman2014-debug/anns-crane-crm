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
  axle_configuration?: string | null;
  front_axle_t?: number | string | null;
  drive_axle_t?: number | string | null;
  trailer_axle_1_t?: number | string | null;
  trailer_axle_2_t?: number | string | null;
  trailer_axle_3_t?: number | string | null;
  trailer_axle_4_t?: number | string | null;
  collection_contact_name?: string | null;
  collection_contact_phone?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  preferred_move_window?: string | null;
  trailer_type?: string | null;
  trailer_registration?: string | null;
  trailer_fleet_id?: string | null;
  tractor_unit_type?: string | null;
  tractor_unit_registration?: string | null;
  tractor_unit_fleet_id?: string | null;
  haulier_contact_name?: string | null;
  haulier_contact_phone?: string | null;
  escort_required?: boolean | null;
  escort_details?: string | null;
  escort_provider?: string | null;
  escort_contact_name?: string | null;
  escort_contact_phone?: string | null;
  route_notes?: string | null;
  planned_route?: string | null;
  route_start?: string | null;
  route_finish?: string | null;
  restriction_notes?: string | null;
  police_notes?: string | null;
  council_notes?: string | null;
  bridge_notes?: string | null;
  access_notes?: string | null;
  authority_areas?: string | null;
  route_checked?: boolean | null;
  movement_reference?: string | null;
  submission_method?: string | null;
  submission_status?: string | null;
  submission_notes?: string | null;
  movement_order_reference?: string | null;
  movement_order_required?: boolean | null;
  movement_order_status?: string | null;
  movement_order_cover_from?: string | null;
  movement_order_cover_to?: string | null;
  self_escort_required?: boolean | null;
  self_escort_van_reg?: string | null;
  self_escort_driver_name?: string | null;
  self_escort_driver_phone?: string | null;
  police_escort_required?: boolean | null;
  movement_order_submitted_at?: string | null;
  approval_status?: string | null;
  approval_notes?: string | null;
  approval_reference?: string | null;
  approval_received_at?: string | null;
  submitted_by_name?: string | null;
  authorised_to_move?: boolean | null;
  authorised_move_notes?: string | null;
  police_reference?: string | null;
  highways_reference?: string | null;
  bridge_reference?: string | null;
  council_reference?: string | null;
  special_order_reference?: string | null;
  vr1_reference?: string | null;
  special_instructions?: string | null;
  contingency_notes?: string | null;
  checklist_dimensions_confirmed?: boolean | null;
  checklist_weight_confirmed?: boolean | null;
  checklist_vehicle_confirmed?: boolean | null;
  checklist_axle_data_confirmed?: boolean | null;
  checklist_route_checked?: boolean | null;
  checklist_trailer_checked?: boolean | null;
  checklist_escort_checked?: boolean | null;
  checklist_site_access_checked?: boolean | null;
  checklist_contacts_confirmed?: boolean | null;
  checklist_authorities_identified?: boolean | null;
  checklist_customer_approved?: boolean | null;
  checklist_supplier_booked?: boolean | null;
  checklist_documents_uploaded?: boolean | null;
  checklist_submission_reviewed?: boolean | null;
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

function joined(parts: unknown[], separator = " • ") {
  return parts.map((part) => clean(part)).filter(Boolean).join(separator);
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
  if (raw === "awaiting_response") return "Awaiting response";
  if (raw === "awaiting_approval") return "Awaiting approval";
  if (raw === "approved") return "Approved";
  if (raw === "rejected") return "Rejected";
  if (raw === "amendments_required") return "Amendments required";
  if (raw === "completed") return "Completed";
  return raw ? raw.replace(/_/g, " ") : "Not started";
}

export function approvalStatusLabel(value: string | null | undefined) {
  const raw = clean(value).toLowerCase();
  if (raw === "not_started") return "Not started";
  if (raw === "not_required") return "Not required";
  if (raw === "awaiting_response") return "Awaiting response";
  if (raw === "awaiting_approval") return "Awaiting approval";
  if (raw === "approved") return "Approved";
  if (raw === "restricted") return "Approved with restrictions";
  if (raw === "rejected") return "Rejected";
  if (raw === "queried") return "Queried / more info needed";
  return raw ? raw.replace(/_/g, " ") : "Not started";
}

export function authorisationStatusLabel(value: boolean | string | null | undefined) {
  return bool(value) ? "Authorised to move" : "Not authorised to move";
}

export function submissionMethodLabel(value: string | null | undefined) {
  const raw = clean(value).toLowerCase();
  if (raw === "esdal") return "ESDAL";
  if (raw === "email") return "Email";
  if (raw === "portal") return "Portal";
  if (raw === "phone") return "Phone";
  if (raw === "manual") return "Manual";
  return raw ? raw.replace(/_/g, " ") : "Not set";
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
      authorised: false,
    };
  }

  const routeChecked = bool(row?.route_checked) || bool(row?.checklist_route_checked);
  const plannedRoutePresent = !!clean(row?.planned_route || row?.route_notes);

  const critical: Array<[string, boolean]> = [
    ["Category", !!clean(row?.abnormal_load_category)],
    ["Load length", num(row?.load_length_m) > 0],
    ["Load width", num(row?.load_width_m) > 0],
    ["Load height", num(row?.load_height_m) > 0],
    ["Load weight", num(row?.load_weight_t) > 0],
    ["Overall transport length", num(row?.transport_length_m) > 0],
    ["Overall transport width", num(row?.transport_width_m) > 0],
    ["Overall transport height", num(row?.transport_height_m) > 0],
    ["Overall gross weight", num(row?.transport_gross_weight_t) > 0],
    ["Tractor unit type", !!clean(row?.tractor_unit_type)],
    ["Tractor unit registration", !!clean(row?.tractor_unit_registration)],
    ["Trailer type", !!clean(row?.trailer_type)],
    ["Trailer registration", !!clean(row?.trailer_registration)],
    ["Axle configuration", !!clean(row?.axle_configuration)],
    ["Route start", !!clean(row?.route_start || row?.collection_address)],
    ["Route finish", !!clean(row?.route_finish || row?.delivery_address)],
    ["Planned route / route notes", plannedRoutePresent],
    ["Collection contact", !!clean(row?.collection_contact_name)],
    ["Delivery contact", !!clean(row?.delivery_contact_name)],
    ["Route checked", routeChecked],
  ];

  const recommended: Array<[string, boolean]> = [
    ["Preferred move window", !!clean(row?.preferred_move_window || row?.collection_time)],
    ["Haulier contact", !!clean(row?.haulier_contact_name) || !!clean(row?.haulier_contact_phone)],
    ["Authority areas", !!clean(row?.authority_areas)],
    ["Restrictions / access notes", !!clean(row?.restriction_notes || row?.access_notes)],
    ["Submission method", !!clean(row?.submission_method)],
    ["Documents uploaded", bool(row?.checklist_documents_uploaded)],
  ];

  if (bool(row?.escort_required)) {
    recommended.push(
      ["Escort provider", !!clean(row?.escort_provider || row?.escort_details)],
      ["Escort contact", !!clean(row?.escort_contact_name || row?.escort_contact_phone)],
    );
  }

  const checklist: Array<[string, boolean]> = [
    ["Dimensions confirmed", bool(row?.checklist_dimensions_confirmed)],
    ["Weight confirmed", bool(row?.checklist_weight_confirmed)],
    ["Vehicle confirmed", bool(row?.checklist_vehicle_confirmed)],
    ["Axle data confirmed", bool(row?.checklist_axle_data_confirmed)],
    ["Route checked", bool(row?.checklist_route_checked)],
    ["Trailer checked", bool(row?.checklist_trailer_checked)],
    ["Site access checked", bool(row?.checklist_site_access_checked)],
    ["Contacts confirmed", bool(row?.checklist_contacts_confirmed)],
    ["Authorities identified", bool(row?.checklist_authorities_identified)],
    ["Customer approved", bool(row?.checklist_customer_approved)],
    ["Supplier booked", bool(row?.checklist_supplier_booked)],
    ["Documents uploaded", bool(row?.checklist_documents_uploaded)],
    ["Submission reviewed", bool(row?.checklist_submission_reviewed)],
    ["Movement order submitted", bool(row?.checklist_movement_order_submitted)],
    ["Approval / permit received", bool(row?.checklist_approval_received)],
  ];

  if (bool(row?.escort_required)) {
    checklist.splice(6, 0, ["Escort checked", bool(row?.checklist_escort_checked)]);
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
      authorised: bool(row?.authorised_to_move),
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
      authorised: bool(row?.authorised_to_move),
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
    authorised: bool(row?.authorised_to_move),
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
  push("Movement reference", row.movement_reference);
  push("Movement order reference", row.movement_order_reference);
  push("Job type", row.job_type);
  push("Collection date", row.transport_date);
  push("Delivery date", row.delivery_date);
  push("Collection time", row.collection_time);
  push("Delivery time", row.delivery_time);
  push("Collection address", row.collection_address);
  push("Delivery address", row.delivery_address);
  push("Route start", row.route_start || row.collection_address);
  push("Route finish", row.route_finish || row.delivery_address);
  push("Collection contact", joined([row.collection_contact_name, row.collection_contact_phone]));
  push("Delivery contact", joined([row.delivery_contact_name, row.delivery_contact_phone]));
  push("Load description", row.load_description);

  lines.push("");
  lines.push(`Vehicle & Load Details`);
  lines.push(`----------------------`);
  push("Tractor unit registration", row.tractor_unit_registration);
  push("Tractor unit type", row.tractor_unit_type);
  push("Tractor unit fleet ID", row.tractor_unit_fleet_id);
  push("Trailer registration", row.trailer_registration);
  push("Trailer type", row.trailer_type);
  push("Trailer fleet ID", row.trailer_fleet_id);
  push("Haulier contact", joined([row.haulier_contact_name, row.haulier_contact_phone]));
  push("Load dimensions", [fmtMeasure(row.load_length_m, "m"), fmtMeasure(row.load_width_m, "m"), fmtMeasure(row.load_height_m, "m")].join(" x "));
  push("Load weight", fmtMeasure(row.load_weight_t, "t"));
  push("Overall transport dimensions", [fmtMeasure(row.transport_length_m, "m"), fmtMeasure(row.transport_width_m, "m"), fmtMeasure(row.transport_height_m, "m")].join(" x "));
  push("Overall gross weight", fmtMeasure(row.transport_gross_weight_t, "t"));
  push("Axle configuration", row.axle_configuration);
  push("Axle weights / notes", row.axle_weight_notes);
  push("Front axle", fmtMeasure(row.front_axle_t, "t"));
  push("Drive axle", fmtMeasure(row.drive_axle_t, "t"));
  push("Trailer axle 1", fmtMeasure(row.trailer_axle_1_t, "t"));
  push("Trailer axle 2", fmtMeasure(row.trailer_axle_2_t, "t"));
  push("Trailer axle 3", fmtMeasure(row.trailer_axle_3_t, "t"));
  push("Trailer axle 4", fmtMeasure(row.trailer_axle_4_t, "t"));
  push("Preferred move window", row.preferred_move_window);
  push("Escort required", bool(row.escort_required) ? "Yes" : "No");
  push("Escort provider", row.escort_provider);
  push("Escort contact", joined([row.escort_contact_name, row.escort_contact_phone]));
  push("Escort details", row.escort_details);

  lines.push("");
  lines.push(`Route & Authority`);
  lines.push(`-----------------`);
  push("Planned route", row.planned_route);
  push("Route notes", row.route_notes);
  push("Restrictions / access notes", joined([row.restriction_notes, row.access_notes], " | "));
  push("Bridge notes", row.bridge_notes);
  push("Police notes", row.police_notes);
  push("Council / highway notes", row.council_notes);
  push("Authority areas", row.authority_areas);
  push("Route checked", bool(row.route_checked) ? "Yes" : "No");
  push("Police reference", row.police_reference);
  push("Highways reference", row.highways_reference);
  push("Bridge reference", row.bridge_reference);
  push("Council reference", row.council_reference);
  push("Special Order reference", row.special_order_reference);
  push("VR1 reference", row.vr1_reference);

  lines.push("");
  lines.push(`Submission & Approval`);
  lines.push(`---------------------`);
  push("Submission method", submissionMethodLabel(row.submission_method));
  push("Submission status", movementStatusLabel(row.submission_status));
  push("Submitted by", row.submitted_by_name);
  push("Submitted at", row.movement_order_submitted_at);
  push("Submission notes", row.submission_notes);
  push("Approval status", approvalStatusLabel(row.approval_status));
  push("Approval reference", row.approval_reference);
  push("Approval received at", row.approval_received_at);
  push("Approval notes", row.approval_notes);
  push("Authorisation", authorisationStatusLabel(row.authorised_to_move));
  push("Authorised move notes", row.authorised_move_notes);

  lines.push("");
  lines.push(`Operational Notes`);
  lines.push(`-----------------`);
  push("Special instructions", row.special_instructions);
  push("Contingency notes", row.contingency_notes);
  push("Supplier", row.supplier_name);
  if (num(row.supplier_cost) > 0) {
    push("Supplier / PO cost", `£${num(row.supplier_cost).toFixed(2)}`);
  }
  if (num(row.agreed_sell_rate) > 0) {
    push("Charge to customer", `£${num(row.agreed_sell_rate).toFixed(2)}`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}


export function simpleMovementOrderStatusLabel(value: string | null | undefined) {
  const raw = clean(value).toLowerCase();
  if (raw === "not_required") return "Not required";
  if (raw === "required") return "Required";
  if (raw === "submitted") return "Submitted";
  if (raw === "approved") return "Approved";
  if (raw === "rejected") return "Rejected";
  if (raw === "other") return "Other";
  return raw ? raw.replace(/_/g, " ") : "Not required";
}
