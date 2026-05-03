const mobileSafetyCss = `
* { box-sizing: border-box; }
html, body { width: 100%; max-width: 100%; overflow-x: hidden; }
body { overscroll-behavior-x: none; }

@media (max-width: 900px) {
  html, body { overflow-x: hidden; }

  [data-mobile-safe-root],
  [data-mobile-safe-root] * {
    min-width: 0;
  }

  [data-mobile-safe-root] {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  [data-mobile-safe-root] > * {
    max-width: 100%;
  }

  [data-mobile-safe-root] h1 {
    font-size: clamp(28px, 9vw, 42px) !important;
    line-height: 1.08 !important;
  }

  [data-mobile-safe-root] h2 {
    font-size: clamp(22px, 7vw, 32px) !important;
    line-height: 1.12 !important;
  }

  [data-mobile-safe-root] h3 {
    font-size: clamp(18px, 6vw, 24px) !important;
    line-height: 1.18 !important;
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
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: 44px;
    font-size: 16px !important;
  }

  [data-mobile-safe-root] textarea {
    min-height: 96px;
  }

  [data-mobile-safe-root] button,
  [data-mobile-safe-root] a {
    max-width: 100%;
  }

  [data-mobile-safe-root] button,
  [data-mobile-safe-root] a[style*="padding"] {
    min-height: 42px;
  }

  [data-mobile-safe-root] [style*="display: flex"],
  [data-mobile-safe-root] [style*="display:flex"] {
    flex-wrap: wrap !important;
  }

  [data-mobile-safe-root]:not([data-mobile-page-kind="planner"]) [style*="grid-template-columns"] {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [data-mobile-safe-root] [style*="width: min("],
  [data-mobile-safe-root] [style*="width:min("],
  [data-mobile-safe-root] [style*="max-width: min("],
  [data-mobile-safe-root] [style*="max-width:min("],
  [data-mobile-safe-root] [style*="96vw"] {
    width: 100% !important;
    max-width: 100% !important;
  }

  [data-mobile-safe-root]:not([data-mobile-page-kind="planner"]) [style*="min-width"]:not(table):not(th):not(td) {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  [data-mobile-safe-root] [style*="overflow-x: auto"],
  [data-mobile-safe-root] [style*="overflow-x:auto"] {
    max-width: 100% !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
  }

  /* Generic CRM table protection: on phones, tables should scroll sideways,
     never compress columns until headings become vertical letters. */
  [data-mobile-safe-root] table {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
    border-collapse: collapse;
    white-space: nowrap;
  }

  [data-mobile-safe-root] thead,
  [data-mobile-safe-root] tbody,
  [data-mobile-safe-root] tr {
    width: max-content;
  }

  [data-mobile-safe-root] th,
  [data-mobile-safe-root] td {
    white-space: normal !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
    min-width: 128px !important;
    max-width: 320px;
    vertical-align: top;
  }

  [data-mobile-safe-root] th:last-child,
  [data-mobile-safe-root] td:last-child {
    min-width: 140px !important;
  }

  [data-mobile-safe-root][data-mobile-page-kind="planner"] {
    overflow-x: auto !important;
  }

  [data-mobile-safe-root][data-mobile-page-kind="planner"] [style*="min-width"],
  [data-mobile-safe-root][data-mobile-page-kind="planner"] [style*="grid-template-columns"] {
    max-width: none !important;
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
