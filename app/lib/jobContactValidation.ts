export const CRANE_JOB_SITE_CONTACT_ERROR = "Site contact name and contact number are required before a crane job can be saved.";

export const TRANSPORT_JOB_SITE_CONTACT_ERROR = "Pickup / site contact name and contact number are required before a transport job can be saved.";

export function cleanRequiredText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

export function hasRequiredCraneJobSiteContact(input: {
  contact_name?: unknown;
  contact_phone?: unknown;
}) {
  return !!cleanRequiredText(input.contact_name) && !!cleanRequiredText(input.contact_phone);
}

export function assertRequiredCraneJobSiteContact(input: {
  contact_name?: unknown;
  contact_phone?: unknown;
}) {
  if (!hasRequiredCraneJobSiteContact(input)) {
    throw new Error(CRANE_JOB_SITE_CONTACT_ERROR);
  }
}

export function hasRequiredTransportJobSiteContact(input: {
  collection_contact_name?: unknown;
  collection_contact_phone?: unknown;
}) {
  return !!cleanRequiredText(input.collection_contact_name) && !!cleanRequiredText(input.collection_contact_phone);
}

export function assertRequiredTransportJobSiteContact(input: {
  collection_contact_name?: unknown;
  collection_contact_phone?: unknown;
}) {
  if (!hasRequiredTransportJobSiteContact(input)) {
    throw new Error(TRANSPORT_JOB_SITE_CONTACT_ERROR);
  }
}
