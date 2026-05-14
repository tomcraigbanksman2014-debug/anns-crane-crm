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

export function printWithDocumentTitle(title: string | null | undefined) {
  if (typeof window === "undefined") return;

  const nextTitle = cleanPrintDocumentTitle(title);
  const previousTitle = document.title;
  document.title = nextTitle;

  const restoreTitle = () => {
    window.setTimeout(() => {
      if (document.title === nextTitle) {
        document.title = previousTitle || "AnnS Crane CRM";
      }
    }, 500);
  };

  window.addEventListener("afterprint", restoreTitle, { once: true });
  window.setTimeout(() => window.print(), 0);
}
