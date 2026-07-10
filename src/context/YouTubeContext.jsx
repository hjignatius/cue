import { createContext, useCallback, useContext, useState } from 'react';

const YouTubeContext = createContext(null);

export function YouTubeProvider({ children }) {
  const [url, setUrl]             = useState(null);
  const [title, setTitle]         = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const openPlayer = useCallback((newUrl, newTitle) => {
    setUrl(newUrl);
    setTitle(newTitle || '');
    setCollapsed(false);
  }, []);

  const closePlayer    = useCallback(() => setUrl(null), []);
  const collapsePlayer = useCallback(() => setCollapsed(true), []);
  const expandPlayer   = useCallback(() => setCollapsed(false), []);

  return (
    <YouTubeContext.Provider value={{ url, title, collapsed, openPlayer, closePlayer, collapsePlayer, expandPlayer }}>
      {children}
    </YouTubeContext.Provider>
  );
}

export function useYouTube() {
  return useContext(YouTubeContext);
}
