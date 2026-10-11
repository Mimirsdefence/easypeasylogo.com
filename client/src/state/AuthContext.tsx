import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useLocation } from 'wouter';

/**
 * AuthContext owns the authentication status and loading state.
 */

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
}

type AuthAction = 
  | { type: 'SET_AUTH'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: AuthState = {
  isAuthenticated: false,
  loading: true,
};

const AuthContext = createContext<{
  state: AuthState;
  setAuth: (isAuthenticated: boolean) => void;
  setLoading: (loading: boolean) => void;
} | undefined>(undefined);

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_AUTH':
      return { ...state, isAuthenticated: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export interface AuthProviderProps {
  children: ReactNode;
  /**
   * Value of `state.loading` during the very first render.
   *
   * The prerenderer (script/prerender.ts) renders the public pages on a server
   * where no auth check can run. Passing `false` keeps the real page markup in
   * the prerendered HTML instead of the "Loading..." gate.
   */
  initialLoading?: boolean;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, initialLoading = true }) => {
  const [state, dispatch] = useReducer(
    authReducer,
    initialLoading,
    (loading): AuthState => ({ ...initialState, loading }),
  );
  const [, setLocation] = useLocation();

  const setAuth = (isAuthenticated: boolean) => dispatch({ type: 'SET_AUTH', payload: isAuthenticated });
  const setLoading = (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading });

  useEffect(() => {
    let mounted = true;
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setAuth(true);
      }
      setLoading(false);
    });

    // Central auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setAuth(true);
        // ONLY first-time signup should redirect to checkout
        if (event as string === "SIGNED_UP") {
          setLocation("/checkout");
        }
      } else if (event === "SIGNED_OUT") {
        setAuth(false);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ state, setAuth, setLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
