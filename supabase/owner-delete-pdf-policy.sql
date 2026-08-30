-- Let an owner DELETE their own PDF objects, so unpublish/delete can clean up
-- Storage instead of leaving orphans. Run ONCE in the Supabase SQL editor.
--
-- The app never deleted Storage objects before, so a DELETE policy likely doesn't
-- exist yet — without it, removePdfObjects() is silently denied (it's best-effort
-- and never throws, so unpublish still succeeds, it just doesn't clean up).
-- Objects live at {owner_id}/{songId}.pdf, so the owner is the first path folder.

create policy "owner delete own pdfs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'song-pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- To remove later:
--   drop policy "owner delete own pdfs" on storage.objects;
