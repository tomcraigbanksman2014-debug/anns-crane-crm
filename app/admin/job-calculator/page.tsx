import ClientShell from "../../ClientShell";
import { requireOfficeUser } from "../../lib/routeGuards";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import JobPackageCalculatorClient from "./JobPackageCalculatorClient";

export const dynamic = "force-dynamic";

type SlimClient = {
  id: string;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type SlimCraneJob = {
  id: string;
  job_number: number | string | null;
  client_id: string | null;
  site_name: string | null;
  site_address: string | null;
  job_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
};

type SlimTransportJob = {
  id: string;
  transport_number: string | null;
  client_id: string | null;
  job_type: string | null;
  collection_address: string | null;
  delivery_address: string | null;
  transport_date: string | null;
  delivery_date: string | null;
  status: string | null;
};

type SlimQuote = {
  id: string;
  client_id: string | null;
  subject: string | null;
  quote_date: string | null;
  status: string | null;
  amount: number | null;
  notes: string | null;
  pdf_sections: Record<string, unknown> | null;
};

export default async function JobCalculatorPage() {
  await requireOfficeUser();

  const admin = createSupabaseAdminClient();

  const [clientsRes, jobsRes, transportRes, quotesRes] = await Promise.all([
    admin
      .from("clients")
      .select("id, company_name, contact_name, phone, email, address")
      .eq("archived", false)
      .order("company_name", { ascending: true })
      .limit(500),
    admin
      .from("jobs")
      .select("id, job_number, client_id, site_name, site_address, job_date, start_date, end_date, status")
      .eq("archived", false)
      .order("job_date", { ascending: false })
      .limit(250),
    admin
      .from("transport_jobs")
      .select("id, transport_number, client_id, job_type, collection_address, delivery_address, transport_date, delivery_date, status")
      .eq("archived", false)
      .order("transport_date", { ascending: false })
      .limit(250),
    admin
      .from("quotes")
      .select("id, client_id, subject, quote_date, status, amount, notes, pdf_sections")
      .eq("archived", false)
      .order("quote_date", { ascending: false })
      .limit(250),
  ]);

  const clients = ((clientsRes.data ?? []) as SlimClient[]).map((client) => ({
    ...client,
    company_name: client.company_name ?? "Unnamed customer",
  }));

  return (
    <ClientShell>
      <JobPackageCalculatorClient
        clients={clients}
        craneJobs={(jobsRes.data ?? []) as SlimCraneJob[]}
        transportJobs={(transportRes.data ?? []) as SlimTransportJob[]}
        quotes={(quotesRes.data ?? []) as SlimQuote[]}
        loadError={
          clientsRes.error?.message ||
          jobsRes.error?.message ||
          transportRes.error?.message ||
          quotesRes.error?.message ||
          ""
        }
      />
    </ClientShell>
  );
}
