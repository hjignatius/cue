import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Pause, Play, X } from 'lucide-react';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useIsNarrow } from '../hooks/useIsNarrow.js';

const SIZES    = { compact: { w: 320, h: 180 }, large: { w: 480, h: 270 } };
const HEADER_H = 36;
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
        y: clamp(s.y, 0, Math.max(0, window.innerHeight - h - HEADER_H)),
      };
    }
    return {
      x: Math.max(0, window.innerWidth  - w  - 16),
      y: Math.max(0, window.innerHeight - h  - HEADER_H - 16),
    };
  });

  const [playing, setPlaying] = useState(true);
  const iframeRef    = useRef(null);
  const containerRef = useRef(null);
  const dragRef      = useRef(null);

  const embedUrl = youtubeEmbedUrl(url);

  // Reset local playing state whenever a new video URL is loaded (autoplay starts)
  useEffect(() => { if (url) setPlaying(true); }, [url]);

  // Clamp position when window resizes
  useEffect(() => {
    function onResize() {
      const { w, h } = SIZES[size];
      setPos(p => ({
        x: clamp(p.x, 0, Math.max(0, window.innerWidth  - w)),
        y: clamp(p.y, 0, Math.max(0, window.innerHeight - h - HEADER_H)),
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
      y: clamp(pos.y, 0, Math.max(0, window.innerHeight - h - HEADER_H)),
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
    const totalH = (collapsed ? 0 : h) + HEADER_H;
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
  const iconBtn = `flex items-center justify-center w-7 h-7 rounded-lg transition-colors shrink-0 ${text} ${hover}`;

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
          style={{ width: videoW, height: videoH, display: 'block' }}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          title="YouTube player"
        />
      </div>
    </div>
  );
}
