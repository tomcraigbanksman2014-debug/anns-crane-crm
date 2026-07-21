"use client";
import { useState } from "react";
function decodeBase64Url(value: string) { const padding = "=".repeat((4 - value.length % 4) % 4); const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(base64); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); }
export default function ShaunDiaryNotificationButton() {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function enable() {
    setBusy(true); setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported on this device.");
      const permission = await Notification.requestPermission(); if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/shaun-diary/push/subscribe", { cache: "no-store" }); const keyJson = await keyRes.json(); if (!keyRes.ok || !keyJson.publicKey) throw new Error(keyJson.error || "Push key is missing.");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(keyJson.publicKey) });
      const saveRes = await fetch("/api/shaun-diary/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) }); const saveJson = await saveRes.json(); if (!saveRes.ok) throw new Error(saveJson.error || "Unable to save notification subscription.");
      const testRes = await fetch("/api/shaun-diary/push/test", { method: "POST" }); const testJson = await testRes.json(); if (!testRes.ok) throw new Error(testJson.error || "Subscription saved but the test failed.");
      setMessage("Notifications enabled. A test notification has been sent.");
    } catch (error: any) { setMessage(error?.message || "Unable to enable notifications."); }
    setBusy(false);
  }
  return <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><button type="button" className="sd-btn" disabled={busy} onClick={enable}>{busy ? "Enabling..." : "Enable notifications"}</button>{message && <span style={{fontSize:13,fontWeight:700}}>{message}</span>}</div>;
}
