type SupabaseLike = {
  from: (table: string) => any;
};

const ROLE_LOCAL_PARTS = new Set([
  "account",
  "accounts",
  "accountant",
  "accountspayable",
  "accounts-payable",
  "invoice",
  "invoices",
  "payables",
  "payroll",
  "police",
  "authority",
  "highways",
  "council",
  "association",
  "internal",
  "no-reply",
  "noreply",
  "donotreply",
  "do-not-reply",
]);

const ROLE_CONTAINS = [
  "accountant",
  "accounts",
  "invoice",
  "police",
  "authority",
  "highways",
  "council",
  "association",
  "internal",
  "noreply",
  "no-reply",
  "do-not-reply",
];

export function normaliseMarketingEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function cleanMarketingEmail(value: unknown) {
  const email = String(value ?? "").trim();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export function isSuppressedByBuiltInMarketingPattern(value: unknown) {
  const email = normaliseMarketingEmail(value);
  if (!email || !email.includes("@")) return false;

  const [localPart, domain] = email.split("@");
  const compactLocal = localPart.replace(/[._\s]/g, "-");

  if (ROLE_LOCAL_PARTS.has(localPart) || ROLE_LOCAL_PARTS.has(compactLocal)) return true;

  return ROLE_CONTAINS.some((part) => localPart.includes(part) || domain.includes(part));
}

export async function checkMarketingSuppression(supabase: SupabaseLike, emailValue: unknown) {
  const email = normaliseMarketingEmail(emailValue);
  if (!email) {
    return { suppressed: true, reason: "No email address" };
  }

  if (isSuppressedByBuiltInMarketingPattern(email)) {
    return { suppressed: true, reason: "Marketing suppression pattern" };
  }

  const [localPart, domain] = email.split("@");

  const { data: unsubscribedRows, error: unsubscribeError } = await supabase
    .from("marketing_unsubscribes")
    .select("id")
    .eq("email_normalized", email)
    .limit(1);

  if (!unsubscribeError && Array.isArray(unsubscribedRows) && unsubscribedRows.length > 0) {
    return { suppressed: true, reason: "Unsubscribed" };
  }

  const { data: suppressionRows, error: suppressionError } = await supabase
    .from("marketing_suppression_entries")
    .select("match_type, match_value, reason, active")
    .eq("active", true);

  if (!suppressionError && Array.isArray(suppressionRows)) {
    for (const row of suppressionRows) {
      const matchType = String((row as any)?.match_type ?? "").trim().toLowerCase();
      const matchValue = normaliseMarketingEmail((row as any)?.match_value);

      if (!matchValue) continue;

      const reason = String((row as any)?.reason ?? "Marketing suppression list").trim() || "Marketing suppression list";

      if (matchType === "email" && email === matchValue) {
        return { suppressed: true, reason };
      }

      if (matchType === "domain" && domain === matchValue.replace(/^@/, "")) {
        return { suppressed: true, reason };
      }

      if (matchType === "local_part" && localPart === matchValue) {
        return { suppressed: true, reason };
      }

      if (matchType === "contains" && email.includes(matchValue)) {
        return { suppressed: true, reason };
      }
    }
  }

  return { suppressed: false, reason: null as string | null };
}
