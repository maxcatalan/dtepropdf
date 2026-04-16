import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still loading, null = not signed in, object = signed in
  const [session, setSession] = useState(undefined);
  const [credits, setCredits] = useState({ ocr: 0, xml: 0 });

  const fetchCredits = useCallback(async (currentSession) => {
    if (!currentSession) { setCredits({ ocr: 0, xml: 0 }); return; }
    try {
      const res = await fetch('/api/credits', {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCredits({ ocr: data.ocr_credits ?? 0, xml: data.xml_credits ?? 0 });
      }
    } catch { /* network error — keep current credits */ }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null);
      fetchCredits(s ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      fetchCredits(s ?? null);
    });

    return () => subscription.unsubscribe();
  }, [fetchCredits]);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signUp = (email, password) =>
    supabase.auth.signUp({ email, password });

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading: session === undefined,
      credits,
      refreshCredits: () => fetchCredits(session),
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
