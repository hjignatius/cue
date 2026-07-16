import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext({
  user: null,
  isConfigured: false,
  signInWithEmail: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      // Clean Supabase auth tokens from the URL after the magic-link redirect.
      if (window.location.hash.includes('access_token')) {
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithEmail(email) {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // shouldCreateUser is defense-in-depth: signups are disabled in the
      // Supabase dashboard, and that setting is the real enforcement.
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{ user, isConfigured: !!supabase, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
