import React, { ReactNode, useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { UserProvider, useUser } from './UserContext';
import { ProjectProvider } from './ProjectContext';
import { CreditsProvider } from './CreditsContext';
import { ChatProvider } from './ChatContext';
import { GenerationProvider } from './GenerationContext';
import { supabase } from '../lib/supabaseClient';
import { readStorage, writeStorage } from '../lib/storage';

interface AppStateProviderProps {
  children: ReactNode;
  /**
   * Forwarded to <AuthProvider>. The prerenderer passes `false` so public
   * pages render their real markup instead of the "Loading..." gate.
   */
  initialLoading?: boolean;
}

function AuthHydrator({ children }: { children: ReactNode }) {
  const { setAuth, setLoading } = useAuth();
  const { setUser } = useUser();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Initialize guest session: persist sessionId to localStorage and Supabase
        const SESSION_ID_KEY = 'easypeasy_session_id';
        let sessionId = readStorage(SESSION_ID_KEY);
        if (!sessionId) {
          sessionId = crypto.randomUUID();
          writeStorage(SESSION_ID_KEY, sessionId);
        }

        // Ensure guest session exists in Supabase
        await supabase
          .from("guest_sessions")
          .upsert({ guest_session_id: sessionId });

        // Check authentication status
        const { data: { session } } = await supabase.auth.getSession();
        if (session && mounted) {
          setAuth(true);
          setUser({
            user_id: session.user.id,
            email: session.user.email || '',
            isAuthenticated: true,
            newsletterOptIn: false
          });
        }
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session) {
        setAuth(true);
        setUser({
          user_id: session.user.id,
          email: session.user.email || '',
          isAuthenticated: true,
          newsletterOptIn: false
        });

      } else {
        setAuth(false);
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}

export const AppStateProvider: React.FC<AppStateProviderProps> = ({ children, initialLoading }) => {
  return (
    <AuthProvider initialLoading={initialLoading}>
      <UserProvider>
        <AuthHydrator>
          <ProjectProvider>
            <CreditsProvider>
              <ChatProvider>
                <GenerationProvider>
                  {children}
                </GenerationProvider>
              </ChatProvider>
            </CreditsProvider>
          </ProjectProvider>
        </AuthHydrator>
      </UserProvider>
    </AuthProvider>
  );
};
