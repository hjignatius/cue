// PDF cloud-sync SEAM — Stage 1b, NOT IMPLEMENTED in Stage 1a.
//
// In Stage 1a the PDF Blob is PURELY LOCAL (IndexedDB 'pdfs' store). No Supabase
// Storage bucket, no upload, no download, no signed URLs exist yet. These
// functions are deliberate, LOUD not-implemented markers so that "cloud isn't
// wired yet" can never be mistaken for "cloud broke" once 1b turns it on: they
// throw a clearly-labelled error rather than silently succeeding or no-op'ing.
//
// Callers in Stage 1a must NOT invoke these on the normal local path. They exist
// so the wiring points are named and greppable for 1b.

export class PdfSyncNotWiredError extends Error {
  constructor(op) {
    super(`[pdfSync] "${op}" is a Stage 1b feature and is NOT wired yet. ` +
          `The PDF exists only locally in IndexedDB. This is expected in Stage 1a — ` +
          `it is NOT a cloud failure. Do not call ${op} until Stage 1b lands.`);
    this.name = 'PdfSyncNotWiredError';
    this.op = op;
  }
}

// Upload a local PDF Blob to cloud Storage and return its storage ref. (1b)
export async function uploadPdfBlob(/* songId, blob, userId */) {
  throw new PdfSyncNotWiredError('uploadPdfBlob');
}

// Download a pdf song's Blob from cloud Storage when it's missing locally. (1b)
export async function downloadPdfBlob(/* songId, ref */) {
  throw new PdfSyncNotWiredError('downloadPdfBlob');
}

// Ensure a pdf song's Blob is present locally, fetching from cloud if not. (1b)
export async function syncPdfBlob(/* song */) {
  throw new PdfSyncNotWiredError('syncPdfBlob');
}
