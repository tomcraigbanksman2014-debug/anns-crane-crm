const TOM_IDENTIFIERS = new Set([
  "tomcraig2019",
  "tomcraig2019@outlook.com",
  "tomcraigbanksman2014",
  "tomcraigbanksman2014@gmail.com",
  "sales",
  "sales@annscranehire.co.uk",
  "masteradmin",
  "master admin",
  "master_admin",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function titleCaseUsername(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function displayUserName(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (TOM_IDENTIFIERS.has(lower)) return "Tom";

  if (lower.includes("@")) {
    const username = lower.split("@")[0] || lower;
    if (TOM_IDENTIFIERS.has(username)) return "Tom";
    return titleCaseUsername(username) || raw;
  }

  return titleCaseUsername(raw) || raw;
}

export function displayUserNameFromEmail(email: string | null | undefined) {
  return displayUserName(email ?? "");
}
