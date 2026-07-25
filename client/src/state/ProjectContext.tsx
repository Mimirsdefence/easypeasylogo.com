import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Project } from '../types';

/**
 * ProjectContext owns the currently active project.
 * It PERSISTS the activeProject to localStorage.
 * In the future, this will be replaced by fetching the project by ID from the backend.
 */

interface ProjectState {
  activeProject: Project | null;
}

type ProjectAction = { type: 'SET_PROJECT'; payload: Project | null };

const STORAGE_KEY = 'easypeasy_active_project';

const getInitialState = (): ProjectState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return {
    activeProject: stored ? JSON.parse(stored) : null,
  };
};

const ProjectContext = createContext<{
  state: ProjectState;
  setProject: (project: Project | null) => void;
} | undefined>(undefined);

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, activeProject: action.payload };
    default:
      return state;
  }
}

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(projectReducer, getInitialState());

  useEffect(() => {
    if (state.activeProject) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.activeProject));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state.activeProject]);

  const setProject = (project: Project | null) => dispatch({ type: 'SET_PROJECT', payload: project });

  return (
    <ProjectContext.Provider value={{ state, setProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within a ProjectProvider');
  return context;
};
