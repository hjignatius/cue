import { useEffect, useRef, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { KEY_NAMES } from '../utils/transpose.js';

const RESET_AFTER_MS = 3000;
const MIN_TAPS = 2;

function playMetronome(bpmVal, timeSig = '4/4') {
  if (!bpmVal) return;
  const beatsPerMeasure = timeSig === '3/4' ? 3 : 4;
  const totalBeats = beatsPerMeasure * 2;
  const interval = 60 / bpmVal;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  for (let i = 0; i < totalBeats; i++) {
    const isAccent = i % beatsPerMeasure === 0;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = isAccent ? 1000 : 700;
    gain.gain.setValueAtTime(isAccent ? 1 : 0.55, ctx.currentTime + i * interval);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * interval + 0.05);
    osc.start(ctx.currentTime + i * interval);
    osc.stop(ctx.currentTime + i * interval + 0.05);
  }
}

function TapTempo({ bpm, onBpm, timeSig, onTimeSig }) {
  const tapsRef = useRef([]);
  const timerRef = useRef(null);
  const [display, setDisplay] = useState(null);

  function handleTap() {
    const now = Date.now();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { tapsRef.current = []; setDisplay(null); }, RESET_AFTER_MS);
    tapsRef.current.push(now);
    if (tapsRef.current.length < MIN_TAPS) { setDisplay('...'); return; }
    let total = 0;
    for (let i = 1; i < tapsRef.current.length; i++) total += tapsRef.current[i] - tapsRef.current[i - 1];
    const val = Math.round(60000 / (total / (tapsRef.current.length - 1)));
    setDisplay(val);
    onBpm(String(val));
  }

  const previewBpm = Number(display || bpm || 120);

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onPointerDown={handleTap}
        className="px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-400 select-none touch-none transition-colors"
        title="Tap in rhythm to set BPM"
      >
        {display === null ? 'Tap' : display === '...' ? '...' : `${display}`}
      </button>
      <button
        type="button"
        onClick={() => playMetronome(previewBpm, timeSig)}
        className="px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
        title={`Preview tempo (${timeSig})`}
      >
        ▶
      </button>
      <button
        type="button"
        onClick={() => onTimeSig(timeSig === '4/4' ? '3/4' : '4/4')}
        className="px-2 py-1 text-xs font-mono font-bold rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
        title="Toggle time signature"
      >
        {timeSig}
      </button>
    </div>
  );
}

function DurationStepper({ value, onChange }) {
  const intervalRef  = useRef(null);
  const timeoutRef   = useRef(null);
  const startTimeRef = useRef(0);
  const valueRef     = useRef(value);
  valueRef.current   = value;

  function parseDuration(str) {
    if (!str?.trim()) return 0;
    const parts = String(str).split(':');
    if (parts.length === 2) return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    return parseInt(str, 10) || 0;
  }

  function formatDuration(secs) {
    secs = Math.max(0, Math.round(secs));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }

  function doStep(dir) {
    const held = Date.now() - startTimeRef.current;
    const inc  = held > 4000 ? 10 : held > 2000 ? 5 : 1;
    onChange(formatDuration(parseDuration(valueRef.current) + dir * inc));
  }

  function startHold(e, dir) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startTimeRef.current = Date.now();
    doStep(dir);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => doStep(dir), 150);
    }, 400);
  }

  function stopHold() {
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);
  }

  const btnCls = 'px-3 py-2.5 text-sm font-bold rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-400 select-none touch-none transition-colors';

  return (
    <div className="flex items-center gap-1">
      <button type="button" onPointerDown={e => startHold(e, -1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold} className={btnCls} title="Decrease duration">−</button>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="3:30"
        size={5}
        className="bg-transparent border-b border-gray-300 dark:border-gray-700 focus:border-indigo-500 outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 py-0.5 text-center transition-colors"
      />
      <button type="button" onPointerDown={e => startHold(e, 1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold} className={btnCls} title="Increase duration">+</button>
    </div>
  );
}

export default function MetadataForm({ metadata, onChange, onDetectKey }) {
  function set(key, val) { onChange(prev => ({ ...prev, [key]: val })); }

  const [hints, setHints]         = useState([]);
  const [detecting, setDetecting] = useState(false);
  const popoverRef                = useRef(null);

  useEffect(() => {
    if (!hints.length) return;
    function handleClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setHints([]);
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [hints.length]);

  async function handleDetect() {
    if (!onDetectKey) return;
    setDetecting(true);
    const results = onDetectKey();
    setDetecting(false);
    if (!results.length) { alert('No chords found in this song.'); return; }
    if (results.length === 1 || results[0].pct >= 90) {
      set('key', results[0].name);
    } else {
      setHints(results);
    }
  }

  const inputCls = 'bg-transparent border-b border-gray-300 dark:border-gray-700 focus:border-indigo-500 outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 py-0.5 w-full transition-colors';

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      {/* Artist */}
      <div className="flex flex-col gap-0.5 min-w-32">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Artist</label>
        <input
          value={metadata.artist || ''}
          onChange={e => set('artist', e.target.value)}
          placeholder="Artist name"
          className={inputCls}
        />
      </div>

      {/* Source key */}
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Key</label>
        <div className="flex items-center gap-1">
          <select
            value={metadata.key || ''}
            onChange={e => set('key', e.target.value)}
            className="bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 focus:border-indigo-500 outline-none text-sm text-gray-900 dark:text-white py-0.5 pr-4 transition-colors cursor-pointer"
          >
            <option value="">—</option>
            {KEY_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {onDetectKey && (
            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                onClick={handleDetect}
                disabled={detecting}
                title="Auto-detect key from chords"
                className="p-0.5 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors disabled:opacity-40"
              >
                <Wand2 size={13} />
              </button>
              {hints.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-28">
                  <p className="px-3 pt-0.5 pb-1 text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">Best matches</p>
                  {hints.map(h => (
                    <button
                      key={h.name}
                      type="button"
                      onClick={() => { set('key', h.name); setHints([]); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                    >
                      <span className="font-medium">{h.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-3">{h.pct}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tempo */}
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Tempo (BPM)</label>
        <div className="flex items-center gap-1.5">
          <input
            value={metadata.tempo || ''}
            onChange={e => set('tempo', e.target.value)}
            placeholder="120"
            size={4}
            className="bg-transparent border-b border-gray-300 dark:border-gray-700 focus:border-indigo-500 outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 py-0.5 transition-colors"
          />
          <TapTempo
            bpm={metadata.tempo}
            onBpm={v => set('tempo', v)}
            timeSig={metadata.timeSig || '4/4'}
            onTimeSig={v => set('timeSig', v)}
          />
        </div>
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Duration (M:SS)</label>
        <DurationStepper value={metadata.duration || ''} onChange={v => set('duration', v)} />
      </div>

      {/* YouTube URL */}
      <div className="flex flex-col gap-0.5 min-w-48 flex-1">
        <label className="text-xs text-gray-500 uppercase tracking-wide">YouTube URL</label>
        <input
          value={metadata.youtubeUrl || ''}
          onChange={e => set('youtubeUrl', e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
          className={`${inputCls}`}
        />
      </div>
    </div>
  );
}
