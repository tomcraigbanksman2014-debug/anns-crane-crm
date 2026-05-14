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
  warning?: string | null;
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
  "Create crane job for Crendons on Wednesday with Grove",
  "Find job 169",
  "Show jobs needing lift plans this week",
  "Move job 169 to Friday",
  "Add Shaun as operator on job 169",
  "Mark today's visit on job 169 as invoiced",
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

export default function CrmAssistant() {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftAction | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      from: "assistant",
      text: "Ask me to find jobs, check missing info, create crane job drafts, move jobs, assign operators, or mark a visit invoiced.",
      response: { examples: EXAMPLES, mode: "help" },
    },
  ]);
  const messageIdRef = useRef(2);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const lastAssistantResponse = useMemo(() => {
    const reversed = [...messages].reverse();
    return reversed.find((msg) => msg.from === "assistant" && msg.response)?.response ?? null;
  }, [messages]);

  useEffect(() => {
    setSpeechSupported(supportsSpeechRecognition());
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  function addMessage(from: ChatMessage["from"], text: string, response?: AssistantResponse | null) {
    const id = messageIdRef.current++;
    setMessages((current) => [...current, { id, from, text, response }]);
  }

  async function sendCommand(rawCommand?: string) {
    const text = String(rawCommand ?? command).trim();
    if (!text || busy) return;

    setOpen(true);
    setCommand("");
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

      if (json?.draftAction) {
        setPendingDraft(json.draftAction);
      }

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
        body: JSON.stringify({ mode: "execute", draftAction: pendingDraft }),
      });

      const json = (await res.json().catch(() => ({}))) as AssistantResponse;
      const replyText = json?.error || json?.message || json?.title || "Saved.";
      setPendingDraft(null);
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

  function startListening() {
    if (!speechSupported || listening || busy) return;

    const recognition = makeSpeechRecognition();
    if (!recognition) {
      setSpeechSupported(false);
      return;
    }

    recognitionRef.current = recognition;
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalText = "";

    recognition.onstart = () => {
      setListening(true);
      setOpen(true);
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = String(event.results[i]?.[0]?.transcript ?? "").trim();
        if (event.results[i]?.isFinal) finalText = `${finalText} ${text}`.trim();
        else interim = `${interim} ${text}`.trim();
      }
      setCommand((finalText || interim).trim());
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      const spoken = finalText.trim();
      if (spoken) {
        setCommand(spoken);
        addMessage("assistant", `I heard: ${spoken}. Check it, then press Send.`, { mode: "transcript" });
      }
    };

    recognition.start();
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // Ignore stop errors from browser speech APIs.
    }
    setListening(false);
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

    return (
      <div style={draftBoxStyle}>
        <div style={{ fontWeight: 1000 }}>{draft.title}</div>
        {draft.warning ? <div style={warningStyle}>{draft.warning}</div> : null}
        <div style={{ display: "grid", gap: 6 }}>
          {draft.preview.map((row) => (
            <div key={`${row.label}-${row.value}`} style={previewRowStyle}>
              <span style={{ opacity: 0.7 }}>{row.label}</span>
              <strong>{row.value || "—"}</strong>
            </div>
          ))}
        </div>
        <div style={draftActionsStyle}>
          <button type="button" onClick={confirmDraft} disabled={busy} style={confirmBtnStyle}>
            {busy ? "Saving..." : "Confirm"}
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
              <div style={{ fontSize: 12, opacity: 0.72 }}>Type or speak a simple command</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={closeBtnStyle} aria-label="Close CRM Assistant">
              ×
            </button>
          </div>

          <div style={messagesStyle}>
            {messages.slice(-8).map((message) => (
              <div key={message.id} style={message.from === "user" ? userBubbleStyle : assistantBubbleStyle}>
                <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                {message.from === "assistant" ? renderResponse(message.response) : null}
              </div>
            ))}
            {pendingDraft ? renderDraft(pendingDraft) : null}
          </div>

          <div style={inputAreaStyle}>
            {listening ? <div style={listeningStyle}>Listening… speak clearly, then check the text before sending.</div> : null}
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
                  <button type="button" onClick={stopListening} style={micStopBtnStyle}>
                    Stop mic
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
  width: "min(440px, calc(100vw - 24px))",
  maxHeight: "min(720px, calc(100dvh - 24px))",
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
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontSize: 24,
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

const responseTitleStyle: React.CSSProperties = {
  fontWeight: 1000,
};

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

const resultDescriptionStyle: React.CSSProperties = {
  marginTop: 4,
  opacity: 0.72,
  fontSize: 12,
  lineHeight: 1.35,
};

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

const previewRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "110px 1fr",
  gap: 8,
  fontSize: 13,
};

const draftActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

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

const inputActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

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

const micStopBtnStyle: React.CSSProperties = {
  ...micBtnStyle,
  background: "#fff0f0",
};

const micHintStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
  fontWeight: 800,
};

const listeningStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(15,118,110,0.10)",
  border: "1px solid rgba(15,118,110,0.18)",
  color: "#0f766e",
  fontWeight: 900,
  fontSize: 12,
};

const checklistWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
};

const checklistGroupStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.07)",
  borderRadius: 11,
  padding: 9,
};

const checklistTitleStyle: React.CSSProperties = {
  fontWeight: 1000,
  marginBottom: 4,
};

const badTextStyle: React.CSSProperties = { color: "#b00020" };
const warnTextStyle: React.CSSProperties = { color: "#8a5200" };
const goodTextStyle: React.CSSProperties = { color: "#0b7a4b" };
