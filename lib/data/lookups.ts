import { createSupabaseServerClient } from "../supabase/server";

export async function getActiveOperators() {
  const supabase = createSupabaseServerClient();

  return supabase
    .from("operators")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name", { ascending: true });
}

export async function getActiveVehicles() {
  const supabase = createSupabaseServerClient();

  return supabase
    .from("vehicles")
    .select("id, name, reg_number")
    .eq("status", "active")
    .order("name", { ascending: true });
}

export async function getActiveEquipment() {
  const supabase = createSupabaseServerClient();

  return supabase
    .from("equipment")
    .select("id, name, asset_number")
    .eq("status", "active")
    .order("name", { ascending: true });
}

export async function getActiveSuppliers() {
  const supabase = createSupabaseServerClient();

  return supabase
    .from("suppliers")
    .select("id, company_name")
    .eq("status", "active")
    .order("company_name", { ascending: true });
}

export async function getClients() {
  const supabase = createSupabaseServerClient();

  return supabase
    .from("clients")
    .select("id, company_name")
    .order("company_name", { ascending: true });
}

export async function getRecentJobs(limit = 300) {
  const supabase = createSupabaseServerClient();

  return supabase
    .from("jobs")
    .select("id, job_number, site_name")
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function getRecentPurchaseOrders(limit = 300) {
  const supabase = createSupabaseServerClient();

  return supabase
    .from("purchase_orders")
    .select("id, po_number")
    .order("created_at", { ascending: false })
    .limit(limit);
}
