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
  | "assign_crane_draft"
  | "update_job_status_draft"
  | "mark_visit_invoiced_draft"
  | "open_related_job_page"
  | "open_page"
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
  job_status: string | null;
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
    | "assign_crane"
    | "update_job_status"
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

function words(value: unknown) {
  return normaliseName(value).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }

  return previous[b.length];
}

function similarity(a: string, b: string) {
  const left = normaliseName(a);
  const right = normaliseName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (right.includes(left) || left.includes(right)) return 0.9;

  const maxLen = Math.max(left.length, right.length, 1);
  const editScore = 1 - levenshtein(left, right) / maxLen;
  const leftWords = new Set(words(left));
  const rightWords = new Set(words(right));
  const rightList = [...rightWords];
  const overlap = [...leftWords].filter((word) => rightWords.has(word) || rightList.some((candidate) => candidate.includes(word) || word.includes(candidate))).length;
  const tokenScore = overlap / Math.max(leftWords.size, 1);

  return Math.max(editScore, tokenScore * 0.86);
}

function sortBySimilarity<T>(rows: T[], wanted: string, nameGetter: (row: T) => unknown) {
  return rows
    .map((row) => ({ row, score: similarity(wanted, String(nameGetter(row) ?? "")) }))
    .sort((a, b) => b.score - a.score);
}

function chooseLikelyMatch<T>(ranked: Array<{ row: T; score: number }>) {
  const first = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  if (!first) return null;
  if (first.score >= 0.62) return first.row;
  if (first.score >= 0.5 && (!second || first.score - second.score >= 0.18)) return first.row;
  return null;
}

function repairSpokenCommand(value: string) {
  let text = String(value ?? "")
    .replace(/\blift\s+lamp\b/gi, "lift plan")
    .replace(/\bleft\s+plan\b/gi, "lift plan")
    .replace(/\blip\s+plan\b/gi, "lift plan")
    .replace(/\bjob\s+number\s+(\d+)\b/gi, "job $1")
    .replace(/\bjobs\s+(\d+)\b/gi, "job $1")
    .replace(/\s+/g, " ")
    .trim();

  const parts = text.split(" ").filter(Boolean);
  const deduped: string[] = [];
  for (const part of parts) {
    if (deduped[deduped.length - 1]?.toLowerCase() !== part.toLowerCase()) deduped.push(part);
  }
  text = deduped.join(" ");

  const commandStartWords = new Set(["open", "show", "find", "create", "make", "move", "change", "add", "assign", "mark", "check", "search", "go", "take"]);
  const lowerWords = text.toLowerCase().split(" ");
  let startIndex = -1;
  for (let i = 0; i < lowerWords.length; i++) {
    if (commandStartWords.has(lowerWords[i])) startIndex = i;
  }
  if (startIndex > 0) text = text.split(" ").slice(startIndex).join(" ");

  return text.replace(/\s+/g, " ").trim();
}

function stripCommandNoise(value: string) {
  return String(value ?? "")
    .replace(/\b(show|find|open|go|take|me|job|jobs|customer|customers|for|the|this|week|needing|need|needs|lift|plans|plan|planner|please|can|you)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseJobStatus(value: string | null | undefined) {
  const lower = String(value ?? "").toLowerCase();
  if (/\b(confirm|confirmed)\b/.test(lower)) return "confirmed";
  if (/\b(provisional|pencil|hold)\b/.test(lower)) return "provisional";
  if (/\b(progress|started|start|in progress|on site)\b/.test(lower)) return "in_progress";
  if (/\b(complete|completed|done|finished)\b/.test(lower)) return "completed";
  if (/\b(cancel|cancelled|canceled|archive|delete|remove)\b/.test(lower)) return "dangerous";
  if (/\bdraft\b/.test(lower)) return "draft";
  return null;
}

function friendlyStatus(value: string | null | undefined) {
  const status = String(value ?? "").trim();
  if (!status) return "—";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  if (/\bnext week\b/.test(lower)) start.setDate(start.getDate() + 7);
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

  if (jobNumber && /\b(open|view|show|go to|take me to)\b/.test(lower) && /\b(lift\s*plan|lp|invoice|documents?|files?|edit|pack|pdf|print)\b/.test(lower)) {
    return {
      ...emptyParsed("open_related_job_page", text),
      job_number: jobNumber,
      confidence: 0.86,
    };
  }

  if (/\b(move|change|put)\b/.test(lower) && jobNumber && dateText) {
    return {
      ...emptyParsed("update_job_date_draft", text),
      job_number: jobNumber,
      date_text: dateText,
      target_date: resolveDate(dateText),
      confidence: 0.75,
    };
  }

  const requestedStatus = normaliseJobStatus(lower);
  if (jobNumber && requestedStatus) {
    return {
      ...emptyParsed("update_job_status_draft", text),
      job_number: jobNumber,
      job_status: requestedStatus,
      dangerous: requestedStatus === "dangerous",
      confidence: 0.78,
    };
  }

  if (/\b(add|assign|put)\b/.test(lower) && /\b(crane|grove|tadano|bocker|jekko|hiab|hk40|spider)\b/.test(lower) && jobNumber) {
    const craneMatch = text.match(/\b(?:add|assign|put)\s+(.+?)\s+(?:as\s+)?(?:crane|machine)?\s*(?:on|to|for)\s+job\b/i) ?? text.match(/\b(?:with|using)\s+(?:the\s+)?(.+?)(?:\s+on|\s+to|\s+for|$)/i);
    return {
      ...emptyParsed("assign_crane_draft", text),
      job_number: jobNumber,
      crane_name: clean(craneMatch?.[1]),
      confidence: 0.72,
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
    job_status: null,
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
          "assign_crane_draft",
          "update_job_status_draft",
          "mark_visit_invoiced_draft",
          "open_related_job_page",
          "open_page",
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
      job_status: { type: ["string", "null"] },
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
      "job_status",
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
              "You are the command parser for AnnS Crane CRM. Be as flexible as possible with UK crane-hire/site language and messy speech-to-text. Convert the user command into the best ONE structured action, not a chat answer. Prefer doing something useful: navigation/open/read actions, search, or a safe draft action. Do not invent database records. Use open_related_job_page for commands like open/view/show the lift plan, lift plan pack, invoice, documents, files, print, PDF, or edit page for a specific job. Use open_page for simple navigation such as open customers, jobs, staff planner, transport planner, outstanding invoices, suppliers, cranes, vehicles, settings, system health, sales hub, transport map, asset locations, quotes, or purchase orders. Use search_jobs for broad requests, names, sites, postcodes, customers, or anything not covered. Safe write actions must be drafts that need confirmation: create crane job, move job date, assign operator, assign crane, mark visit invoiced, or update job status to provisional/confirmed/in progress/completed. If the command asks to cancel, delete, archive, unlock a lift plan, bulk invoice, bulk change records, or anything destructive, set action unknown and dangerous true. Today's date is " +
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
  if (!wanted) return { selected: null as any, matches: [] as any[], score: 0 };

  const direct = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, email, archived")
    .or("archived.is.null,archived.eq.false")
    .ilike("company_name", safeLike(wanted))
    .order("company_name", { ascending: true })
    .limit(20);

  let rows = direct.data ?? [];

  if (rows.length < 3) {
    const broad = await supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, archived")
      .or("archived.is.null,archived.eq.false")
      .order("company_name", { ascending: true })
      .limit(250);
    rows = [...rows, ...(broad.data ?? [])].filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index);
  }

  const ranked = sortBySimilarity(rows, wanted, (row: any) => row.company_name).slice(0, 8);
  const selected = chooseLikelyMatch(ranked) ?? null;

  return { selected, matches: ranked.map((item) => item.row), score: ranked[0]?.score ?? 0 };
}

async function resolveCrane(supabase: any, name: string | null | undefined) {
  const wanted = clean(name);
  if (!wanted) return { selected: null as any, matches: [] as any[], score: 0 };

  const direct = await supabase
    .from("cranes")
    .select("id, name, reg_number, fleet_number, status, archived")
    .or("archived.is.null,archived.eq.false")
    .or(`name.ilike.${safeLike(wanted)},reg_number.ilike.${safeLike(wanted)},fleet_number.ilike.${safeLike(wanted)}`)
    .order("name", { ascending: true })
    .limit(20);

  let rows = direct.data ?? [];

  if (rows.length < 3) {
    const broad = await supabase
      .from("cranes")
      .select("id, name, reg_number, fleet_number, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("name", { ascending: true })
      .limit(150);
    rows = [...rows, ...(broad.data ?? [])].filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index);
  }

  const ranked = rows
    .map((row: any) => ({ row, score: Math.max(similarity(wanted, row.name), similarity(wanted, row.reg_number), similarity(wanted, row.fleet_number)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const selected = chooseLikelyMatch(ranked) ?? null;

  return { selected, matches: ranked.map((item) => item.row), score: ranked[0]?.score ?? 0 };
}

async function resolveOperator(supabase: any, name: string | null | undefined) {
  const wanted = clean(name);
  if (!wanted) return { selected: null as any, matches: [] as any[], score: 0 };

  const direct = await supabase
    .from("operators")
    .select("id, full_name, email, status, archived")
    .or("archived.is.null,archived.eq.false")
    .ilike("full_name", safeLike(wanted))
    .order("full_name", { ascending: true })
    .limit(20);

  let rows = direct.data ?? [];

  if (rows.length < 3) {
    const broad = await supabase
      .from("operators")
      .select("id, full_name, email, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("full_name", { ascending: true })
      .limit(200);
    rows = [...rows, ...(broad.data ?? [])].filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index);
  }

  const ranked = rows
    .map((row: any) => ({ row, score: Math.max(similarity(wanted, row.full_name), similarity(wanted, row.email)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const selected = chooseLikelyMatch(ranked) ?? null;

  return { selected, matches: ranked.map((item) => item.row), score: ranked[0]?.score ?? 0 };
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
      "Open the lift plan for job 169",
      "Show jobs needing lift plans this week",
      "Open staff planner",
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
  if (/(lift\s*plan|\blp\b)/.test(lower) && /(need|missing|required|review|show|check)/.test(lower)) {
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

function relatedJobHref(job: any, command: string) {
  const lower = String(command ?? "").toLowerCase();
  if (/\b(lift\s*plan|lp)\b/.test(lower)) {
    if (/\b(pack|full pack|print pack)\b/.test(lower)) return `/jobs/${job.id}/lift-plan/pack`;
    if (/\b(print|pdf)\b/.test(lower)) return `/jobs/${job.id}/lift-plan/print`;
    return `/jobs/${job.id}/lift-plan`;
  }
  if (/\b(invoice|invoicing)\b/.test(lower)) return `/jobs/${job.id}/invoice`;
  if (/\b(document|documents|upload|files)\b/.test(lower)) return `/jobs/${job.id}`;
  if (/\b(edit|change)\b/.test(lower)) return `/jobs/${job.id}/edit`;
  return `/jobs/${job.id}`;
}

function relatedJobLabel(command: string) {
  const lower = String(command ?? "").toLowerCase();
  if (/\b(lift\s*plan|lp)\b/.test(lower)) {
    if (/\b(pack|full pack|print pack)\b/.test(lower)) return "Lift plan pack";
    if (/\b(print|pdf)\b/.test(lower)) return "Lift plan print/PDF";
    return "Lift plan";
  }
  if (/\b(invoice|invoicing)\b/.test(lower)) return "Invoice page";
  if (/\b(document|documents|upload|files)\b/.test(lower)) return "Job documents";
  if (/\b(edit|change)\b/.test(lower)) return "Edit job";
  return "Job page";
}

async function handleOpenRelatedJobPage(supabase: any, parsed: ParsedCommand, command: string) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  if (!job) {
    return responseJson({
      mode: "read",
      action: "open_related_job_page",
      title: "Job not found",
      message: parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number to open.",
      results: [],
    });
  }

  const href = relatedJobHref(job, command);
  const label = relatedJobLabel(command);
  return responseJson({
    mode: "read",
    action: "open_related_job_page",
    title: `Open ${label.toLowerCase()} for job ${job.job_number}`,
    message: `I found job ${job.job_number}.`,
    results: [
      {
        label: `${label} — Job ${job.job_number}`,
        href,
        badge: "open",
        description: jobResult(job).description,
      },
    ],
    open_href: href,
  });
}

function pageShortcut(command: string) {
  const lower = String(command ?? "").toLowerCase();
  const wantsOpen = /\b(open|go to|take me to|show|view)\b/.test(lower);
  if (!wantsOpen) return null;

  const shortcuts: Array<{ test: RegExp; label: string; href: string; description: string }> = [
    { test: /\bstaff\s+planner\b/, label: "Staff planner", href: "/staff-planner", description: "Employee, sub-contractor and office-staff availability." },
    { test: /\btransport\s+planner\b/, label: "Transport planner", href: "/transport-planner", description: "Transport planner board." },
    { test: /\b(crane\s+)?planner\b/, label: "Crane planner", href: "/planner", description: "Crane planner board." },
    { test: /\boutstanding\s+invoice|invoices?\s+outstanding|not\s+invoiced\b/, label: "Outstanding invoices", href: "/invoices/outstanding", description: "Crane and transport invoice status list." },
    { test: /\bdashboard\s+actions?|action\s+queue\b/, label: "Dashboard actions", href: "/dashboard/actions", description: "Action-led dashboard list." },
    { test: /\bsystem\s+health\b/, label: "System health", href: "/settings/system-health", description: "Masteradmin configuration checks." },
    { test: /\bsettings\b/, label: "Settings", href: "/settings", description: "CRM settings." },
    { test: /\bstatus\s+audit\b/, label: "Status audit", href: "/settings/status-audit", description: "Job and invoice status audit." },
    { test: /\baudit\s+log\b/, label: "Audit log", href: "/admin/audit", description: "Admin audit log." },
    { test: /\bstaff\s+accounts?|users?\b/, label: "Staff accounts", href: "/admin/users", description: "Admin user management." },
    { test: /\bsubcontractors?\s+pay\b/, label: "Subcontractor Pay", href: "/subcontractor-pay", description: "Subcontractor pay records." },
    { test: /\bsubcontractors?\b/, label: "Subcontractors", href: "/subcontractors", description: "Subcontractor records." },
    { test: /\bsuppliers?\b/, label: "Suppliers", href: "/suppliers", description: "Supplier records." },
    { test: /\bpurchase\s+orders?|\bpos?\b/, label: "Purchase orders", href: "/purchase-orders", description: "Purchase order list." },
    { test: /\btransport\s+map\b/, label: "Transport map", href: "/transport-map", description: "Transport route map." },
    { test: /\basset\s+locations?\b/, label: "Asset locations", href: "/equipment/locations", description: "Trailer, mats and asset drop-off locations." },
    { test: /\bvehicles?|trucks?\b/, label: "Vehicles", href: "/vehicles", description: "Vehicle records." },
    { test: /\bcranes?\b/, label: "Cranes", href: "/cranes", description: "Crane fleet records." },
    { test: /\bequipment\b/, label: "Equipment", href: "/equipment", description: "Equipment records." },
    { test: /\boperators?|drivers?\b/, label: "Operators", href: "/operators", description: "Operator records." },
    { test: /\bcustomers?|clients?\b/, label: "Customers", href: "/customers", description: "Customer records." },
    { test: /\btransport\s+jobs?\b/, label: "Transport jobs", href: "/transport-jobs", description: "Transport job list." },
    { test: /\b(crane\s+)?jobs?\b/, label: "Crane jobs", href: "/jobs", description: "Crane job list." },
    { test: /\bquotes?\b/, label: "Quotes", href: "/quotes", description: "Quote list." },
    { test: /\bsales\s+hub|campaigns?|leads?\b/, label: "Sales Hub", href: "/sales", description: "Sales leads and campaigns." },
  ];

  return shortcuts.find((item) => item.test.test(lower)) ?? null;
}

function handleOpenPageShortcut(command: string) {
  const shortcut = pageShortcut(command);
  if (!shortcut) return null;

  return responseJson({
    mode: "read",
    action: "open_page",
    title: `Open ${shortcut.label}`,
    message: `Open ${shortcut.label}.`,
    results: [{ label: shortcut.label, href: shortcut.href, badge: "open", description: shortcut.description }],
    open_href: shortcut.href,
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

  const matchWarnings = [
    customer.selected && parsed.customer_name && normaliseName(customer.selected.company_name) !== normaliseName(parsed.customer_name)
      ? `I matched customer "${customer.selected.company_name}" from "${parsed.customer_name}". Check this before confirming.`
      : null,
    crane.selected && parsed.crane_name && normaliseName(crane.selected.name) !== normaliseName(parsed.crane_name)
      ? `I matched crane "${crane.selected.name}" from "${parsed.crane_name}". Check this before confirming.`
      : null,
    operator.selected && parsed.operator_name && normaliseName(operator.selected.full_name) !== normaliseName(parsed.operator_name)
      ? `I matched operator "${operator.selected.full_name}" from "${parsed.operator_name}". Check this before confirming.`
      : null,
    crane.selected ? null : "No crane was confidently matched, so this will create the job without a crane allocation.",
  ].filter(Boolean).join(" ");

  const draft: DraftAction = {
    type: "create_crane_job",
    title: "Create crane job",
    warning: matchWarnings || null,
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
    warning: parsed.operator_name && normaliseName(operator.selected.full_name) !== normaliseName(parsed.operator_name)
      ? `I matched operator "${operator.selected.full_name}" from "${parsed.operator_name}". Check this before confirming.`
      : null,
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

async function handleAssignCraneDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  const crane = await resolveCrane(supabase, parsed.crane_name);

  if (!job || !crane.selected) {
    return responseJson({
      mode: "needs_more_info",
      action: parsed.action,
      title: "I need a job and crane",
      message: !job ? "I could not find that job." : `I could not find crane ${parsed.crane_name ?? ""}.`,
      results: crane.matches.slice(0, 6).map((row: any) => ({
        label: row.name ?? "Crane",
        href: `/cranes/${row.id}`,
        badge: "crane",
        description: `${row.reg_number ?? row.fleet_number ?? "—"} • ${row.status ?? "—"}`,
      })),
    });
  }

  const startDate = clean(job.start_date) ?? clean(job.job_date);
  const endDate = clean(job.end_date) ?? startDate;
  const draft: DraftAction = {
    type: "assign_crane",
    title: `Add ${crane.selected.name} to job ${job.job_number}`,
    warning: parsed.crane_name && normaliseName(crane.selected.name) !== normaliseName(parsed.crane_name)
      ? `I matched crane "${crane.selected.name}" from "${parsed.crane_name}". Check this before confirming.`
      : null,
    preview: [
      { label: "Job", value: `Job ${job.job_number}` },
      { label: "Customer", value: first(job.clients)?.company_name ?? "—" },
      { label: "Crane", value: crane.selected.name ?? "—" },
      { label: "Dates", value: `${formatDate(startDate)}${endDate && endDate !== startDate ? ` → ${formatDate(endDate)}` : ""}` },
    ],
    payload: {
      job_id: job.id,
      job_number: job.job_number,
      crane_id: crane.selected.id,
      crane_name: crane.selected.name,
      start_date: startDate,
      end_date: endDate,
      start_time: job.start_time ?? null,
      end_time: job.end_time ?? null,
    },
  };

  return responseJson({
    mode: "draft",
    action: parsed.action,
    title: draft.title,
    message: "I have prepared the crane allocation. Check it, then confirm to save it.",
    draftAction: draft,
    results: [jobResult(job)],
  });
}

async function handleUpdateJobStatusDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  const status = normaliseJobStatus(parsed.job_status ?? "");

  if (!job || !status || status === "dangerous") {
    return responseJson({
      mode: status === "dangerous" ? "blocked" : "needs_more_info",
      action: parsed.action,
      title: status === "dangerous" ? "Use the normal CRM controls for that" : "I need a job and a safe status",
      message: status === "dangerous"
        ? "Cancelling, deleting or archiving must be done through the normal CRM page with the proper confirmation trail."
        : !job ? "I could not find that job." : "Tell me the status to set, for example confirmed, provisional, in progress or completed.",
    }, status === "dangerous" ? 400 : 200);
  }

  const draft: DraftAction = {
    type: "update_job_status",
    title: `Set job ${job.job_number} to ${friendlyStatus(status)}`,
    warning: status === "completed" ? "This will mark the job as completed. Check this is the correct job before confirming." : null,
    preview: [
      { label: "Job", value: `Job ${job.job_number}` },
      { label: "Customer", value: first(job.clients)?.company_name ?? "—" },
      { label: "Current status", value: friendlyStatus(job.status) },
      { label: "New status", value: friendlyStatus(status) },
    ],
    payload: {
      job_id: job.id,
      job_number: job.job_number,
      old_status: job.status ?? null,
      new_status: status,
    },
  };

  return responseJson({
    mode: "draft",
    action: parsed.action,
    title: draft.title,
    message: "I have prepared the status change. Check it, then confirm to save it.",
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

async function executeAssignCrane(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const craneId = clean(p.crane_id);
  if (!jobId || !craneId) throw new Error("Job and crane are required.");

  const payload: Record<string, any> = {
    job_id: jobId,
    asset_type: "crane",
    crane_id: craneId,
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
    action: "crm_assistant_crane_assigned",
    entity_type: "job",
    entity_id: jobId,
    meta: {
      job_number: p.job_number ?? null,
      crane_id: craneId,
      crane_name: p.crane_name ?? null,
    },
  });

  return {
    title: "Crane added",
    message: `${p.crane_name ?? "Crane"} has been added to job ${p.job_number ?? ""}.`,
    href: `/jobs/${jobId}`,
    result: {
      label: `Open job ${p.job_number ?? ""}`,
      href: `/jobs/${jobId}`,
      badge: "updated",
      description: `${p.crane_name ?? "Crane"} added as a crane allocation.`,
    },
  };
}

async function executeUpdateJobStatus(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const newStatus = normaliseJobStatus(clean(p.new_status));
  if (!jobId || !newStatus || newStatus === "dangerous") throw new Error("A safe job status is required.");

  const { error } = await supabase
    .from("jobs")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: user.email ? user.email.split("@")[0] : null,
    action: "crm_assistant_job_status_updated",
    entity_type: "job",
    entity_id: jobId,
    meta: {
      job_number: p.job_number ?? null,
      old_status: p.old_status ?? null,
      new_status: newStatus,
    },
  });

  return {
    title: "Job status updated",
    message: `Job ${p.job_number ?? ""} is now ${friendlyStatus(newStatus)}.`,
    href: `/jobs/${jobId}`,
    result: {
      label: `Open job ${p.job_number ?? ""}`,
      href: `/jobs/${jobId}`,
      badge: "updated",
      description: `Status changed to ${friendlyStatus(newStatus)}.`,
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
  if (draft.type === "assign_crane") return executeAssignCrane(supabase, user, draft);
  if (draft.type === "update_job_status") return executeUpdateJobStatus(supabase, user, draft);
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

    const rawCommand = clean(body?.command);
    const command = clean(rawCommand ? repairSpokenCommand(rawCommand) : null);
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
    const shortcut = handleOpenPageShortcut(command);

    if (parsed.job_number && /\b(open|view|show|go to|take me to)\b/.test(lowerCommand) && /\b(lift\s*plan|\blp\b|invoice|documents?|files?|edit|pack|pdf|print)\b/.test(lowerCommand)) {
      return handleOpenRelatedJobPage(supabase, parsed, command);
    }

    if (parsed.action === "open_page" && shortcut) return shortcut;
    if (parsed.action !== "search_jobs" && shortcut && !parsed.job_number) return shortcut;

    if (/(lift\s*plan|\blp\b)/.test(lowerCommand) && !parsed.job_number) {
      return handleSearch(supabase, parsed, command);
    }

    if (parsed.action === "help") return helpResponse();
    if (parsed.action === "open_job") return handleOpenJob(supabase, parsed);
    if (parsed.action === "open_related_job_page") return handleOpenRelatedJobPage(supabase, parsed, command);
    if (parsed.action === "open_page" && shortcut) return shortcut;
    if (parsed.action === "check_job_missing_info") return handleMissingInfo(supabase, parsed);
    if (parsed.action === "open_planner_date") return handleOpenPlanner(parsed);
    if (parsed.action === "create_crane_job_draft") return handleCreateCraneDraft(supabase, parsed, command);
    if (parsed.action === "update_job_date_draft") return handleMoveJobDraft(supabase, parsed);
    if (parsed.action === "assign_operator_draft") return handleAssignOperatorDraft(supabase, parsed);
    if (parsed.action === "assign_crane_draft") return handleAssignCraneDraft(supabase, parsed);
    if (parsed.action === "update_job_status_draft") return handleUpdateJobStatusDraft(supabase, parsed);
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
