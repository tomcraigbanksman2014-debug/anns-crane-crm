import ClientShell from "./ClientShell";

export const metadata = {
  title: "Anns Crane CRM",
  description: "CRM system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body
        style={{
          height: "100%",
          margin: 0,
          fontFamily: "system-ui",
          background: "#bfc1c6",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Logo Header */}
          <header
            style={{
              height: 280, // much larger header space
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              src="/logo.png"
              alt="Anns Crane Hire"
              style={{
                height: 240, // larger logo
                width: "auto",
                display: "block",
              }}
            />
          </header>

          {/* App Shell */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
            }}
          >
            <ClientShell>{children}</ClientShell>
          </div>
        </div>
      </body>
    </html>
  );
}
