"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TranscriptRow = {
  id: string;
  created_at?: string | null;
  call_direction?: string | null;
  phone_number?: string | null;
  transcript?: string | null;
  summary?: string | null;
  job_requirements?: string | null;
  action_points?: string[] | null;
  detected_customer_name?: string | null;
  detected_contact_name?: string | null;
  detected_phone_numbers?: string[] | null;
  detected_site_address?: string | null;
  detected_job_date?: string | null;
  detected_job_type?: string | null;
  matched_client_id?: string | null;
  matched_client_name?: string | null;
  match_confidence?: string | null;
  match_reason?: string | null;
};

type CustomerRow = {
  id: string;
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ClickedCallContext = {
  phone: string;
  sourceText: string;
  path: string;
  capturedAt: string;
};

function cleanPhoneHref(href: string) {
  return decodeURIComponent(String(href ?? "").replace(/^tel:/i, "")).trim();
}

function truncate(value: string, max = 900) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function supportsMediaRecorder() {
  if (typeof window === "undefined") return false;
  return Boolean(navigator?.mediaDevices && (window as any).MediaRecorder);
}

function bestMimeType() {
  if (typeof window === "undefined") return "";
  const MediaRecorderCtor = (window as any).MediaRecorder;
  if (!MediaRecorderCtor?.isTypeSupported) return "";
  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return options.find((type) => MediaRecorderCtor.isTypeSupported(type)) || "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function secondsLabel(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function FloatingCallTranscriber() {
  const [open, setOpen] = useState(false);
  const [mediaSupported, setMediaSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [direction, setDirection] = useState("incoming");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [clickedContext, setClickedContext] = useState<ClickedCallContext | null>(null);
  const [result, setResult] = useState<TranscriptRow | null>(null);
  const [recent, setRecent] = useState<TranscriptRow[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [saveFullTranscript, setSaveFullTranscript] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const directionRef = useRef(direction);
  const phoneRef = useRef(phoneNumber);
  const clickedContextRef = useRef(clickedContext);
  const saveFullTranscriptRef = useRef(saveFullTranscript);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    phoneRef.current = phoneNumber;
  }, [phoneNumber]);

  useEffect(() => {
    clickedContextRef.current = clickedContext;
  }, [clickedContext]);

  useEffect(() => {
    saveFullTranscriptRef.current = saveFullTranscript;
    try {
      window.localStorage.setItem("anns_call_transcriber_save_full", saveFullTranscript ? "1" : "0");
    } catch {
      // ignore storage issues
    }
  }, [saveFullTranscript]);

  useEffect(() => {
    setMediaSupported(supportsMediaRecorder());
    try {
      setSaveFullTranscript(window.localStorage.getItem("anns_call_transcriber_save_full") === "1");
    } catch {
      // ignore storage issues
    }
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href^='tel:']") as HTMLAnchorElement | null;
      if (!anchor) return;

      const phone = cleanPhoneHref(anchor.getAttribute("href") || "");
      if (!phone) return;

      const contextNode = anchor.closest("[data-call-context], tr, article, section, div");
      const contextText = truncate(contextNode?.textContent || anchor.textContent || "", 700);
      const nextContext = {
        phone,
        sourceText: contextText,
        path: window.location.pathname,
        capturedAt: new Date().toISOString(),
      };

      try {
        window.localStorage.setItem("anns_last_clicked_call", JSON.stringify(nextContext));
      } catch {
        // ignore storage issues
      }

      setClickedContext(nextContext);
      setDirection("outgoing");
      setPhoneNumber(phone);
      setOpen(true);
      setNotice("Outgoing click-to-dial captured. Start recording when the call connects.");
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadRecent();

    try {
      const raw = window.localStorage.getItem("anns_last_clicked_call");
      if (raw && !clickedContext) {
        const parsed = JSON.parse(raw);
        if (parsed?.phone) {
          setClickedContext(parsed);
          if (!phoneNumber) setPhoneNumber(parsed.phone);
        }
      }
    } catch {
      // ignore bad local storage
    }
  }, [open]);

  useEffect(() => {
    return () => {
      cleanupStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const transcriptLines = useMemo(() => {
    const text = String(result?.transcript ?? "").trim();
    if (!text) return [];
    return text.split(/(?<=[.!?])\s+/).filter(Boolean);
  }, [result?.transcript]);

  async function loadRecent() {
    try {
      const res = await fetch("/api/call-transcripts/recent", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRecent(Array.isArray(data?.transcripts) ? data.transcripts : []);
    } catch {
      // not critical
    }
  }

  function cleanupStream() {
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {
      // ignore cleanup failures
    }
    streamRef.current = null;
  }

  async function startRecording(mode: "mic" | "screen") {
    setError(null);
    setNotice(null);
    setResult(null);
    setShowTranscript(false);

    if (!supportsMediaRecorder()) {
      setError("This browser does not support call recording. Use Chrome or Edge on desktop.");
      return;
    }

    try {
      let stream: MediaStream;

      if (mode === "screen") {
        const mediaDevices = navigator.mediaDevices as any;
        stream = await mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        if (stream.getAudioTracks().length === 0) {
          cleanupStream();
          setError("No audio was shared. Choose a screen/window/tab and tick the audio sharing option if your browser shows one.");
          return;
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }

      cleanupStream();
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = bestMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = [...chunksRef.current];
        chunksRef.current = [];
        cleanupStream();

        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        void submitRecording(blob);
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((value) => value + 1);
      }, 1000);

      if (mode === "screen") {
        setNotice("Recording shared screen/system audio. Keep the call audio playing while recording.");
      } else {
        setNotice("Recording microphone audio. If you use a headset, it may only catch your side of the call.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not start recording.");
      cleanupStream();
      setRecording(false);
    }
  }

  function stopRecording() {
    setError(null);
    setNotice(null);

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupStream();
      setRecording(false);
      return;
    }

    setRecording(false);
    setProcessing(true);
    recorder.stop();
  }

  async function submitRecording(blob: Blob) {
    try {
      if (!blob.size) {
        throw new Error("Recording was empty.");
      }

      const context = clickedContextRef.current;
      const form = new FormData();
      const fileName = `call-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      form.append("audio", blob, fileName);
      form.append("direction", directionRef.current || "unknown");
      form.append("phone_number", phoneRef.current || context?.phone || "");
      form.append("page_path", window.location.pathname);
      form.append("source_context", context?.sourceText || "");
      form.append("save_full_transcript", saveFullTranscriptRef.current ? "true" : "false");

      const res = await fetch("/api/call-transcripts/transcribe", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Could not transcribe call.");
      }

      const next = data.transcript as TranscriptRow;
      setResult(next);
      setNewCustomerName(next.detected_customer_name || "");
      setNewContactName(next.detected_contact_name || "");
      setNewCustomerPhone(next.phone_number || next.detected_phone_numbers?.[0] || "");
      setNotice(next.transcript ? "Call transcript and summary saved privately." : "Call summary saved privately. Full transcript was not stored.");
      await loadRecent();
    } catch (err: any) {
      setError(err?.message || "Could not transcribe recording.");
    } finally {
      setProcessing(false);
    }
  }

  async function searchCustomers() {
    const q = customerSearch.trim();
    if (!q && !result?.phone_number) return;

    setSearching(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (result?.phone_number) params.set("phone", result.phone_number);

      const res = await fetch(`/api/call-transcripts/search-customers?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not search customers.");
      setCustomerResults(Array.isArray(data?.customers) ? data.customers : []);
    } catch (err: any) {
      setError(err?.message || "Customer search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function linkCustomer(clientId: string) {
    if (!result?.id) return;
    setLinking(true);
    setError(null);

    try {
      const res = await fetch(`/api/call-transcripts/${result.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not link customer.");
      setResult(data.transcript);
      setNotice("Transcript linked to customer.");
      await loadRecent();
    } catch (err: any) {
      setError(err?.message || "Could not link customer.");
    } finally {
      setLinking(false);
    }
  }

  async function createAndLinkCustomer() {
    if (!result?.id) return;
    if (!newCustomerName.trim()) {
      setError("Company name is required to create a customer.");
      return;
    }

    setCreatingCustomer(true);
    setError(null);

    try {
      const res = await fetch(`/api/call-transcripts/${result.id}/create-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: newCustomerName,
          contact_name: newContactName,
          phone: newCustomerPhone,
          email: newCustomerEmail,
          notes: result.summary ? `Created from call transcript.\n\n${result.summary}` : "Created from call transcript.",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not create customer.");
      setResult(data.transcript);
      setNotice("Customer created and linked to transcript.");
      await loadRecent();
    } catch (err: any) {
      setError(err?.message || "Could not create customer.");
    } finally {
      setCreatingCustomer(false);
    }
  }

  function clearCurrentCallContext() {
    setClickedContext(null);
    setPhoneNumber("");
    setDirection("incoming");
    setNotice(null);
    try {
      window.localStorage.removeItem("anns_last_clicked_call");
    } catch {
      // ignore
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{ ...floatingButtonStyle, ...(recording ? floatingButtonRecordingStyle : {}) }}
        title="Private call transcriber"
      >
        {recording ? "Recording" : "Call notes"}
      </button>

      {open ? (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={titleStyle}>My Call Transcriber</div>
              <div style={subtitleStyle}>Private to Tom / master admin</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={closeButtonStyle}>×</button>
          </div>

          <div style={warningStyle}>
            This records audio available to the browser. If your Evonex call is through a headset, mic mode may only capture your voice. For both sides, use speaker audio or screen/system audio where available.
          </div>

          {error ? <div style={errorStyle}>{error}</div> : null}
          {notice ? <div style={noticeStyle}>{notice}</div> : null}

          <div style={cardStyle}>
            <div style={fieldGridStyle}>
              <label style={labelStyle}>
                Direction
                <select value={direction} onChange={(e) => setDirection(e.target.value)} style={inputStyle} disabled={recording || processing}>
                  <option value="incoming">Incoming</option>
                  <option value="outgoing">Outgoing</option>
                  <option value="unknown">Not sure</option>
                </select>
              </label>

              <label style={labelStyle}>
                Number, if known
                <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. 07900..." style={inputStyle} disabled={recording || processing} />
              </label>

              <label style={labelStyle}>
                Save preference
                <select
                  value={saveFullTranscript ? "full" : "summary"}
                  onChange={(e) => setSaveFullTranscript(e.target.value === "full")}
                  style={inputStyle}
                  disabled={recording || processing}
                >
                  <option value="summary">Summary & actions only</option>
                  <option value="full">Full transcript + summary</option>
                </select>
              </label>
            </div>

            <div style={privacyNoteStyle}>
              Summary mode still listens to the recording to create the notes, but it only saves the summary, job details and actions. Choose full transcript only when you want the word-for-word text kept.
            </div>

            {clickedContext ? (
              <div style={clickedContextStyle}>
                <div style={{ fontWeight: 900 }}>Last click-to-dial captured</div>
                <div>{clickedContext.phone}</div>
                {clickedContext.sourceText ? <div style={{ opacity: 0.72 }}>{clickedContext.sourceText}</div> : null}
                <button type="button" onClick={clearCurrentCallContext} style={tinyButtonStyle}>Clear link</button>
              </div>
            ) : null}

            <div style={recordActionsStyle}>
              {!recording ? (
                <>
                  <button type="button" onClick={() => startRecording("mic")} disabled={!mediaSupported || processing} style={primaryButtonStyle}>
                    Start mic recording
                  </button>
                  <button type="button" onClick={() => startRecording("screen")} disabled={!mediaSupported || processing} style={secondaryButtonStyle}>
                    Screen/system audio
                  </button>
                </>
              ) : (
                <button type="button" onClick={stopRecording} style={dangerButtonStyle}>
                  Stop & transcribe • {secondsLabel(seconds)}
                </button>
              )}
            </div>

            {processing ? <div style={processingStyle}>{saveFullTranscript ? "Transcribing and summarising call..." : "Creating call summary and actions..."}</div> : null}
          </div>

          {result ? (
            <div style={cardStyle}>
              <div style={sectionTitleStyle}>{result.transcript ? "Transcript result" : "Call summary result"}</div>

              <div style={matchBoxStyle}>
                <div style={{ fontWeight: 900 }}>Customer match</div>
                {result.matched_client_id ? (
                  <div>
                    <a href={`/customers/${result.matched_client_id}`} style={linkStyle}>{result.matched_client_name || "Open customer"}</a>
                    <div style={{ opacity: 0.75 }}>{result.match_reason || result.match_confidence}</div>
                  </div>
                ) : (
                  <div style={{ opacity: 0.78 }}>No customer linked yet. Search or create one below.</div>
                )}
              </div>

              <Info label="Summary" value={result.summary} />
              <Info label="Job requirements" value={result.job_requirements} />
              <Info label="Detected customer" value={result.detected_customer_name} />
              <Info label="Detected contact" value={result.detected_contact_name} />
              <Info label="Detected date/time" value={result.detected_job_date} />
              <Info label="Detected site/address" value={result.detected_site_address} />

              {Array.isArray(result.action_points) && result.action_points.length ? (
                <div style={infoBlockStyle}>
                  <div style={infoLabelStyle}>Action points</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                    {result.action_points.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                  </ul>
                </div>
              ) : null}

              <div style={inlineButtonRowStyle}>
                {result.transcript ? (
                  <button type="button" onClick={() => setShowTranscript((value) => !value)} style={secondaryButtonStyle}>
                    {showTranscript ? "Hide full transcript" : "Show full transcript"}
                  </button>
                ) : (
                  <div style={summaryOnlyBadgeStyle}>Summary-only mode: full transcript not saved</div>
                )}
                {result.matched_client_id ? <a href={`/customers/${result.matched_client_id}`} style={secondaryLinkButtonStyle}>Open customer</a> : null}
              </div>

              {showTranscript && result.transcript ? (
                <div style={transcriptBoxStyle}>
                  {transcriptLines.length ? transcriptLines.map((line, index) => <p key={index} style={{ margin: "0 0 8px" }}>{line}</p>) : "No transcript text."}
                </div>
              ) : null}

              <div style={dividerStyle} />

              <div style={sectionTitleStyle}>Link to customer</div>
              <div style={searchRowStyle}>
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer name, contact, phone or email" style={inputStyle} />
                <button type="button" onClick={searchCustomers} disabled={searching} style={secondaryButtonStyle}>{searching ? "Searching..." : "Search"}</button>
              </div>

              {customerResults.length ? (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {customerResults.map((customer) => (
                    <div key={customer.id} style={customerResultStyle}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{customer.company_name || "Unnamed customer"}</div>
                        <div style={{ opacity: 0.74 }}>{[customer.contact_name, customer.phone, customer.email].filter(Boolean).join(" • ")}</div>
                      </div>
                      <button type="button" onClick={() => linkCustomer(customer.id)} disabled={linking} style={tinyButtonStyle}>Link</button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={dividerStyle} />

              <div style={sectionTitleStyle}>Or create customer from this call</div>
              <div style={fieldGridStyle}>
                <label style={labelStyle}>Company name<input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>Contact name<input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>Phone<input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>Email<input value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} style={inputStyle} /></label>
              </div>
              <button type="button" onClick={createAndLinkCustomer} disabled={creatingCustomer || !newCustomerName.trim()} style={primaryButtonStyle}>
                {creatingCustomer ? "Creating..." : "Create customer & link"}
              </button>
            </div>
          ) : null}

          {recent.length ? (
            <div style={cardStyle}>
              <div style={sectionTitleStyle}>Recent private transcripts</div>
              <div style={{ display: "grid", gap: 8 }}>
                {recent.map((row) => (
                  <button key={row.id} type="button" onClick={() => setResult(row)} style={recentButtonStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{row.matched_client_name || row.detected_customer_name || row.phone_number || "Unlinked call"}</strong>
                      <span style={{ opacity: 0.65 }}>{formatDate(row.created_at)}</span>
                    </div>
                    <div style={{ opacity: 0.76, marginTop: 4 }}>{row.summary || "No summary"}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={infoBlockStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

const floatingButtonStyle: React.CSSProperties = {
  position: "fixed",
  right: 22,
  bottom: 92,
  zIndex: 70,
  border: "1px solid rgba(0,0,0,0.18)",
  background: "#111",
  color: "#fff",
  borderRadius: 999,
  padding: "13px 18px",
  fontWeight: 1000,
  boxShadow: "0 14px 38px rgba(0,0,0,0.26)",
  cursor: "pointer",
};

const floatingButtonRecordingStyle: React.CSSProperties = {
  background: "#b91c1c",
};

const panelStyle: React.CSSProperties = {
  position: "fixed",
  right: 22,
  bottom: 145,
  width: "min(620px, calc(100vw - 24px))",
  maxHeight: "min(790px, calc(100vh - 170px))",
  overflowY: "auto",
  zIndex: 75,
  background: "#edf3f9",
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 22,
  padding: 16,
  boxShadow: "0 22px 70px rgba(0,0,0,0.32)",
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 10,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 1000,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 3,
  opacity: 0.68,
  fontWeight: 800,
};

const closeButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  borderRadius: 12,
  width: 38,
  height: 38,
  fontSize: 24,
  fontWeight: 900,
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 14,
  marginTop: 12,
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(0,0,0,0.15)",
  borderRadius: 11,
  padding: "10px 11px",
  fontWeight: 750,
  background: "#fff",
};

const privacyNoteStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 11px",
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  lineHeight: 1.45,
};

const recordActionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#111",
  color: "#fff",
  borderRadius: 12,
  padding: "11px 14px",
  fontWeight: 1000,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  color: "#111",
  borderRadius: 12,
  padding: "11px 14px",
  fontWeight: 1000,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryLinkButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  display: "inline-block",
};

const summaryOnlyBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#f1f5f9",
  color: "#334155",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 950,
};

const dangerButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: "#b91c1c",
};

const tinyButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  borderRadius: 10,
  padding: "7px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const warningStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 13,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  fontSize: 13,
  fontWeight: 750,
};

const errorStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 13,
  background: "#fee2e2",
  border: "1px solid #fecaca",
  fontWeight: 850,
  marginTop: 10,
};

const noticeStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 13,
  background: "#dcfce7",
  border: "1px solid #bbf7d0",
  fontWeight: 850,
  marginTop: 10,
};

const clickedContextStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginTop: 12,
  padding: 10,
  borderRadius: 13,
  background: "#e0f2fe",
  border: "1px solid #bae6fd",
};

const processingStyle: React.CSSProperties = {
  marginTop: 12,
  fontWeight: 900,
  opacity: 0.78,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 1000,
  marginBottom: 10,
};

const matchBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 10,
  background: "#f8fafc",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 13,
  marginBottom: 10,
};

const linkStyle: React.CSSProperties = {
  color: "#0f172a",
  fontWeight: 1000,
};

const infoBlockStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 13,
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 1000,
  textTransform: "uppercase",
  opacity: 0.62,
  marginBottom: 4,
};

const inlineButtonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
};

const transcriptBoxStyle: React.CSSProperties = {
  marginTop: 10,
  maxHeight: 240,
  overflowY: "auto",
  padding: 12,
  borderRadius: 13,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.55,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "rgba(0,0,0,0.1)",
  margin: "14px 0",
};

const searchRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
};

const customerResultStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: 10,
  borderRadius: 13,
  background: "#f8fafc",
  border: "1px solid rgba(0,0,0,0.08)",
};

const recentButtonStyle: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  borderRadius: 13,
  padding: 10,
  cursor: "pointer",
};
