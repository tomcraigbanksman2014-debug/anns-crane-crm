"use client";

import JobEquipmentManager from "../app/jobs/[id]/JobEquipmentManager";

type Option = {
  value: string;
  label: string;
};

type Allocation = {
  id: string;
  asset_type?: string | null;
  crane_id?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
  operator_id?: string | null;
  source_type?: string | null;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
  item_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  agreed_cost?: number | null;
  supplier_reference?: string | null;
  notes?: string | null;
  cranes?: {
    id?: string;
    name?: string | null;
    reg_number?: string | null;
    capacity?: string | null;
  } | null;
  vehicles?: {
    id?: string;
    name?: string | null;
    reg_number?: string | null;
  } | null;
  equipment?: {
    id?: string;
    name?: string | null;
    asset_number?: string | null;
  } | null;
  operators?: {
    id?: string;
    full_name?: string | null;
  } | null;
  suppliers?: {
    id?: string;
    company_name?: string | null;
  } | null;
  purchase_orders?: {
    id?: string;
    po_number?: string | null;
    status?: string | null;
  } | null;
};

export default function JobAllocations(props: {
  jobId: string;
  initialAllocations: Allocation[];
  craneOptions: Option[];
  vehicleOptions: Option[];
  equipmentOptions: Option[];
  operatorOptions: Option[];
  supplierOptions: Option[];
  purchaseOrderOptions: Option[];
  defaultDate?: string | null;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
}) {
  return <JobEquipmentManager {...props} />;
}
