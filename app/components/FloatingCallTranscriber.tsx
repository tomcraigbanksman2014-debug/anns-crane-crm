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
  matched_job_id?: string | null;
  matched_transport_job_id?: string | null;
  match_confidence?: string | null;
  match_reason?: string | null;
  status?: string | null;
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
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return options.find((type) => MediaRecorderCtor.isTypeSupported(type)) || "";
}

function createAudioRecorder(stream: MediaStream) {
  const MediaRecorderCtor = (window as any).MediaRecorder as typeof MediaRecorder | undefined;
  if (!MediaRecorderCtor) {
    throw new Error("This browser does not support call recording. Use Chrome or Edge on desktop.");
  }

  const preferredMimeType = bestMimeType();
  const attempts: Array<MediaRecorderOptions | undefined> = [];

  if (preferredMimeType) {
    attempts.push({ mimeType: preferredMimeType, audioBitsPerSecond: 64000 });
    attempts.push({ mimeType: preferredMimeType });
  }

  attempts.push({ audioBitsPerSecond: 64000 });
  attempts.push(undefined);

  let lastError: unknown = null;

  for (const options of attempts) {
    try {
      const recorder = options ? new MediaRecorderCtor(stream, options) : new MediaRecorderCtor(stream);
      return {
        recorder,
        mimeType: options?.mimeType || recorder.mimeType || preferredMimeType || "audio/webm",
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not start the audio recorder for the selected source.");
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

function actionSuggestion(row: TranscriptRow | null) {
  const text = [row?.detected_job_type, row?.job_requirements, row?.summary]
    .join(" ")
    .toLowerCase();

  if (!text.trim()) return "Review call and choose an action.";

  if (/(transport|haulage|hiab|low loader|lowloader|trailer|collect|collection|deliver|delivery|move|machine|forklift|container|cabin)/i.test(text)) {
    return "Suggested action: create a transport job.";
  }

  if (/(crane|lift|lifting|contract lift|cpa|spider|jekko|40\s*t|40 ton|60\s*t|60 ton|80\s*t|80 ton|ton crane)/i.test(text)) {
    return "Suggested action: create a crane job.";
  }

  if (/(quote|price|cost|rate|enquiry|requirement)/i.test(text)) {
    return "Suggested action: review and create the right job/quote from the call.";
  }

  return "Suggested action: review call and add a follow-up note.";
}

function defaultJobType(row: TranscriptRow | null) {
  const text = [row?.detected_job_type, row?.job_requirements, row?.summary].join(" ").toLowerCase();
  if (/(transport|haulage|hiab|low loader|trailer|collect|collection|deliver|delivery|move|container|cabin|forklift)/i.test(text)) return "transport";
  if (/(crane|lift|spider|jekko|contract lift|cpa|ton crane|40 ton|60 ton|80 ton)/i.test(text)) return "crane";
  return "unknown";
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
  const [savingEdits, setSavingEdits] = useState(false);
  const [creatingAction, setCreatingAction] = useState<"crane" | "transport" | null>(null);

  const [editSummary, setEditSummary] = useState("");
  const [editRequirements, setEditRequirements] = useState("");
  const [editActions, setEditActions] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editSiteAddress, setEditSiteAddress] = useState("");
  const [editJobDate, setEditJobDate] = useState("");
  const [editJobType, setEditJobType] = useState("");

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
    if (!result) return;
    setEditSummary(result.summary || "");
    setEditRequirements(result.job_requirements || "");
    setEditActions(Array.isArray(result.action_points) ? result.action_points.join("\n") : "");
    setEditContactName(result.detected_contact_name || "");
    setEditContactPhone(result.phone_number || result.detected_phone_numbers?.[0] || "");
    setEditSiteAddress(result.detected_site_address || "");
    setEditJobDate(result.detected_job_date || "");
    setEditJobType(result.detected_job_type || defaultJobType(result));
  }, [result?.id]);

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

  async function startRecording() {
    setError(null);
    setNotice(null);
    setResult(null);
    setShowTranscript(false);

    if (!supportsMediaRecorder()) {
      setError("This browser does not support call recording. Use Chrome or Edge on desktop.");
      return;
    }

    try {
      const captureStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      cleanupStream();
      streamRef.current = captureStream;
      chunksRef.current = [];

      const { recorder, mimeType } = createAudioRecorder(captureStream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
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
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      setNotice("Recording call audio from your selected Chrome microphone. With Voicemeeter Out 1 selected, this should capture both sides.");
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
      if (!blob.size) throw new Error("Recording was empty.");

      const context = clickedContextRef.current;
      const form = new FormData();
      const fileName = `call-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      form.append("audio", blob, fileName);
      form.append("direction", directionRef.current || "unknown");
      form.append("phone_number", phoneRef.current || context?.phone || "");
      form.append("page_path", window.location.pathname);
      form.append("source_context", context?.sourceText || "");
      form.append("save_full_transcript", saveFullTranscriptRef.current ? "true" : "false");

      const res = await fetch("/api/call-transcripts/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data?.error || "Could not transcribe call.");

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

  function editablePayload() {
    return {
      summary: editSummary,
      job_requirements: editRequirements,
      action_points: editActions
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      detected_contact_name: editContactName,
      detected_phone_numbers: editContactPhone ? [editContactPhone] : [],
      detected_site_address: editSiteAddress,
      detected_job_date: editJobDate,
      detected_job_type: editJobType,
    };
  }

  async function saveTranscriptEdits(showSavedNotice = true) {
    if (!result?.id) return null;
    setSavingEdits(true);
    setError(null);

    try {
      const res = await fetch(`/api/call-transcripts/${result.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editablePayload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save edited call details.");
      setResult(data.transcript);
      if (showSavedNotice) setNotice("Call summary/details saved.");
      await loadRecent();
      return data.transcript as TranscriptRow;
    } catch (err: any) {
      setError(err?.message || "Could not save edited call details.");
      return null;
    } finally {
      setSavingEdits(false);
    }
  }

  async function createFromTranscript(kind: "crane" | "transport") {
    if (!result?.id) return;
    if (!result.matched_client_id) {
      setError("Link or create a customer before creating a job from the call.");
      return;
    }

    setCreatingAction(kind);
    setError(null);

    try {
      const saved = await saveTranscriptEdits(false);
      if (!saved?.id) return;

      const res = await fetch(`/api/call-transcripts/${saved.id}/create-${kind}-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not create ${kind} job.`);

      setResult(data.transcript || saved);
      setNotice(data.message || `${kind === "crane" ? "Crane" : "Transport"} job created from call summary.`);
      await loadRecent();

      const href = kind === "crane" ? `/jobs/${data.job_id}` : `/transport-jobs/${data.transport_job_id}`;
      if (data.job_id || data.transport_job_id) window.location.href = href;
    } catch (err: any) {
      setError(err?.message || `Could not create ${kind} job.`);
    } finally {
      setCreatingAction(null);
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
          notes: result.summary ? `Created from call summary.\n\n${result.summary}` : "Created from call summary.",
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
            This records from your selected Chrome microphone. With your Voicemeeter setup, choose Voicemeeter Out 1 as the microphone and use Start call recording.
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
              Summary mode is the default. With Voicemeeter set up, use Start call recording and make sure Chrome is using Voicemeeter Out 1 as the microphone.
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
                <button type="button" onClick={startRecording} disabled={!mediaSupported || processing} style={primaryButtonStyle}>
                  Start call recording
                </button>
              ) : (
                <button type="button" onClick={stopRecording} style={dangerButtonStyle}>
                  Stop & summarise • {secondsLabel(seconds)}
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
                  <div style={{ opacity: 0.78 }}>No customer linked yet. Search or create one below before creating a job.</div>
                )}
              </div>

              <div style={actionBoxStyle}>
                <div style={infoLabelStyle}>Recommended next step</div>
                <div style={{ fontWeight: 900 }}>{actionSuggestion({ ...result, summary: editSummary, job_requirements: editRequirements, detected_job_type: editJobType })}</div>
                <div style={{ marginTop: 8, opacity: 0.76 }}>
                  Check the editable details below, then create the job. The call summary will be saved as internal notes on the job and added to the customer profile notes.
                </div>
              </div>

              <div style={editPanelStyle}>
                <div style={sectionTitleStyle}>Editable call summary/details</div>
                <label style={labelStyle}>
                  Summary
                  <textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={4} style={textareaStyle} />
                </label>

                <label style={labelStyle}>
                  Requirements
                  <textarea value={editRequirements} onChange={(e) => setEditRequirements(e.target.value)} rows={3} style={textareaStyle} />
                </label>

                <label style={labelStyle}>
                  Action points, one per line
                  <textarea value={editActions} onChange={(e) => setEditActions(e.target.value)} rows={3} style={textareaStyle} placeholder="e.g. Create draft crane job for Wednesday" />
                </label>

                <div style={fieldGridStyle}>
                  <label style={labelStyle}>Contact name<input value={editContactName} onChange={(e) => setEditContactName(e.target.value)} style={inputStyle} /></label>
                  <label style={labelStyle}>Contact number<input value={editContactPhone} onChange={(e) => setEditContactPhone(e.target.value)} style={inputStyle} /></label>
                  <label style={labelStyle}>Date/time heard<input value={editJobDate} onChange={(e) => setEditJobDate(e.target.value)} style={inputStyle} placeholder="Wednesday, 01/07/2026, tomorrow..." /></label>
                  <label style={labelStyle}>Job type<input value={editJobType} onChange={(e) => setEditJobType(e.target.value)} style={inputStyle} placeholder="crane / transport / HIAB..." /></label>
                </div>

                <label style={labelStyle}>
                  Site / collection / delivery address
                  <textarea value={editSiteAddress} onChange={(e) => setEditSiteAddress(e.target.value)} rows={3} style={textareaStyle} />
                </label>

                <button type="button" onClick={() => void saveTranscriptEdits(true)} disabled={savingEdits} style={secondaryButtonStyle}>
                  {savingEdits ? "Saving..." : "Save edited call details"}
                </button>
              </div>

              <div style={buttonPanelStyle}>
                <button type="button" onClick={() => void createFromTranscript("crane")} disabled={creatingAction !== null || !result.matched_client_id} style={primaryButtonStyle}>
                  {creatingAction === "crane" ? "Creating crane job..." : "Create crane job"}
                </button>
                <button type="button" onClick={() => void createFromTranscript("transport")} disabled={creatingAction !== null || !result.matched_client_id} style={secondaryButtonStyle}>
                  {creatingAction === "transport" ? "Creating transport job..." : "Create transport job"}
                </button>
                {result.matched_job_id ? <a href={`/jobs/${result.matched_job_id}`} style={secondaryLinkButtonStyle}>Open created crane job</a> : null}
                {result.matched_transport_job_id ? <a href={`/transport-jobs/${result.matched_transport_job_id}`} style={secondaryLinkButtonStyle}>Open created transport job</a> : null}
              </div>

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

const floatingButtonRecordingStyle: React.CSSProperties = { background: "#b91c1c" };

const panelStyle: React.CSSProperties = {
  position: "fixed",
  right: 22,
  bottom: 145,
  width: "min(700px, calc(100vw - 24px))",
  maxHeight: "min(840px, calc(100vh - 170px))",
  overflowY: "auto",
  zIndex: 75,
  background: "#edf3f9",
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 22,
  padding: 16,
  boxShadow: "0 22px 70px rgba(0,0,0,0.32)",
};

const panelHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 };
const titleStyle: React.CSSProperties = { fontSize: 26, fontWeight: 1000, letterSpacing: -0.4 };
const subtitleStyle: React.CSSProperties = { marginTop: 2, opacity: 0.7, fontWeight: 900 };
const closeButtonStyle: React.CSSProperties = { border: "1px solid rgba(0,0,0,0.16)", background: "#fff", borderRadius: 14, width: 42, height: 42, fontSize: 28, fontWeight: 1000, cursor: "pointer" };
const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,0.84)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 14, marginTop: 12, boxShadow: "0 10px 28px rgba(0,0,0,0.06)" };
const warningStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#7c2d12", fontWeight: 800, fontSize: 13, lineHeight: 1.35 };
const errorStyle: React.CSSProperties = { marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#fee2e2", border: "1px solid #fecaca", color: "#7f1d1d", fontWeight: 900 };
const noticeStyle: React.CSSProperties = { marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#064e3b", fontWeight: 900 };
const fieldGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 1000 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 12, border: "1px solid rgba(0,0,0,0.16)", padding: "12px 13px", fontSize: 14, background: "#fff" };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 92, resize: "vertical", fontFamily: "inherit" };
const privacyNoteStyle: React.CSSProperties = { marginTop: 10, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(248,250,252,0.8)", fontSize: 13, opacity: 0.8, fontWeight: 800 };
const clickedContextStyle: React.CSSProperties = { marginTop: 10, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(37,99,235,0.22)", background: "rgba(219,234,254,0.65)", display: "grid", gap: 4, fontSize: 13 };
const recordActionsStyle: React.CSSProperties = { marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" };
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 999, padding: "12px 18px", background: "#0f172a", color: "#fff", fontWeight: 1000, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid rgba(0,0,0,0.16)", borderRadius: 999, padding: "11px 16px", background: "#fff", color: "#0f172a", fontWeight: 1000, cursor: "pointer", textDecoration: "none" };
const dangerButtonStyle: React.CSSProperties = { ...primaryButtonStyle, background: "#b91c1c" };
const processingStyle: React.CSSProperties = { marginTop: 10, fontWeight: 900, opacity: 0.76 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 20, fontWeight: 1000, marginBottom: 10 };
const matchBoxStyle: React.CSSProperties = { padding: 12, borderRadius: 14, border: "1px solid rgba(0,0,0,0.1)", background: "#f8fafc", marginBottom: 10 };
const actionBoxStyle: React.CSSProperties = { padding: 12, borderRadius: 14, border: "1px solid #bfdbfe", background: "#eff6ff", marginBottom: 10 };
const editPanelStyle: React.CSSProperties = { display: "grid", gap: 10, padding: 12, borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(248,250,252,0.85)", marginTop: 10 };
const buttonPanelStyle: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" };
const linkStyle: React.CSSProperties = { color: "#0f172a", fontWeight: 1000 };
const inlineButtonRowStyle: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 };
const secondaryLinkButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, display: "inline-flex", textDecoration: "none" };
const tinyButtonStyle: React.CSSProperties = { border: "1px solid rgba(0,0,0,0.14)", background: "#fff", borderRadius: 999, padding: "7px 10px", fontWeight: 900, cursor: "pointer", width: "fit-content" };
const summaryOnlyBadgeStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#f8fafc", fontWeight: 1000, color: "#334155" };
const transcriptBoxStyle: React.CSSProperties = { marginTop: 10, padding: 12, borderRadius: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.1)", maxHeight: 220, overflowY: "auto", lineHeight: 1.45 };
const dividerStyle: React.CSSProperties = { height: 1, background: "rgba(0,0,0,0.1)", margin: "14px 0" };
const searchRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" };
const customerResultStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: 10, borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(0,0,0,0.08)" };
const recentButtonStyle: React.CSSProperties = { textAlign: "left", padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", background: "#fff", cursor: "pointer" };
const infoLabelStyle: React.CSSProperties = { textTransform: "uppercase", letterSpacing: 0.3, fontSize: 12, fontWeight: 1000, opacity: 0.62, marginBottom: 4 };
