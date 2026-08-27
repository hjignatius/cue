// Lazy PDF.js loader. Dynamically imported ONLY when a pdf song opens, so the
// pdfjs chunk never lands in the text-path bundle. The worker is a BUNDLED LOCAL
// asset (Vite ?url import), never a CDN — required for the strict-CSP offline
// PWA. (Stage 1b: the hand-rolled service worker must precache pdfjs' hashed
// chunk AND this worker file via the build manifest so PDFs render offline.)

let _pdfjsPromise = null;

export function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}
