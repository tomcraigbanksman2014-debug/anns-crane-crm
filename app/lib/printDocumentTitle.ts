export function cleanPrintDocumentTitle(value: string | null | undefined, fallback = "AnnS Crane CRM") {
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .trim()
    .replace(/^[-. ]+|[-. ]+$/g, "");

  return cleaned || fallback;
}

type PrintTitleOptions = {
  /**
   * Mac/Safari/Chrome can read document.title late when the Save as PDF dialog opens.
   * Keep the title in place long enough so it does not fall back to "AnnS CRM".
   */
  restoreAfterMs?: number;
};

export function setPrintDocumentTitle(title: string | null | undefined, fallback = "AnnS Crane CRM") {
  if (typeof window === "undefined") return cleanPrintDocumentTitle(title, fallback);

  const nextTitle = cleanPrintDocumentTitle(title, fallback);
  document.title = nextTitle;
  return nextTitle;
}

export function printWithDocumentTitle(title: string | null | undefined, options: PrintTitleOptions = {}) {
  if (typeof window === "undefined") return;

  const nextTitle = cleanPrintDocumentTitle(title);
  const previousTitle = document.title;
  const restoreAfterMs = Math.max(30000, options.restoreAfterMs ?? 120000);

  document.title = nextTitle;

  let restoreQueued = false;
  const restoreTitle = () => {
    if (restoreQueued) return;
    restoreQueued = true;

    window.setTimeout(() => {
      if (document.title === nextTitle) {
        document.title = previousTitle || "AnnS Crane CRM";
      }
    }, restoreAfterMs);
  };

  window.addEventListener("afterprint", restoreTitle, { once: true });
  window.setTimeout(() => window.print(), 250);
  window.setTimeout(restoreTitle, restoreAfterMs + 1000);
}
