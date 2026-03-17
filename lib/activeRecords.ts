export function isActiveStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "active";
}

export function isNotArchived(value: boolean | null | undefined) {
  return value !== true;
}

export function isSelectableRecord<T extends { archived?: boolean | null; status?: string | null }>(
  record: T | null | undefined
) {
  if (!record) return false;
  return isNotArchived(record.archived) && isActiveStatus(record.status);
}

export function filterSelectableRecords<
  T extends { archived?: boolean | null; status?: string | null }
>(records: T[] | null | undefined) {
  return (records ?? []).filter((record) => isSelectableRecord(record));
}
