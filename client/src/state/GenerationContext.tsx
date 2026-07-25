import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { GenerationJob, GeneratedImage } from '../types';

const GENERATION_LOCK_KEY = 'generation_lock_job';

/**
 * GenerationContext owns the state of the current generation process.
 * It does NOT persist jobs, status, images, or generationReady.
 * In the future, this will be replaced by polling /api/jobs/:id.
 */

type GenerationStatus = "idle" | "pending" | "running" | "completed" | "error";

interface GenerationState {
  currentJob: GenerationJob | null;
  status: GenerationStatus;
  generationReady: boolean;
  generatedImages: GeneratedImage[];
}

type GenerationAction =
  | { type: 'SET_JOB'; payload: GenerationJob | null }
  | { type: 'SET_STATUS'; payload: GenerationStatus }
  | { type: 'SET_GENERATION_READY'; payload: boolean }
  | { type: 'ADD_IMAGES'; payload: GeneratedImage[] }
  | { type: 'SET_IMAGES'; payload: GeneratedImage[] };

const initialState: GenerationState = {
  currentJob: null,
  status: 'idle',
  generationReady: false,
  generatedImages: [],
};

const GenerationContext = createContext<{
  state: GenerationState;
  setJob: (job: GenerationJob | null) => void;
  setStatus: (status: GenerationStatus) => void;
  setGenerationReady: (ready: boolean) => void;
  addImages: (images: GeneratedImage[]) => void;
  setImages: (images: GeneratedImage[]) => void;
} | undefined>(undefined);

function generationReducer(state: GenerationState, action: GenerationAction): GenerationState {
  switch (action.type) {
    case 'SET_JOB':
      return { ...state, currentJob: action.payload };
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_GENERATION_READY':
      return { ...state, generationReady: action.payload };
    case 'ADD_IMAGES':
      return { ...state, generatedImages: [...action.payload, ...state.generatedImages] };
    case 'SET_IMAGES':
      return { ...state, generatedImages: action.payload };
    default:
      return state;
  }
}

export const GenerationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(generationReducer, initialState);

  const setJob = (job: GenerationJob | null) => dispatch({ type: 'SET_JOB', payload: job });
  const setStatus = (status: GenerationStatus) => dispatch({ type: 'SET_STATUS', payload: status });
  const setGenerationReady = (ready: boolean) => dispatch({ type: 'SET_GENERATION_READY', payload: ready });
  const addImages = (images: GeneratedImage[]) => dispatch({ type: 'ADD_IMAGES', payload: images });
  const setImages = (images: GeneratedImage[]) => dispatch({ type: 'SET_IMAGES', payload: images });

  useEffect(() => {
    const lockedJobId = localStorage.getItem(GENERATION_LOCK_KEY);
    if (lockedJobId && state.status === 'idle') {
      setStatus('running');
      setJob({
        generation_job_id: lockedJobId,
        project_id: 'recovery',
        status: 'pending',
        created_at: new Date().toISOString()
      });
    }
  }, []);

  return (
    <GenerationContext.Provider value={{ state, setJob, setStatus, setGenerationReady, addImages, setImages }}>
      {children}
    </GenerationContext.Provider>
  );
};

export const useGeneration = () => {
  const context = useContext(GenerationContext);
  if (!context) throw new Error('useGeneration must be used within a GenerationProvider');
  return context;
};
