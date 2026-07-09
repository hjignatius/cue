import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrefsProvider } from './context/PrefsContext.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrefsProvider>
      <App />
    </PrefsProvider>
  </StrictMode>,
);
