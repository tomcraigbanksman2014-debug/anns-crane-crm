export type SearchEntityType =
  | "customer"
  | "job"
  | "transport"
  | "quote"
  | "equipment"
  | "audit";

export type SearchScope =
  | "all"
  | "customers"
  | "jobs"
  | "transport"
  | "quotes"
  | "equipment"
  | "audit";

export type SearchItem = {
  type: SearchEntityType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  sort_date?: string | null;
};

export type GroupedSearchResults = {
  customers: SearchItem[];
  jobs: SearchItem[];
  transport: SearchItem[];
  quotes: SearchItem[];
  equipment: SearchItem[];
  audit: SearchItem[];
};

function safeQ(q: string) {
  return q.trim().slice(0, 120);
}

function safeLike(q: string) {
  return `%${q.replace(/[%]/g, "").replace(/,/g, " ")}%`;
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function includeScope(scope: SearchScope, key: SearchScope) {
  return scope === "all" || scope === key;
}

function shortText(value: string | null | undefined, max = 120) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function runGlobalSearch(
  supabase: any,
  rawQuery: string,
  scope: SearchScope = "all",
  limit = 20
): Promise<{
  query: string;
  grouped: GroupedSearchResults;
  flat: SearchItem[];
}> {
  const q = safeQ(rawQuery);
  if (!q) {
    return {
      query: "",
      grouped: {
        customers: [],
        jobs: [],
        transport: [],
        quotes: [],
        equipment: [],
        audit: [],
      },
      flat: [],
    };
  }

  const like = safeLike(q);
  const uuid = isUuid(q) ? q : null;
  const numericQ = /^\d+$/.test(q) ? Number(q) : null;

  const tasks: Promise<any>[] = [];

  tasks.push(
    includeScope(scope, "customers")
      ? supabase
          .from("clients")
          .select("id, company_name, contact_name, phone, email, notes, archived, created_at")
          .eq("archived", false)
          .or(
            [
              uuid ? `id.eq.${uuid}` : null,
              `company_name.ilike.${like}`,
              `contact_name.ilike.${like}`,
              `phone.ilike.${like}`,
              `email.ilike.${like}`,
              `notes.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("company_name", { ascending: true })
          .limit(limit)
      : Promise.resolve({ data: [] })
  );

  tasks.push(
    includeScope(scope, "jobs")
      ? supabase
          .from("jobs")
          .select(`
            id,
            job_number,
            site_name,
            site_address,
            job_date,
            status,
            notes,
            archived,
            clients:client_id (
              company_name
            )
          `)
          .eq("archived", false)
          .or(
            [
              uuid ? `id.eq.${uuid}` : null,
              numericQ !== null ? `job_number.eq.${numericQ}` : null,
              `site_name.ilike.${like}`,
              `site_address.ilike.${like}`,
              `status.ilike.${like}`,
              `notes.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("job_date", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] })
  );

  tasks.push(
    includeScope(scope, "transport")
      ? supabase
          .from("transport_jobs")
          .select(`
            id,
            transport_number,
            transport_date,
            collection_address,
            delivery_address,
            load_description,
            status,
            notes,
            archived,
            clients:client_id (
              company_name
            ),
            jobs:linked_job_id (
              job_number,
              site_name
            )
          `)
          .eq("archived", false)
          .or(
            [
              uuid ? `id.eq.${uuid}` : null,
              `transport_number.ilike.${like}`,
              `collection_address.ilike.${like}`,
              `delivery_address.ilike.${like}`,
              `load_description.ilike.${like}`,
              `status.ilike.${like}`,
              `notes.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("transport_date", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] })
  );

  tasks.push(
    includeScope(scope, "quotes")
      ? supabase
          .from("quotes")
          .select(`
            id,
            subject,
            amount,
            status,
            quote_date,
            valid_until,
            notes,
            archived,
            clients:client_id (
              company_name
            )
          `)
          .eq("archived", false)
          .or(
            [
              uuid ? `id.eq.${uuid}` : null,
              `subject.ilike.${like}`,
              `status.ilike.${like}`,
              `notes.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] })
  );

  tasks.push(
    includeScope(scope, "equipment")
      ? supabase
          .from("equipment")
          .select("id, name, asset_number, type, capacity, status, notes, archived, created_at")
          .eq("archived", false)
          .or(
            [
              uuid ? `id.eq.${uuid}` : null,
              `name.ilike.${like}`,
              `asset_number.ilike.${like}`,
              `type.ilike.${like}`,
              `capacity.ilike.${like}`,
              `status.ilike.${like}`,
              `notes.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("name", { ascending: true })
          .limit(limit)
      : Promise.resolve({ data: [] })
  );

  tasks.push(
    includeScope(scope, "audit")
      ? supabase
          .from("audit_log")
          .select("id, action, entity_type, entity_id, meta, created_at")
          .or(
            [
              uuid ? `id.eq.${uuid}` : null,
              uuid ? `entity_id.eq.${uuid}` : null,
              `action.ilike.${like}`,
              `entity_type.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] })
  );

  const [
    customersRes,
    jobsRes,
    transportRes,
    quotesRes,
    equipmentRes,
    auditRes,
  ] = await Promise.all(tasks);

  const grouped: GroupedSearchResults = {
    customers: [],
    jobs: [],
    transport: [],
    quotes: [],
    equipment: [],
    audit: [],
  };

  for (const c of customersRes.data ?? []) {
    grouped.customers.push({
      type: "customer",
      id: c.id,
      title: c.company_name ?? "Customer",
      subtitle: `${c.contact_name ?? "—"} • ${c.phone ?? "—"} • ${c.email ?? "—"}${
        c.notes ? " • notes" : ""
      }`,
      href: `/customers/${c.id}`,
      sort_date: c.created_at ?? null,
    });
  }

  for (const j of jobsRes.data ?? []) {
    const client = asArray(j.clients)[0];
    grouped.jobs.push({
      type: "job",
      id: j.id,
      title: `Job #${j.job_number ?? "—"} • ${j.site_name ?? "—"}`,
      subtitle: `${client?.company_name ?? "—"} • ${shortText(j.site_address)} • ${j.status ?? "—"}`,
      href: `/jobs/${j.id}`,
      sort_date: j.job_date ?? null,
    });
  }

  for (const t of transportRes.data ?? []) {
    const client = asArray(t.clients)[0];
    const linkedJob = asArray(t.jobs)[0];
    grouped.transport.push({
      type: "transport",
      id: t.id,
      title: `${t.transport_number ?? "Transport Job"} • ${t.status ?? "—"}`,
      subtitle: `${client?.company_name ?? "—"} • Pickup: ${shortText(
        t.collection_address,
        50
      )} • Delivery: ${shortText(t.delivery_address, 50)}${
        linkedJob?.job_number ? ` • Job #${linkedJob.job_number}` : ""
      }`,
      href: `/transport-jobs/${t.id}`,
      sort_date: t.transport_date ?? null,
    });
  }

  for (const qRow of quotesRes.data ?? []) {
    const client = asArray(qRow.clients)[0];
    grouped.quotes.push({
      type: "quote",
      id: qRow.id,
      title: qRow.subject ?? "Quote",
      subtitle: `${client?.company_name ?? "—"} • £${Number(qRow.amount ?? 0).toFixed(
        2
      )} • ${qRow.status ?? "—"}`,
      href: `/quotes/${qRow.id}`,
      sort_date: qRow.quote_date ?? null,
    });
  }

  for (const e of equipmentRes.data ?? []) {
    grouped.equipment.push({
      type: "equipment",
      id: e.id,
      title: e.name ?? "Equipment",
      subtitle: `${e.asset_number ?? "—"} • ${e.type ?? "—"} • ${e.capacity ?? "—"} • ${e.status ?? "—"}${
        e.notes ? " • notes" : ""
      }`,
      href: `/equipment/${e.id}`,
      sort_date: e.created_at ?? null,
    });
  }

  for (const a of auditRes.data ?? []) {
    const metaText = a.meta ? JSON.stringify(a.meta) : "";
    grouped.audit.push({
      type: "audit",
      id: a.id,
      title: `${a.action ?? "action"} • ${a.entity_type ?? "entity"}`,
      subtitle: `${a.created_at ?? ""}${a.entity_id ? ` • ${a.entity_id}` : ""}${
        metaText ? ` • ${shortText(metaText, 80)}` : ""
      }`,
      href: `/admin/audit`,
      sort_date: a.created_at ?? null,
    });
  }

  const flat = [
    ...grouped.customers,
    ...grouped.jobs,
    ...grouped.transport,
    ...grouped.quotes,
    ...grouped.equipment,
    ...grouped.audit,
  ].sort((a, b) => String(b.sort_date ?? "").localeCompare(String(a.sort_date ?? "")));

  return {
    query: q,
    grouped,
    flat,
  };
}
