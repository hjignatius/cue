import { useState, useRef } from 'react';

export default function ResizeHandle({ handleProps, dark }) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(null);

  function showTab() {
    clearTimeout(hideTimer.current);
    setVisible(true);
  }

  function scheduleHide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 1500);
  }

  function onPointerDown(e) {
    showTab();
    handleProps.onPointerDown(e);
  }

  function onPointerUp(e) {
    scheduleHide();
    handleProps.onPointerUp(e);
  }

  function onPointerCancel() {
    scheduleHide();
  }

  const barColor = visible
    ? (dark ? 'bg-indigo-500' : 'bg-indigo-400')
    : (dark ? 'bg-gray-800 group-hover:bg-indigo-600' : 'bg-gray-200 group-hover:bg-indigo-500');

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={handleProps.onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ width: 12, touchAction: 'none', flexShrink: 0 }}
      className="group relative cursor-col-resize select-none overflow-visible"
    >
      {/* Thin visual line */}
      <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] transition-colors ${barColor}`} />

    </div>
  );
}
