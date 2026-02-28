"use client";

import Link from "next/link";

export default function AdminUsersPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h1 style={{ margin: 0 }}>Admin → Users</h1>

      <p style={{ margin: 0, opacity: 0.85 }}>
        This page exists now (so no more 404). Next step: we’ll add the form to
        create staff usernames and passwords.
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <Link href="/dashboard">Go to dashboard</Link>
        <span>•</span>
        <Link href="/login">Go to login</Link>
      </div>
    </main>
  );
}
