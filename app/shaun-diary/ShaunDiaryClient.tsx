"use client";

import { useEffect, useMemo, useState } from "react";
import { SHAUN_DIARY_TYPES, diaryTypeLabel, formatDiarySummary, type ShaunDiaryEntry } from "../lib/shaunDiary";
import ShaunDiaryNotifications from "../components/ShaunDiaryNotifications";

type Draft = {
  id?: string;
  title: string;
  entry_type: string;
  date: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  notes: string;
  contact_name: string;
  contact_phone: string;
  reminder_minutes: string;
};

const emptyDraft = (date: string): Draft => ({
  title: "",
  entry_type: "site_visit",
  date,
  start_time: "09:00",
  end_time: "10:00",
  all_day: false,
  location: "",
  notes: "",
  contact_name: "",
  contact_phone: "",
  reminder_minutes: "60",
});

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function localDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isoFromLocal(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}:00`).toISOString();
}

function entryToDraft(entry: ShaunDiaryEntry): Draft {
  const start = new Date(entry.start_at);
  const end = new Date(entry.end_at);
  return {
    id: entry.id,
    title: entry.title,
    entry_type: entry.entry_type,
    date: localDate(start),
    start_time: localTime(start),
    end_time: localTime(end),
    all_day: Boolean(entry.all_day),
    location: entry.location || "",
    notes: entry.notes || "",
    contact_name: entry.contact_name || "",
    contact_phone: entry.contact_phone || "",
    reminder_minutes: entry.reminder_minutes == null ? "" : String(entry.reminder_minutes),
  };
}

export default function ShaunDiaryClient() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<ShaunDiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const rangeEnd = addDays(weekStart, 7);

  async function load() {
    setLoading(true); setError("");
    const res = await fetch(`/api/shaun-diary?start=${encodeURIComponent(weekStart.toISOString())}&end=${encodeURIComponent(rangeEnd.toISOString())}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error || "Unable to load diary.");
    else setEntries(Array.isArray(json.entries) ? json.entries : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [weekStart]);

  function entriesForDay(day: Date) {
    const key = localDate(day);
    return entries.filter((entry) => localDate(new Date(entry.start_at)) === key);
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setError("");
    const payload = {
      title: draft.title,
      entry_type: draft.entry_type,
      start_at: isoFromLocal(draft.date, draft.all_day ? "00:00" : draft.start_time),
      end_at: isoFromLocal(draft.date, draft.all_day ? "23:59" : draft.end_time),
      all_day: draft.all_day,
      location: draft.location,
      notes: draft.notes,
      contact_name: draft.contact_name,
      contact_phone: draft.contact_phone,
      reminder_minutes: draft.reminder_minutes,
    };
    const url = draft.id ? `/api/shaun-diary/${draft.id}` : "/api/shaun-diary";
    const res = await fetch(url, { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error || "Unable to save diary entry.");
    else { setDraft(null); await load(); }
    setSaving(false);
  }

  async function remove() {
    if (!draft?.id || !confirm("Delete this diary entry?")) return;
    setSaving(true);
    const res = await fetch(`/api/shaun-diary/${draft.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Unable to delete diary entry.");
    } else { setDraft(null); await load(); }
    setSaving(false);
  }

  async function moveEntry(entry: ShaunDiaryEntry, date: string) {
    const start = new Date(entry.start_at);
    const end = new Date(entry.end_at);
    const duration = end.getTime() - start.getTime();
    const newStart = new Date(`${date}T${localTime(start)}:00`);
    const res = await fetch(`/api/shaun-diary/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, start_at: newStart.toISOString(), end_at: new Date(newStart.getTime() + duration).toISOString() }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Unable to move entry.");
    } else await load();
  }

  const weekSummary = useMemo(() => formatDiarySummary(entries, `Shaun's diary: ${weekStart.toLocaleDateString("en-GB")} to ${addDays(weekStart, 6).toLocaleDateString("en-GB")}`), [entries, weekStart]);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(weekSummary)}`;
  const pdfUrl = `/api/shaun-diary/pdf?start=${encodeURIComponent(weekStart.toISOString())}&end=${encodeURIComponent(rangeEnd.toISOString())}`;

  async function sendEmail() {
    setSending(true); setMessage("");
    const res = await fetch("/api/shaun-diary/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: email, start: weekStart.toISOString(), end: rangeEnd.toISOString() }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(json.error || "Unable to send email.");
    else setMessage("Schedule emailed successfully.");
    setSending(false);
  }

  return (
    <div className="sd-wrap">
      <ShaunDiaryNotifications />
      <style>{`
        .sd-wrap{max-width:1500px;margin:0 auto;padding:18px}.sd-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}.sd-actions{display:flex;gap:8px;flex-wrap:wrap}.sd-btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:9px 13px;font-weight:700;cursor:pointer}.sd-btn.primary{background:#0f172a;color:white;border-color:#0f172a}.sd-grid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:10px;overflow-x:auto}.sd-day{min-height:560px;background:#fff;border:1px solid #dbe2ea;border-radius:12px;padding:10px}.sd-day.today{border:2px solid #2563eb}.sd-dayhead{display:flex;justify-content:space-between;gap:8px;align-items:center;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:8px}.sd-entry{border:1px solid #dbe2ea;border-left:5px solid #334155;border-radius:9px;padding:8px;margin-bottom:8px;background:#f8fafc;cursor:pointer}.sd-entry strong{display:block}.sd-entry small{display:block;color:#475569;margin-top:3px}.sd-empty{color:#94a3b8;font-size:13px;padding:16px 2px}.sd-modalback{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}.sd-modal{background:white;border-radius:14px;max-width:720px;width:100%;max-height:92vh;overflow:auto;padding:20px}.sd-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sd-field{display:flex;flex-direction:column;gap:5px}.sd-field.full{grid-column:1/-1}.sd-field input,.sd-field select,.sd-field textarea{border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit}.sd-footer{display:flex;justify-content:space-between;gap:10px;margin-top:18px}.sd-error{background:#fee2e2;color:#991b1b;padding:10px;border-radius:8px;margin-bottom:12px}.sd-share{background:#f8fafc;border:1px solid #dbe2ea;border-radius:12px;padding:14px;margin-bottom:14px}.sd-sharegrid{display:grid;grid-template-columns:1fr auto;gap:8px}.sd-share textarea{width:100%;min-height:170px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px}.sd-time{font-weight:800;color:#0f172a}.sd-type{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}.sd-location{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:900px){.sd-grid{grid-template-columns:1fr}.sd-day{min-height:auto}.sd-form{grid-template-columns:1fr}.sd-field.full{grid-column:auto}.sd-sharegrid{grid-template-columns:1fr}}
      `}</style>

      <div className="sd-toolbar">
        <div>
          <h1 style={{ margin: 0 }}>Shaun&apos;s Diary</h1>
          <div style={{ color: "#64748b", marginTop: 4 }}>{weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "long" })} – {addDays(weekStart, 6).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</div>
        </div>
        <div className="sd-actions">
          <button className="sd-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>Previous</button>
          <button className="sd-btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
          <button className="sd-btn" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next</button>
          <button className="sd-btn" onClick={() => setShareOpen(!shareOpen)}>Send / Share</button>
          <button className="sd-btn primary" onClick={() => setDraft(emptyDraft(localDate(new Date())))}>Add entry</button>
        </div>
      </div>

      {error && <div className="sd-error">{error}</div>}

      {shareOpen && (
        <div className="sd-share">
          <h3 style={{ marginTop: 0 }}>Send this week&apos;s schedule</h3>
          <div className="sd-actions" style={{ marginBottom: 12 }}>
            <a className="sd-btn" href={pdfUrl} target="_blank">Download PDF</a>
            <a className="sd-btn" href={whatsappUrl} target="_blank" rel="noreferrer">Open in WhatsApp</a>
            <button className="sd-btn" onClick={() => navigator.clipboard.writeText(weekSummary).then(() => setMessage("Schedule copied."))}>Copy schedule</button>
          </div>
          <div className="sd-sharegrid" style={{ marginBottom: 10 }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Recipient email address" style={{ border:"1px solid #cbd5e1", borderRadius:8, padding:10 }} />
            <button className="sd-btn primary" disabled={sending || !email} onClick={sendEmail}>{sending ? "Sending..." : "Send email"}</button>
          </div>
          {message && <div style={{ marginBottom: 10, fontWeight: 700 }}>{message}</div>}
          <textarea readOnly value={weekSummary} />
        </div>
      )}

      {loading ? <div>Loading diary...</div> : (
        <div className="sd-grid">
          {days.map((day) => {
            const list = entriesForDay(day);
            const today = localDate(day) === localDate(new Date());
            return (
              <div key={localDate(day)} className={`sd-day ${today ? "today" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); const entry = entries.find(x => x.id === id); if (entry) void moveEntry(entry, localDate(day)); }}>
                <div className="sd-dayhead">
                  <div><strong>{day.toLocaleDateString("en-GB", { weekday: "long" })}</strong><div style={{ color:"#64748b" }}>{day.toLocaleDateString("en-GB", { day:"2-digit", month:"short" })}</div></div>
                  <button className="sd-btn" style={{ padding:"5px 9px" }} onClick={() => setDraft(emptyDraft(localDate(day)))}>+</button>
                </div>
                {!list.length && <div className="sd-empty">No entries</div>}
                {list.map((entry) => {
                  const start = new Date(entry.start_at); const end = new Date(entry.end_at);
                  return <div key={entry.id} className="sd-entry" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", entry.id)} onClick={() => setDraft(entryToDraft(entry))}>
                    <div className="sd-type">{diaryTypeLabel(entry.entry_type)}</div>
                    <div className="sd-time">{entry.all_day ? "All day" : `${localTime(start)}–${localTime(end)}`}</div>
                    <strong>{entry.title}</strong>
                    {entry.location && <small className="sd-location">📍 {entry.location}</small>}
                    {entry.contact_name && <small>Contact: {entry.contact_name}</small>}
                  </div>;
                })}
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <div className="sd-modalback" onMouseDown={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="sd-modal">
            <h2 style={{ marginTop: 0 }}>{draft.id ? "Edit diary entry" : "Add diary entry"}</h2>
            <div className="sd-form">
              <label className="sd-field full"><span>Title *</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title:e.target.value })} /></label>
              <label className="sd-field"><span>Type</span><select value={draft.entry_type} onChange={(e) => setDraft({ ...draft, entry_type:e.target.value })}>{SHAUN_DIARY_TYPES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
              <label className="sd-field"><span>Date</span><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date:e.target.value })} /></label>
              <label className="sd-field full" style={{ flexDirection:"row", alignItems:"center" }}><input type="checkbox" checked={draft.all_day} onChange={(e) => setDraft({ ...draft, all_day:e.target.checked })} /> <span>All day</span></label>
              {!draft.all_day && <><label className="sd-field"><span>Start time</span><input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time:e.target.value })} /></label><label className="sd-field"><span>End time</span><input type="time" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time:e.target.value })} /></label></>}
              <label className="sd-field full"><span>Location</span><input value={draft.location} onChange={(e) => setDraft({ ...draft, location:e.target.value })} /></label>
              <label className="sd-field"><span>Contact name</span><input value={draft.contact_name} onChange={(e) => setDraft({ ...draft, contact_name:e.target.value })} /></label>
              <label className="sd-field"><span>Contact phone</span><input value={draft.contact_phone} onChange={(e) => setDraft({ ...draft, contact_phone:e.target.value })} /></label>
              <label className="sd-field"><span>Reminder</span><select value={draft.reminder_minutes} onChange={(e) => setDraft({ ...draft, reminder_minutes:e.target.value })}><option value="">None</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="120">2 hours before</option><option value="1440">1 day before</option></select></label>
              <label className="sd-field full"><span>Notes</span><textarea rows={5} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes:e.target.value })} /></label>
            </div>
            <div className="sd-footer">
              <div>{draft.id && <button className="sd-btn" style={{ color:"#b91c1c" }} disabled={saving} onClick={remove}>Delete</button>}</div>
              <div className="sd-actions"><button className="sd-btn" onClick={() => setDraft(null)}>Cancel</button><button className="sd-btn primary" disabled={saving || !draft.title} onClick={save}>{saving ? "Saving..." : "Save"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
