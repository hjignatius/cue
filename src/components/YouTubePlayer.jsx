import { useEffect } from 'react';
import { X } from 'lucide-react';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';

export default function YouTubePlayer({ url, onClose }) {
  const embedUrl = youtubeEmbedUrl(url);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!embedUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl mx-4"
        style={{ aspectRatio: '16/9' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-9 right-0 flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors"
          title="Close (Esc)"
        >
          <X size={15} /> Close
        </button>
        <iframe
          src={embedUrl}
          className="w-full h-full rounded-xl"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          title="YouTube player"
        />
      </div>
    </div>
  );
}
