import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext({
  user: null,
  isConfigured: false,
  signInWithEmail: async () => {},
  verifyEmailOtp: async () => {},
  signOut: async () => {},
  endedElsewhere: false,
  clearEndedElsewhere: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // A session that ended without this device asking. Under single-seat that is
  // almost always "you signed in somewhere else" — but the client cannot tell
  // that from an expired or revoked token, so what it SAYS is a possibility,
  // not a fact.
  const [endedElsewhere, setEndedElsewhere] = useState(false);
  // Set while this device is deliberately signing itself out, so its own
  // sign-out is not reported back to it as a surprise.
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      // Clean Supabase auth tokens from the URL after the magic-link redirect.
      if (window.location.hash.includes('access_token')) {
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // A SIGNED_OUT this device did not ask for. The old code just set the user
      // to null and moved on, which is why losing a session felt like a fault:
      // you were simply signed out one day, mid-use, with nothing said.
      if (event === 'SIGNED_OUT' && !leavingRef.current) setEndedElsewhere(true);
      if (event === 'SIGNED_IN') setEndedElsewhere(false);
      leavingRef.current = false;
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
  // ONE DEVICE AT A TIME. Signing in here ends every other session on the
  // account — `scope: 'others'` leaves the one just created and revokes the
  // rest. It matches how Howard actually moves between machines (sign out
  // there, sign in here) and makes it a rule rather than a discipline, which
  // means two devices can never both publish the same set.
  //
  // Best-effort on purpose: if the revoke call fails, the sign-in that just
  // succeeded still stands. Being signed in on two devices is a weaker state
  // than being signed in on none.
  async function verifyEmailOtp(email, token) {
    if (!supabase) return;
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    try {
      await supabase.auth.signOut({ scope: 'others' });
    } catch (err) {
      console.warn('[auth] could not sign out other devices', err);
    }
  }

  // SIGN OUT THIS DEVICE, NOT EVERY DEVICE.
  //
  // supabase-js defaults signOut() to scope 'global', which revokes the refresh
  // token for every session the account has open — so signing out on the Mac
  // silently signed Howard out on the iPad and the iPhone too, minutes or hours
  // later, with nothing on screen to connect the two events. Cue signs out one
  // device at a time; there is no "sign out everywhere" in the app, so there is
  // no reason for the only sign-out there is to mean that.
  //
  // 'local' clears this device's stored session and leaves the others alone.
  async function signOut() {
    if (!supabase) return;
    leavingRef.current = true;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) { leavingRef.current = false; throw error; }
  }

  return (
    <AuthContext.Provider value={{
      user, isConfigured: !!supabase, signInWithEmail, verifyEmailOtp, signOut,
      endedElsewhere, clearEndedElsewhere: () => setEndedElsewhere(false),
    }}>
      {children}
    </AuthContext.Provider>
  );
}
