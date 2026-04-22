"use client";

import { useState } from "react";

export default function TransportDocumentUploadForm({
  transportJobId,
}: {
  transportJobId: string;
}) {
  const [saving, setSaving] = useState(false);
  const [shareWithOperator, setShareWithOperator] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);

  return (
    <form
      action={`/api/transport-jobs/${transportJobId}/documents/upload`}
      method="POST"
      encType="multipart/form-data"
      onSubmit={() => setSaving(true)}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <select name="document_type" defaultValue="other" style={selectStyle}>
          <option value="movement_order">Movement Order</option>
          <option value="movement_order_request">Movement Order Request</option>
          <option value="route_plan">Route Plan</option>
          <option value="permit">Permit / Approval</option>
          <option value="escort_confirmation">Escort Confirmation</option>
          <option value="authority_notice">Authority Notice</option>
          <option value="bridge_notice">Bridge Notice</option>
          <option value="police_notice">Police Notice</option>
          <option value="dimension_sheet">Dimension Sheet</option>
          <option value="drawing">Drawing</option>
          <option value="weight_sheet">Weight Sheet</option>
          <option value="vehicle_configuration">Vehicle Configuration</option>
          <option value="rams">RAMS</option>
          <option value="site_drawing">Site Drawing</option>
          <option value="photo">Photo</option>
          <option value="delivery_note">Delivery Note</option>
          <option value="collection_note">Collection Note</option>
          <option value="pod">POD</option>
          <option value="other">Other</option>
        </select>

        <input
          name="files"
          type="file"
          required
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          style={inputStyle}
          onChange={(e) => setSelectedCount(e.target.files?.length ?? 0)}
        />

        {selectedCount > 0 ? (
          <div style={helpText}>
            {selectedCount} file{selectedCount === 1 ? "" : "s"} selected
          </div>
        ) : null}

        <label style={checkboxRow}>
          <input
            type="checkbox"
            name="share_with_operator"
            value="true"
            checked={shareWithOperator}
            onChange={(e) => setShareWithOperator(e.target.checked)}
          />
          <span>Share with operator</span>
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" disabled={saving} style={primaryBtn}>
            {saving ? "Uploading..." : "Upload document"}
          </button>
        </div>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.82)",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.88)",
  boxSizing: "border-box",
  fontSize: 14,
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 700,
};

const helpText: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.72,
  fontWeight: 700,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
