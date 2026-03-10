export const metadata = {
  title: "AnnS Crane CRM",
  description: "Enterprise CRM System",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
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
          width: "100%",
          minHeight: "100dvh",
          overflowX: "hidden",
          background:
            "linear-gradient(135deg, rgba(235,245,255,1) 0%, rgba(225,238,255,1) 45%, rgba(243,247,255,1) 100%)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
          WebkitTextSizeAdjust: "100%",
        }}
      >
        {children}
      </body>
    </html>
  );
}
