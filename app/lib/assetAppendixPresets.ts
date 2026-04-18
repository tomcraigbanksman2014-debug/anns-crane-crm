export type AssetPresetKind = 'crane' | 'vehicle';

export type AssetProfileInput = {
  name?: string | null;
  make?: string | null;
  model?: string | null;
  vehicleType?: string | null;
  capacity?: string | null;
};

export type AssetAppendixBundlePreset = {
  key: string;
  title: string;
  documentType: string;
  appendixOrder: number;
  pages: number[];
};

export type AssetAppendixPreset = {
  key: string;
  label: string;
  assetType: AssetPresetKind;
  bundles: AssetAppendixBundlePreset[];
};

export type CraneAppendixSelectionContext = {
  liftType?: string | null;
  craneConfiguration?: string | null;
  outriggerSetup?: string | null;
  loadDescription?: string | null;
  notes?: string | null;
};

export type VehicleAppendixSelectionContext = {
  jobType?: string | null;
  vehicleConfiguration?: string | null;
  hiabConfiguration?: string | null;
  outriggerSetup?: string | null;
  loadDescription?: string | null;
  notes?: string | null;
};

function norm(...parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

const PRESETS: AssetAppendixPreset[] = [
  {
    key: 'ak46',
    label: 'Böcker AK 46/6000',
    assetType: 'crane',
    bundles: [
      { key: 'spec', title: 'AK46 SPEC', documentType: 'spec_sheet', appendixOrder: 10, pages: [1] },
      { key: 'crane', title: 'AK46 CRANE OPERATION', documentType: 'load_chart', appendixOrder: 20, pages: [2] },
      { key: 'basket', title: 'AK46 PLATFORM / BASKET', documentType: 'load_chart', appendixOrder: 30, pages: [3] },
      { key: 'dimensions', title: 'AK46 DIMENSIONS', documentType: 'manual', appendixOrder: 40, pages: [4] },
    ],
  },
  {
    key: 'gmk4080',
    label: 'Grove GMK4080-1',
    assetType: 'crane',
    bundles: [
      { key: 'spec', title: 'GMK4080 SPEC', documentType: 'spec_sheet', appendixOrder: 10, pages: [3] },
      { key: 'support', title: 'GMK4080 DIMENSIONS / NOTES / RANGE', documentType: 'manual', appendixOrder: 15, pages: [10, 11, 12, 13] },
      { key: 'main_boom', title: 'GMK4080 MAIN BOOM', documentType: 'load_chart', appendixOrder: 20, pages: [14, 15, 16, 17] },
      { key: 'jib_a', title: 'GMK4080 JIB (A)', documentType: 'load_chart', appendixOrder: 30, pages: [18, 19, 20] },
      { key: 'jib_b', title: 'GMK4080 JIB (B)', documentType: 'load_chart', appendixOrder: 31, pages: [21, 22] },
      { key: 'extension', title: 'GMK4080 EXTENSION / LUFFING', documentType: 'load_chart', appendixOrder: 40, pages: [23, 24] },
    ],
  },
  {
    key: 'jekko_spx532',
    label: 'Jekko SPX532',
    assetType: 'crane',
    bundles: [
      { key: 'core', title: 'SPX532 CORE / SUPPORT', documentType: 'spec_sheet', appendixOrder: 10, pages: [2, 3, 4] },
      { key: 'stability', title: 'SPX532 STABILITY', documentType: 'manual', appendixOrder: 15, pages: [7, 8] },
      { key: 'main_boom', title: 'SPX532 MAIN BOOM', documentType: 'load_chart', appendixOrder: 20, pages: [9, 10, 11] },
      { key: 'jib1000', title: 'SPX532 JIB1000', documentType: 'load_chart', appendixOrder: 30, pages: [12, 13, 14] },
      { key: 'jib1200_a', title: 'SPX532 JIB1200 (A)', documentType: 'load_chart', appendixOrder: 40, pages: [15, 16, 17] },
      { key: 'jib1200_b', title: 'SPX532 JIB1200 (B)', documentType: 'load_chart', appendixOrder: 41, pages: [18, 19, 20] },
    ],
  },
  {
    key: 'mtk35',
    label: 'Marchetti MTK 35',
    assetType: 'crane',
    bundles: [
      { key: 'spec', title: 'MTK35 SPEC / DIMENSIONS', documentType: 'spec_sheet', appendixOrder: 10, pages: [2, 6] },
      { key: 'crane', title: 'MTK35 CRANE CHARTS', documentType: 'load_chart', appendixOrder: 20, pages: [3, 4] },
      { key: 'mewp', title: 'MTK35 MEWP', documentType: 'load_chart', appendixOrder: 30, pages: [5] },
    ],
  },
  {
    key: 'xhipro858',
    label: 'HIAB X-HIPRO 858',
    assetType: 'vehicle',
    bundles: [
      { key: 'spec', title: 'X-HIPRO SPEC', documentType: 'spec_sheet', appendixOrder: 10, pages: [2] },
      { key: 'chart', title: 'X-HIPRO LOAD DIAGRAM', documentType: 'load_chart', appendixOrder: 20, pages: [3] },
    ],
  },
  {
    key: 'pk65002',
    label: 'Palfinger PK 65002 SH',
    assetType: 'vehicle',
    bundles: [
      { key: 'spec', title: 'PK65002 SPEC', documentType: 'spec_sheet', appendixOrder: 10, pages: [11] },
      { key: 'boom', title: 'PK65002 BOOM CHARTS', documentType: 'load_chart', appendixOrder: 20, pages: [8] },
      { key: 'fly', title: 'PK65002 FLY JIB / DPS', documentType: 'load_chart', appendixOrder: 30, pages: [9] },
      { key: 'dimensions', title: 'PK65002 DIMENSIONS', documentType: 'manual', appendixOrder: 40, pages: [10] },
    ],
  },
];

export function detectAssetAppendixPreset(assetType: AssetPresetKind, profile: AssetProfileInput | null | undefined) {
  const haystack = norm(profile?.name, profile?.make, profile?.model, profile?.vehicleType, profile?.capacity);
  if (!haystack) return null;

  if (assetType === 'crane') {
    if (hasAny(haystack, ['ak 46', 'ak46', '46 6000', '46/6000', 'bocker ak'])) return PRESETS.find((p) => p.key === 'ak46') ?? null;
    if (hasAny(haystack, ['gmk4080', 'gmk 4080', '4080 1', '4080-1', 'grove'])) return PRESETS.find((p) => p.key === 'gmk4080') ?? null;
    if (hasAny(haystack, ['spx532', 'spx 532', 'jekko'])) return PRESETS.find((p) => p.key === 'jekko_spx532') ?? null;
    if (hasAny(haystack, ['mtk35', 'mtk 35', 'marchetti'])) return PRESETS.find((p) => p.key === 'mtk35') ?? null;
  }

  if (assetType === 'vehicle') {
    if (hasAny(haystack, ['x hipro 858', 'x-hipro 858', '858', 'hiab x'])) return PRESETS.find((p) => p.key === 'xhipro858') ?? null;
    if (hasAny(haystack, ['pk 65002', 'pk65002', '65002 sh', 'palfinger'])) return PRESETS.find((p) => p.key === 'pk65002') ?? null;
  }

  return null;
}

export function listAssetAppendixPresetBundles(assetType: AssetPresetKind, profile: AssetProfileInput | null | undefined) {
  return detectAssetAppendixPreset(assetType, profile)?.bundles ?? [];
}

function bundleTitles(preset: AssetAppendixPreset, keys: string[]) {
  const wanted = new Set(keys);
  return preset.bundles.filter((bundle) => wanted.has(bundle.key)).map((bundle) => bundle.title);
}

export function selectCraneBundleTitlesForContext(
  profile: AssetProfileInput | null | undefined,
  context: CraneAppendixSelectionContext | null | undefined
) {
  const preset = detectAssetAppendixPreset('crane', profile);
  if (!preset) return null;

  const source = norm(
    context?.liftType,
    context?.craneConfiguration,
    context?.outriggerSetup,
    context?.loadDescription,
    context?.notes
  );

  if (preset.key === 'ak46') {
    const isBasket = hasAny(source, ['basket', 'platform', 'mewp', 'man basket']);
    const restricted = hasAny(source, ['restricted access', 'tight access', 'narrow access', 'restricted setup']);
    const keys = ['spec', isBasket ? 'basket' : 'crane'];
    if (restricted) keys.push('dimensions');
    return bundleTitles(preset, keys);
  }

  if (preset.key === 'gmk4080') {
    const isExtension = hasAny(source, ['luffing', 'hydraulic luffing', 'boom extension', 'fixed offset', 'extension']);
    const isJib = hasAny(source, ['jib', 'swingaway', 'fly jib', 'boom + jib', 'boom and jib']);
    const keys = ['spec', 'support'];
    if (isExtension) keys.push('extension');
    else if (isJib) keys.push('jib_a', 'jib_b');
    else keys.push('main_boom');
    return bundleTitles(preset, keys);
  }

  if (preset.key === 'jekko_spx532') {
    const isJ0 = hasAny(source, [' j0 ', 'stability j0', 'class j0']);
    const isJib1200 = hasAny(source, ['jib1200', 'jib 1200', '1200']);
    const isJib1000 = hasAny(source, ['jib1000', 'jib 1000', '1000']);
    const keys = ['core', 'stability'];
    if (isJ0) return bundleTitles(preset, keys);
    if (isJib1200) keys.push('jib1200_a', 'jib1200_b');
    else if (isJib1000) keys.push('jib1000');
    else keys.push('main_boom');
    return bundleTitles(preset, keys);
  }

  if (preset.key === 'mtk35') {
    const isMewp = hasAny(source, ['mewp', 'basket', 'platform']);
    return bundleTitles(preset, ['spec', isMewp ? 'mewp' : 'crane']);
  }

  return preset.bundles.map((bundle) => bundle.title);
}

export function selectVehicleBundleTitlesForContext(
  profile: AssetProfileInput | null | undefined,
  context: VehicleAppendixSelectionContext | null | undefined
) {
  const preset = detectAssetAppendixPreset('vehicle', profile);
  if (!preset) return null;

  const source = norm(
    context?.jobType,
    context?.vehicleConfiguration,
    context?.hiabConfiguration,
    context?.outriggerSetup,
    context?.loadDescription,
    context?.notes
  );

  if (preset.key === 'xhipro858') {
    return bundleTitles(preset, ['spec', 'chart']);
  }

  if (preset.key === 'pk65002') {
    const isFly = hasAny(source, ['fly', 'jib', 'dps', 'pj100', 'pj125', 'pj170']);
    const restricted = hasAny(source, ['hpsc', 'variable stabiliser', 'partial', 'restricted']);
    const keys = ['spec', isFly ? 'fly' : 'boom'];
    if (restricted) keys.push('dimensions');
    return bundleTitles(preset, keys);
  }

  return preset.bundles.map((bundle) => bundle.title);
}
