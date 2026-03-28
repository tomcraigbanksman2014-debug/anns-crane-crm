
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function matchesOperatorLogin(authEmail: string, operator: any) {
  const email = String(authEmail ?? "").trim().toLowerCase();
  const username = email.includes("@") ? email.split("@")[0] : email;
  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorEmailUsername = operatorEmail.includes("@") ? operatorEmail.split("@")[0] : operatorEmail;
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();
  return ((!!operatorEmail && operatorEmail === email) || (!!operatorEmailUsername && operatorEmailUsername === username) || (!!operatorName && operatorName === username));
}
function hrefFor(path: string | null | undefined) {
  if (!path || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "#";
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${path}`;
}

export default async function OperatorDocumentsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login?next=/operator/documents");
  const authEmail = String(user.email ?? "").trim().toLowerCase();
  const { data: operators } = await supabase.from("operators").select("id, full_name, email, status").eq("status", "active");
  const operator = (operators ?? []).find((op: any) => matchesOperatorLogin(authEmail, op)) ?? null;
  if (!operator) return <ClientShell><div style={{width:"min(900px,95vw)",margin:"0 auto"}}><div style={box}>No operator record linked to this login.</div></div></ClientShell>;

  const { data: jobs } = await supabase.from("jobs").select("id, operator_id, main_operator_id, job_equipment(operator_id)").neq("status","cancelled").limit(500);
  const assignedJobIds = (jobs ?? []).filter((job: any) => {
    if (String(job.operator_id ?? "") === String(operator.id)) return true;
    if (String(job.main_operator_id ?? "") === String(operator.id)) return true;
    const allocations = Array.isArray(job.job_equipment) ? job.job_equipment : [];
    return allocations.some((row: any) => String(row.operator_id ?? "") === String(operator.id));
  }).map((job: any) => job.id);

  const [{ data: craneDocs }, { data: transportDocs }] = await Promise.all([
    assignedJobIds.length ? supabase.from("job_documents").select("id, job_id, file_name, file_path, document_type, created_at, share_with_operator").in("job_id", assignedJobIds).eq("share_with_operator", true).order("created_at", { ascending: false }) : Promise.resolve({ data: [] } as any),
    supabase.from("transport_jobs").select("id").eq("operator_id", operator.id).then(async ({ data }) => {
      const ids = (data ?? []).map((x: any) => x.id);
      if (!ids.length) return { data: [] } as any;
      return supabase.from("transport_job_documents").select("id, transport_job_id, file_name, file_path, document_type, created_at, share_with_operator").in("transport_job_id", ids).eq("share_with_operator", true).order("created_at", { ascending: false });
    }),
  ]);

  const items = [
    ...((craneDocs ?? []) as any[]).map((doc: any) => ({ ...doc, scope: "Crane" })),
    ...((transportDocs ?? []) as any[]).map((doc: any) => ({ ...doc, scope: "Transport" })),
  ];

  return <ClientShell><div style={{width:"min(900px,95vw)",margin:"0 auto"}}><div style={card}><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center"}}><div><h1 style={{margin:0,fontSize:32}}>Documents</h1><p style={{marginTop:6,opacity:0.8}}>Documents shared with <strong>{operator.full_name}</strong></p></div><a href="/operator/jobs" style={btn}>← Back</a></div>{!items.length ? <div style={box}>No shared documents available.</div> : <div style={{display:"grid",gap:12,marginTop:18}}>{items.map((doc: any) => <div key={`${doc.scope}-${doc.id}`} style={box}><div style={{fontWeight:900,fontSize:18}}>{doc.file_name ?? "Document"}</div><div style={{marginTop:6,fontSize:13,opacity:0.76}}>{doc.scope} • {doc.document_type ?? "other"}</div><div style={{marginTop:12}}><a href={hrefFor(doc.file_path)} target="_blank" rel="noreferrer" style={primaryBtn}>Open</a></div></div>)}</div>}</div></div></ClientShell>;
}
const card: React.CSSProperties = { background:"rgba(255,255,255,0.18)", padding:18, borderRadius:14, border:"1px solid rgba(255,255,255,0.4)", boxShadow:"0 8px 30px rgba(0,0,0,0.08)" };
const box: React.CSSProperties = { marginTop:18, padding:"14px 16px", borderRadius:14, background:"rgba(255,255,255,0.58)", border:"1px solid rgba(0,0,0,0.08)" };
const btn: React.CSSProperties = { display:"inline-block", padding:"10px 14px", borderRadius:10, background:"rgba(255,255,255,0.82)", color:"#111", textDecoration:"none", fontWeight:800 };
const primaryBtn: React.CSSProperties = { display:"inline-block", padding:"10px 14px", borderRadius:10, background:"#111", color:"#fff", textDecoration:"none", fontWeight:800 };
