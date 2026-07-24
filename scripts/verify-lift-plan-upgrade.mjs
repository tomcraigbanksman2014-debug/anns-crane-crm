import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function check(name, condition, detail = "") {
  checks.push({ name, status: condition ? "PASS" : "FAIL", detail });
}

function contains(relativePath, text) {
  return read(relativePath).includes(text);
}

const profiles = "app/lib/ai/equipmentProfiles.ts";
const matcher = "app/lib/ai/matchEquipmentProfile.ts";
const specs = "app/lib/rangeChartSpecs.ts";
const mobilePack = "app/jobs/[id]/lift-plan/pack/page.tsx";
const transportPack = "app/transport-jobs/[id]/lift-plan/pack/page.tsx";
const builder = "app/jobs/[id]/lift-plan/RangeChartBuilder.tsx";
const presets = "app/lib/assetAppendixPresets.ts";
const validation = "app/lib/liftPlanTechnicalValidation.ts";

check("SN74 XPX uses exact HIAB X-HIPRO 858 EP-6 profile", contains(profiles, "AnnS artic HIAB on SN74 XPX: HIAB X-HIPRO 858 EP-6"));
check("SF25 XNB uses exact Palfinger PK 65002 SH E profile", contains(profiles, "AnnS rigid HIAB on SF25 XNB: Palfinger PK 65002 SH E"));
check("SN25 XRA remains historical and excluded from current matching", contains(matcher, "SN25 XRA was a historic hire vehicle"));
check("EP-6 16.3 m / 4,100 kg duty is present", contains(specs, "point(16.3, 4100)"));
check("Palfinger E 15.7 m / 3,100 kg duty is present", contains(specs, "point(15.7, 3100)"));
check("HK40 uses the correct 4.5 t, 2.1 t, 1.4 t and 0 t chart families", contains(specs, "4.5 t, 2.1 t, 1.4 t and 0 t tables") && !/HK40[^\n]{0,120}8\.5\s*t\s*counterweight/i.test(read(specs)));
check("HK40 9 m extension curves are present", contains(specs, "hk40-extension-35_2-9-0deg-45t") && contains(specs, "hk40-extension-30_3-9-20deg-45t"));
check("HK40 appendix pages are mapped to the correct uploaded specification", contains(presets, "pages: [4, 5, 6, 7, 8, 9, 10, 11]") && contains(presets, "pages: [12, 13]") && contains(presets, "pages: [14, 15, 16]"));
check("Issued mobile PDF does not call the setup recommendation engine", !contains(mobilePack, "suggestRangeChartSetups"));
check("Issued mobile PDF preserves the saved chart capacity", contains(mobilePack, "The issued PDF is a record of the AP-saved duty"));
check("Selected structured chart boom length is locked through save and print", contains(builder, "Structured profile options are exact load-chart columns") && contains(mobilePack, "The saved structured profile is an exact load-chart column"));
check("Lift Supervisor is not removed from mobile or HIAB packs", !contains(mobilePack, "isShaunRobinsonName") && !contains(transportPack, "isShaunRobinsonName"));
check("Advisory chart warnings do not block approval", !contains(validation, "errors.push(warning)"));
check("Missing capacity and overload still block approval", contains(validation, "Confirm and save the chart capacity for the selected setup.") && contains(validation, "exceeds the saved chart capacity"));
check("Owned HIAB packs always include the exact static owned chart assets", contains(transportPack, "ownedStaticProfile") && contains(transportPack, "[...staticAppendixAssets, ...supplementaryVehicleAssets]"));
check("Old job-level HK40 technical copies are excluded", contains(mobilePack, "const isSelectedHk40") && contains(mobilePack, "filteredJobSpecAppendixAssets"));

for (const relativePath of [mobilePack, transportPack]) {
  const source = read(relativePath);
  check(`${relativePath} has no printed AnnS ground-loading claim`, !source.includes("AnnS ground-loading check"));
  check(`${relativePath} has no printed appointed-person formula claim`, !source.includes("appointed-person planning formula"));
  check(`${relativePath} has no printed estimated-max label`, !source.includes("Estimated max outrigger load"));
  check(`${relativePath} uses worst-case ground-bearing wording`, source.includes("Worst-case outrigger load used for ground-bearing calculation"));
}

for (const asset of [
  "hiab-x-hipro-858-spec.png",
  "hiab-x-hipro-858-chart.png",
  "palfinger-pk65002-sh-spec.png",
  "palfinger-pk65002-sh-chart.png",
]) {
  const absolutePath = path.join(projectRoot, "public/lift-plan-assets", asset);
  const valid = fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 20_000;
  check(`Static appendix asset exists: ${asset}`, valid, valid ? `${fs.statSync(absolutePath).size} bytes` : "missing or empty");
}

const vercel = JSON.parse(read("vercel.json"));
check("Automatic Vercel git deployment remains disabled", vercel?.git?.deploymentEnabled === false);

const failed = checks.filter((item) => item.status === "FAIL");
for (const item of checks) {
  console.log(`${item.status.padEnd(4)}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
