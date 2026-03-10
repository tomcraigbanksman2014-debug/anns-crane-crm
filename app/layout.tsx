import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AnnS Crane CRM",
  description: "Enterprise CRM System",
  applicationName: "AnnS Crane CRM",
};

export const viewport: Viewport = {
  themeColor: "#2c6fa3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
