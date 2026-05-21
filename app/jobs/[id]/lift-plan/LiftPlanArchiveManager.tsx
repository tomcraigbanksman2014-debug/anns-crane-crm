"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ArchiveRow = {
  id: string;
  title: string | null;
  archive_status: string | null;
  notes: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  uploaded_by_email: string | null;
  created_at: string | null;
  signed_url: string | null;
};

const statusLabels: Record<string, string> = {
  previous_draft: "Previous draft",
  approved_copy: "Approved copy",
  superseded: "Superseded",
  client_copy: "Client copy",
  other: "Other",
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB");
}

function fmtSize(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}

export default function LiftPlanArchiveManager({
  jobId,
  initialArchives,
}: {
  jobId: string;
  initialArchives: ArchiveRow[];
}) {
  const router = useRouter();
  const [archives, setArchives] = useState<ArchiveRow[]>(initialArchives ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("Previous lift plan pack");
  const [archiveStatus, setArchiveStatus] = useState("previous_draft");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setArchives(initialArchives ?? []);
  }, [initialArchives]);

  async function uploadArchive(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!file) {
      setMessage("Choose the old lift plan PDF first.");
      return;
    }

    const looksLikePdf = file.type.toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      setMessage("Please upload a PDF file.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || "Previous lift plan pack");
      formData.append("archive_status", archiveStatus);
      formData.append("notes", notes);

      const res = await fetch(`/api/jobs/${jobId}/lift-plan/pdf-archive/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.error || "Could not archive PDF.");
        return;
      }

      setFile(null);
      setTitle("Previous lift plan pack");
      setArchiveStatus("previous_draft");
      setNotes("");
      const input = document.getElementById("lift-plan-pdf-archive-file") as HTMLInputElement | null;
      if (input) input.value = "";
      if (data?.archive?.id) {
        setArchives((prev) => [data.archive as ArchiveRow, ...prev.filter((item) => item.id !== data.archive.id)]);
      }
      setMessage("Previous lift plan PDF archived.");
      router.refresh();
    } catch {
      setMessage("Could not archive PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArchive(id: string) {
    if (!confirm("Remove this archived lift plan PDF from the job?")) return;
    setMessage(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/jobs/${jobId}/lift-plan/pdf-archive/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Could not remove archived PDF.");
        return;
      }
      setArchives((prev) => prev.filter((item) => item.id !== id));
      setMessage("Archived PDF removed.");
      router.refresh();
    } catch {
      setMessage("Could not remove archived PDF.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section style={cardStyle}>
      <div style={headerRow}>
        <div>
          <h2 style={headingStyle}>Previous lift plan packs / PDF archive</h2>
          <p style={helperText}>
            Upload an old saved lift plan PDF here so it stays attached to the job as a previous draft, approved copy or superseded pack. This keeps the old pack available without overwriting the current editable draft.
          </p>
        </div>
      </div>

      <form onSubmit={uploadArchive} style={formGrid}>
        <div style={fieldBlock}>
          <label style={labelStyle}>Archive title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Previous lift plan pack" />
        </div>

        <div style={fieldBlock}>
          <label style={labelStyle}>Archive type</label>
          <select value={archiveStatus} onChange={(e) => setArchiveStatus(e.target.value)} style={inputStyle}>
            <option value="previous_draft">Previous draft</option>
            <option value="approved_copy">Approved copy</option>
            <option value="superseded">Superseded</option>
            <option value="client_copy">Client copy</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div style={fieldBlockWide}>
          <label style={labelStyle}>Old lift plan PDF</label>
          <input id="lift-plan-pdf-archive-file" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={inputStyle} />
        </div>

        <div style={fieldBlockWide}>
          <label style={labelStyle}>Notes / why archived</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textAreaStyle} placeholder="Example: old approved pack before current amendments" />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={busy} style={primaryBtn}>
            {busy ? "Archiving..." : "Upload previous PDF"}
          </button>
          {message ? <span style={messageStyle}>{message}</span> : null}
        </div>
      </form>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {archives.length ? (
          archives.map((archive) => {
            const status = String(archive.archive_status ?? "previous_draft");
            return (
              <div key={archive.id} style={archiveCard}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{archive.title || archive.file_name || "Previous lift plan pack"}</strong>
                    <span style={pillStyle}>{statusLabels[status] || status}</span>
                  </div>
                  <div style={metaStyle}>
                    {archive.file_name || "PDF"} • {fmtSize(archive.file_size_bytes)} • Uploaded {fmtDate(archive.created_at)}{archive.uploaded_by_email ? ` by ${archive.uploaded_by_email}` : ""}
                  </div>
                  {archive.notes ? <div style={notesStyle}>{archive.notes}</div> : null}
                </div>
                <div style={buttonRow}>
                  {archive.signed_url ? (
                    <a href={archive.signed_url} target="_blank" rel="noreferrer" style={secondaryBtn}>
                      View PDF
                    </a>
                  ) : null}
                  <button type="button" onClick={() => deleteArchive(archive.id)} disabled={deletingId === archive.id} style={dangerBtn}>
                    {deletingId === archive.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={emptyBox}>No previous lift plan PDFs archived yet.</div>
        )}
      </div>
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 900,
};

const helperText: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 14,
  lineHeight: 1.45,
  opacity: 0.8,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const fieldBlock: React.CSSProperties = {
  display: "grid",
  gap: 5,
};

const fieldBlockWide: React.CSSProperties = {
  display: "grid",
  gap: 5,
  gridColumn: "1 / -1",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.72,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.86)",
  boxSizing: "border-box",
};

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 74,
  resize: "vertical",
};

const archiveCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,120,255,0.12)",
  color: "#0b57d0",
  fontSize: 12,
  fontWeight: 900,
};

const metaStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.76,
};

const notesStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  whiteSpace: "pre-wrap",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "0",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.86)",
  color: "#111",
  fontWeight: 900,
  textDecoration: "none",
};

const dangerBtn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(180,0,0,0.18)",
  background: "rgba(180,0,0,0.08)",
  color: "#8b0000",
  fontWeight: 900,
  cursor: "pointer",
};

const emptyBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};

const messageStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
};
