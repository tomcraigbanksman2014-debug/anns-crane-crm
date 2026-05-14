import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";
import { getAccessContext } from "../../lib/access";
import { runGlobalSearch } from "../../lib/global-search";
import { writeAuditLog } from "../../lib/audit";
import { assertOperatorAvailable } from "../../lib/staffAvailability";

type AssistantAction =
  | "search_jobs"
  | "open_job"
  | "open_planner_date"
  | "check_job_missing_info"
  | "create_crane_job_draft"
  | "create_transport_job_draft"
  | "update_job_date_draft"
  | "assign_operator_draft"
  | "mark_visit_invoiced_draft"
  | "help"
  | "unknown";

type ParsedCommand = {
  action: AssistantAction;
  confidence: number;
  job_number: number | null;
  customer_name: string | null;
  crane_name: string | null;
  operator_name: string | null;
  date_text: string | null;
  target_date: string | null;
  visit_date: string | null;
  search_query: string | null;
  site_name: string | null;
  site_address: string | null;
  notes: string | null;
  dangerous: boolean;
};

type AssistantResult = {
  label: string;
  href?: string;
  description?: string;
  badge?: string;
};

type DraftPreviewRow = {
  label: string;
  value: string;
};

type DraftAction = {
  type:
    | "create_crane_job"
    | "move_crane_job"
    | "assign_operator"
    | "mark_visit_invoiced";
  title: string;
  warning?: string | null;
  preview: DraftPreviewRow[];
  payload: Record<string, any>;
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isIsoDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

function isoDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(dateIso: string, days: number) {
  const d = parseDateOnly(dateIso);
  if (!d) return dateIso;
  d.setDate(d.getDate() + days);
  return isoDateLocal(d);
}

function dateOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const fallback = raw.slice(0, 10);
  return isIsoDate(fallback) ? fallback : null;
}

function timeOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/T(\d{2}:\d{2})/);
  if (match?.[1]) return match[1];
  const timeMatch = raw.match(/^(\d{2}:\d{2})/);
  if (timeMatch?.[1]) return timeMatch[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function shiftTimestampDate(value: string | null | undefined, deltaDays: number) {
  const date = dateOnlyFromTimestamp(value);
  if (!date) return null;
  const time = timeOnlyFromTimestamp(value) ?? "08:00";
  return `${addDays(date, deltaDays)}T${time}:00`;
}

function daysBetween(startIso: string, endIso: string) {
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = parseDateOnly(value);
  if (!d) return String(value);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function safeLike(value: string) {
  return `%${String(value ?? "").replace(/[%_,]/g, " ").trim()}%`;
}

function normaliseName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/limited/g, "ltd")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCommandNoise(value: string) {
  return String(value ?? "")
    .replace(/\b(show|find|open|me|job|jobs|customer|customers|for|the|this|week|needing|need|needs|lift|plans|planner)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentTodayIso() {
  return isoDateLocal(new Date());
}

function mondayOf(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function weekBoundsFromCommand(command: string) {
  const lower = String(command ?? "").toLowerCase();
  const start = mondayOf(new Date());
  if (/next week/.test(lower)) start.setDate(start.getDate() + 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoDateLocal(start), end: isoDateLocal(end) };
}

function resolveDate(dateText: string | null | undefined, targetDate?: string | null) {
  const target = clean(targetDate);
  if (target && isIsoDate(target)) return target;

  const raw = String(dateText ?? "").trim().toLowerCase();
  if (!raw) return null;

  if (isIsoDate(raw)) return raw;

  const ddmmyyyy = raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const rawYear = ddmmyyyy[3] ?? String(new Date().getFullYear());
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const iso = `${year}-${month}-${day}`;
    if (parseDateOnly(iso)) return iso;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/\btoday\b/.test(raw)) return isoDateLocal(today);
  if (/\btomorrow\b/.test(raw)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return isoDateLocal(d);
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const matchDay = Object.keys(weekdays).find((day) => raw.includes(day));
  if (matchDay) {
    const wanted = weekdays[matchDay];
    const current = today.getDay();
    let diff = wanted - current;
    if (diff < 0) diff += 7;
    if (/\bnext\b/.test(raw) && diff === 0) diff = 7;
    if (/\bnext\b/.test(raw) && diff > 0 && diff < 7) {
      // In site language, "next Wednesday" usually means the upcoming named day.
      // Keep the nearest future date rather than jumping an extra week.
    }
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return isoDateLocal(d);
  }

  return null;
}

function extractResponseText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;

  const parts: string[] = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function fallbackParseCommand(command: string): ParsedCommand {
  const text = String(command ?? "").trim();
  const lower = text.toLowerCase();
  const jobMatch = lower.match(/\bjob\s*#?\s*(\d+)\b/) ?? lower.match(/\b#\s*(\d+)\b/);
  const jobNumber = jobMatch ? Number(jobMatch[1]) : null;

  const dateBits = [
    "today",
    "tomorrow",
    "next monday",
    "next tuesday",
    "next wednesday",
    "next thursday",
    "next friday",
    "next saturday",
    "next sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const dateText = dateBits.find((bit) => lower.includes(bit)) ?? null;

  if (/\b(help|what can you do|examples)\b/.test(lower)) {
    return emptyParsed("help", text);
  }

  if (/\b(create|add|new)\b/.test(lower) && /\b(crane|lift)\b/.test(lower) && /\bjob\b/.test(lower)) {
    const customerMatch = text.match(/\bfor\s+(.+?)(?:\s+on\s+|\s+tomorrow\b|\s+today\b|\s+next\s+|\s+with\s+|$)/i);
    const craneMatch = text.match(/\bwith\s+(?:the\s+)?(.+?)(?:\s+on\s+|$)/i);
    return {
      ...emptyParsed("create_crane_job_draft", text),
      customer_name: clean(customerMatch?.[1]),
      crane_name: clean(craneMatch?.[1]),
      date_text: dateText,
      target_date: resolveDate(dateText),
      confidence: 0.72,
    };
  }

  if (/\b(move|change|put)\b/.test(lower) && jobNumber) {
    return {
      ...emptyParsed("update_job_date_draft", text),
      job_number: jobNumber,
      date_text: dateText,
      target_date: resolveDate(dateText),
      confidence: 0.75,
    };
  }

  if (/\b(add|assign|put)\b/.test(lower) && /\b(operator|driver|shaun|tom|dan)\b/.test(lower) && jobNumber) {
    const operatorMatch = text.match(/\b(?:add|assign|put)\s+(.+?)\s+(?:as\s+)?(?:operator|driver)?\s*(?:on|to|for)\s+job\b/i);
    return {
      ...emptyParsed("assign_operator_draft", text),
      job_number: jobNumber,
      operator_name: clean(operatorMatch?.[1]),
      confidence: 0.7,
    };
  }

  if (/\binvoic/.test(lower) && jobNumber) {
    return {
      ...emptyParsed("mark_visit_invoiced_draft", text),
      job_number: jobNumber,
      visit_date: resolveDate(dateText, null) ?? (/today/.test(lower) ? currentTodayIso() : null),
      date_text: dateText,
      confidence: 0.8,
    };
  }

  if (/\bmissing|ready|lift plan|lp\b/.test(lower) && jobNumber) {
    return {
      ...emptyParsed("check_job_missing_info", text),
      job_number: jobNumber,
      confidence: 0.78,
    };
  }

  if (/\b(planner|diary|calendar)\b/.test(lower)) {
    return {
      ...emptyParsed("open_planner_date", text),
      date_text: dateText,
      target_date: resolveDate(dateText),
      confidence: 0.65,
    };
  }

  if (jobNumber) {
    return {
      ...emptyParsed("open_job", text),
      job_number: jobNumber,
      confidence: 0.82,
    };
  }

  return {
    ...emptyParsed("search_jobs", text),
    search_query: stripCommandNoise(text) || text,
    confidence: 0.55,
  };
}

function emptyParsed(action: AssistantAction, command: string): ParsedCommand {
  return {
    action,
    confidence: action === "unknown" ? 0 : 0.5,
    job_number: null,
    customer_name: null,
    crane_name: null,
    operator_name: null,
    date_text: null,
    target_date: null,
    visit_date: null,
    search_query: stripCommandNoise(command),
    site_name: null,
    site_address: null,
    notes: null,
    dangerous: false,
  };
}

async function parseWithOpenAI(command: string): Promise<ParsedCommand | null> {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const todayIso = currentTodayIso();
  const model = clean(process.env.OPENAI_CRM_ASSISTANT_MODEL) ?? "gpt-4.1-mini";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: [
          "search_jobs",
          "open_job",
          "open_planner_date",
          "check_job_missing_info",
          "create_crane_job_draft",
          "create_transport_job_draft",
          "update_job_date_draft",
          "assign_operator_draft",
          "mark_visit_invoiced_draft",
          "help",
          "unknown",
        ],
      },
      confidence: { type: "number" },
      job_number: { type: ["number", "null"] },
      customer_name: { type: ["string", "null"] },
      crane_name: { type: ["string", "null"] },
      operator_name: { type: ["string", "null"] },
      date_text: { type: ["string", "null"] },
      target_date: { type: ["string", "null"] },
      visit_date: { type: ["string", "null"] },
      search_query: { type: ["string", "null"] },
      site_name: { type: ["string", "null"] },
      site_address: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      dangerous: { type: "boolean" },
    },
    required: [
      "action",
      "confidence",
      "job_number",
      "customer_name",
      "crane_name",
      "operator_name",
      "date_text",
      "target_date",
      "visit_date",
      "search_query",
      "site_name",
      "site_address",
      "notes",
      "dangerous",
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You turn simple UK crane-hire CRM commands into one safe structured action. Do not invent CRM data. Extract names and dates only. Write actions must be drafts that need confirmation. If the command asks to cancel, delete, archive, unlock a lift plan, bulk invoice, or anything destructive, set action unknown and dangerous true. Today's date is " +
              todayIso +
              ". Dates should be ISO YYYY-MM-DD when the user gives a clear date such as today, tomorrow, Wednesday, next Wednesday, or DD/MM/YYYY.",
          },
          { role: "user", content: command },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "crm_command",
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const text = extractResponseText(data);
    if (!text) return null;

    const parsed = JSON.parse(text) as ParsedCommand;
    if (!parsed?.action) return null;

    return {
      ...fallbackParseCommand(command),
      ...parsed,
      target_date: resolveDate(parsed.date_text, parsed.target_date),
      visit_date: resolveDate(parsed.date_text, parsed.visit_date),
    };
  } catch {
    return null;
  }
}

async function resolveCustomer(supabase: any, name: string | null | undefined) {
  const wanted = clean(name);
  if (!wanted) return { selected: null as any, matches: [] as any[] };

  const { data } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, email, archived")
    .or("archived.is.null,archived.eq.false")
    .ilike("company_name", safeLike(wanted))
    .order("company_name", { ascending: true })
    .limit(8);

  const rows = data ?? [];
  const normWanted = normaliseName(wanted);
  const selected =
    rows.find((row: any) => normaliseName(row?.company_name) === normWanted) ??
    rows.find((row: any) => normaliseName(row?.company_name).includes(normWanted)) ??
    rows[0] ??
    null;

  return { selected, matches: rows };
}

async function resolveCrane(supabase: any, name: string | null | undefined) {
  const wanted = clean(name);
  if (!wanted) return { selected: null as any, matches: [] as any[] };

  const { data } = await supabase
    .from("cranes")
    .select("id, name, reg_number, fleet_number, status, archived")
    .or("archived.is.null,archived.eq.false")
    .ilike("name", safeLike(wanted))
    .order("name", { ascending: true })
    .limit(8);

  const rows = data ?? [];
  const normWanted = normaliseName(wanted);
  const selected =
    rows.find((row: any) => normaliseName(row?.name) === normWanted) ??
    rows.find((row: any) => normaliseName(row?.name).includes(normWanted)) ??
    rows[0] ??
    null;

  return { selected, matches: rows };
}

async function resolveOperator(supabase: any, name: string | null | undefined) {
  const wanted = clean(name);
  if (!wanted) return { selected: null as any, matches: [] as any[] };

  const { data } = await supabase
    .from("operators")
    .select("id, full_name, email, status, archived")
    .or("archived.is.null,archived.eq.false")
    .ilike("full_name", safeLike(wanted))
    .order("full_name", { ascending: true })
    .limit(8);

  const rows = data ?? [];
  const normWanted = normaliseName(wanted);
  const selected =
    rows.find((row: any) => normaliseName(row?.full_name) === normWanted) ??
    rows.find((row: any) => normaliseName(row?.full_name).includes(normWanted)) ??
    rows[0] ??
    null;

  return { selected, matches: rows };
}

async function findJobByNumber(supabase: any, jobNumber: number | null | undefined) {
  const n = numberOrNull(jobNumber);
  if (n == null) return null;

  const { data } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      client_id,
      operator_id,
      crane_id,
      site_name,
      site_address,
      job_date,
      start_date,
      end_date,
      start_time,
      end_time,
      status,
      hire_type,
      lift_type,
      notes,
      archived,
      clients:client_id (id, company_name),
      operators:operator_id (id, full_name),
      cranes:crane_id (id, name, reg_number)
    `)
    .eq("job_number", n)
    .maybeSingle();

  return data ?? null;
}

function jobResult(job: any): AssistantResult {
  const client = first(job?.clients);
  return {
    label: `Job ${job?.job_number ?? "—"}`,
    href: `/jobs/${job?.id}`,
    badge: String(job?.status ?? "Job"),
    description: `${client?.company_name ?? "No customer"} • ${job?.site_name ?? job?.site_address ?? "No site"} • ${formatDate(job?.start_date ?? job?.job_date)}`,
  };
}

function responseJson(payload: Record<string, any>, status = 200) {
  return NextResponse.json({ ok: status < 400, ...payload }, { status });
}

function helpResponse() {
  return responseJson({
    mode: "help",
    title: "AnnS CRM Assistant",
    message:
      "Type or tap the microphone and say a simple command. I can find jobs, check missing job details, open the planner, and prepare safe changes for confirmation.",
    examples: [
      "Create crane job for Crendons on Wednesday with Grove",
      "Find job 169",
      "Show jobs needing lift plans this week",
      "Move job 169 to Friday",
      "Add Shaun as operator on job 169",
      "Mark today's visit on job 169 as invoiced",
    ],
  });
}

async function handleJobsNeedingLiftPlans(supabase: any, command: string) {
  const bounds = weekBoundsFromCommand(command);
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      client_id,
      site_name,
      site_address,
      job_date,
      start_date,
      end_date,
      status,
      hire_type,
      lift_type,
      archived,
      clients:client_id (id, company_name)
    `)
    .or("archived.is.null,archived.eq.false")
    .order("start_date", { ascending: true })
    .limit(120);

  if (error) throw new Error(error.message);

  const activeJobs = (jobs ?? []).filter((job: any) => {
    const status = String(job?.status ?? "").toLowerCase();
    if (["cancelled", "late_cancelled", "draft"].includes(status)) return false;
    const start = clean(job.start_date) ?? clean(job.job_date);
    const end = clean(job.end_date) ?? start;
    if (!start || !end) return false;
    if (end < bounds.start || start > bounds.end) return false;
    return liftPlanLikelyRequired(job);
  });

  const jobIds = activeJobs.map((job: any) => job.id).filter(Boolean);
  const { data: liftPlans, error: liftError } = jobIds.length
    ? await supabase
        .from("lift_plans")
        .select("job_id, paperwork_locked, method_statement, risk_assessment, pack_sections")
        .in("job_id", jobIds)
    : { data: [], error: null };

  if (liftError) throw new Error(liftError.message);

  const liftPlanByJobId = new Map((liftPlans ?? []).map((row: any) => [String(row.job_id), row]));
  const needing = activeJobs.filter((job: any) => {
    const liftPlan = liftPlanByJobId.get(String(job.id));
    return !liftPlan || !Boolean((liftPlan as any)?.paperwork_locked);
  });

  return responseJson({
    mode: "read",
    action: "search_jobs",
    title: `Jobs needing lift plans ${formatDate(bounds.start)} → ${formatDate(bounds.end)}`,
    message: needing.length
      ? `I found ${needing.length} job${needing.length === 1 ? "" : "s"} that may need lift plan attention.`
      : "I could not find any contract-lift jobs needing lift plan attention for that week.",
    results: needing.slice(0, 12).map(jobResult),
  });
}

async function handleSearch(supabase: any, parsed: ParsedCommand, command: string) {
  const lower = String(command ?? "").toLowerCase();
  if (/(lift\s*plan|lp)/.test(lower) && /(need|missing|required|review|show|check)/.test(lower)) {
    return handleJobsNeedingLiftPlans(supabase, command);
  }

  const query = clean(parsed.search_query) ?? clean(parsed.customer_name) ?? stripCommandNoise(command) ?? command;
  const results = await runGlobalSearch(supabase, query, "all", 8);

  return responseJson({
    mode: "read",
    action: parsed.action,
    title: `Search: ${query}`,
    message: results.flat.length ? `I found ${results.flat.length} result${results.flat.length === 1 ? "" : "s"}.` : "I could not find anything matching that.",
    results: results.flat.slice(0, 8).map((item) => ({
      label: item.title,
      href: item.href,
      badge: item.type,
      description: item.subtitle,
    })),
  });
}

async function handleOpenJob(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);

  if (!job) {
    return responseJson({
      mode: "read",
      action: parsed.action,
      title: "Job not found",
      message: parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number to open.",
      results: [],
    });
  }

  return responseJson({
    mode: "read",
    action: parsed.action,
    title: `Open job ${job.job_number}`,
    message: "I found the job.",
    results: [jobResult(job)],
    open_href: `/jobs/${job.id}`,
  });
}

function liftPlanLikelyRequired(job: any) {
  const hireType = String(job?.hire_type ?? "").toLowerCase();
  const liftType = String(job?.lift_type ?? "").toLowerCase();
  return hireType.includes("contract") || liftType.includes("contract");
}

async function handleMissingInfo(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  if (!job) {
    return responseJson({
      mode: "read",
      title: "Job not found",
      message: parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number to check.",
    });
  }

  const [{ data: equipmentRows }, { data: liftPlans }] = await Promise.all([
    supabase
      .from("job_equipment")
      .select("id, asset_type, crane_id, operator_id, item_name, cranes:crane_id (id, name), operators:operator_id (id, full_name)")
      .eq("job_id", job.id),
    supabase
      .from("lift_plans")
      .select("id, paperwork_locked, method_statement, risk_assessment, pack_sections")
      .eq("job_id", job.id)
      .limit(1),
  ]);

  const client = first(job.clients);
  const missing: string[] = [];
  const warnings: string[] = [];
  const done: string[] = [];

  if (client?.company_name) done.push("Customer added"); else missing.push("Customer missing");
  if (job.site_name || job.site_address) done.push("Site details added"); else missing.push("Site name/address missing");
  if (job.start_date || job.job_date) done.push("Job date added"); else missing.push("Job date missing");
  if (job.start_time) done.push("Start time added"); else warnings.push("Start time not set");

  const hasCrane = Boolean(job.crane_id || (equipmentRows ?? []).some((row: any) => row.crane_id || String(row.asset_type ?? "") === "crane"));
  const hasOperator = Boolean(job.operator_id || (equipmentRows ?? []).some((row: any) => row.operator_id));

  if (hasCrane) done.push("Crane/allocation added"); else warnings.push("No crane/allocation selected");
  if (hasOperator) done.push("Operator/labour allocation added"); else warnings.push("No operator/labour allocation selected");

  if (liftPlanLikelyRequired(job)) {
    const liftPlan = (liftPlans ?? [])[0] ?? null;
    if (!liftPlan) missing.push("Contract lift appears to need a lift plan");
    else if (liftPlan.paperwork_locked) done.push("Lift plan locked");
    else warnings.push("Lift plan is not locked yet");
  }

  return responseJson({
    mode: "read",
    action: parsed.action,
    title: `Job ${job.job_number} check`,
    message: missing.length === 0 && warnings.length === 0 ? "This job looks ready from the basic checks." : "Here is what I found.",
    results: [jobResult(job)],
    checklist: {
      missing,
      warnings,
      done,
    },
  });
}

async function handleOpenPlanner(parsed: ParsedCommand) {
  const date = resolveDate(parsed.date_text, parsed.target_date) ?? currentTodayIso();
  return responseJson({
    mode: "read",
    action: parsed.action,
    title: `Open crane planner`,
    message: `Open the crane planner from ${formatDate(date)}.`,
    results: [
      {
        label: `Crane planner — ${formatDate(date)}`,
        href: `/planner?date=${encodeURIComponent(date)}`,
        badge: "planner",
        description: "The planner will open around this date.",
      },
    ],
    open_href: `/planner?date=${encodeURIComponent(date)}`,
  });
}

async function handleCreateCraneDraft(supabase: any, parsed: ParsedCommand, command: string) {
  const date = resolveDate(parsed.date_text, parsed.target_date);
  const customer = await resolveCustomer(supabase, parsed.customer_name);
  const crane = await resolveCrane(supabase, parsed.crane_name);
  const operator = await resolveOperator(supabase, parsed.operator_name);

  const missing: string[] = [];
  if (!customer.selected) missing.push(parsed.customer_name ? `Customer not found: ${parsed.customer_name}` : "Customer missing");
  if (!date) missing.push(parsed.date_text ? `I could not understand the date: ${parsed.date_text}` : "Date missing");

  if (missing.length > 0) {
    return responseJson({
      mode: "needs_more_info",
      action: parsed.action,
      title: "I need a bit more information",
      message: missing.join(". "),
      results: [
        ...customer.matches.slice(0, 5).map((row: any) => ({
          label: row.company_name ?? "Customer",
          href: `/customers/${row.id}`,
          badge: "customer",
          description: `${row.contact_name ?? "—"} • ${row.phone ?? "—"}`,
        })),
        ...crane.matches.slice(0, 5).map((row: any) => ({
          label: row.name ?? "Crane",
          href: `/cranes/${row.id}`,
          badge: "crane",
          description: `${row.reg_number ?? row.fleet_number ?? "—"} • ${row.status ?? "—"}`,
        })),
      ],
    });
  }

  const draft: DraftAction = {
    type: "create_crane_job",
    title: "Create crane job",
    warning: crane.selected ? null : "No crane was confidently matched, so this will create the job without a crane allocation.",
    preview: [
      { label: "Customer", value: customer.selected.company_name ?? "—" },
      { label: "Date", value: formatDate(date) },
      { label: "Crane", value: crane.selected?.name ?? "Not allocated" },
      { label: "Operator", value: operator.selected?.full_name ?? "Not allocated" },
      { label: "Status", value: "Provisional" },
      { label: "Times", value: "08:00 → 16:00" },
    ],
    payload: {
      client_id: customer.selected.id,
      crane_id: crane.selected?.id ?? null,
      operator_id: operator.selected?.id ?? null,
      job_date: date,
      start_date: date,
      end_date: date,
      start_time: "08:00",
      end_time: "16:00",
      status: "provisional",
      site_name: clean(parsed.site_name),
      site_address: clean(parsed.site_address),
      notes: `Created by AnnS CRM Assistant from command: ${command}`,
    },
  };

  return responseJson({
    mode: "draft",
    action: parsed.action,
    title: draft.title,
    message: "I have prepared this job. Check it, then confirm to save it.",
    draftAction: draft,
  });
}

async function handleMoveJobDraft(supabase: any, parsed: ParsedCommand) {
  const date = resolveDate(parsed.date_text, parsed.target_date);
  const job = await findJobByNumber(supabase, parsed.job_number);

  if (!job || !date) {
    return responseJson({
      mode: "needs_more_info",
      action: parsed.action,
      title: "I need a job number and date",
      message: !job ? "I could not find that job." : "I could not understand the new date.",
    });
  }

  const oldStart = clean(job.start_date) ?? clean(job.job_date) ?? date;
  const oldEnd = clean(job.end_date) ?? oldStart;
  const duration = daysBetween(oldStart, oldEnd);
  const newEnd = addDays(date, duration);

  const draft: DraftAction = {
    type: "move_crane_job",
    title: `Move job ${job.job_number}`,
    warning: "This will move the main job dates and any job-equipment allocation dates by the same number of days.",
    preview: [
      { label: "Job", value: `Job ${job.job_number}` },
      { label: "From", value: `${formatDate(oldStart)}${oldEnd !== oldStart ? ` → ${formatDate(oldEnd)}` : ""}` },
      { label: "To", value: `${formatDate(date)}${newEnd !== date ? ` → ${formatDate(newEnd)}` : ""}` },
      { label: "Customer", value: first(job.clients)?.company_name ?? "—" },
    ],
    payload: {
      job_id: job.id,
      job_number: job.job_number,
      old_start_date: oldStart,
      old_end_date: oldEnd,
      new_start_date: date,
      new_end_date: newEnd,
      day_delta: daysBetween(oldStart, date),
    },
  };

  return responseJson({
    mode: "draft",
    action: parsed.action,
    title: draft.title,
    message: "I have prepared the date change. Check it, then confirm to save it.",
    draftAction: draft,
    results: [jobResult(job)],
  });
}

async function handleAssignOperatorDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  const operator = await resolveOperator(supabase, parsed.operator_name);

  if (!job || !operator.selected) {
    return responseJson({
      mode: "needs_more_info",
      action: parsed.action,
      title: "I need a job and operator",
      message: !job ? "I could not find that job." : `I could not find operator ${parsed.operator_name ?? ""}.`,
      results: operator.matches.slice(0, 6).map((row: any) => ({
        label: row.full_name ?? "Operator",
        href: `/operators/${row.id}`,
        badge: "operator",
        description: row.status ?? "—",
      })),
    });
  }

  const startDate = clean(job.start_date) ?? clean(job.job_date);
  const endDate = clean(job.end_date) ?? startDate;
  const draft: DraftAction = {
    type: "assign_operator",
    title: `Add ${operator.selected.full_name} to job ${job.job_number}`,
    warning: null,
    preview: [
      { label: "Job", value: `Job ${job.job_number}` },
      { label: "Customer", value: first(job.clients)?.company_name ?? "—" },
      { label: "Operator", value: operator.selected.full_name ?? "—" },
      { label: "Dates", value: `${formatDate(startDate)}${endDate && endDate !== startDate ? ` → ${formatDate(endDate)}` : ""}` },
    ],
    payload: {
      job_id: job.id,
      job_number: job.job_number,
      operator_id: operator.selected.id,
      operator_name: operator.selected.full_name,
      start_date: startDate,
      end_date: endDate,
      start_time: job.start_time ?? null,
      end_time: job.end_time ?? null,
      item_name: "Operator / labour",
    },
  };

  return responseJson({
    mode: "draft",
    action: parsed.action,
    title: draft.title,
    message: "I have prepared the operator allocation. Check it, then confirm to save it.",
    draftAction: draft,
    results: [jobResult(job)],
  });
}

async function handleVisitInvoiceDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  const visitDate = resolveDate(parsed.date_text, parsed.visit_date) ?? currentTodayIso();

  if (!job) {
    return responseJson({
      mode: "needs_more_info",
      action: parsed.action,
      title: "I need a valid job number",
      message: parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number to mark invoiced.",
    });
  }

  const draft: DraftAction = {
    type: "mark_visit_invoiced",
    title: `Mark visit invoiced`,
    warning: "This only marks the selected visit/day as invoiced. It does not mark the whole job as paid.",
    preview: [
      { label: "Job", value: `Job ${job.job_number}` },
      { label: "Customer", value: first(job.clients)?.company_name ?? "—" },
      { label: "Visit date", value: formatDate(visitDate) },
      { label: "New visit invoice status", value: "Invoiced" },
    ],
    payload: {
      job_id: job.id,
      job_number: job.job_number,
      visit_date: visitDate,
      invoice_status: "Invoiced",
      notes: "Marked through AnnS CRM Assistant.",
    },
  };

  return responseJson({
    mode: "draft",
    action: parsed.action,
    title: draft.title,
    message: "I have prepared the visit invoice mark. Check it, then confirm to save it.",
    draftAction: draft,
    results: [jobResult(job)],
  });
}

async function executeCreateCraneJob(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const startDate = clean(p.start_date) ?? clean(p.job_date);
  const endDate = clean(p.end_date) ?? startDate;

  if (!p.client_id || !startDate || !endDate) {
    throw new Error("Customer and date are required before creating the job.");
  }

  if (p.operator_id) {
    await assertOperatorAvailable(supabase, {
      operatorId: p.operator_id,
      startDate,
      endDate,
      startTime: clean(p.start_time),
      endTime: clean(p.end_time),
    });
  }

  const jobPayload: Record<string, any> = {
    client_id: clean(p.client_id),
    operator_id: clean(p.operator_id),
    site_name: clean(p.site_name),
    site_address: clean(p.site_address),
    job_date: startDate,
    start_date: startDate,
    end_date: endDate,
    start_time: clean(p.start_time) ?? "08:00",
    end_time: clean(p.end_time) ?? "16:00",
    status: clean(p.status) ?? "provisional",
    hire_type: clean(p.hire_type),
    lift_type: clean(p.lift_type),
    notes: clean(p.notes),
    equipment_count: p.crane_id ? 1 : 0,
    archived: false,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data: job, error } = await supabase
    .from("jobs")
    .insert(jobPayload)
    .select("id, job_number")
    .single();

  if (error || !job?.id) {
    throw new Error(error?.message ?? "Could not create job.");
  }

  if (p.crane_id || p.operator_id) {
    const allocationPayload: Record<string, any> = {
      job_id: job.id,
      asset_type: p.crane_id ? "crane" : "other",
      crane_id: clean(p.crane_id),
      operator_id: clean(p.operator_id),
      source_type: "owned",
      start_date: startDate,
      end_date: endDate,
      start_time: clean(p.start_time) ?? "08:00",
      end_time: clean(p.end_time) ?? "16:00",
      agreed_cost: 0,
      agreed_sell_rate: 0,
      supplier_cost: 0,
      item_name: p.crane_id ? null : "Operator / labour",
      notes: "Created by AnnS CRM Assistant.",
      updated_at: new Date().toISOString(),
    };

    const { error: allocationError } = await supabase.from("job_equipment").insert(allocationPayload);
    if (allocationError) {
      await supabase.from("jobs").delete().eq("id", job.id);
      throw new Error(allocationError.message);
    }
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: user.email ? user.email.split("@")[0] : null,
    action: "crm_assistant_job_created",
    entity_type: "job",
    entity_id: job.id,
    meta: {
      job_number: job.job_number ?? null,
      client_id: jobPayload.client_id,
      crane_id: clean(p.crane_id),
      operator_id: clean(p.operator_id),
      start_date: startDate,
    },
  });

  return {
    title: `Job ${job.job_number ?? ""} created`,
    message: "The crane job has been saved.",
    href: `/jobs/${job.id}`,
    result: {
      label: `Open job ${job.job_number ?? ""}`,
      href: `/jobs/${job.id}`,
      badge: "created",
      description: "The job was created from the CRM Assistant.",
    },
  };
}

async function executeMoveJob(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const newStart = clean(p.new_start_date);
  const newEnd = clean(p.new_end_date) ?? newStart;
  const delta = Number(p.day_delta ?? 0);

  if (!jobId || !newStart || !newEnd) throw new Error("Job and new date are required.");

  const { data: existingJob, error: existingError } = await supabase
    .from("jobs")
    .select("id, job_number, start_date, end_date, job_date")
    .eq("id", jobId)
    .single();

  if (existingError || !existingJob) throw new Error("Job not found.");

  const { error: jobError } = await supabase
    .from("jobs")
    .update({
      job_date: newStart,
      start_date: newStart,
      end_date: newEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (jobError) throw new Error(jobError.message);

  const { data: rows, error: rowsError } = await supabase
    .from("job_equipment")
    .select("id, start_date, end_date")
    .eq("job_id", jobId);

  if (rowsError) throw new Error(rowsError.message);

  for (const row of rows ?? []) {
    const rowStart = clean(row.start_date);
    const rowEnd = clean(row.end_date) ?? rowStart;
    if (!rowStart) continue;

    const { error: rowError } = await supabase
      .from("job_equipment")
      .update({
        start_date: addDays(rowStart, delta),
        end_date: rowEnd ? addDays(rowEnd, delta) : addDays(rowStart, delta),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (rowError) throw new Error(rowError.message);
  }

  const { data: allocationRows, error: allocationRowsError } = await supabase
    .from("job_allocations")
    .select("id, start_at, end_at")
    .eq("job_id", jobId);

  if (allocationRowsError) throw new Error(allocationRowsError.message);

  for (const row of allocationRows ?? []) {
    const shiftedStart = shiftTimestampDate(row.start_at, delta);
    const shiftedEnd = shiftTimestampDate(row.end_at, delta) ?? shiftedStart;
    if (!shiftedStart) continue;

    const { error: allocationError } = await supabase
      .from("job_allocations")
      .update({
        start_at: shiftedStart,
        end_at: shiftedEnd,
      })
      .eq("id", row.id);

    if (allocationError) throw new Error(allocationError.message);
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: user.email ? user.email.split("@")[0] : null,
    action: "crm_assistant_job_moved",
    entity_type: "job",
    entity_id: jobId,
    meta: {
      job_number: existingJob.job_number ?? null,
      old_start_date: existingJob.start_date ?? existingJob.job_date ?? null,
      old_end_date: existingJob.end_date ?? existingJob.start_date ?? existingJob.job_date ?? null,
      new_start_date: newStart,
      new_end_date: newEnd,
      day_delta: delta,
    },
  });

  return {
    title: `Job ${existingJob.job_number ?? ""} moved`,
    message: `The job was moved to ${formatDate(newStart)}.`,
    href: `/jobs/${jobId}`,
    result: {
      label: `Open job ${existingJob.job_number ?? ""}`,
      href: `/jobs/${jobId}`,
      badge: "moved",
      description: `Moved to ${formatDate(newStart)}`,
    },
  };
}

async function executeAssignOperator(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const operatorId = clean(p.operator_id);
  if (!jobId || !operatorId) throw new Error("Job and operator are required.");

  await assertOperatorAvailable(supabase, {
    operatorId,
    startDate: clean(p.start_date),
    endDate: clean(p.end_date) ?? clean(p.start_date),
    startTime: clean(p.start_time),
    endTime: clean(p.end_time),
  });

  const payload: Record<string, any> = {
    job_id: jobId,
    asset_type: "other",
    operator_id: operatorId,
    item_name: clean(p.item_name) ?? "Operator / labour",
    source_type: "owned",
    start_date: clean(p.start_date),
    end_date: clean(p.end_date) ?? clean(p.start_date),
    start_time: clean(p.start_time),
    end_time: clean(p.end_time),
    agreed_cost: 0,
    agreed_sell_rate: 0,
    supplier_cost: 0,
    notes: "Added by AnnS CRM Assistant.",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("job_equipment").insert(payload);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: user.email ? user.email.split("@")[0] : null,
    action: "crm_assistant_operator_assigned",
    entity_type: "job",
    entity_id: jobId,
    meta: {
      job_number: p.job_number ?? null,
      operator_id: operatorId,
      operator_name: p.operator_name ?? null,
    },
  });

  return {
    title: "Operator added",
    message: `${p.operator_name ?? "Operator"} has been added to job ${p.job_number ?? ""}.`,
    href: `/jobs/${jobId}`,
    result: {
      label: `Open job ${p.job_number ?? ""}`,
      href: `/jobs/${jobId}`,
      badge: "updated",
      description: `${p.operator_name ?? "Operator"} added as labour/operator allocation.`,
    },
  };
}

async function executeVisitInvoice(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const visitDate = clean(p.visit_date);
  if (!jobId || !visitDate) throw new Error("Job and visit date are required.");

  const payload = {
    job_id: jobId,
    visit_date: visitDate,
    invoice_status: clean(p.invoice_status) ?? "Invoiced",
    invoice_number: clean(p.invoice_number),
    invoice_date: currentTodayIso(),
    notes: clean(p.notes) ?? "Marked through AnnS CRM Assistant.",
    updated_at: new Date().toISOString(),
    created_by: user.id,
  };

  const { error } = await supabase
    .from("job_visit_invoices")
    .upsert(payload, { onConflict: "job_id,visit_date" });

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: user.email ? user.email.split("@")[0] : null,
    action: "crm_assistant_visit_marked_invoiced",
    entity_type: "job_visit_invoice",
    entity_id: jobId,
    meta: {
      job_number: p.job_number ?? null,
      visit_date: visitDate,
      invoice_status: payload.invoice_status,
    },
  });

  return {
    title: "Visit marked invoiced",
    message: `Job ${p.job_number ?? ""} visit on ${formatDate(visitDate)} is now marked as invoiced.`,
    href: `/planner?date=${encodeURIComponent(visitDate)}`,
    result: {
      label: `Open planner on ${formatDate(visitDate)}`,
      href: `/planner?date=${encodeURIComponent(visitDate)}`,
      badge: "invoiced",
      description: "The visit invoice marker has been saved.",
    },
  };
}

async function executeDraft(supabase: any, user: any, draft: DraftAction | null) {
  if (!draft?.type) throw new Error("Missing draft action.");

  if (draft.type === "create_crane_job") return executeCreateCraneJob(supabase, user, draft);
  if (draft.type === "move_crane_job") return executeMoveJob(supabase, user, draft);
  if (draft.type === "assign_operator") return executeAssignOperator(supabase, user, draft);
  if (draft.type === "mark_visit_invoiced") return executeVisitInvoice(supabase, user, draft);

  throw new Error("This action is not supported yet.");
}

async function assertOfficeAccess() {
  const access = await getAccessContext();
  if (!access.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (access.role === "operator" || !access.role) {
    return NextResponse.json({ error: "CRM Assistant is only available to office/admin users." }, { status: 403 });
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const accessError = await assertOfficeAccess();
    if (accessError) return accessError;

    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));

    if (body?.mode === "execute") {
      const result = await executeDraft(supabase, user, body?.draftAction ?? null);
      return responseJson({
        mode: "executed",
        title: result.title,
        message: result.message,
        open_href: result.href,
        results: [result.result],
      });
    }

    const command = clean(body?.command);
    if (!command) {
      return responseJson({ error: "Command is required." }, 400);
    }

    const parsed = (await parseWithOpenAI(command)) ?? fallbackParseCommand(command);

    if (parsed.dangerous) {
      return responseJson({
        mode: "blocked",
        action: parsed.action,
        title: "I will not do that automatically",
        message:
          "That sounds like a destructive or high-risk action. Open the job/page and use the normal CRM controls so there is a proper audit trail and confirmation.",
      });
    }

    const lowerCommand = command.toLowerCase();
    if (/(lift\s*plan|\blp\b)/.test(lowerCommand) && !parsed.job_number) {
      return handleSearch(supabase, parsed, command);
    }

    if (parsed.action === "help") return helpResponse();
    if (parsed.action === "open_job") return handleOpenJob(supabase, parsed);
    if (parsed.action === "check_job_missing_info") return handleMissingInfo(supabase, parsed);
    if (parsed.action === "open_planner_date") return handleOpenPlanner(parsed);
    if (parsed.action === "create_crane_job_draft") return handleCreateCraneDraft(supabase, parsed, command);
    if (parsed.action === "update_job_date_draft") return handleMoveJobDraft(supabase, parsed);
    if (parsed.action === "assign_operator_draft") return handleAssignOperatorDraft(supabase, parsed);
    if (parsed.action === "mark_visit_invoiced_draft") return handleVisitInvoiceDraft(supabase, parsed);
    if (parsed.action === "create_transport_job_draft") {
      return responseJson({
        mode: "needs_more_info",
        action: parsed.action,
        title: "Transport assistant is not saving yet",
        message:
          "I can understand the transport request, but I have left transport-job saving out of this first safe build because transport jobs need collection, delivery, load and movement-order details. Use the transport job form for now.",
        results: [{ label: "Open new transport job form", href: "/transport-jobs/new", badge: "transport", description: "Create the transport job with the full required details." }],
      });
    }

    return handleSearch(supabase, parsed, command);
  } catch (e: any) {
    return responseJson({ error: e?.message ?? "CRM Assistant failed." }, 400);
  }
}
