import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { ChatMessage } from '../types';

/**
 * ChatContext owns the history of chat messages for the current session.
 * It does NOT persist messages.
 * In the future, this will be replaced by fetching messages from /api/projects/:id/messages.
 */

interface ChatState {
  messages: ChatMessage[];
}

type ChatAction = 
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } };

const initialState: ChatState = {
  messages: [],
};

const ChatContext = createContext<{
  state: ChatState;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, content: string) => void;
} | undefined>(undefined);

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.chat_message_id === action.payload.id
            ? { ...m, content: action.payload.content }
            : m
        )
      };
    default:
      return state;
  }
}

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  const setMessages = (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    if (typeof messages === 'function') {
      dispatch({ type: 'SET_MESSAGES', payload: messages(state.messages) });
    } else {
      dispatch({ type: 'SET_MESSAGES', payload: messages });
    }
  };
  const addMessage = (message: ChatMessage) => dispatch({ type: 'ADD_MESSAGE', payload: message });
  const updateMessage = (id: string, content: string) => {
    dispatch({
      type: 'UPDATE_MESSAGE',
      payload: { id, content }
    });
  };

  return (
    <ChatContext.Provider value={{ state, setMessages, addMessage, updateMessage }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
