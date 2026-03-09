import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AnnS Crane CRM",
  description: "Enterprise CRM System",
  applicationName: "AnnS Crane CRM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AnnS Crane CRM",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#e9f3ff",
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
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
