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
          background: "#cfcfd3",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Logo */}
        <div
          style={{
            textAlign: "center",
            paddingTop: 30,
          }}
        >
          <img
            src="/logo.png"
            alt="AnnS Crane Hire"
            style={{
              width: 200,
              height: "auto",
            }}
          />
        </div>

        {/* Page content centered */}
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
      </body>
    </html>
  );
}
