import React, { createContext, useContext, useReducer, ReactNode, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface CreditsState {
  credits: number;
  isLoadingCredits: boolean;
}

type CreditsAction =
  | { type: 'SET_CREDITS'; payload: number }
  | { type: 'SET_LOADING_CREDITS'; payload: boolean };

const STORAGE_KEY = 'easypeasy_credits';

const getInitialState = (): CreditsState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return {
    credits: stored ? parseInt(stored, 10) : 0,
    isLoadingCredits: false,
  };
};

const CreditsContext = createContext<{
  state: CreditsState;
  isLoadingCredits: boolean;
  setCredits: (credits: number) => void;
} | undefined>(undefined);

function creditsReducer(state: CreditsState, action: CreditsAction): CreditsState {
  switch (action.type) {
    case 'SET_CREDITS':
      return { ...state, credits: action.payload };
    case 'SET_LOADING_CREDITS':
      return { ...state, isLoadingCredits: action.payload };
    default:
      return state;
  }
}

export const CreditsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(creditsReducer, getInitialState());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch credits, optionally showing the loading flag.
    // showLoadingGate is only true for a fresh SIGNED_IN (modal login).
    const fetchCreditsWithRetry = async (userId: string, showLoadingGate: boolean) => {
      if (!mountedRef.current) return;

      if (showLoadingGate) {
        dispatch({ type: 'SET_LOADING_CREDITS', payload: true });
      }

      let succeeded = false;

      for (let attempt = 0; attempt <= 2; attempt++) {
        if (!mountedRef.current) return;

        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 800));
          if (!mountedRef.current) return;
        }

        try {
          const { data, error } = await supabase
            .from("user_credits")
            .select("balance")
            .eq("user_id", userId)
            .single();

          if (error) {
            if (error.code === "PGRST116") {
              await supabase.from("user_credits").insert({ user_id: userId, balance: 0 });
              if (mountedRef.current) dispatch({ type: 'SET_CREDITS', payload: 0 });
              succeeded = true;
              break;
            }
            // Non-fatal — retry
          } else if (data && typeof data.balance === "number") {
            if (mountedRef.current) dispatch({ type: 'SET_CREDITS', payload: data.balance });
            succeeded = true;
            break;
          }
        } catch {
          // Network error — retry
        }
      }

      if (mountedRef.current) {
        if (showLoadingGate) {
          dispatch({ type: 'SET_LOADING_CREDITS', payload: false });
        }
        if (!succeeded) {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) dispatch({ type: 'SET_CREDITS', payload: parseInt(stored, 10) });
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      if (session?.user) {
        // Only arm the loading gate for a brand-new login from a modal.
        // INITIAL_SESSION (page load/refresh) and TOKEN_REFRESHED (tab focus)
        // must NOT toggle the gate — they would unmount the page and wipe chat state.
        const isNewLogin = event === 'SIGNED_IN';
        fetchCreditsWithRetry(session.user.id, isNewLogin);
      } else if (event === 'SIGNED_OUT') {
        dispatch({ type: 'SET_CREDITS', payload: 0 });
        dispatch({ type: 'SET_LOADING_CREDITS', payload: false });
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, state.credits.toString());
  }, [state.credits]);

  const setCredits = (credits: number) => dispatch({ type: 'SET_CREDITS', payload: credits });

  return (
    <CreditsContext.Provider value={{ state, isLoadingCredits: state.isLoadingCredits, setCredits }}>
      {children}
    </CreditsContext.Provider>
  );
};

export const useCredits = () => {
  const context = useContext(CreditsContext);
  if (!context) throw new Error('useCredits must be used within a CreditsProvider');
  return context;
};
