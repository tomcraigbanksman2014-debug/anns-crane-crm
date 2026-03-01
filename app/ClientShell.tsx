"use client";

import Image from "next/image";
import React from "react";

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#bfc1c4", // match logo background tone
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 18 }}>
        <Image
          src="/logo.png"
          alt="AnnS Crane Hire"
          width={220}
          height={220}
          priority
          style={{
            width: 220,
            height: "auto",
            display: "block",
          }}
        />
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
