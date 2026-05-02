"use client";

import { useEffect, useRef, useState } from "react";
import { normaliseDraftBody, normaliseDraftSubject } from "../../../../lib/emailSignature";

type DraftRow = {
  target_type: "lead" | "customer";
  target_id: string;
  company_name: string;
  contact_name: string;
  channel: string;
  subject: string;
  body: string;
  provider?: "openai" | "fallback";
  target_email?: string | null;
  target_phone?: string | null;
};

type SkippedRow = {
  target_type: "lead" | "customer";
  target_id: string;
  company_name: string;
  reason: string;
};

type GmailStatus = {
  connected: boolean;
  emailAddress?: string | null;
  expectedEmail?: string | null;
  expiryDate?: string | null;
  connectedByUsername?: string | null;
  updatedAt?: string | null;
  error?: string | null;
};

type GmailSendResponse = {
  ok?: boolean;
  senderEmail?: string;
  batchLimit?: number;
  requestedCount?: number;
  processedCount?: number;
  remainingCount?: number;
  imageCount?: number;
  imageFilenames?: string[];
  unsubscribeEnabled?: boolean;
  testModeEnabled?: boolean;
  testRecipientEmail?: string | null;
  sent?: Array<{ key: string; to: string; messageId: string; threadId: string; originalTo?: string | null }>;
  failed?: Array<{ key: string; to: string | null; error: string }>;
  skipped?: Array<{ key: string; reason: string }>;
  error?: string;
};

type CampaignTestModeSettings = {
  testModeEnabled: boolean;
  testRecipientEmail: string;
  updatedAt?: string | null;
  updatedByUsername?: string | null;
  canUpdate?: boolean;
};

type CampaignImagePreview = {
  file: File;
  url: string;
};

const MAX_CAMPAIGN_IMAGES = 5;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

export default function CampaignRunner({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [channel, setChannel] = useState<string>("email");
  const [goal, setGoal] = useState<string>("introduction");
  const [tone, setTone] = useState<string>("professional");

  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkBody, setBulkBody] = useState("");

  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailStatusLoading, setGmailStatusLoading] = useState(false);
  const [gmailSending, setGmailSending] = useState(false);
  const [gmailResult, setGmailResult] = useState<GmailSendResponse | null>(null);
  const [gmailSentKeys, setGmailSentKeys] = useState<string[]>([]);
  const [testModeSettings, setTestModeSettings] = useState<CampaignTestModeSettings>({
    testModeEnabled: true,
    testRecipientEmail: "sales@annscranehire.co.uk",
    canUpdate: false,
  });
  const [testModeSaving, setTestModeSaving] = useState(false);

  const [campaignImages, setCampaignImages] = useState<CampaignImagePreview[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  const imageRef = useRef<CampaignImagePreview[]>([]);

  useEffect(() => {
    imageRef.current = campaignImages;
  }, [campaignImages]);

  useEffect(() => {
    refreshGmailStatus();
    refreshCampaignTestModeSettings();

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const success = params.get("success");
      const urlError = params.get("error");

      if (success) setError(success);
      if (urlError) setError(urlError);

      if (success || urlError) {
        params.delete("success");
        params.delete("error");
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
      }
    }

    return () => {
      imageRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    };
  }, []);

  function draftKey(draft: DraftRow, index: number) {
    return `${draft.target_type}:${draft.target_id || index}`;
  }

  function isValidEmail(value: unknown) {
    const email = String(value ?? "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function totalImageBytes(images: CampaignImagePreview[]) {
    return images.reduce((sum, image) => sum + image.file.size, 0);
  }

  function formatBytes(bytes: number) {
    if (!bytes) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function isSuccessMessage(value: string) {
    const text = value.toLowerCase();
    return (
      text.includes("sent through microsoft") ||
      text.includes("sent through microsoft graph") ||
      text.includes("connected") ||
      text.includes("configured") ||
      text.includes("disconnected") ||
      text.includes("generated") ||
      text.includes("applied")
    );
  }

  const isEmailCampaign = channel === "email";

  const emailDrafts = drafts.filter(
    (draft) =>
      String(draft.channel ?? "email").toLowerCase() === "email" &&
      isValidEmail(draft.target_email)
  );

  const unsentEmailDrafts = emailDrafts.filter(
    (draft, index) => !gmailSentKeys.includes(draftKey(draft, index))
  );

  function setFeedback(message: string) {
    setError(message);
    window.setTimeout(() => {
      setError((current) => (current === message ? null : current));
    }, 2600);
  }

  function updateDraft(index: number, updates: Partial<DraftRow>) {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...updates } : draft))
    );
  }

  function applyBulkMessageToAllDrafts() {
    const subject = normaliseDraftSubject(bulkSubject);
    const body = normaliseDraftBody(bulkBody);

    if (!subject && !body) {
      setError("Paste a subject or body before applying to all drafts.");
      return;
    }

    setDrafts((current) =>
      current.map((draft) => ({
        ...draft,
        subject: subject || draft.subject,
        body: body || draft.body,
      }))
    );

    setFeedback("Message applied to all drafts.");
  }

  function loadFirstDraftIntoBulkEditor() {
    const first = drafts.find((draft) => String(draft.channel ?? "email").toLowerCase() === "email");

    if (!first) {
      setError("No email draft available to load.");
      return;
    }

    setBulkSubject(normaliseDraftSubject(first.subject));
    setBulkBody(normaliseDraftBody(first.body));
    setFeedback("First draft loaded into shared editor.");
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImageError(null);

    const files = Array.from(e.target.files ?? []);
    e.target.value = "";

    if (!files.length) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length !== files.length) {
      setImageError("Only image files can be attached.");
      return;
    }

    setCampaignImages((current) => {
      const nextFiles = [...current.map((item) => item.file), ...imageFiles];

      if (nextFiles.length > MAX_CAMPAIGN_IMAGES) {
        setImageError(`Maximum ${MAX_CAMPAIGN_IMAGES} images allowed.`);
        return current;
      }

      const nextTotal = nextFiles.reduce((sum, file) => sum + file.size, 0);
      if (nextTotal > MAX_TOTAL_IMAGE_BYTES) {
        setImageError("Images are too large. Keep the total image size under 20MB.");
        return current;
      }

      return [
        ...current,
        ...imageFiles.map((file) => ({
          file,
          url: URL.createObjectURL(file),
        })),
      ];
    });
  }

  function removeCampaignImage(index: number) {
    setCampaignImages((current) => {
      const image = current[index];
      if (image) URL.revokeObjectURL(image.url);
      return current.filter((_item, i) => i !== index);
    });
  }

  function clearCampaignImages() {
    setCampaignImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.url));
      return [];
    });
    setImageError(null);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function refreshGmailStatus() {
    setGmailStatusLoading(true);

    try {
      const res = await fetch("/api/email/microsoft/status", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      setGmailStatus(data);
    } catch {
      setGmailStatus({
        connected: false,
        error: "Could not check Microsoft Graph configuration.",
      });
    } finally {
      setGmailStatusLoading(false);
    }
  }


  async function refreshCampaignTestModeSettings() {
    try {
      const res = await fetch("/api/sales-campaigns/test-mode", {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestModeSettings({
          testModeEnabled: data?.testModeEnabled !== false,
          testRecipientEmail: String(data?.testRecipientEmail || "sales@annscranehire.co.uk"),
          updatedAt: data?.updatedAt ?? null,
          updatedByUsername: data?.updatedByUsername ?? null,
          canUpdate: Boolean(data?.canUpdate),
        });
      }
    } catch {
      // Test mode is safe by default; leave the local default on failure.
    }
  }

  async function saveCampaignTestModeSettings() {
    setTestModeSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/sales-campaigns/test-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testModeEnabled: testModeSettings.testModeEnabled,
          testRecipientEmail: testModeSettings.testRecipientEmail,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save campaign test mode settings.");
        return;
      }

      setTestModeSettings({
        testModeEnabled: data?.testModeEnabled !== false,
        testRecipientEmail: String(data?.testRecipientEmail || "sales@annscranehire.co.uk"),
        updatedAt: data?.updatedAt ?? null,
        updatedByUsername: data?.updatedByUsername ?? null,
        canUpdate: Boolean(data?.canUpdate),
      });
      setFeedback("Campaign test mode settings saved.");
    } catch {
      setError("Could not save campaign test mode settings.");
    } finally {
      setTestModeSaving(false);
    }
  }

  function connectGmail() {
    setError(
      "Microsoft Graph sending is configured through Vercel environment variables, not an in-app OAuth button. Add MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and MICROSOFT_SENDER_EMAIL, then refresh Microsoft status."
    );
  }

  async function disconnectGmail() {
    setError(
      "Microsoft Graph sender is controlled by Vercel environment variables. Remove or rotate the Microsoft app secret in Azure/Vercel to disable campaign sending."
    );
  }

  async function sendGmailBatch(batchSize: number) {
    if (!gmailStatus?.connected) {
      setError("Configure Microsoft Graph before sending campaign emails.");
      return;
    }

    if (!unsentEmailDrafts.length) {
      setError("No unsent email-ready drafts available.");
      return;
    }

    const effectiveBatchSize = testModeSettings.testModeEnabled ? 1 : batchSize;
    const batch = unsentEmailDrafts.slice(0, effectiveBatchSize);

    setGmailSending(true);
    setError(null);
    setGmailResult(null);

    try {
      const formData = new FormData();
      formData.append("drafts", JSON.stringify(batch));
      formData.append("batch_limit", String(effectiveBatchSize));

      for (const image of campaignImages) {
        formData.append("images", image.file, image.file.name);
      }

      const res = await fetch(`/api/sales-campaigns/${campaignId}/send-microsoft`, {
        method: "POST",
        body: formData,
      });

      const data = (await res.json().catch(() => ({}))) as GmailSendResponse;

      if (!res.ok) {
        setError(data?.error || "Could not send emails through Microsoft Graph.");
        setGmailResult(data);
        return;
      }

      const sentKeys = Array.isArray(data.sent) && !data.testModeEnabled
        ? data.sent.map((row) => row.key).filter(Boolean)
        : [];

      setGmailSentKeys((current) => Array.from(new Set([...current, ...sentKeys])));
      setGmailResult(data);

      const sentCount = data.sent?.length ?? 0;
      const failedCount = data.failed?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;
      const imageCount = data.imageCount ?? campaignImages.length;

      if (sentCount > 0 && failedCount === 0) {
        if (data.testModeEnabled) {
          setFeedback(
            `Test mode is ON: ${sentCount} test email sent to ${data.testRecipientEmail || testModeSettings.testRecipientEmail}. No customer or lead received it.`
          );
        } else {
          setFeedback(
            `${sentCount} email${sentCount === 1 ? "" : "s"} sent through Microsoft Graph${
              imageCount ? ` with ${imageCount} image${imageCount === 1 ? "" : "s"}` : ""
            }.`
          );
        }
      } else if (sentCount > 0) {
        setError(`${sentCount} sent, ${failedCount} failed, ${skippedCount} skipped.`);
      } else {
        setError(data?.error || `${failedCount} failed, ${skippedCount} skipped. No emails were sent.`);
      }
    } catch {
      setError("Could not send emails through Microsoft Graph.");
    } finally {
      setGmailSending(false);
    }
  }

  async function generateDrafts() {
    setLoading(true);
    setError(null);
    setGmailResult(null);
    setGmailSentKeys([]);

    try {
      const res = await fetch(`/api/sales-campaigns/${campaignId}/generate-drafts`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Could not generate drafts.");
        return;
      }

      const nextDrafts = Array.isArray(data?.drafts) ? data.drafts : [];
      const nextChannel = String(data?.campaign?.channel ?? "email");

      setDrafts(nextDrafts);
      setSkipped(Array.isArray(data?.skipped) ? data.skipped : []);
      setChannel(nextChannel);
      setGoal(String(data?.campaign?.goal ?? "introduction"));
      setTone(String(data?.campaign?.tone ?? "professional"));

      const firstEmailDraft = nextDrafts.find(
        (draft: DraftRow) => String(draft.channel ?? "email").toLowerCase() === "email"
      );

      if (firstEmailDraft) {
        setBulkSubject(normaliseDraftSubject(firstEmailDraft.subject));
        setBulkBody(normaliseDraftBody(firstEmailDraft.body));
      }

      setFeedback("Drafts generated.");
    } catch {
      setError("Could not generate drafts.");
    } finally {
      setLoading(false);
    }
  }

  async function copyCombinedNonEmail() {
    const blocks = drafts.map((draft) => {
      const parts = [
        `Type: ${draft.target_type}`,
        `Company: ${draft.company_name}`,
        draft.contact_name ? `Contact: ${draft.contact_name}` : "",
        draft.subject ? `Subject: ${normaliseDraftSubject(draft.subject)}` : "",
        "Body:",
        normaliseDraftBody(draft.body),
      ].filter(Boolean);
      return parts.join("\n");
    });

    await copyText(blocks.join("\n\n--------------------\n\n"), "All drafts");
  }

  const leadDrafts = drafts.filter((row) => row.target_type === "lead").length;
  const customerDrafts = drafts.filter((row) => row.target_type === "customer").length;
  const gmailConnected = Boolean(gmailStatus?.connected);
  const selectedImageBytes = totalImageBytes(campaignImages);

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>Campaign Runner</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Generate drafts and send marketing emails through Microsoft Graph from <strong>{campaignName}</strong>.
      </p>
      <p style={{ marginTop: 6, opacity: 0.72, fontSize: 14 }}>
        Email campaigns must be sent through Microsoft Graph so unsubscribe links and headers are included.
      </p>

      {error ? (
        <div style={isSuccessMessage(error) ? successBox : errorBox}>{error}</div>
      ) : null}

      <div style={summaryGrid}>
        <SummaryCard label="Channel" value={channel} />
        <SummaryCard label="Goal" value={goal} />
        <SummaryCard label="Tone" value={tone} />
        <SummaryCard label="Drafts" value={String(drafts.length)} />
        <SummaryCard label="Lead drafts" value={String(leadDrafts)} />
        <SummaryCard label="Customer drafts" value={String(customerDrafts)} />
        <SummaryCard label="Skipped" value={String(skipped.length)} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" onClick={generateDrafts} disabled={loading} style={primaryBtn}>
          {loading ? "Generating..." : "Generate all drafts"}
        </button>

        {drafts.length > 0 && !isEmailCampaign ? (
          <button type="button" onClick={copyCombinedNonEmail} style={secondaryBtn}>
            Copy all drafts
          </button>
        ) : null}
      </div>

      {isEmailCampaign && drafts.length > 0 ? (
        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ fontWeight: 1000, fontSize: 18 }}>Shared campaign message</div>
          <div style={{ marginTop: 6, fontSize: 14, opacity: 0.76 }}>
            Paste the exact subject and email body once, then apply it to every email draft. The unsubscribe line is added automatically when sending.
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Subject to apply to all</label>
            <input
              value={bulkSubject}
              onChange={(e) => setBulkSubject(e.target.value)}
              style={inputStyle}
              placeholder="New 40t Tadano Faun HK40 now available"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Email body to apply to all</label>
            <textarea
              value={bulkBody}
              onChange={(e) => setBulkBody(e.target.value)}
              style={{ ...textareaStyle, minHeight: 230 }}
              placeholder="Paste the campaign email body here..."
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" onClick={applyBulkMessageToAllDrafts} style={primaryBtn}>
              Apply this message to all drafts
            </button>
            <button type="button" onClick={loadFirstDraftIntoBulkEditor} style={secondaryBtn}>
              Load first draft into editor
            </button>
          </div>
        </section>
      ) : null}

      {isEmailCampaign ? (
        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ fontWeight: 1000, fontSize: 18 }}>Email sending method</div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>
            Campaign email sending is Microsoft Graph/Outlook only. Manual Outlook send/copy buttons have been removed so marketing
            emails always include the unsubscribe footer, one-click unsubscribe link, and List-Unsubscribe headers.
          </div>
        </section>
      ) : null}

      {isEmailCampaign ? (
        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Campaign images</div>
              <div style={{ marginTop: 6, fontSize: 14, opacity: 0.76 }}>
                Optional. These images will be embedded into each Microsoft Graph email and attached inline.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <label style={secondaryBtn}>
                Choose images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  style={{ display: "none" }}
                />
              </label>

              {campaignImages.length > 0 ? (
                <button type="button" onClick={clearCampaignImages} style={secondaryBtn}>
                  Clear images
                </button>
              ) : null}
            </div>
          </div>

          {imageError ? <div style={errorBox}>{imageError}</div> : null}

          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.72 }}>
            Selected: {campaignImages.length}/{MAX_CAMPAIGN_IMAGES} images • Total size:{" "}
            {formatBytes(selectedImageBytes)} / {formatBytes(MAX_TOTAL_IMAGE_BYTES)}
          </div>

          {campaignImages.length ? (
            <div style={imageGridStyle}>
              {campaignImages.map((image, index) => (
                <div key={`${image.file.name}-${index}`} style={imageCardStyle}>
                  <img src={image.url} alt={image.file.name} style={imagePreviewStyle} />

                  <div style={{ padding: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 13, wordBreak: "break-word" }}>
                      {image.file.name}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                      {formatBytes(image.file.size)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeCampaignImage(index)}
                      style={{ ...secondaryBtn, marginTop: 8, padding: "7px 10px" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...panelStyle, marginTop: 12 }}>
              No campaign images selected. Microsoft Graph sends will go without extra crane photos.
            </div>
          )}
        </section>
      ) : null}

      {isEmailCampaign ? (
        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Microsoft Graph / Outlook sender</div>
              <div style={{ marginTop: 6, fontSize: 14, opacity: 0.76 }}>
                Sends campaign emails from the Microsoft/Outlook sales mailbox using Microsoft Graph.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <button type="button" onClick={refreshGmailStatus} disabled={gmailStatusLoading} style={secondaryBtn}>
                {gmailStatusLoading ? "Checking..." : "Refresh Microsoft status"}
              </button>

              {gmailConnected ? (
                <button type="button" onClick={disconnectGmail} disabled={gmailStatusLoading || gmailSending} style={secondaryBtn}>
                  Disable info
                </button>
              ) : (
                <button type="button" onClick={connectGmail} disabled={gmailStatusLoading} style={primaryBtn}>
                  Microsoft setup info
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div style={gmailStatusLine}>
              <strong>Status:</strong>{" "}
              {gmailStatusLoading
                ? "Checking..."
                : gmailConnected
                  ? `Connected as ${gmailStatus?.emailAddress || gmailStatus?.expectedEmail || "sales mailbox"}`
                  : `Not configured${gmailStatus?.expectedEmail ? ` — expected ${gmailStatus.expectedEmail}` : ""}`}
            </div>

            {gmailStatus?.connectedByUsername ? (
              <div style={gmailStatusLine}>
                <strong>Connected by:</strong> {gmailStatus.connectedByUsername}
              </div>
            ) : null}

            {gmailStatus?.updatedAt ? (
              <div style={gmailStatusLine}>
                <strong>Last updated:</strong> {new Date(gmailStatus.updatedAt).toLocaleString()}
              </div>
            ) : null}

            {gmailStatus?.error ? (
              <div style={errorBox}>{gmailStatus.error}</div>
            ) : null}
          </div>

          <div style={testModeBoxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 1000 }}>Campaign test mode</div>
                <div style={{ marginTop: 5, fontSize: 13, opacity: 0.75 }}>
                  When ON, the server sends one test email only to the test recipient. Customers and leads are protected.
                </div>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
                <input
                  type="checkbox"
                  checked={testModeSettings.testModeEnabled}
                  disabled={!testModeSettings.canUpdate || testModeSaving}
                  onChange={(e) =>
                    setTestModeSettings((current) => ({ ...current, testModeEnabled: e.target.checked }))
                  }
                />
                Test mode {testModeSettings.testModeEnabled ? "ON" : "OFF"}
              </label>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <label style={labelStyle}>Test recipient email</label>
              <input
                value={testModeSettings.testRecipientEmail}
                disabled={!testModeSettings.canUpdate || testModeSaving}
                onChange={(e) =>
                  setTestModeSettings((current) => ({ ...current, testRecipientEmail: e.target.value }))
                }
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={saveCampaignTestModeSettings}
                  disabled={!testModeSettings.canUpdate || testModeSaving}
                  style={testModeSettings.canUpdate ? primaryBtn : disabledBtn}
                >
                  {testModeSaving ? "Saving..." : "Save test mode settings"}
                </button>
                <button type="button" onClick={refreshCampaignTestModeSettings} style={secondaryBtn}>
                  Refresh test mode
                </button>
                <span style={{ fontSize: 13, opacity: 0.72 }}>
                  {testModeSettings.canUpdate
                    ? "Only masteradmin can change this setting."
                    : "Only masteradmin can change this setting."}
                </span>
              </div>

              {testModeSettings.updatedAt ? (
                <div style={{ fontSize: 12, opacity: 0.68 }}>
                  Last changed {new Date(testModeSettings.updatedAt).toLocaleString()} by {testModeSettings.updatedByUsername || "—"}
                </div>
              ) : null}
            </div>
          </div>

          {drafts.length > 0 ? (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div style={unsubscribeNoticeStyle}>
                <div style={{ fontWeight: 1000 }}>Unsubscribe protection enabled</div>
                <div style={{ marginTop: 5 }}>
                  Microsoft Graph campaign sends include a unique one-click unsubscribe link, unsubscribe footer text,
                  List-Unsubscribe header and List-Unsubscribe-Post header. Anyone who unsubscribes will be skipped
                  from future marketing campaign sends.
                </div>
              </div>

              <div style={gmailStatsGrid}>
                <SummaryCard label="Email-ready drafts" value={String(emailDrafts.length)} />
                <SummaryCard label="Sent this session" value={String(gmailSentKeys.length)} />
                <SummaryCard label="Remaining" value={String(unsentEmailDrafts.length)} />
                <SummaryCard label="Images selected" value={String(campaignImages.length)} />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => sendGmailBatch(1)}
                  disabled={!gmailConnected || gmailSending || unsentEmailDrafts.length === 0}
                  style={secondaryBtn}
                >
                  {gmailSending ? "Sending..." : "Send 1 test email through Microsoft Graph"}
                </button>

                <button
                  type="button"
                  onClick={() => sendGmailBatch(25)}
                  disabled={!gmailConnected || gmailSending || unsentEmailDrafts.length === 0 || testModeSettings.testModeEnabled}
                  style={testModeSettings.testModeEnabled ? disabledBtn : primaryBtn}
                >
                  {gmailSending ? "Sending..." : testModeSettings.testModeEnabled ? "Bulk send locked by test mode" : "Send next 25 through Microsoft Graph"}
                </button>

                <button
                  type="button"
                  onClick={() => sendGmailBatch(50)}
                  disabled={!gmailConnected || gmailSending || unsentEmailDrafts.length === 0 || testModeSettings.testModeEnabled}
                  style={testModeSettings.testModeEnabled ? disabledBtn : secondaryBtn}
                >
                  {gmailSending ? "Sending..." : testModeSettings.testModeEnabled ? "Turn off test mode for bulk" : "Send next 50"}
                </button>
              </div>

              <div style={{ fontSize: 13, opacity: 0.72 }}>
                Use the 1-email test first. For image campaigns, batches of 25 are safer than 50 because each email is heavier.
              </div>
            </div>
          ) : null}

          {gmailResult ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Last Microsoft Graph send result</div>
              <div style={gmailStatsGrid}>
                <SummaryCard label="Sent" value={String(gmailResult.sent?.length ?? 0)} />
                <SummaryCard label="Failed" value={String(gmailResult.failed?.length ?? 0)} />
                <SummaryCard label="Skipped" value={String(gmailResult.skipped?.length ?? 0)} />
                <SummaryCard label="Images sent" value={String(gmailResult.imageCount ?? 0)} />
                <SummaryCard label="Unsubscribe" value={gmailResult.unsubscribeEnabled ? "Enabled" : "—"} />
                <SummaryCard label="Processed" value={String(gmailResult.processedCount ?? 0)} />
                <SummaryCard label="Test mode" value={gmailResult.testModeEnabled ? "ON" : "OFF"} />
              </div>

              {gmailResult.imageFilenames?.length ? (
                <div style={{ ...successBox, marginTop: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Images included</div>
                  {gmailResult.imageFilenames.map((filename) => (
                    <div key={filename} style={{ marginTop: 4 }}>
                      {filename}
                    </div>
                  ))}
                </div>
              ) : null}

              {gmailResult.failed?.length ? (
                <div style={{ ...errorBox, marginTop: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Failed emails</div>
                  {gmailResult.failed.map((row) => (
                    <div key={`${row.key}-${row.to || "missing"}`} style={{ marginTop: 4 }}>
                      {row.to || row.key}: {row.error}
                    </div>
                  ))}
                </div>
              ) : null}

              {gmailResult.skipped?.length ? (
                <div style={{ ...errorBox, marginTop: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Skipped emails</div>
                  {gmailResult.skipped.map((row) => (
                    <div key={row.key} style={{ marginTop: 4 }}>
                      {row.key}: {row.reason}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {skipped.length > 0 ? (
        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Skipped targets</div>
          <div style={{ display: "grid", gap: 8 }}>
            {skipped.map((row) => (
              <div key={`${row.target_type}-${row.target_id}`} style={skipCard}>
                <div style={{ fontWeight: 800 }}>{row.company_name}</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                  {row.target_type.toUpperCase()} • {row.reason}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {drafts.length === 0 ? (
          <div style={panelStyle}>No drafts generated yet.</div>
        ) : (
          drafts.map((draft, index) => {
            const openHref =
              draft.target_type === "lead"
                ? `/sales-hub/leads/${draft.target_id}`
                : draft.target_type === "customer"
                  ? `/customers/${draft.target_id}`
                  : `/suppliers`;

            const key = draftKey(draft, index);
            const alreadySent = gmailSentKeys.includes(key);

            return (
              <div key={`${draft.target_type}-${draft.target_id}`} style={draftCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>
                      {draft.company_name}
                      {alreadySent ? (
                        <span style={sentBadge}>Sent through Microsoft Graph</span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {draft.target_type.toUpperCase()} • {draft.contact_name || "No contact name"} • {draft.target_email || draft.target_phone || "No destination"} • {draft.channel}
                      {draft.provider ? ` • ${draft.provider}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a href={openHref} style={linkBtn}>
                      Open {draft.target_type}
                    </a>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Subject</label>
                  <input
                    value={normaliseDraftSubject(draft.subject)}
                    onChange={(e) => updateDraft(index, { subject: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Body</label>
                  <textarea
                    value={normaliseDraftBody(draft.body)}
                    onChange={(e) => updateDraft(index, { body: e.target.value })}
                    style={textareaStyle}
                  />

                  {isEmailCampaign ? (
                    <div style={{ marginTop: 8, fontSize: 13, opacity: 0.72 }}>
                      The unsubscribe line is added automatically when Microsoft Graph sends the email.
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => copyText(normaliseDraftBody(draft.body), "Body")}
                        style={secondaryBtn}
                      >
                        Copy body
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const gmailStatsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const summaryCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const panelStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const draftCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const skipCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.64)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
  fontWeight: 900,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 260,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
  whiteSpace: "pre-wrap",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};

const successBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,160,80,0.14)",
  border: "1px solid rgba(0,160,80,0.18)",
};

const gmailStatusLine: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.82,
};

const sentBadge: React.CSSProperties = {
  display: "inline-block",
  marginLeft: 8,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,160,80,0.15)",
  border: "1px solid rgba(0,160,80,0.22)",
  fontSize: 12,
  fontWeight: 900,
};

const unsubscribeNoticeStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(0,160,80,0.12)",
  border: "1px solid rgba(0,160,80,0.22)",
  fontSize: 13,
  color: "#0b5f3a",
};


const testModeBoxStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 16,
  border: "1px solid #f59e0b",
  background: "#fffbeb",
};

const disabledBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#e5e7eb",
  color: "#6b7280",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 1000,
  cursor: "not-allowed",
};

const imageGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const imageCardStyle: React.CSSProperties = {
  overflow: "hidden",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.10)",
};

const imagePreviewStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: 130,
  objectFit: "cover",
};
