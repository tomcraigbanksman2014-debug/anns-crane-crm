export function getMasterAdminEmail() {
  return String(
    process.env.MASTER_ADMIN_EMAIL ??
      process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ??
      ""
  )
    .trim()
    .toLowerCase();
}

export function isMasterAdminEmail(email: string | null | undefined) {
  const normalisedEmail = String(email ?? "").trim().toLowerCase();
  const masterAdminEmail = getMasterAdminEmail();

  return !!normalisedEmail && !!masterAdminEmail && normalisedEmail === masterAdminEmail;
}
