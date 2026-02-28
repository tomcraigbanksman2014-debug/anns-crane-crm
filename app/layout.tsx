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
          overflow: "hidden", // ✅ kills the page scrollbar
        }}
      >
        {/* Full-screen app shell */}
        <div
          style={{
            height: "100vh", // exact viewport height
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Logo header (fixed height) */}
          <header
            style={{
              height: 200, // adjust if you want bigger/smaller logo space
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              src="/logo.png"
              alt="AnnS Crane Hire"
              style={{
                maxHeight: 160,
                width: "auto",
                display: "block",
              }}
            />
          </header>

          {/* Page content fills remaining space perfectly */}
          <main
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              boxSizing: "border-box",
              overflow: "hidden", // ✅ prevents main from causing body scroll
            }}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
