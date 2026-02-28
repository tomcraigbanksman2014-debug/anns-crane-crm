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
          background: "#bfc1c6",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Entire screen container */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Logo (fixed height area) */}
          <div
            style={{
              textAlign: "center",
              padding: "20px 0",
              flexShrink: 0,
            }}
          >
            <img
              src="/logo.png"
              alt="AnnS Crane Hire"
              style={{
                width: 180,
                height: "auto",
              }}
            />
          </div>

          {/* Centered content area */}
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
