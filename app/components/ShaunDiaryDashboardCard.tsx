"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShaunDiaryEntry } from "../lib/shaunDiary";

function fmtTime(value: string) { return new Date(value).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }); }
export default function ShaunDiaryDashboardCard() {
  const [entries, setEntries] = useState<ShaunDiaryEntry[]>([]);
  useEffect(() => {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+2);
    fetch(`/api/shaun-diary?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, { cache:"no-store" })
      .then(r => r.ok ? r.json() : null).then(j => setEntries(Array.isArray(j?.entries) ? j.entries : [])).catch(() => {});
  }, []);
  const today = new Date().toDateString();
  const todayEntries = entries.filter(e => new Date(e.start_at).toDateString() === today);
  const next = todayEntries.find(e => new Date(e.end_at).getTime() >= Date.now()) || entries.find(e => new Date(e.start_at).getTime() > Date.now());
  return <div style={{ background:"#fff", border:"1px solid #dbe2ea", borderRadius:14, padding:16, marginBottom:16 }}>
    <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", marginBottom:10 }}><div><strong style={{ fontSize:18 }}>Shaun&apos;s Diary</strong><div style={{ color:"#64748b", fontSize:13 }}>Today and next</div></div><Link href="/shaun-diary" style={{ fontWeight:800 }}>Open diary →</Link></div>
    {!todayEntries.length ? <div style={{ color:"#64748b" }}>Nothing scheduled today.</div> : todayEntries.slice(0,4).map(e => <div key={e.id} style={{ borderTop:"1px solid #eef2f7", padding:"9px 0" }}><strong>{e.all_day ? "All day" : fmtTime(e.start_at)} — {e.title}</strong>{e.location && <div style={{ color:"#64748b", fontSize:13 }}>{e.location}</div>}</div>)}
    {next && <div style={{ marginTop:10, background:"#eff6ff", borderRadius:9, padding:10 }}><strong>Next:</strong> {new Date(next.start_at).toLocaleDateString("en-GB", { weekday:"short" })} {next.all_day ? "All day" : fmtTime(next.start_at)} — {next.title}</div>}
  </div>;
}
