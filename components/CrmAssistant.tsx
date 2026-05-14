"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AssistantResult = {
  label: string;
  href?: string;
  description?: string;
  badge?: string;
};

type DraftPreviewRow = {
  label: string;
  value: string;
};

type DraftAction = {
  type: string;
  title: string;
  risk?: "low" | "medium" | "high";
  warning?: string | null;
  requires_reason?: boolean;
  requires_confirm_text?: boolean;
  confirm_text?: string | null;
  preview: DraftPreviewRow[];
  payload: Record<string, any>;
};

type AssistantResponse = {
  ok?: boolean;
  mode?: string;
  action?: string;
  title?: string;
  message?: string;
  error?: string;
  results?: AssistantResult[];
  draftAction?: DraftAction;
  open_href?: string;
  examples?: string[];
  checklist?: {
    missing?: string[];
    warnings?: string[];
    done?: string[];
  };
};

type ChatMessage = {
  id: number;
  from: "user" | "assistant";
  text: string;
  response?: AssistantResponse | null;
};

const EXAMPLES = [
  "Open the lift plan for job 169",
  "Create crane job for Crendons on Wednesday with Grove",
  "Move job 169 to Friday",
  "Add Shaun as operator on job 169",
  "Assign HK40 to job 169",
  "Mark today's visit on job 169 as invoiced",
  "Set job 169 to completed",
  "Cancel job 174 because it was a duplicate",
];

function supportsSpeechRecognition() {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

function makeSpeechRecognition() {
  const w = window as any;
  const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Recognition) return null;
  return new Recognition();
}

function cleanupSpeech(value: string) {
  let text = String(value ?? "").trim();
  text = text.replace(/\blift\s+lamp\b/gi, "lift plan");
  text = text.replace(/\bleft\s+plan\b/gi, "lift plan");
  text = text.replace(/\bjob\s+number\s*(\d+)/gi, "job $1");
  text = text.replace(/\bjob\s+hash\s*(\d+)/gi, "job $1");
  text = text.replace(/\b(open|show|find|the|for|job|lift|plan)\s+\1\b/gi, "$1");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

export default function CrmAssistant() {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftAction | null>(null);
  const [highRiskReason, setHighRiskReason] = useState("");
  const [highRiskConfirm, setHighRiskConfirm] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      from: "assistant",
      text: "Ask me to search, open pages, check missing job info, or prepare CRM changes behind a Confirm screen. Use the mic on mobile and tap Stop & send when finished.",
      response: { examples: EXAMPLES, mode: "help" },
    },
  ]);

  const messageIdRef = useRef(2);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const commandRef = useRef("");
  const listeningRef = useRef(false);
  const stoppingForSendRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);

  const lastAssistantResponse = useMemo(() => {
    const reversed = [...messages].reverse();
    return reversed.find((msg) => msg.from === "assistant" && msg.response)?.response ?? null;
  }, [messages]);

  useEffect(() => {
    setSpeechSupported(supportsSpeechRecognition());
  }, []);

  useEffect(() => {
    commandRef.current = command;
  }, [command]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    if (pendingDraft) {
      setHighRiskReason("");
      setHighRiskConfirm("");
    }
  }, [pendingDraft]);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // Ignore browser speech API cleanup errors.
      }
    };
  }, []);

  function addMessage(from: ChatMessage["from"], text: string, response?: AssistantResponse | null) {
    const id = messageIdRef.current++;
    setMessages((current) => [...current, { id, from, text, response }]);
  }

  async function sendCommand(rawCommand?: string) {
    const text = cleanupSpeech(String(rawCommand ?? commandRef.current ?? command).trim());
    if (!text || busy) return;

    setOpen(true);
    setCommand("");
    commandRef.current = "";
    setPendingDraft(null);
    addMessage("user", text);
    setBusy(true);

    try {
      const res = await fetch("/api/crm-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ command: text }),
      });

      const json = (await res.json().catch(() => ({}))) as AssistantResponse;
      const replyText = json?.error || json?.message || json?.title || "Done.";

      if (json?.draftAction) setPendingDraft(json.draftAction);
      addMessage("assistant", replyText, json);
    } catch (e: any) {
      addMessage("assistant", e?.message || "CRM Assistant failed.", { error: e?.message || "CRM Assistant failed." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDraft() {
    if (!pendingDraft || busy) return;
    setBusy(true);

    try {
      const res = await fetch("/api/crm-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          mode: "execute",
          draftAction: pendingDraft,
          reason: highRiskReason,
          confirmText: highRiskConfirm,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as AssistantResponse;
      const replyText = json?.error || json?.message || json?.title || "Saved.";
      if (!json?.error) setPendingDraft(null);
      addMessage("assistant", replyText, json);
    } catch (e: any) {
      addMessage("assistant", e?.message || "Could not save the confirmed action.", { error: e?.message || "Could not save the confirmed action." });
    } finally {
      setBusy(false);
    }
  }

  function cancelDraft() {
    setPendingDraft(null);
    addMessage("assistant", "Cancelled. Nothing has been saved.", { mode: "cancelled" });
  }

  function buildRecognition() {
    const recognition = makeSpeechRecognition();
    if (!recognition) return null;

    recognition.lang = "en-GB";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listeningRef.current = true;
      setListening(true);
      setOpen(true);
    };

    recognition.onresult = (event: any) => {
      const finalParts: string[] = [];
      const interimParts: string[] = [];

      for (let i = 0; i < event.results.length; i++) {
        const transcript = String(event.results[i]?.[0]?.transcript ?? "").trim();
        if (!transcript) continue;
        if (event.results[i]?.isFinal) finalParts.push(transcript);
        else interimParts.push(transcript);
      }

      const text = cleanupSpeech([...finalParts, ...interimParts].join(" "));
      setCommand(text);
      commandRef.current = text;
    };

    recognition.onerror = () => {
      // Some mobile browsers end recognition on silence or network hiccups.
      // The onend handler below restarts unless the user explicitly tapped Stop & send.
    };

    recognition.onend = () => {
      const shouldRestart = listeningRef.current && !stoppingForSendRef.current;
      if (shouldRestart) {
        restartTimerRef.current = window.setTimeout(() => {
          try {
            recognitionRef.current = buildRecognition();
            recognitionRef.current?.start?.();
          } catch {
            setListening(false);
            listeningRef.current = false;
          }
        }, 250);
        return;
      }

      setListening(false);
      listeningRef.current = false;

      if (stoppingForSendRef.current) {
        const spoken = cleanupSpeech(commandRef.current);
        stoppingForSendRef.current = false;
        if (spoken) void sendCommand(spoken);
      }
    };

    return recognition;
  }

  function startListening() {
    if (!speechSupported || listening || busy) return;
    stoppingForSendRef.current = false;
    listeningRef.current = true;
    setCommand("");
    commandRef.current = "";

    const recognition = buildRecognition();
    if (!recognition) {
      setSpeechSupported(false);
      return;
    }

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setListening(false);
      listeningRef.current = false;
    }
  }

  function stopListeningAndSend() {
    stoppingForSendRef.current = true;
    listeningRef.current = false;
    try {
      recognitionRef.current?.stop?.();
    } catch {
      setListening(false);
      const spoken = cleanupSpeech(commandRef.current);
      if (spoken) void sendCommand(spoken);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendCommand();
    }
  }

  function renderResponse(response: AssistantResponse | null | undefined) {
    if (!response) return null;

    return (
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {response.title ? <div style={responseTitleStyle}>{response.title}</div> : null}

        {response.checklist ? (
          <div style={checklistWrapStyle}>
            <ChecklistGroup title="Missing" items={response.checklist.missing ?? []} tone="bad" />
            <ChecklistGroup title="Needs checking" items={response.checklist.warnings ?? []} tone="warn" />
            <ChecklistGroup title="Done" items={response.checklist.done ?? []} tone="good" />
          </div>
        ) : null}

        {response.results?.length ? (
          <div style={{ display: "grid", gap: 7 }}>
            {response.results.map((item, index) => (
              <a key={`${item.href ?? item.label}-${index}`} href={item.href ?? "#"} style={resultLinkStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{item.label}</strong>
                  {item.badge ? <span style={badgeStyle}>{item.badge}</span> : null}
                </div>
                {item.description ? <div style={resultDescriptionStyle}>{item.description}</div> : null}
              </a>
            ))}
          </div>
        ) : null}

        {response.examples?.length ? (
          <div style={{ display: "grid", gap: 7 }}>
            {response.examples.map((example) => (
              <button key={example} type="button" onClick={() => void sendCommand(example)} style={exampleButtonStyle}>
                {example}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderDraft(draft: DraftAction | null) {
    if (!draft) return null;
    const highRisk = draft.risk === "high";
    const requiredConfirmText = draft.confirm_text ?? "CONFIRM";
    const highRiskReady = !highRisk || ((!draft.requires_reason || highRiskReason.trim()) && (!draft.requires_confirm_text || highRiskConfirm.trim() === requiredConfirmText));

    return (
      <div style={draftBoxStyle}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 1000 }}>{draft.title}</div>
          {draft.risk ? <span style={draft.risk === "high" ? highRiskBadgeStyle : draft.risk === "medium" ? mediumRiskBadgeStyle : lowRiskBadgeStyle}>{draft.risk} risk</span> : null}
        </div>
        {draft.warning ? <div style={warningStyle}>{draft.warning}</div> : null}
        <div style={{ display: "grid", gap: 6 }}>
          {draft.preview.map((row) => (
            <div key={`${row.label}-${row.value}`} style={previewRowStyle}>
              <span style={{ opacity: 0.7 }}>{row.label}</span>
              <strong>{row.value || "—"}</strong>
            </div>
          ))}
        </div>

        {highRisk ? (
          <div style={highRiskBoxStyle}>
            <strong>Extra confirmation required</strong>
            {draft.requires_reason ? (
              <textarea
                value={highRiskReason}
                onChange={(event) => setHighRiskReason(event.target.value)}
                placeholder="Reason for this high-risk change"
                style={{ ...textareaStyle, minHeight: 58 }}
                rows={2}
              />
            ) : null}
            {draft.requires_confirm_text ? (
              <input
                value={highRiskConfirm}
                onChange={(event) => setHighRiskConfirm(event.target.value)}
                placeholder={`Type ${requiredConfirmText}`}
                style={inputStyle}
              />
            ) : null}
          </div>
        ) : null}

        <div style={draftActionsStyle}>
          <button type="button" onClick={confirmDraft} disabled={busy || !highRiskReady} style={{ ...confirmBtnStyle, opacity: busy || !highRiskReady ? 0.55 : 1 }}>
            {busy ? "Saving..." : highRisk ? "Confirm high-risk change" : "Confirm"}
          </button>
          {lastAssistantResponse?.results?.[0]?.href ? (
            <a href={lastAssistantResponse.results[0].href} style={editLinkStyle}>
              Edit/Open
            </a>
          ) : null}
          <button type="button" onClick={cancelDraft} disabled={busy} style={cancelBtnStyle}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={floatingButtonStyle}>
          <span style={{ fontSize: 20 }}>✨</span>
          CRM Assistant
        </button>
      ) : null}

      {open ? (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={{ fontWeight: 1000, fontSize: 17 }}>AnnS CRM Assistant</div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Type or speak a CRM command</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={closeBtnStyle} aria-label="Close CRM Assistant">
              ×
            </button>
          </div>

          <div style={messagesStyle}>
            {messages.slice(-10).map((message) => (
              <div key={message.id} style={message.from === "user" ? userBubbleStyle : assistantBubbleStyle}>
                <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                {message.from === "assistant" ? renderResponse(message.response) : null}
              </div>
            ))}
            {pendingDraft ? renderDraft(pendingDraft) : null}
          </div>

          <div style={inputAreaStyle}>
            {listening ? <div style={listeningStyle}>Listening… take your time. Tap Stop & send when finished.</div> : null}
            <textarea
              ref={inputRef}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="e.g. Create crane job for Crendons on Wednesday with Grove"
              style={textareaStyle}
              rows={3}
            />
            <div style={inputActionsStyle}>
              <button type="button" onClick={() => void sendCommand()} disabled={busy || !command.trim()} style={sendBtnStyle}>
                {busy ? "Working..." : "Send"}
              </button>
              {speechSupported ? (
                listening ? (
                  <button type="button" onClick={stopListeningAndSend} style={micStopBtnStyle}>
                    Stop & send
                  </button>
                ) : (
                  <button type="button" onClick={startListening} disabled={busy} style={micBtnStyle}>
                    🎙 Talk
                  </button>
                )
              ) : (
                <span style={micHintStyle}>Mic not supported in this browser</span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChecklistGroup({ title, items, tone }: { title: string; items: string[]; tone: "bad" | "warn" | "good" }) {
  if (!items.length) return null;
  return (
    <div style={checklistGroupStyle}>
      <div style={{ ...checklistTitleStyle, ...(tone === "bad" ? badTextStyle : tone === "warn" ? warnTextStyle : goodTextStyle) }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const floatingButtonStyle: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: "calc(18px + env(safe-area-inset-bottom))",
  zIndex: 2147483000,
  border: "1px solid rgba(0,0,0,0.16)",
  background: "#111827",
  color: "#fff",
  padding: "13px 16px",
  borderRadius: 999,
  boxShadow: "0 18px 45px rgba(0,0,0,0.24)",
  fontWeight: 1000,
  cursor: "pointer",
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const panelStyle: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: "calc(18px + env(safe-area-inset-bottom))",
  zIndex: 2147483001,
  width: "min(520px, calc(100vw - 24px))",
  maxHeight: "min(760px, calc(100dvh - 24px))",
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.14)",
  borderRadius: 18,
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
};

const panelHeaderStyle: React.CSSProperties = {
  padding: 14,
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  background: "linear-gradient(135deg, #ffffff, #eef4ff)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const closeBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontSize: 28,
  lineHeight: 1,
  cursor: "pointer",
};

const messagesStyle: React.CSSProperties = {
  padding: 12,
  overflowY: "auto",
  display: "grid",
  gap: 10,
  alignContent: "start",
};

const userBubbleStyle: React.CSSProperties = {
  justifySelf: "end",
  maxWidth: "92%",
  background: "#111827",
  color: "#fff",
  padding: "10px 12px",
  borderRadius: "15px 15px 4px 15px",
  fontSize: 14,
};

const assistantBubbleStyle: React.CSSProperties = {
  justifySelf: "start",
  maxWidth: "96%",
  background: "#f3f6fb",
  color: "#111",
  padding: "10px 12px",
  borderRadius: "15px 15px 15px 4px",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};

const responseTitleStyle: React.CSSProperties = { fontWeight: 1000 };

const resultLinkStyle: React.CSSProperties = {
  display: "block",
  color: "#111",
  textDecoration: "none",
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  fontWeight: 1000,
  borderRadius: 999,
  padding: "3px 7px",
  background: "rgba(0,0,0,0.08)",
};

const resultDescriptionStyle: React.CSSProperties = { marginTop: 4, opacity: 0.72, fontSize: 12, lineHeight: 1.35 };

const exampleButtonStyle: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  borderRadius: 12,
  padding: "9px 10px",
  cursor: "pointer",
  fontWeight: 800,
};

const draftBoxStyle: React.CSSProperties = {
  background: "#fffaf0",
  border: "1px solid rgba(180,110,0,0.26)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
};

const warningStyle: React.CSSProperties = {
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.28)",
  borderRadius: 10,
  padding: 9,
  fontWeight: 800,
  fontSize: 13,
};

const previewRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "125px 1fr", gap: 8, fontSize: 13 };

const highRiskBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  background: "rgba(190,0,0,0.08)",
  border: "1px solid rgba(190,0,0,0.18)",
  padding: 10,
  borderRadius: 12,
};

const draftActionsStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };

const confirmBtnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  background: "#0f766e",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 1000,
  cursor: "pointer",
};

const editLinkStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  background: "#fff",
  color: "#111",
  textDecoration: "none",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 1000,
};

const cancelBtnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  color: "#111",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const inputAreaStyle: React.CSSProperties = {
  padding: 12,
  borderTop: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.92)",
  display: "grid",
  gap: 8,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  resize: "vertical",
  minHeight: 74,
  borderRadius: 13,
  border: "1px solid rgba(0,0,0,0.14)",
  padding: 11,
  boxSizing: "border-box",
  fontSize: 14,
  fontFamily: "inherit",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.14)",
  padding: "0 11px",
  boxSizing: "border-box",
  fontSize: 14,
  fontFamily: "inherit",
};

const inputActionsStyle: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };

const sendBtnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  background: "#111827",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 1000,
  cursor: "pointer",
};

const micBtnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  background: "#fff",
  color: "#111",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 1000,
  cursor: "pointer",
};

const micStopBtnStyle: React.CSSProperties = { ...micBtnStyle, background: "#fff0f0" };
const micHintStyle: React.CSSProperties = { fontSize: 12, opacity: 0.65, fontWeight: 800 };

const listeningStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(15,118,110,0.10)",
  border: "1px solid rgba(15,118,110,0.18)",
  color: "#0f766e",
  fontWeight: 900,
  fontSize: 12,
};

const checklistWrapStyle: React.CSSProperties = { display: "grid", gap: 7 };
const checklistGroupStyle: React.CSSProperties = { background: "rgba(255,255,255,0.78)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 11, padding: 9 };
const checklistTitleStyle: React.CSSProperties = { fontWeight: 1000, marginBottom: 4 };
const badTextStyle: React.CSSProperties = { color: "#b00020" };
const warnTextStyle: React.CSSProperties = { color: "#8a5200" };
const goodTextStyle: React.CSSProperties = { color: "#0b7a4b" };
const lowRiskBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "rgba(0,150,90,0.12)", color: "#0b7a4b" };
const mediumRiskBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "rgba(255,170,0,0.18)", color: "#8a5200" };
const highRiskBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "rgba(190,0,0,0.12)", color: "#b00020" };
