"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SiteOption = {
  kind: "job" | "transport";
  id: string;
  label: string;
  siteText: string;
};

type ActiveShift = {
  id: string;
  started_at: string;
  start_site_text: string | null;
} | null;

function embedMapUrl(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return "";
  return `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image."));
      img.onload = () => {
        const maxW = 1200;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Could not prepare image."));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

function issueLabel(value: string) {
  if (value === "no_issues") return "No issues";
  if (value === "delay") return "Delay";
  if (value === "safety_issue") return "Safety issue";
  if (value === "damage") return "Damage";
  if (value === "other") return "Other";
  return value;
}

const SIGNATURE_HEIGHT = 160;

function SignaturePad({ onChange }: { onChange: (data: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const resizeCanvas = useCallback((preserveDrawing: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentData =
      preserveDrawing && hasInkRef.current ? canvas.toDataURL("image/png") : "";

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(Math.round(rect.width || canvas.parentElement?.clientWidth || 320), 1);
    const cssHeight = SIGNATURE_HEIGHT;
    const dpr = typeof window !== "undefined" ? Math.max(window.devicePixelRatio || 1, 1) : 1;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.2 * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";

    if (currentData) {
      const img = new Image();
      img.onload = () => {
        const ctx2 = canvas.getContext("2d");
        if (!ctx2) return;
        ctx2.clearRect(0, 0, canvas.width, canvas.height);
        ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = currentData;
    }
  }, []);

  useEffect(() => {
    resizeCanvas(false);

    const handleResize = () => {
      resizeCanvas(true);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resizeCanvas]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function emitSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(hasInkRef.current ? canvas.toDataURL("image/png") : "");
  }

  function begin(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const p = point(e);
    drawingRef.current = true;
    lastPointRef.current = p;
    hasInkRef.current = true;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const p = point(e);
    const last = lastPointRef.current;

    if (!last) {
      lastPointRef.current = p;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    lastPointRef.current = p;
  }

  function end(e?: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (canvas && e) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }

    emitSignature();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    hasInkRef.current = false;
    drawingRef.current = false;
    lastPointRef.current = null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <canvas
        ref={canvasRef}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        style={{
          width: "100%",
          height: SIGNATURE_HEIGHT,
          display: "block",
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          touchAction: "none",
        }}
      />
      <button type="button" onClick={clear} style={ghostBtn}>
        Clear signature
      </button>
    </div>
  );
}

export default function OperatorShiftWizard({
  operatorName,
  assignedSites,
  activeShift,
}: {
  operatorName: string;
  assignedSites: SiteOption[];
  activeShift: ActiveShift;
}) {
  const [mode, setMode] = useState<"start" | "end" | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [selectedSiteKey, setSelectedSiteKey] = useState("");
  const [manualSite, setManualSite] = useState("");
  const [photoData, setPhotoData] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [safetyChecks, setSafetyChecks] = useState<string[]>([]);
  const [endIssueType, setEndIssueType] = useState("no_issues");
  const [endIssueNotes, setEndIssueNotes] = useState("");

  const selectedSite = useMemo(
    () => assignedSites.find((x) => `${x.kind}:${x.id}` === selectedSiteKey) ?? null,
    [assignedSites, selectedSiteKey]
  );

  const resolvedSiteText = selectedSite ? selectedSite.siteText : manualSite.trim();

  function resetState(nextMode: "start" | "end") {
    setMode(nextMode);
    setStep(0);
    setBusy(false);
    setMsg("");
    setLat(null);
    setLng(null);
    setAccuracy(null);
    setSelectedSiteKey("");
    setManualSite("");
    setPhotoData("");
    setSignatureData("");
    setSafetyChecks([]);
    setEndIssueType("no_issues");
    setEndIssueNotes("");
  }

  function requestLocation() {
    setMsg("");
    if (!navigator.geolocation) {
      setMsg("This device does not support location.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setAccuracy(pos.coords.accuracy);
        setStep(1);
      },
      (err) => {
        setMsg(err.message || "Could not get location.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    setMsg("");
    try {
      const data = await compressImage(file);
      setPhotoData(data);
    } catch (e: any) {
      setMsg(e?.message || "Could not prepare photo.");
    }
  }

  async function submit() {
    if (lat == null || lng == null) {
      setMsg("Location is required.");
      return;
    }
    if (!resolvedSiteText) {
      setMsg("Select or enter the site you are working at.");
      return;
    }
    if (!photoData) {
      setMsg(mode === "start" ? "Start photo is required." : "End photo is required.");
      return;
    }
    if (!signatureData) {
      setMsg("Signature is required.");
      return;
    }
    if (mode === "start" && safetyChecks.length < 3) {
      setMsg("Complete all safety checks first.");
      return;
    }
    if (mode === "end" && endIssueType === "other" && !endIssueNotes.trim()) {
      setMsg("Enter details for Other.");
      return;
    }

    setBusy(true);
    setMsg("");

    const payload: any = {
      start_lat: lat,
      start_lng: lng,
      start_accuracy: accuracy,
      start_site_text: resolvedSiteText,
      start_job_id: selectedSite?.kind === "job" ? selectedSite.id : null,
      start_transport_job_id: selectedSite?.kind === "transport" ? selectedSite.id : null,
      start_photo_data: photoData,
      start_signature_data: signatureData,
      start_safety: safetyChecks,
      end_lat: lat,
      end_lng: lng,
      end_accuracy: accuracy,
      end_site_text: resolvedSiteText,
      end_job_id: selectedSite?.kind === "job" ? selectedSite.id : null,
      end_transport_job_id: selectedSite?.kind === "transport" ? selectedSite.id : null,
      end_photo_data: photoData,
      end_signature_data: signatureData,
      end_issue_type: endIssueType,
      end_issue_notes: endIssueNotes.trim(),
    };

    try {
      const res = await fetch(
        mode === "start"
          ? "/api/operator/shifts"
          : `/api/operator/shifts/${activeShift?.id}/end`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not save shift.");
        setBusy(false);
        return;
      }

      window.location.reload();
    } catch {
      setMsg("Could not save shift.");
      setBusy(false);
    }
  }

  const issues = ["no_issues", "delay", "safety_issue", "damage", "other"];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={dashCard}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, opacity: 0.72 }}>Operator</div>
            <div style={{ fontWeight: 900, fontSize: 22 }}>{operatorName}</div>
            {activeShift ? (
              <div style={{ marginTop: 6, fontSize: 14, opacity: 0.8 }}>
                Day started at{" "}
                {new Date(activeShift.started_at).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          {!activeShift ? (
            <button type="button" onClick={() => resetState("start")} style={greenBtn}>
              Start Day Now
            </button>
          ) : (
            <button type="button" onClick={() => resetState("end")} style={blueBtn}>
              Stop Work
            </button>
          )}
          <a href="/operator/shifts" style={blueLinkBtn}>
            Shifts
          </a>
          <a href="/operator/documents" style={blueLinkBtn}>
            Documents
          </a>
        </div>
      </div>

      {mode ? (
        <div style={wizardCard}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>
                {mode === "start" ? "START SHIFT" : "END SHIFT"}
              </div>
              <h2 style={{ margin: "6px 0 0", fontSize: 28 }}>
                {
                  [
                    mode === "start" ? "Pinpoint location" : "Confirm end location",
                    "Confirm location",
                    "Site working at",
                    mode === "start" ? "Take photo" : "End photo",
                    mode === "start" ? "Safety checks" : "End of shift",
                    "Signature",
                  ][step]
                }
              </h2>
            </div>
            <button type="button" onClick={() => setMode(null)} style={redBtn}>
              Cancel
            </button>
          </div>

          {msg ? <div style={errorBox}>{msg}</div> : null}

          {step === 0 ? (
            <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
              <div style={{ fontSize: 16, lineHeight: 1.45 }}>
                {mode === "start"
                  ? "Allow your phone to pinpoint your current location before starting work."
                  : "Confirm your location before ending your shift."}
              </div>
              <button type="button" onClick={requestLocation} style={greenBtn}>
                Search
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
              <div style={{ fontSize: 16 }}>
                Accuracy: {accuracy != null ? `+/- ${accuracy.toFixed(1)}m` : "—"}
              </div>
              {lat != null && lng != null ? (
                <iframe
                  src={embedMapUrl(lat, lng)}
                  style={{
                    width: "100%",
                    height: 280,
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 12,
                  }}
                />
              ) : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setStep(2)} style={greenBtn}>
                  Next
                </button>
                <button type="button" onClick={requestLocation} style={ghostBtn}>
                  Search again
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16, lineHeight: 1.45 }}>
                Select today’s job/site first, or enter a site manually.
              </div>
              <select
                value={selectedSiteKey}
                onChange={(e) => setSelectedSiteKey(e.target.value)}
                style={inputStyle}
              >
                <option value="">Manual site entry</option>
                {assignedSites.map((site) => (
                  <option key={`${site.kind}:${site.id}`} value={`${site.kind}:${site.id}`}>
                    {site.label}
                  </option>
                ))}
              </select>
              {!selectedSite ? (
                <input
                  value={manualSite}
                  onChange={(e) => setManualSite(e.target.value)}
                  placeholder="Enter site working at"
                  style={inputStyle}
                />
              ) : (
                <div style={softBox}>{selectedSite.siteText}</div>
              )}
              <button type="button" onClick={() => setStep(3)} style={greenBtn}>
                Next
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16 }}>
                {mode === "start"
                  ? "Take a photograph of yourself."
                  : "Take an end of shift photograph."}
              </div>
              {photoData ? (
                <img
                  src={photoData}
                  alt="Shift capture"
                  style={{
                    width: "100%",
                    maxHeight: 420,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.1)",
                  }}
                />
              ) : null}
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
              <button type="button" onClick={() => setStep(4)} style={greenBtn}>
                Next
              </button>
            </div>
          ) : null}

          {step === 4 && mode === "start" ? (
            <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
              {[
                "I confirm that I am not under the influence of drugs or alcohol.",
                "I will work/have worked in accordance with the Risk Assessment / Method Statement for the task(s).",
                "I have checked my PPE (including Safety Harness where applicable) and confirm all items are in serviceable condition.",
              ].map((text, idx) => {
                const key = `check_${idx + 1}`;
                const checked = safetyChecks.includes(key);

                return (
                  <label key={key} style={checkRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSafetyChecks((current) =>
                          e.target.checked
                            ? [...current, key]
                            : current.filter((x) => x !== key)
                        );
                      }}
                    />
                    <span>{text}</span>
                  </label>
                );
              })}
              <button type="button" onClick={() => setStep(5)} style={greenBtn}>
                Next
              </button>
            </div>
          ) : null}

          {step === 4 && mode === "end" ? (
            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16 }}>Record the shift outcome before finishing.</div>
              <div style={{ display: "grid", gap: 10 }}>
                {issues.map((issue) => (
                  <label key={issue} style={checkRow}>
                    <input
                      type="radio"
                      name="end_issue_type"
                      checked={endIssueType === issue}
                      onChange={() => setEndIssueType(issue)}
                    />
                    <span>{issueLabel(issue)}</span>
                  </label>
                ))}
              </div>
              {endIssueType === "other" ? (
                <textarea
                  value={endIssueNotes}
                  onChange={(e) => setEndIssueNotes(e.target.value)}
                  rows={4}
                  placeholder="Enter details"
                  style={textareaStyle}
                />
              ) : (
                <textarea
                  value={endIssueNotes}
                  onChange={(e) => setEndIssueNotes(e.target.value)}
                  rows={4}
                  placeholder="Optional notes"
                  style={textareaStyle}
                />
              )}
              <button type="button" onClick={() => setStep(5)} style={greenBtn}>
                Next
              </button>
            </div>
          ) : null}

          {step === 5 ? (
            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16 }}>
                Sign to {mode === "start" ? "start" : "finish"} your shift.
              </div>
              <SignaturePad onChange={setSignatureData} />
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                style={busy ? disabledBtn : greenBtn}
              >
                {busy ? "Saving..." : mode === "start" ? "Start shift" : "End shift"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const dashCard: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const wizardCard: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const greenBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "18px 16px",
  borderRadius: 14,
  border: "none",
  background: "#22c01a",
  color: "#fff",
  fontSize: 22,
  fontWeight: 900,
  cursor: "pointer",
  textAlign: "center",
};

const blueBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "18px 16px",
  borderRadius: 14,
  border: "none",
  background: "#2f4fbc",
  color: "#fff",
  fontSize: 22,
  fontWeight: 900,
  cursor: "pointer",
  textAlign: "center",
};

const blueLinkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "18px 16px",
  borderRadius: 14,
  background: "#2f4fbc",
  color: "#fff",
  fontSize: 22,
  fontWeight: 900,
  textAlign: "center",
  textDecoration: "none",
};

const redBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "#c61c1c",
  color: "#fff",
  fontSize: 18,
  fontWeight: 900,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.86)",
  color: "#111",
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
};

const disabledBtn: React.CSSProperties = {
  ...greenBtn,
  opacity: 0.6,
  cursor: "not-allowed",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  boxSizing: "border-box",
  background: "#fff",
  fontSize: 16,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  boxSizing: "border-box",
  background: "#fff",
  fontSize: 16,
};

const checkRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "22px 1fr",
  gap: 10,
  alignItems: "start",
  fontSize: 16,
  lineHeight: 1.4,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.20)",
  fontWeight: 800,
};

const softBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
};
