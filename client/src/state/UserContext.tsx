import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';

export interface User {
  user_id: string;
  email: string;
  isAuthenticated: boolean;
  hasPurchasedStarter?: boolean;
  hasActiveSubscription?: boolean;
  newsletterOptIn?: boolean;
}

interface UserState {
  user: User | null;
}

type UserAction = { type: 'SET_USER'; payload: User | null };

const STORAGE_KEY = 'easypeasy_user';

const getInitialState = (): UserState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return {
    user: stored ? JSON.parse(stored) : null,
  };
};

const UserContext = createContext<{
  state: UserState;
  setUser: (user: User | null) => void;
} | undefined>(undefined);

function userReducer(state: UserState, action: UserAction): UserState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    default:
      return state;
  }
}

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(userReducer, getInitialState());

  useEffect(() => {
    if (state.user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state.user]);

  const setUser = (user: User | null) => dispatch({ type: 'SET_USER', payload: user });

  return (
    <UserContext.Provider value={{ state, setUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};
