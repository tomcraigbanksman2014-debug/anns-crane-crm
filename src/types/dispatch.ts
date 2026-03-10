export type DispatchStatus =
  | "planned"
  | "dispatched"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface PlannerEquipment {
  id: string;
  name: string;
  asset_number: string | null;
  type: string | null;
  capacity: string | null;
  status: string | null;
}

export interface PlannerJob {
  id: string;
  job_number: string;
  job_date: string;
  start_time: string | null;
  end_time: string | null;
  site_name: string | null;
  site_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  hire_type: string | null;
  lift_type: string | null;
  status: string | null;
  client: {
    id: string;
    company_name: string;
  } | null;
  dispatch: PlannerDispatch | null;
}

export interface PlannerDispatch {
  id: string;
  job_id: string;
  equipment_id: string;
  dispatch_date: string;
  start_time: string | null;
  end_time: string | null;
  operator_name: string | null;
  operator_user_id: string | null;
  status: DispatchStatus;
  notes: string | null;
}

export interface PlannerDay {
  date: string;
  label: string;
  jobs: PlannerJob[];
}
