import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Maximize2, Minimize2, Pause, Play, X } from 'lucide-react';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useIsNarrow } from '../hooks/useIsNarrow.js';

const SIZES    = { compact: { w: 320, h: 180 }, large: { w: 480, h: 270 } };
const HEADER_H = 44;
// The Watch-on-YouTube strip under the video. Counted in every position clamp
// below, or the box hangs past the bottom of the screen by exactly this much —
// it is only shown while the video is (so it disappears with it when collapsed).
const FOOTER_H = 27;
const POS_KEY  = 'cue:yt_player_pos';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function loadPersisted() {
  try { return JSON.parse(localStorage.getItem(POS_KEY)) ?? {}; } catch { return {}; }
}

function savePersisted(size, x, y) {
  localStorage.setItem(POS_KEY, JSON.stringify({ size, x, y }));
}

export default function YouTubePlayer() {
  const { url, title, collapsed, closePlayer, collapsePlayer, expandPlayer } = useYouTube();
  const { theme } = usePrefs();
  const dark     = theme === 'dark';
  const isMobile = useIsNarrow(640);

  const [size, setSize] = useState(() => {
    const s = loadPersisted();
    return s.size && SIZES[s.size] ? s.size : 'compact';
  });

  const [pos, setPos] = useState(() => {
    const s  = loadPersisted();
    const sz = s.size && SIZES[s.size] ? s.size : 'compact';
    const { w, h } = SIZES[sz];
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      return {
        x: clamp(s.x, 0, Math.max(0, window.innerWidth  - w)),
        y: clamp(s.y, 0, Math.max(0, window.innerHeight - h - HEADER_H - FOOTER_H)),
      };
    }
    return {
      x: Math.max(0, window.innerWidth  - w  - 16),
      y: Math.max(0, window.innerHeight - h  - HEADER_H - FOOTER_H - 16),
    };
  });

  const [playing, setPlaying] = useState(true);
  // The video's owner does not allow playback outside YouTube. Reported by the
  // player itself; see the listener below.
  const [blocked, setBlocked] = useState(false);
  const iframeRef    = useRef(null);
  const containerRef = useRef(null);
  const dragRef      = useRef(null);

  const embedUrl = youtubeEmbedUrl(url);

  // Reset local playing state whenever a new video URL is loaded (autoplay starts)
  useEffect(() => { if (url) setPlaying(true); setBlocked(false); }, [url]);

  // WHY THIS EXISTS: plenty of videos simply will not play in an iframe, and
  // official music videos — exactly what Fill in song details looks up — are the
  // worst offenders, because labels monetise on youtube.com and switch off
  // playback elsewhere. Until now Cue showed YouTube's own error inside the frame
  // and left it at that, with no way out but closing the overlay.
  //
  // The embed already speaks this protocol — sendCmd below uses it to post
  // play/pause — but only ever talked. Asking to LISTEN as well gets errors back,
  // and 101 and 150 both mean precisely "the owner disallows embedding". (2, 5 and
  // 100 are a bad id, an HTML5 failure and a removed video: real failures, but not
  // ones a link to YouTube would fix, so they are left to the frame to explain.)
  //
  // Belt and braces: the Watch on YouTube link below is shown ALWAYS, not only
  // when this fires. The handshake is an undocumented corner of the player API,
  // and a link that is always there cannot be broken by it changing.
  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== 'https://www.youtube.com') return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      let data;
      try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (data?.event === 'onError' && (data.info === 101 || data.info === 150)) setBlocked(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Start the event stream. Until this is posted the player only receives.
  function startListening() {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      'https://www.youtube.com',
    );
  }

  // Clamp position when window resizes
  useEffect(() => {
    function onResize() {
      const { w, h } = SIZES[size];
      setPos(p => ({
        x: clamp(p.x, 0, Math.max(0, window.innerWidth  - w)),
        y: clamp(p.y, 0, Math.max(0, window.innerHeight - h - HEADER_H - FOOTER_H)),
      }));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [size]);

  function sendCmd(func) {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      'https://www.youtube.com',
    );
  }

  function togglePlayPause() {
    sendCmd(playing ? 'pauseVideo' : 'playVideo');
    setPlaying(p => !p);
  }

  function toggleSize() {
    const newSize = size === 'compact' ? 'large' : 'compact';
    const { w, h } = SIZES[newSize];
    const newPos = {
      x: clamp(pos.x, 0, Math.max(0, window.innerWidth  - w)),
      y: clamp(pos.y, 0, Math.max(0, window.innerHeight - h - HEADER_H - FOOTER_H)),
    };
    setSize(newSize);
    setPos(newPos);
    savePersisted(newSize, newPos.x, newPos.y);
  }

  function onPointerDown(e) {
    if (isMobile) return;
    if (e.target.closest('button') || e.target.tagName === 'IFRAME') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const { w, h } = SIZES[size];
    const totalH = (collapsed ? 0 : h + FOOTER_H) + HEADER_H;
    const newPos = {
      x: clamp(dragRef.current.ox + e.clientX - dragRef.current.sx, 0, Math.max(0, window.innerWidth  - w)),
      y: clamp(dragRef.current.oy + e.clientY - dragRef.current.sy, 0, Math.max(0, window.innerHeight - totalH)),
    };
    dragRef.current.lastPos = newPos;
    setPos(newPos);
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    const lastPos = dragRef.current.lastPos;
    dragRef.current = null;
    if (lastPos) savePersisted(size, lastPos.x, lastPos.y);
  }

  if (!url || !embedUrl) return null;

  const { w, h } = SIZES[size];
  const videoW   = isMobile ? '100%' : w;
  const videoH   = isMobile ? Math.round(window.innerWidth * 9 / 16) : h;

  const containerStyle = isMobile
    ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9980 }
    : { position: 'fixed', left: pos.x, top: pos.y, width: w, zIndex: 9980 };

  const bg     = dark ? 'bg-gray-900'     : 'bg-white';
  const border = dark ? 'border-gray-700' : 'border-gray-200';
  const text   = dark ? 'text-gray-100'   : 'text-gray-800';
  const hover  = dark ? 'hover:bg-white/10' : 'hover:bg-black/10';
  const iconBtn = `flex items-center justify-center w-11 h-11 rounded-lg transition-colors shrink-0 ${text} ${hover}`;

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={`${bg} border ${border} ${isMobile ? 'rounded-t-xl' : 'rounded-xl'} shadow-2xl overflow-hidden flex flex-col select-none`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Toolbar — always visible; content varies by state */}
      <div
        className={`flex items-center gap-1 px-2 flex-shrink-0 ${!isMobile ? 'cursor-move' : ''}`}
        style={{ height: HEADER_H }}
      >
        <span className={`flex-1 truncate text-xs font-medium ${text} min-w-0 pr-1`} title={title || undefined}>
          {title || 'YouTube'}
        </span>

        {/* Play/Pause — collapsed only */}
        {collapsed && (
          <button onClick={togglePlayPause} className={iconBtn} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={12} strokeWidth={2.5} /> : <Play size={12} strokeWidth={2.5} />}
          </button>
        )}

        {/* Size toggle — expanded + desktop only */}
        {!collapsed && !isMobile && (
          <button onClick={toggleSize} className={iconBtn} title={size === 'compact' ? 'Larger video' : 'Smaller video'}>
            {size === 'compact' ? <Maximize2 size={12} strokeWidth={2.5} /> : <Minimize2 size={12} strokeWidth={2.5} />}
          </button>
        )}

        {/* Expand / Collapse */}
        <button
          onClick={collapsed ? expandPlayer : collapsePlayer}
          className={iconBtn}
          title={collapsed ? 'Expand video' : 'Collapse to audio'}
        >
          {collapsed
            ? <ChevronUp   size={14} strokeWidth={2.5} />
            : <ChevronDown size={14} strokeWidth={2.5} />
          }
        </button>

        {/* Close */}
        <button onClick={closePlayer} className={iconBtn} title="Close">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* iframe wrapper — always mounted; height:0 clips video while audio continues */}
      <div
        style={{
          width: videoW,
          height: collapsed ? 0 : videoH,
          overflow: 'hidden',
          flexShrink: 0,
          pointerEvents: collapsed ? 'none' : 'auto',
          transition: 'height 0.15s ease',
        }}
      >
        <iframe
          ref={iframeRef}
          src={embedUrl}
          onLoad={startListening}
          style={{ width: videoW, height: videoH, display: 'block' }}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          title="YouTube player"
        />
      </div>

      {/* The way out. Always present while the video is showing: a blocked video
          is otherwise a dead end, and nothing can tell in advance which videos
          those are — whether a video may be embedded is not in search results,
          so even a perfect link the AI finds may be unplayable here. */}
      {!collapsed && (
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] border-t ${
            dark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
          }`}
          style={{ width: videoW }}
        >
          {blocked && (
            <span className="min-w-0 truncate text-amber-600 dark:text-amber-400" title="The owner of this video does not allow it to play outside YouTube.">
              Owner blocks playback here
            </span>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`ml-auto shrink-0 inline-flex items-center gap-1 font-medium ${
              dark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'
            }`}
          >
            <ExternalLink size={11} /> Watch on YouTube
          </a>
        </div>
      )}
    </div>
  );
}
