"use client";

import AssetDocumentManager, { type AssetDocumentItem } from "../../components/AssetDocumentManager";
import type { AssetProfileInput } from "../../lib/assetAppendixPresets";

export default function CraneDocumentsManager({
  craneId,
  assetProfile,
  initialDocuments,
}: {
  craneId: string;
  assetProfile?: AssetProfileInput | null;
  initialDocuments: AssetDocumentItem[];
}) {
  return (
    <AssetDocumentManager
      assetLabel="Crane"
      assetType="crane"
      assetProfile={assetProfile}
      uploadUrl={`/api/cranes/${craneId}/documents/upload`}
      deleteUrlPrefix={`/api/cranes/${craneId}/documents`}
      initialDocuments={initialDocuments}
      documentTypeOptions={[
        { value: "spec_sheet", label: "spec_sheet" },
        { value: "load_chart", label: "load_chart" },
        { value: "manual", label: "manual" },
        { value: "loler", label: "loler" },
        { value: "inspection", label: "inspection" },
        { value: "insurance", label: "insurance" },
        { value: "service", label: "service" },
        { value: "other", label: "other" },
      ]}
    />
  );
}
