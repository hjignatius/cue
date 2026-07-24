import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext({
  user: null,
  isConfigured: false,
  signInWithEmail: async () => {},
  verifyEmailOtp: async () => {},
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

  // Sends the sign-in email. The template carries BOTH a {{ .Token }} code and a
  // {{ .ConfirmationURL }} link, so emailRedirectTo stays — the link still works
  // on desktop. In the iOS Home Screen PWA the link is useless (Safari opens it
  // and writes the session into Safari's storage container, not the installed
  // app's), which is why the in-app code path exists.
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

  // Exchanges the emailed 6-digit code for a session, in-app — no browser
  // handoff. type: 'email' is the value for a code sent by signInWithOtp; see
  // @supabase/auth-js GoTrueClient.d.ts, which also marks 'magiclink' deprecated.
  // onAuthStateChange picks up the new session, so nothing else needs to change.
  async function verifyEmailOtp(email, token) {
    if (!supabase) return;
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{ user, isConfigured: !!supabase, signInWithEmail, verifyEmailOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
