"use client";

import AssetDocumentManager, { type AssetDocumentItem } from "../../components/AssetDocumentManager";

export default function VehicleDocumentsManager({
  vehicleId,
  initialDocuments,
}: {
  vehicleId: string;
  initialDocuments: AssetDocumentItem[];
}) {
  return (
    <AssetDocumentManager
      assetLabel="Vehicle / HIAB"
      uploadUrl={`/api/vehicles/${vehicleId}/documents/upload`}
      deleteUrlPrefix={`/api/vehicles/${vehicleId}/documents`}
      initialDocuments={initialDocuments}
      documentTypeOptions={[
        { value: "spec_sheet", label: "spec_sheet" },
        { value: "load_chart", label: "load_chart" },
        { value: "manual", label: "manual" },
        { value: "inspection", label: "inspection" },
        { value: "service", label: "service" },
        { value: "other", label: "other" },
      ]}
    />
  );
}
