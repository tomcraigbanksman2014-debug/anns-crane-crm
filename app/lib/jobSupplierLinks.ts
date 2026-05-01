type SupplierLookupRow = { id: string; company_name?: string | null; category?: string | null };

export type SupplierLinkInput = {
  supplier_id: string | null;
  supplier_display_name: string | null;
  supplier_category: string | null;
  supplier_reference: string | null;
  service_description: string | null;
  supplier_cost: number | null;
  notes: string | null;
  is_primary: boolean;
  sort_order: number;
};

function clean(value: FormDataEntryValue | null | undefined) {
  const raw = String(value ?? "").trim();
  return raw.length ? raw : null;
}

function numberOrNull(value: FormDataEntryValue | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function checkboxValue(value: FormDataEntryValue | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}

function countFromForm(formData: FormData) {
  const raw = Number(String(formData.get("supplier_link_count") ?? "").trim());
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 25);
  return 12;
}

export function parseSupplierLinksFromFormData(formData: FormData): SupplierLinkInput[] {
  const count = countFromForm(formData);
  const rows: SupplierLinkInput[] = [];

  for (let index = 0; index < count; index += 1) {
    const rawSupplierId = clean(formData.get(`supplier_link_supplier_id_${index}`));
    const supplierId = rawSupplierId && rawSupplierId !== "other" ? rawSupplierId : null;
    const supplierDisplayName = clean(formData.get(`supplier_link_supplier_display_name_${index}`));
    const supplierCategory = clean(formData.get(`supplier_link_supplier_category_${index}`));
    const supplierReference = clean(formData.get(`supplier_link_supplier_reference_${index}`));
    const serviceDescription = clean(formData.get(`supplier_link_service_description_${index}`));
    const supplierCost = numberOrNull(formData.get(`supplier_link_supplier_cost_${index}`));
    const notes = clean(formData.get(`supplier_link_notes_${index}`));
    const isPrimary = checkboxValue(formData.get(`supplier_link_is_primary_${index}`));

    if (!supplierId && !supplierDisplayName && !supplierCategory && !supplierReference && !serviceDescription && supplierCost === null && !notes) {
      continue;
    }

    rows.push({
      supplier_id: supplierId,
      supplier_display_name: supplierDisplayName,
      supplier_category: supplierCategory,
      supplier_reference: supplierReference,
      service_description: serviceDescription,
      supplier_cost: supplierCost,
      notes,
      is_primary: isPrimary,
      sort_order: rows.length,
    });
  }

  if (rows.length > 0 && !rows.some((row) => row.is_primary)) {
    rows[0].is_primary = true;
  }

  if (rows.filter((row) => row.is_primary).length > 1) {
    let primarySeen = false;
    rows.forEach((row) => {
      if (row.is_primary && !primarySeen) {
        primarySeen = true;
        return;
      }
      row.is_primary = false;
    });
  }

  return rows;
}

export function buildFallbackSupplierLink(input: {
  supplier_id?: string | null;
  supplier_display_name?: string | null;
  supplier_category?: string | null;
  supplier_reference?: string | null;
  service_description?: string | null;
  supplier_cost?: number | string | null;
  notes?: string | null;
}): SupplierLinkInput | null {
  const costRaw = input.supplier_cost === null || input.supplier_cost === undefined || input.supplier_cost === "" ? null : Number(input.supplier_cost);
  const supplierCost = Number.isFinite(costRaw) ? costRaw : null;
  const link: SupplierLinkInput = {
    supplier_id: input.supplier_id ?? null,
    supplier_display_name: input.supplier_display_name ?? null,
    supplier_category: input.supplier_category ?? null,
    supplier_reference: input.supplier_reference ?? null,
    service_description: input.service_description ?? null,
    supplier_cost: supplierCost,
    notes: input.notes ?? null,
    is_primary: true,
    sort_order: 0,
  };

  if (!link.supplier_id && !link.supplier_display_name && !link.supplier_category && !link.supplier_reference && !link.service_description && link.supplier_cost === null && !link.notes) {
    return null;
  }

  return link;
}

export function normaliseSupplierLinks(rawRows: any[] | null | undefined, fallback?: SupplierLinkInput | null): SupplierLinkInput[] {
  const rows = (rawRows ?? [])
    .map((row: any, index: number) => ({
      supplier_id: row.supplier_id ?? null,
      supplier_display_name: row.supplier_display_name ?? row.suppliers?.company_name ?? null,
      supplier_category: row.supplier_category ?? row.suppliers?.category ?? null,
      supplier_reference: row.supplier_reference ?? null,
      service_description: row.service_description ?? null,
      supplier_cost: row.supplier_cost == null ? null : Number(row.supplier_cost),
      notes: row.notes ?? null,
      is_primary: Boolean(row.is_primary),
      sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (rows.length === 0 && fallback) return [fallback];
  if (rows.length > 0 && !rows.some((row) => row.is_primary)) rows[0].is_primary = true;
  return rows;
}

async function enrichSupplierLinks(supabase: any, rows: SupplierLinkInput[]) {
  const ids = Array.from(new Set(rows.map((row) => row.supplier_id).filter(Boolean))) as string[];
  if (ids.length === 0) return rows;

  const { data } = await supabase
    .from("suppliers")
    .select("id, company_name, category")
    .in("id", ids);

  const supplierMap = new Map<string, SupplierLookupRow>();
  (data ?? []).forEach((row: SupplierLookupRow) => {
    if (row?.id) supplierMap.set(String(row.id), row);
  });

  return rows.map((row) => {
    const supplier = row.supplier_id ? supplierMap.get(row.supplier_id) : null;
    return {
      ...row,
      supplier_display_name: row.supplier_display_name || supplier?.company_name || null,
      supplier_category: row.supplier_category || supplier?.category || null,
    };
  });
}

export function getPrimarySupplierLink(rows: SupplierLinkInput[]) {
  return rows.find((row) => row.is_primary) ?? rows[0] ?? null;
}

export function supplierCostTotal(rows: SupplierLinkInput[]) {
  return rows.reduce((total, row) => total + (Number(row.supplier_cost ?? 0) || 0), 0);
}

export async function replaceJobSupplierLinks(supabase: any, jobId: string, rows: SupplierLinkInput[]) {
  const enriched = await enrichSupplierLinks(supabase, rows);
  const primary = getPrimarySupplierLink(enriched);

  const { error: deleteError } = await supabase.from("job_supplier_links").delete().eq("job_id", jobId);
  if (deleteError) throw new Error(deleteError.message);

  if (enriched.length > 0) {
    const { error: insertError } = await supabase.from("job_supplier_links").insert(
      enriched.map((row, index) => ({
        job_id: jobId,
        supplier_id: row.supplier_id,
        supplier_display_name: row.supplier_display_name,
        supplier_category: row.supplier_category,
        supplier_reference: row.supplier_reference,
        service_description: row.service_description,
        supplier_cost: row.supplier_cost,
        notes: row.notes,
        is_primary: row.is_primary,
        sort_order: index,
      }))
    );
    if (insertError) throw new Error(insertError.message);
  }

  const { error: syncError } = await supabase
    .from("jobs")
    .update({
      supplier_id: primary?.supplier_id ?? null,
      cross_hire_cost_total: supplierCostTotal(enriched),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (syncError) throw new Error(syncError.message);
}

export async function replaceTransportSupplierLinks(supabase: any, transportJobId: string, rows: SupplierLinkInput[]) {
  const enriched = await enrichSupplierLinks(supabase, rows);
  const primary = getPrimarySupplierLink(enriched);

  const { error: deleteError } = await supabase
    .from("transport_job_supplier_links")
    .delete()
    .eq("transport_job_id", transportJobId);
  if (deleteError) throw new Error(deleteError.message);

  if (enriched.length > 0) {
    const { error: insertError } = await supabase.from("transport_job_supplier_links").insert(
      enriched.map((row, index) => ({
        transport_job_id: transportJobId,
        supplier_id: row.supplier_id,
        supplier_display_name: row.supplier_display_name,
        supplier_category: row.supplier_category,
        supplier_reference: row.supplier_reference,
        service_description: row.service_description,
        supplier_cost: row.supplier_cost,
        notes: row.notes,
        is_primary: row.is_primary,
        sort_order: index,
      }))
    );
    if (insertError) throw new Error(insertError.message);
  }

  const { error: syncError } = await supabase
    .from("transport_jobs")
    .update({
      supplier_id: primary?.supplier_id ?? null,
      supplier_reference: primary?.supplier_reference ?? null,
      supplier_cost: primary?.supplier_cost ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transportJobId);

  if (syncError) throw new Error(syncError.message);
}
