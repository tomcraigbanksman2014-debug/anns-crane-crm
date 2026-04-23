const mobileSafetyCss = `
* { box-sizing: border-box; }
html, body { width: 100%; max-width: 100%; overflow-x: hidden; }
body { overscroll-behavior-x: none; }

@media (max-width: 900px) {
  [data-mobile-safe-root],
  [data-mobile-safe-root] * {
    min-width: 0;
  }

  [data-mobile-safe-root] {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  [data-mobile-safe-root] img,
  [data-mobile-safe-root] svg,
  [data-mobile-safe-root] canvas,
  [data-mobile-safe-root] video,
  [data-mobile-safe-root] iframe {
    max-width: 100% !important;
    height: auto;
  }

  [data-mobile-safe-root] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  [data-mobile-safe-root] select,
  [data-mobile-safe-root] textarea {
    max-width: 100% !important;
    box-sizing: border-box !important;
  }

  [data-mobile-safe-root] textarea {
    width: 100% !important;
  }

  [data-mobile-safe-root] button,
  [data-mobile-safe-root] a {
    max-width: 100%;
  }

  [data-mobile-safe-root] table {
    display: block;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  [data-mobile-safe-root] th,
  [data-mobile-safe-root] td {
    white-space: normal;
    word-break: break-word;
  }

  [data-mobile-safe-root] [style*="display: flex"][style*="justify-content: space-between"] {
    flex-wrap: wrap !important;
  }

  [data-mobile-safe-root] [style*="display:flex"][style*="justify-content: space-between"] {
    flex-wrap: wrap !important;
  }

  [data-mobile-safe-root]:not([data-mobile-page-kind="planner"]) [style*="grid-template-columns"] {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [data-mobile-safe-root]:not([data-mobile-page-kind="planner"]) [style*="min-width"] {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  [data-mobile-safe-root] [style*="width: min("] {
    width: 100% !important;
    max-width: 100% !important;
  }

  [data-mobile-safe-root] [style*="width:min("] {
    width: 100% !important;
    max-width: 100% !important;
  }

  [data-mobile-safe-root][data-mobile-page-kind="planner"] [style*="min-width"] {
    max-width: none !important;
  }

  [data-mobile-safe-root][data-mobile-page-kind="planner"] [style*="overflow-x: auto"],
  [data-mobile-safe-root][data-mobile-page-kind="planner"] [style*="overflow-x:auto"] {
    -webkit-overflow-scrolling: touch;
  }
}
`;

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
        <style dangerouslySetInnerHTML={{ __html: mobileSafetyCss }} />
        {children}
      </body>
    </html>
  );
}
