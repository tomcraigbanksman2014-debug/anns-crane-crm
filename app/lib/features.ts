function envFlag(name: string, defaultValue: boolean) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on", "enabled"].includes(raw)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(raw)) return false;
  return defaultValue;
}

export function timesheetsEnabled() {
  return envFlag("TIMESHEETS_ENABLED", false);
}
