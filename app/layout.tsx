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
          background: "#bfc1c6", // match your logo background
          overflow: "hidden", // no scrollbars
        }}
      >
        <div
          style={{
            position: "relative",
            height: "100vh",
            width: "100vw",
          }}
        >
          {/* Logo overlay (does NOT affect layout) */}
          <div
            style={{
              position: "absolute",
              top: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <img
              src="/logo.png"
              alt="Anns Crane Hire"
              style={{
                width: 260, // 👈 change this number to make it bigger/smaller
                height: "auto",
                display: "block",
              }}
            />
          </div>

          {/* Page content stays perfectly centered */}
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              padding: 24,
              boxSizing: "border-box",
            }}
          >
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
