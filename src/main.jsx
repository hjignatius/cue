import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PrefsProvider } from './context/PrefsContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { YouTubeProvider } from './context/YouTubeContext.jsx';
import YouTubePlayer from './components/YouTubePlayer.jsx';
import App from './App.jsx';
import SharedSetView from './views/SharedSetView.jsx';
import { registerSw } from './swUpdate.js';

// Offline launch + user-controlled updates. Registers public/sw.js on window
// load; never reloads without a user tap (see swUpdate.js).
registerSw();

// iOS/iPadOS only paints :active (and Tailwind's active:/group-active:) styles
// during a tap when the document carries a touch listener. Without this, press
// feedback — the round buttons' scale, the menu highlights — silently never
// shows on iPad. One empty passive listener is enough to enable it globally.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <PrefsProvider>
        <AuthProvider>
          <YouTubeProvider>
            <Routes>
              <Route path="/shared/:token" element={<SharedSetView />} />
              <Route path="/*" element={<App />} />
            </Routes>
            <YouTubePlayer />
          </YouTubeProvider>
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  </StrictMode>,
);
