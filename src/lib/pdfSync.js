// PDF cloud-sync. The PDF bytes for a 'pdf' song ride through Supabase Storage
// alongside the song row's normal sync: uploaded on publish (guarded so bytes
// aren't re-pushed every time) and downloaded on pull when missing locally.
//
// The bucket 'song-pdfs' is PRIVATE; owner access is by RLS keyed on the path's
// first segment ({owner_id}/{songId}.pdf). The owner reads/writes their own
// objects directly. Stage 2 added an ADDITIVE read policy on the SAME bucket
// (supabase/stage2-shared-pdf-read.sql) that lets a SHARED viewer read a
// published set's objects — so downloadPdfBlob(songId, ownerId) below serves
// both the owner's own pull AND a shared viewer's fetch (the viewer passes the
// owner id, which the published song content carries as `ownerId`).

import { supabase } from './supabase.js';
import { loadPdfBlob, savePdfBlob } from '../utils/storage.js';

const BUCKET = 'song-pdfs';

// Storage path for a song's PDF. STAGE 2 NOTE: cross-owner copy re-ids the song
// (reidSong), so a copied PDF lands at a NEW {owner}/{songId} path — Stage 2 will
// decide duplicate-bytes vs reference-original. Nothing here hard-codes that.
function pdfPath(ownerId, songId) {
  return `${ownerId}/${songId}.pdf`;
}

// Upload a song's local PDF Blob to Storage (owner path). Throws on failure so
// the caller can surface a LOUD retry state — a row synced with no bytes behind
// it must never pass silently. upsert:true so a re-import overwrites cleanly.
export async function uploadPdfBlob(songId, ownerId) {
  if (!supabase) throw new Error('Supabase not configured');
  const blob = await loadPdfBlob(songId);
  if (!blob) throw new Error(`No local PDF to upload for song ${songId}`);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(pdfPath(ownerId, songId), blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
}

// Download a pdf song's bytes from Storage into the local 'pdfs' store. Throws on
// failure so pull-if-missing can keep the fail-soft placeholder + offer a retry.
export async function downloadPdfBlob(songId, ownerId) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.storage.from(BUCKET).download(pdfPath(ownerId, songId));
  if (error) throw error;
  if (!data) throw new Error(`No PDF bytes returned for song ${songId}`);
  await savePdfBlob(songId, data);
}
