import { getQualificationStatus } from "./qualificationStatus";

export function getMissingQualifications(
  required: string[],
  current: { qualification_name: string }[]
) {
  const owned = current.map(q => q.qualification_name.toLowerCase());

  return required.filter(r => !owned.includes(r.toLowerCase()));
}

export function getComplianceSummary(
  required: string[],
  current: { qualification_name: string; expiry_date?: string | null }[]
) {
  const missing = getMissingQualifications(required, current);

  let expired = 0;
  let expiring = 0;

  for (const q of current) {
    const status = getQualificationStatus(q.expiry_date);

    if (status === "expired") expired++;
    if (status === "expiring") expiring++;
  }

  return {
    required: required.length,
    have: current.length,
    missing: missing.length,
    expired,
    expiring,
    missingList: missing,
  };
}
