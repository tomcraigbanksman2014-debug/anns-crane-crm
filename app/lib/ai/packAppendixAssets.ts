export type PackAppendixAsset = {
  title: string;
  publicPath: string;
  description?: string;
};

const PROFILE_APPENDIX_MAP: Record<string, PackAppendixAsset[]> = {
  "ak46-6000": [
    {
      title: "AK 46/6000 specification sheet",
      publicPath: "/lift-plan-assets/ak46-6000-spec.png",
      description: "Reference specification page for the Böcker AK 46/6000.",
    },
    {
      title: "AK 46/6000 working range / chart",
      publicPath: "/lift-plan-assets/ak46-6000-chart.png",
      description: "Reference working range and load chart page for the Böcker AK 46/6000.",
    },
  ],
  "gmk4080-1": [
    {
      title: "GMK4080-1 specification sheet",
      publicPath: "/lift-plan-assets/gmk4080-1-spec.png",
      description: "Reference specification page for the Grove GMK4080-1.",
    },
    {
      title: "GMK4080-1 load chart",
      publicPath: "/lift-plan-assets/gmk4080-1-chart.png",
      description: "Reference load chart page for the Grove GMK4080-1.",
    },
  ],
  "mtk-35": [
    {
      title: "MTK 35 specification sheet",
      publicPath: "/lift-plan-assets/mtk-35-spec.png",
      description: "Reference specification page for the Marchetti MTK 35.",
    },
    {
      title: "MTK 35 chart page",
      publicPath: "/lift-plan-assets/mtk-35-chart.png",
      description: "Reference chart page for the Marchetti MTK 35.",
    },
  ],
  "spx532": [
    {
      title: "SPX532 specification sheet",
      publicPath: "/lift-plan-assets/spx532-spec.png",
      description: "Reference specification page for the Jekko SPX532.",
    },
    {
      title: "SPX532 chart page",
      publicPath: "/lift-plan-assets/spx532-chart.png",
      description: "Reference main boom chart page for the Jekko SPX532.",
    },
  ],
  "hiab-x-hipro-858": [
    {
      title: "HIAB X-HIPRO 858 specification sheet",
      publicPath: "/lift-plan-assets/hiab-x-hipro-858-spec.png",
      description: "Reference technical data page for the HIAB X-HIPRO 858.",
    },
    {
      title: "HIAB X-HIPRO 858 chart page",
      publicPath: "/lift-plan-assets/hiab-x-hipro-858-chart.png",
      description: "Reference chart page for the HIAB X-HIPRO 858.",
    },
  ],
  "palfinger-pk65002-sh": [
    {
      title: "Palfinger PK 65002 SH specification sheet",
      publicPath: "/lift-plan-assets/palfinger-pk65002-sh-spec.png",
      description: "Reference technical specification page for the Palfinger PK 65002 SH.",
    },
    {
      title: "Palfinger PK 65002 SH chart page",
      publicPath: "/lift-plan-assets/palfinger-pk65002-sh-chart.png",
      description: "Reference chart page for the Palfinger PK 65002 SH.",
    },
  ],
};

export function getPackAppendixAssets(profileId: string | null | undefined): PackAppendixAsset[] {
  const key = String(profileId ?? "").trim().toLowerCase();
  if (!key) return [];
  return PROFILE_APPENDIX_MAP[key] ?? [];
}
