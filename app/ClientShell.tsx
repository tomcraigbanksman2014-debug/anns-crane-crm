"use client";

import Image from "next/image";

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#bfc1c6", // match logo background
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
        overflow: "hidden",
      }}
    >
      <div style={{ width: 140, height: 140, position: "relative" }}>
        <Image
          src="/logo.png"
          alt="AnnS Crane Hire"
          fill
          style={{ objectFit: "contain" }}
          priority
        />
      </div>

      {children}
    </div>
  );
}
