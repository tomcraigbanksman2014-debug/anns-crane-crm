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
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui",
          background: "#cfcfd3", // light grey like your screenshot
          minHeight: "100vh",
        }}
      >
        {/* Brand header shown on every page */}
        <header
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: 48,
            paddingBottom: 24,
          }}
        >
          <img
            src="/logo.png"
            alt="AnnS Crane Hire"
            style={{
              width: 260,
              maxWidth: "70vw",
              height: "auto",
              display: "block",
            }}
          />
        </header>

        {/* Page content */}
        <div style={{ padding: 24 }}>{children}</div>
      </body>
    </html>
  );
}
