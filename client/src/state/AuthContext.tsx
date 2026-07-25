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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
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
