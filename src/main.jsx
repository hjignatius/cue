import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PrefsProvider } from './context/PrefsContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import SharedSetView from './views/SharedSetView.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <PrefsProvider>
        <AuthProvider>
          <Routes>
            <Route path="/shared/:token" element={<SharedSetView />} />
            <Route path="/*" element={<App />} />
          </Routes>
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  </StrictMode>,
);
