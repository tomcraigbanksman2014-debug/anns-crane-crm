import { EQUIPMENT_PROFILES, type EquipmentProfile } from "./equipmentProfiles";

function toText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function flatten(value: unknown): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function joinBits(bits: unknown[]) {
  return bits
    .flatMap((bit) => flatten(bit))
    .map((bit) => {
      if (!bit) return "";
      if (typeof bit === "object") {
        return Object.values(bit as Record<string, unknown>)
          .map((v) => String(v ?? ""))
          .join(" ");
      }
      return String(bit);
    })
    .join(" ")
    .toLowerCase();
}

function matchByAliases(text: string) {
  let winner: EquipmentProfile | null = null;
  let winnerScore = 0;

  for (const profile of EQUIPMENT_PROFILES) {
    let score = 0;
    for (const alias of profile.aliases) {
      const key = alias.toLowerCase();
      if (!key) continue;
      if (text.includes(key)) {
        score = Math.max(score, key.length);
      }
    }
    if (score > winnerScore) {
      winner = profile;
      winnerScore = score;
    }
  }

  return winner;
}

export function matchCraneJobEquipmentProfile(job: any): EquipmentProfile | null {
  const crane = flatten(job?.cranes)[0] ?? job?.crane ?? null;
  const text = joinBits([
    crane,
    crane?.name,
    crane?.make,
    crane?.model,
    crane?.capacity,
    job?.hire_type,
    job?.lift_type,
    job?.notes,
    job?.site_name,
  ]);

  return matchByAliases(text);
}

export function matchTransportJobEquipmentProfile(job: any, linkedJob?: any): EquipmentProfile | null {
  const vehicle = flatten(job?.vehicles)[0] ?? job?.vehicle ?? null;
  const text = joinBits([
    vehicle,
    vehicle?.name,
    vehicle?.reg_number,
    vehicle?.vehicle_type,
    vehicle?.trailer_type,
    vehicle?.capacity,
    job?.job_type,
    job?.load_description,
    job?.notes,
    linkedJob,
  ]);

  const matched = matchByAliases(text);
  if (matched) return matched;

  const hiabHints = [
    toText(vehicle?.name),
    toText(vehicle?.vehicle_type),
    toText(vehicle?.trailer_type),
    toText(job?.job_type),
    toText(job?.load_description),
    toText(job?.notes),
  ].join(" ");

  if (hiabHints.includes("rigid hiab") || hiabHints.includes("rigid")) {
    return EQUIPMENT_PROFILES.find((profile) => profile.id === "hiab-x-hipro-858") ?? null;
  }

  if (hiabHints.includes("artic hiab") || hiabHints.includes("artic")) {
    return EQUIPMENT_PROFILES.find((profile) => profile.id === "palfinger-pk65002-sh") ?? null;
  }

  if (hiabHints.includes("hiab") || hiabHints.includes("loader crane")) {
    return EQUIPMENT_PROFILES.find((profile) => profile.id === "hiab-x-hipro-858") ?? null;
  }

  return null;
}
