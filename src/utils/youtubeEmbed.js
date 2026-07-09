// Parse any common YouTube URL and return an embed URL, or null if invalid.
export function youtubeEmbedUrl(rawUrl) {
  if (!rawUrl?.trim()) return null;
  try {
    const u = new URL(rawUrl.trim());
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const params = new URLSearchParams({ rel: '0', autoplay: '1' });

    if (host === 'youtu.be') {
      const videoId = u.pathname.slice(1).split('/')[0];
      if (!videoId) return null;
      const t = u.searchParams.get('t');
      if (t) params.set('start', parseInt(t, 10));
      return `https://www.youtube.com/embed/${videoId}?${params}`;
    }

    if (host === 'youtube.com') {
      const v    = u.searchParams.get('v');
      const list = u.searchParams.get('list');
      const t    = u.searchParams.get('t');

      // Playlist-only URL
      if (!v && list) {
        params.set('listType', 'playlist');
        params.set('list', list);
        return `https://www.youtube.com/embed?${params}`;
      }

      // Video (optionally with playlist)
      if (v) {
        if (t) params.set('start', parseInt(t, 10));
        if (list) params.set('list', list);
        return `https://www.youtube.com/embed/${v}?${params}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}
