import { supabase } from "@/lib/supabaseClient";
import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/state/AuthContext";
import { useUser } from "@/state/UserContext";
import { useProject } from "@/state/ProjectContext";
import { useCredits } from "@/state/CreditsContext";
import { useChat } from "@/state/ChatContext";
import { useGeneration } from "@/state/GenerationContext";
import TopBar from "@/components/TopBar";
import Auth from "@/pages/Auth";
import EmptyStartScreen from "@/components/chat/EmptyStartScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Image as ImageIcon, Sparkles, Download, Shield, ChevronLeft, ChevronRight, X, PanelRightClose, PanelRightOpen, AlertTriangle, Search, ExternalLink, MoreHorizontal, Settings, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatMessage, GeneratedImage } from "@/types";
import logoIcon from "@assets/logo.webp";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SESSION_ID_KEY = 'easypeasy_session_id';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.easypeasylogo.com/webhook/designer-chat';

function useTypewriter(text: string, speed = 28) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return { displayed, done };
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;

async function uploadFileToCloudinary(file: File, expiresInMinutes: number = 2): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  const expiresAt = Math.floor((Date.now() + expiresInMinutes * 60 * 1000) / 1000);
  formData.append("expires_at", expiresAt.toString());
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
  const data = await res.json();
  return data.secure_url as string;
}

const IMAGE_URL_REGEX = /https?:\/\/\S+\.(jpg|jpeg|png)(?:\?\S*)?/gi;

function getSessionId(): string {
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function getInitials(user: any): string {
  if (user?.name) {
    const parts = user.name.trim().split(" ");
    return parts.slice(0, 2).map((p: string) => p[0]).join("").toUpperCase();
  }
  if (user?.email) {
    const prefix = user.email.split("@")[0];
    const parts = prefix.split(/[._-]/);
    if (parts.length > 1) {
      return parts.slice(0, 2).map((p: string) => p[0]).join("").toUpperCase();
    }
    return prefix[0].toUpperCase();
  }
  return "U";
}

export default function AppPage() {
  const [, setLocation] = useLocation();
  const { state: authState } = useAuth();
  const { state: userState } = useUser();
  const { state: projectState, setProject } = useProject();
  const { state: creditsState, setCredits } = useCredits();
  const { state: chatState, addMessage, setMessages, updateMessage } = useChat();
  const { state: generationState, setStatus, addImages, setImages } = useGeneration();
  const inputRef = useRef<HTMLInputElement>(null);
  const genTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGenerationProjectIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, []);

  const sessionId = useRef(getSessionId()).current;
  const [introPlayed, setIntroPlayed] = useState(false);
  const [introRunning, setIntroRunning] = useState(false);
  const [showIntroTyping, setShowIntroTyping] = useState(false);
  const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<"limit" | "new_project" | null>(null);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [showNoCreditsModal, setShowNoCreditsModal] = useState(false);
  const creditButtonRef = useRef<HTMLButtonElement | null>(null);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const STATUS_MESSAGES = [
    { at: 10,  text: "Analyzing brand summary details..." },
    { at: 25,  text: "Structuring design briefs..." },
    { at: 40,  text: "Concepts are being engineered..." },
    { at: 55,  text: "Analyzing your brand preferences..." },
    { at: 70,  text: "Sketching out your layout motifs..." },
    { at: 85,  text: "Applying tailored color schemes..." },
    { at: 100, text: "Refining the high-res details..." },
    { at: 115, text: "Polishing up Concept 1 and Concept 2..." },
    { at: 130, text: "Securing your assets to the gallery..." },
    { at: 145, text: "Almost there, hang tight..." },
    { at: 160, text: "Putting on the final designer touches..." },
  ];

  function getLoadingStatusText(seconds: number): string | null {
    if (seconds < 10) return null;
    const LOOP = 175;
    const looped = ((seconds - 10) % LOOP) + 10;
    let result = STATUS_MESSAGES[0].text;
    for (const msg of STATUS_MESSAGES) {
      if (looped >= msg.at) result = msg.text;
      else break;
    }
    return result;
  }

  function startLoadingTimer() {
    if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
    setLoadingSeconds(0);
    loadingIntervalRef.current = setInterval(() => {
      setLoadingSeconds(s => s + 1);
    }, 1000);
  }

  function stopLoadingTimer() {
    if (loadingIntervalRef.current) {
      clearInterval(loadingIntervalRef.current);
      loadingIntervalRef.current = null;
    }
    setLoadingSeconds(0);
  }

  const getMessageLimitKey = () => {
    const sessionProjectId = localStorage.getItem("easypeasy_session_project_id");
    return `easypeasy_free_messages_${sessionProjectId}`;
  };

  const requireAuth = (reason: "limit" | "new_project") => {
    if (reason === "limit") {
      setIsLimitReached(true);
    } else {
      openAuthModal();
    }
  };

  const addSystemMessage = (text: string) => {
    const projectId = projectState.activeProject?.project_id || localStorage.getItem("easypeasy_session_project_id");
    if (!projectId) return;
    addMessage({
      chat_message_id: crypto.randomUUID(),
      project_id: projectId,
      sender: "system",
      content: text,
      created_at: new Date().toISOString()
    });
  };

  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [sendingProjects, setSendingProjects] = useState<Record<string, boolean>>({});

  const currentActiveId = projectState.activeProject?.project_id || (projectState.activeProject as any)?.id || "";
  const isSending = !!sendingProjects[currentActiveId];
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachedImageUrls, setAttachedImageUrls] = useState<string[]>([]);
  const [attachedImageIntents, setAttachedImageIntents] = useState<("inspiration" | "reference")[]>([]);
  const [attachedRawFile, setAttachedRawFile] = useState<File | null>(null);
  const [isCloudinaryUploading, setIsCloudinaryUploading] = useState(false);
  const [activeImageUsage, setActiveImageUsage] = useState<"inspiration" | "reference" | null>(null);
  const [showImageIntentModal, setShowImageIntentModal] = useState(false);
  const pendingIntentRef = useRef<"inspiration" | "reference">("inspiration");
  const [authModalContext, setAuthModalContext] = useState<"default" | "image" | "generation">("default");
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!authState.loading && !authState.isAuthenticated) {
      const STORAGE_KEY = "easypeasy_session_project_id";
      let sessionId = localStorage.getItem(STORAGE_KEY);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY, sessionId);
      }
      const defaultProj = {
        project_id: sessionId,
        name: "First Brand Design",
        user_id: null as any,
        created_at: new Date().toISOString(),
        isActive: true
      };
      setProject(defaultProj);
      setProjectList([{ id: sessionId, name: defaultProj.name }]);
    }
  }, [authState.isAuthenticated, authState.loading]);

  useEffect(() => {
    if (!authState.loading && !authState.isAuthenticated) {
      const sessionProjectId = localStorage.getItem("easypeasy_session_project_id");
      if (!sessionProjectId) return;
      const introKey = `easypeasy_intro_played_${sessionProjectId}`;
      if (localStorage.getItem(introKey) === "true") {
        setIntroPlayed(true);
      }
      if (chatState.messages.length === 0 && !introPlayed && !introRunning) {
        const runIntro = async () => {
          setIntroRunning(true);
          await new Promise(resolve => setTimeout(resolve, 500));
          const typeText = async (text: string) => {
            setShowIntroTyping(true);
            await new Promise(resolve => setTimeout(resolve, 900));
            setShowIntroTyping(false);
            const projectId = getProjectId();
            const msgId = crypto.randomUUID();
            addMessage({
              chat_message_id: msgId,
              project_id: projectId,
              sender: "designer",
              content: "",
              created_at: new Date().toISOString()
            });
            const chunkSize = 3;
            for (let i = chunkSize; i <= text.length + (chunkSize - 1); i += chunkSize) {
              await new Promise(resolve => setTimeout(resolve, 30));
              const currentText = text.slice(0, Math.min(i, text.length));
              updateMessage(msgId, currentText);
            }
          };
          await typeText("Hi! I'm your brand identity designer.\nI help align your visual identity so your brand builds trust and attracts the right clients.");
          await new Promise(resolve => setTimeout(resolve, 600));
          await typeText("Tell me a bit about your brand or the idea you're exploring. 🙂");
          localStorage.setItem(introKey, "true");
          setIntroPlayed(true);
          setIntroRunning(false);
        };
        runIntro();
      }
    }
  }, [authState.isAuthenticated, authState.loading]);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<GeneratedImage[]>([]);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const [renameProject, setRenameProject] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteProject, setDeleteProject] = useState<{ id: string; name: string } | null>(null);

  const openRenameModal = (project: { id: string; name: string }) => {
    setRenameProject(project);
    setRenameValue(project.name);
  };

  const openDeleteModal = (project: { id: string; name: string }) => {
    setDeleteProject(project);
  };

  const handleRenameProject = async () => {
    if (!renameProject) return;
    if (!authState.isAuthenticated) {
      setRenameProject(null);
      openAuthModal();
      return;
    }
    try {
      const { error } = await supabase
        .from("projects")
        .update({ name: renameValue.trim() })
        .eq("project_id", renameProject.id);
      if (error) {
        console.error("Rename project failed:", error);
        return;
      }
      setProjectList(prev =>
        prev.map(p =>
          p.id === renameProject.id ? { ...p, name: renameValue.trim() } : p
        )
      );
      if (projectState.activeProject?.project_id === renameProject.id) {
        setProject({
          ...projectState.activeProject,
          name: renameValue.trim()
        });
      }
      setRenameProject(null);
    } catch (err) {
      console.error("Unexpected rename error:", err);
    }
  };

  const confirmDeleteProject = async () => {
    if (!deleteProject) return;
    if (!authState.isAuthenticated) {
      setDeleteProject(null);
      openAuthModal();
      return;
    }
    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("project_id", deleteProject.id);
      if (!error) {
        setProjectList(prev => prev.filter(p => p.id !== deleteProject.id));
        if (projectState.activeProject?.project_id === deleteProject.id) {
          setProject(null);
          setMessages([]);
          setStatus('idle');
          stopLoadingTimer();
          setSendingProjects({});
        }
      }
    } finally {
      setDeleteProject(null);
    }
  };

  const WELCOME_TEXT = "Welcome — your brand design starts here.";
  const { displayed: typedHeading, done: headingDone } = useTypewriter(
    chatState.messages.length === 0 ? WELCOME_TEXT : "",
    30
  );

  const filteredImages = useMemo(() => {
    const term = search.toLowerCase();
    return generationState.generatedImages.filter(img => 
      img.url.toLowerCase().includes(term) || 
      projectState.activeProject?.project_id.toLowerCase().includes(term)
    );
  }, [generationState.generatedImages, search, projectState.activeProject]);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return projectList.filter(p =>
      p.name.toLowerCase().includes(term)
    );
  }, [search, projectList]);

  // 👇 FILTER MESSAGES BY CURRENT PROJECT
  const currentMessages = useMemo(() => {
    return chatState.messages.filter(msg => msg.project_id === currentActiveId);
  }, [chatState.messages, currentActiveId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGenerating = generationState.status === 'pending' || generationState.status === 'running';
  const isSendLocked = introRunning || isGenerating || isSending;
  const isEmptyAuthenticatedProject = authState.isAuthenticated && currentMessages.length === 0;

  // --- MOBILE SCROLL FIX: two separate effects ---

  // 1. Scroll to bottom when messages or generation status changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          (viewport as HTMLElement).scrollTop = (viewport as HTMLElement).scrollHeight;
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [currentMessages, generationState.status]);

  // 2. Initial load / project change – ensures mobile scroll works on first load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          (viewport as HTMLElement).scrollTop = (viewport as HTMLElement).scrollHeight;
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentActiveId]);

  useEffect(() => {
    if (authState.isAuthenticated && authModalOpen) {
      setAuthModalOpen(false);
    }
  }, [authState.isAuthenticated, authModalOpen]);

  useEffect(() => {
    if (!authState.isAuthenticated || !userState.user) return;
    const guestSessionId = localStorage.getItem("easypeasy_session_id");
    const guestProjectId = localStorage.getItem("easypeasy_session_project_id");
    if (!guestSessionId && !guestProjectId) return;
    const promoteGuestProject = async () => {
      try {
        const { data: existingProjects, error: checkError } = await supabase
          .from("projects")
          .select("project_id")
          .eq("user_id", userState.user.user_id);
        if (checkError) {
          console.error("Failed to check existing projects:", checkError);
          return;
        }
        if (existingProjects && existingProjects.length > 0) {
          localStorage.removeItem("easypeasy_session_id");
          if (guestProjectId) {
            localStorage.removeItem("easypeasy_session_project_id");
            setProject(null);
          }
          return;
        }
        let project = null;
        if (guestProjectId) {
          const { data: guestProject, error: projectFetchError } = await supabase
            .from("projects")
            .select("*")
            .eq("project_id", guestProjectId)
            .maybeSingle();
          if (projectFetchError) {
            console.error("Failed to fetch guest project:", projectFetchError);
            return;
          }
          if (guestProject) {
            const { error: transferError } = await supabase
              .from("projects")
              .update({
                user_id: userState.user.user_id,
                is_system_default: true
              })
              .eq("project_id", guestProjectId);
            if (transferError) {
              console.error("Failed to transfer guest project:", transferError);
              return;
            }
            project = {
              ...guestProject,
              user_id: userState.user.user_id,
              is_system_default: true
            };
          }
        }
        if (!project) {
          const { data: createdProject, error: createError } = await supabase
            .from("projects")
            .insert({
              user_id: userState.user.user_id,
              name: "First Brand Design",
              is_system_default: true
            })
            .select()
            .single();
          if (createError) {
            console.error("Failed to create promoted project:", createError);
            return;
          }
          project = createdProject;
        }
        if (guestSessionId) {
          const { data: guestMessages, error: fetchError } = await supabase
            .from("guest_messages")
            .select("*")
            .eq("guest_session_id", guestSessionId)
            .order("created_at", { ascending: true });
          if (fetchError) {
            console.error("Failed to fetch guest messages:", fetchError);
          } else if (guestMessages && guestMessages.length > 0 && project) {
            const messagesToInsert = guestMessages.map(m => ({
              project_id: project.project_id,
              sender: m.sender,
              content: m.content,
              created_at: m.created_at
            }));
            const { error: insertError } = await supabase
              .from("chat_messages")
              .insert(messagesToInsert);
            if (insertError) {
              console.error("Failed to migrate guest messages:", insertError);
            }
          }
        }
        if (project) {
          setProject({
            project_id: project.project_id,
            user_id: userState.user.user_id,
            name: project.name || "First Brand Design",
            created_at: project.created_at,
            isActive: true
          });
          setProjectList([{ id: project.project_id, name: project.name || "First Brand Design" }]);
        }
        if (guestSessionId) {
          await supabase
            .from("guest_sessions")
            .delete()
            .eq("guest_session_id", guestSessionId);
          localStorage.removeItem("easypeasy_session_id");
        }
        if (guestProjectId) {
          localStorage.removeItem("easypeasy_session_project_id");
        }
      } catch (err) {
        console.error("Guest project promotion failed:", err);
      }
    };
    promoteGuestProject();
  }, [authState.isAuthenticated, userState.user?.user_id]);

  const getProjectId = () => {
    return projectState.activeProject?.project_id || localStorage.getItem("easypeasy_session_project_id");
  };

  const fetchProjectMessages = async (projectId: string): Promise<ChatMessage[]> => {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Error loading messages:", error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      return [];
    }
  };

  // On project load: hydrate gallery sidebar + inject concept bubbles from logo_gallery
  useEffect(() => {
    if (!authState.isAuthenticated) return;
    const projectId = projectState.activeProject?.project_id;
    if (!projectId) return;

    const loadHistory = async (options?: { skipMessages?: boolean; skipScroll?: boolean }) => {
      const [chatMessages, galleryResult, projectRowResult] = await Promise.all([
        options?.skipMessages ? [] : fetchProjectMessages(projectId),
        supabase
          .from("logo_gallery")
          .select("*")
          .eq("user_id", userState.user?.user_id)
          .order("created_at", { ascending: true }),
        supabase
          .from("projects")
          .select("generation_status")
          .eq("project_id", projectId)
          .single(),
      ]);

      const galleryData = galleryResult.data || [];
      if (galleryResult.error) {
        console.error("Error loading logo_gallery:", galleryResult.error);
      }

      // Build ALL account-wide images for the sidebar gallery (ignores project_id)
      const allImages: GeneratedImage[] = [];
      galleryData.forEach((row: any) => {
        if (row.concept_1_url) allImages.push({
          generated_image_id: `${row.logo_id}-1`,
          project_id: row.project_id,
          url: row.concept_1_url,
          title: row.concept_1_title || "Concept 1",
          created_at: row.created_at || new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
        if (row.concept_2_url) allImages.push({
          generated_image_id: `${row.logo_id}-2`,
          project_id: row.project_id,
          url: row.concept_2_url,
          title: row.concept_2_title || "Concept 2",
          created_at: row.created_at || new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      });
      setImages(allImages);

      if (!options?.skipMessages) {
        const galleryMsgs: ChatMessage[] = [];
        galleryData
          .filter((row: any) => row.project_id === projectId)
          .forEach((row: any) => {
            if (!row.concept_1_url && !row.concept_2_url) return;
            galleryMsgs.push({
              chat_message_id: row.id ? `gallery-${row.id}` : crypto.randomUUID(),
              project_id: projectId,
              sender: "designer",
              content: row.response_text || "Here are your concepts.",
              created_at: row.created_at || new Date().toISOString(),
              concept_1_url: row.concept_1_url || undefined,
              concept_1_title: row.concept_1_title || undefined,
              concept_2_url: row.concept_2_url || undefined,
              concept_2_title: row.concept_2_title || undefined,
            });
          });

        const allMessages = [...chatMessages, ...galleryMsgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(allMessages);
      }

      const isGen = projectRowResult.data?.generation_status === "generating";

      if (isGen && !options?.skipMessages) {
        setSendingProjects(prev => ({ ...prev, [projectId]: true }));
        setStatus('running');
      } else if (isGen && options?.skipMessages) {
        setSendingProjects(prev => ({ ...prev, [projectId]: true }));
        setStatus('running');
      } else if (!isGen && !options?.skipMessages) {
        setSendingProjects(prev => { const n = { ...prev }; delete n[projectId]; return n; });
        setStatus('idle');
      }

      if (!options?.skipScroll) {
        setTimeout(() => {
          const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
          if (viewport) {
            (viewport as HTMLElement).scrollTop = (viewport as HTMLElement).scrollHeight;
          }
        }, 50);
      }

      return isGen;
    };

    // --- Supabase Realtime subscription for generation status ---
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          if (payload.new.generation_status === 'completed') {
            console.log('[Realtime] Generation completed for project', projectId);
            
            if (genTimeoutRef.current) {
              clearTimeout(genTimeoutRef.current);
              genTimeoutRef.current = null;
            }

            setStatus('idle');
            stopLoadingTimer();
            setSendingProjects(prev => { const n = { ...prev }; delete n[projectId]; return n; });
            loadHistory({ skipScroll: false });
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    loadHistory();

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [authState.isAuthenticated, projectState.activeProject?.project_id]);

  const openAuthModal = () => {
    setAuthModalOpen(true);
  };

  const startNewProject = () => {
    setProjectModalOpen(true);
  };

  const activateProject = (proj: { id: string; name: string }) => {
    setProject({
      project_id: proj.id,
      user_id: userState.user?.user_id || "anonymous",
      name: proj.name,
      created_at: new Date().toISOString(),
      isActive: true
    });
    setSearch("");
    setIsSearchOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(`project-${proj.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  const handleCreateProject = async () => {
    const trimmedName = newProjectName.trim().replace(/\s+/g, ' ');
    if (!trimmedName) {
      setProjectError("Project name cannot be empty.");
      return;
    }
    if (trimmedName.length > 60) {
      setProjectError("Maximum 60 characters.");
      return;
    }
    if (!authState.isAuthenticated) {
      requireAuth("new_project");
      return;
    }
    setIsCreatingProject(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert([{
          user_id: userState.user?.user_id,
          name: trimmedName,
          is_system_default: false
        }])
        .select()
        .single();
      if (error || !data) {
        setProjectError("Failed to create project.");
        setIsCreatingProject(false);
        return;
      }
      const id = data.project_id;
      setProject({
        project_id: id,
        user_id: userState.user?.user_id || 'anonymous',
        name: trimmedName,
        created_at: data.created_at,
        isActive: true
      });
      setProjectList(prev => [...prev, { id, name: trimmedName }]);
      setMessages([]);
      setProjectModalOpen(false);
      setNewProjectName("");
      setProjectError(null);
    } catch (err) {
      setProjectError("Failed to create project.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  useEffect(() => {
    if (authState.isAuthenticated) {
      const loadProjects = async () => {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: true });
        if (!error && data) {
          const list = data.map(p => ({
            id: p.project_id,
            name: p.name
          }));
          if (list.length > 0 || projectList.length === 0) {
            setProjectList(list);
          }
          if (!projectState.activeProject && list.length > 0) {
            const first = data[0];
            setProject({
              project_id: first.project_id,
              user_id: first.user_id,
              name: first.name,
              created_at: first.created_at,
              isActive: true
            });
          } else if (list.length === 0) {
            setProject(null);
          }
        }
      };
      loadProjects();
    }
  }, [authState.isAuthenticated]);

  const extractImageUrls = (text: string): string[] => {
    const matches = text.match(IMAGE_URL_REGEX);
    return matches || [];
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    setUploadError(null);
    const extracted = extractImageUrls(val);
    if (extracted.length > 0) {
      setAttachedImageUrls(prev => {
        const combined = [...prev];
        extracted.forEach(url => {
          if (!combined.includes(url)) combined.push(url);
        });
        return combined;
      });
    }
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImageUrls(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setActiveImageUsage(null);
      return next;
    });
    setAttachedImageIntents(prev => prev.filter((_, i) => i !== index));
  };

  const openImageIntentModal = () => {
    if (!authState.isAuthenticated) {
      setAuthModalContext("image");
      setAuthModalOpen(true);
      return;
    }
    setShowImageIntentModal(true);
  };

  const selectImageIntent = (intent: "inspiration" | "reference") => {
    pendingIntentRef.current = intent;
    setShowImageIntentModal(false);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const onSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const MESSAGE_LIMIT_KEY = getMessageLimitKey();
    const freeCount = Number(localStorage.getItem(MESSAGE_LIMIT_KEY) || 0);
    const FREE_LIMIT = 10;
    if (!authState.isAuthenticated) {
      if (freeCount >= FREE_LIMIT) {
        requireAuth("limit");
        return;
      }
    }
    const currentCredits = creditsState.credits ?? 0;
    if (authState.isAuthenticated && currentCredits <= 0) {
      setShowNoCreditsModal(true);
      return;
    }
    if (!input.trim() || isSendLocked) return;
    if (isCloudinaryUploading) return;
    
    setSendingProjects(prev => ({ ...prev, [currentActiveId]: true }));
    let projectId = authState.isAuthenticated
      ? (projectState.activeProject?.project_id ?? null)
      : getProjectId();
    if (!projectId && authState.isAuthenticated && userState.user) {
      setProjectModalOpen(false);
      setProjectError(null);
      setIsCreatingProject(true);
      const { data, error } = await supabase
        .from("projects")
        .insert([
          {
            user_id: userState.user?.user_id,
            name: "First Brand Design",
            is_system_default: true
          }
        ])
        .select()
        .single();
      if (error) {
        console.error("Failed to create default project:", error);
        if (projectId) setSendingProjects(prev => { const n = {...prev}; delete n[projectId!]; return n; });
        setIsCreatingProject(false);
        return;
      }
      projectId = data.project_id;
      setProjectList(prev => [
        ...prev,
        {
          id: data.project_id,
          name: data.name
        }
      ]);
      setProject({
        project_id: data.project_id,
        user_id: userState.user?.user_id ?? "anonymous",
        name: data.name,
        created_at: data.created_at,
        isActive: true
      });
      setSendingProjects(prev => ({ ...prev, [data.project_id]: true }));
      setIsCreatingProject(false);
    }
    if (!projectId) {
      setSendingProjects(prev => { const n = {...prev}; delete n[currentActiveId]; return n; });
      return;
    }

    // ============================================================
    // 🔥 OPTIMISTIC DB UPDATE – set status to 'generating'
    // ============================================================
    console.log("[DB] Starting optimistic update for project:", projectId);
    console.log("[DB] Current user:", userState.user?.user_id || "guest");
    console.log("[DB] authState.isAuthenticated:", authState.isAuthenticated);

    try {
      const { data: updateData, error: updateError } = await supabase
        .from("projects")
        .update({ generation_status: "generating" })
        .eq("project_id", projectId)
        .select();

      if (updateError) {
        console.error("[DB] Optimistic update FAILED with error:", updateError);
        console.error("[DB] Full error object:", JSON.stringify(updateError, null, 2));
      } else {
        console.log("[DB] Optimistic update SUCCESSFUL. Updated rows:", updateData);
        console.log("[DB] New generation_status should be 'generating'");
      }
    } catch (err) {
      console.error("[DB] Optimistic update threw an exception:", err);
    }

    // Update local state to reflect the change
    setProject({
      ...projectState.activeProject,
      generation_status: "generating"
    });

    const userMsg: ChatMessage = {
      chat_message_id: crypto.randomUUID(),
      project_id: projectId,
      sender: "user",
      content: input,
      created_at: new Date().toISOString()
    };
    const currentAttachments = [...attachedImageUrls];
    const messageText = input;
    addMessage({
      ...userMsg,
      ...(currentAttachments.length > 0 ? { references: currentAttachments } : {})
    } as ChatMessage & { references?: string[] });
    try {
      const sessionId = localStorage.getItem("easypeasy_session_id");
      if (authState?.isAuthenticated && projectId) {
        await supabase
          .from("chat_messages")
          .insert({
            project_id: projectId,
            sender: "user",
            content: messageText
          });
      } else if (sessionId) {
        await supabase
          .from("guest_messages")
          .insert({
            guest_session_id: sessionId,
            sender: "user",
            content: messageText
          });
      }
    } catch (err) {
      console.error("Failed to persist user message:", err);
    }
    if (!authState.isAuthenticated) {
      localStorage.setItem(MESSAGE_LIMIT_KEY, String(freeCount + 1));
    }
    setInput("");
    setAttachedImageUrls([]);
    setAttachedRawFile(null);
    setActiveImageUsage(null);
    setGenError(null);
    let handedOffToRealtime = false;
    try {
      const resolvedProjectId = projectState.activeProject?.project_id || projectId || "";
      const formData = new FormData();
      formData.append("sessionId", sessionId ?? "");
      formData.append("userId", userState.user?.user_id || "");
      formData.append("projectId", resolvedProjectId);
      formData.append("messageId", crypto.randomUUID());
      formData.append("timestamp", new Date().toISOString());
      formData.append("message", messageText);
      formData.append("attachedImage", currentAttachments[0] || "");
      formData.append("imageUsage", currentAttachments[0] ? (activeImageUsage || "") : "");
      startLoadingTimer();
      const fetchUrl = `/api/generate-logo?sessionId=${encodeURIComponent(sessionId ?? "")}&projectId=${encodeURIComponent(resolvedProjectId)}`;
      const res = await fetch(fetchUrl, {
        method: "POST",
        body: formData
      });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data: {
        text: string;
        status?: "reply" | "starting_generation" | "generation_started" | "generation_complete";
        images?: string[];
        creditsRemaining?: number;
        trigger_modal?: "none" | "signup_required";
        concept_1_title?: string;
        concept_1_url?: string;
        concept_2_title?: string;
        concept_2_url?: string;
      } = await res.json();
      if (data.status === "generation_started" || data.status === "starting_generation") {
        handedOffToRealtime = true;
        activeGenerationProjectIdRef.current = projectId;
        setStatus("running");
        addSystemMessage("Creating concepts...");
        if (genTimeoutRef.current) clearTimeout(genTimeoutRef.current);
        genTimeoutRef.current = setTimeout(() => {
          setGenError("Generation timed out. Please try again.");
          setStatus("idle");
          stopLoadingTimer();
          const pid = activeGenerationProjectIdRef.current;
          if (pid) setSendingProjects(prev => { const n = { ...prev }; delete n[pid]; return n; });
          activeGenerationProjectIdRef.current = null;
          genTimeoutRef.current = null;
          setTimeout(() => inputRef.current?.focus(), 0);
        }, 300_000);
        // Do NOT reset DB status here – callback will handle it
        return;
      }
      if (data.trigger_modal === "signup_required") {
        const assistantMsg: ChatMessage = {
          chat_message_id: crypto.randomUUID(),
          project_id: projectId,
          sender: "designer",
          content: data.text,
          created_at: new Date().toISOString()
        };
        addMessage(assistantMsg);
        setAuthModalContext("generation");
        setAuthModalOpen(true);
        // Reset status because generation didn't actually start
        try {
          await supabase
            .from("projects")
            .update({ generation_status: "idle" })
            .eq("project_id", projectId);
          console.log("[DB] Reset status to idle (signup required)");
        } catch (dbErr) { /* ignore */ }
        return;
      }
      const assistantMsg: ChatMessage = {
        chat_message_id: crypto.randomUUID(),
        project_id: projectId,
        sender: "designer",
        content: data.text,
        created_at: new Date().toISOString()
      };
      addMessage(assistantMsg);
      try {
        const sessionId = localStorage.getItem("easypeasy_session_id");
        if (authState?.isAuthenticated && projectId) {
          await supabase
            .from("chat_messages")
            .insert({
              project_id: projectId,
              sender: "designer",
              content: data.text
            });
        } else if (sessionId) {
          await supabase
            .from("guest_messages")
            .insert({
              guest_session_id: sessionId,
              sender: "designer",
              content: data.text
            });
        }
      } catch (err) {
        console.error("Failed to persist assistant message:", err);
      }
      const hasConceptUrls = data.concept_1_url || data.concept_2_url;
      const hasLegacyImages = data.status === "generation_complete" && data.images && data.images.length > 0;
      if (hasConceptUrls || hasLegacyImages) {
        setStatus('idle');
        stopLoadingTimer();
        let newImages: GeneratedImage[] = [];
        if (hasConceptUrls) {
          const conceptPairs: { url: string; title: string }[] = [];
          if (data.concept_1_url) conceptPairs.push({ url: data.concept_1_url, title: data.concept_1_title || "Concept 1" });
          if (data.concept_2_url) conceptPairs.push({ url: data.concept_2_url, title: data.concept_2_title || "Concept 2" });
          newImages = conceptPairs.map(({ url, title }) => ({
            generated_image_id: crypto.randomUUID(),
            project_id: projectId ?? "",
            url,
            title,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
          }));
        } else if (data.images) {
          newImages = data.images.map(url => ({
            generated_image_id: crypto.randomUUID(),
            project_id: projectId ?? "",
            url,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
          }));
        }
        if (newImages.length > 0) {
          addImages(newImages);
          setViewerImages(newImages);
          setViewerIndex(0);
          setViewerOpen(true);
          setArchiveOpen(false);
        }
        // Generation completed immediately (sync case) – reset status
        try {
          await supabase
            .from("projects")
            .update({ generation_status: "idle" })
            .eq("project_id", projectId);
          console.log("[DB] Reset status to idle (sync completion)");
        } catch (dbErr) { /* ignore */ }
        setProject({
          ...projectState.activeProject,
          generation_status: 'idle'
        });
        setSendingProjects(prev => { const n = {...prev}; delete n[projectId!]; return n; });
      }
      if (data.creditsRemaining !== undefined) {
        setCredits(data.creditsRemaining);
      }
    } catch (err: any) {
      const wasGenerating = isGenerating || isSending;
      if (wasGenerating) {
        console.warn("Connection dropped mid-generation:", err?.message);
      } else {
        setGenError("Failed to reach designer. Please try again.");
        setStatus('idle');
        stopLoadingTimer();
        // Reset status on fetch error
        try {
          await supabase
            .from("projects")
            .update({ generation_status: "idle" })
            .eq("project_id", projectId);
          console.log("[DB] Reset status to idle (fetch error)");
        } catch (dbErr) { /* ignore */ }
        setProject({
          ...projectState.activeProject,
          generation_status: 'idle'
        });
        setSendingProjects(prev => { const n = {...prev}; delete n[projectId!]; return n; });
      }
    } finally {
      // ============================================================
      // 🔥 RESET FOR NORMAL CHAT REPLIES (not handed off)
      // ============================================================
      if (!handedOffToRealtime) {
        console.log("[DB] Resetting generation_status to idle (normal reply)");
        setStatus('idle');
        try {
          await supabase
            .from("projects")
            .update({ generation_status: "idle" })
            .eq("project_id", projectId);
          console.log("[DB] Reset SUCCESSFUL");
        } catch (dbErr) {
          console.warn("[DB] Reset FAILED:", dbErr);
        }
        if (projectId) setSendingProjects(prev => { const n = {...prev}; delete n[projectId!]; return n; });
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        console.log("[DB] Skipped reset – generation handed off to Realtime");
      }
      // ============================================================
    }
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setUploadError("Invalid file type. Only PNG and JPG are allowed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError("File is too large. Max size is 15MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    const intent = pendingIntentRef.current;
    setAttachedRawFile(file);
    setIsCloudinaryUploading(true);
    try {
      const secureUrl = await uploadFileToCloudinary(file);
      setAttachedImageUrls(prev => [...prev, secureUrl]);
      setAttachedImageIntents(prev => [...prev, intent]);
      setActiveImageUsage(intent);
    } catch {
      setUploadError("Image upload failed. Please try again.");
    } finally {
      setIsCloudinaryUploading(false);
    }
  };

  const openViewer = (images: GeneratedImage[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const renderMessageContent = (msg: ChatMessage & { references?: string[] }) => {
    const hasImages = msg.references && msg.references.length > 0;
    return (
      <div>
        {hasImages && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {msg.references!.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Reference ${i + 1}`}
                className="w-16 h-16 rounded-lg object-cover border border-white/10"
                data-testid={`img-reference-${i}`}
              />
            ))}
          </div>
        )}
        <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        <span className="text-[10px] opacity-50 mt-2 block">
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );
  };

  const renderDesignerContent = (msg: ChatMessage) => {
    const imageRegex = /https?:\/\/\S+\.(jpg|jpeg|png|webp)(?:\?\S*)?/gi;
    const inlineUrls = msg.content.match(imageRegex) || [];
    const textContent = msg.content.replace(imageRegex, '').trim();
    const conceptPairs: { url: string; title: string }[] = [];
    if (msg.concept_1_url) conceptPairs.push({ url: msg.concept_1_url, title: msg.concept_1_title || "Concept 1" });
    if (msg.concept_2_url) conceptPairs.push({ url: msg.concept_2_url, title: msg.concept_2_title || "Concept 2" });
    const displayPairs = conceptPairs.length > 0
      ? conceptPairs
      : inlineUrls.map((url, i) => ({ url, title: `Concept ${i + 1}` }));
    return (
      <div>
        {textContent.length > 0 && (
          <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap min-h-[20px]">
            {textContent}
          </p>
        )}
        {displayPairs.length > 0 && (
          <div className={`grid gap-3 mt-3 ${displayPairs.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {displayPairs.map(({ url, title }, i) => (
              <div key={i} className="flex flex-col gap-1">
                <img
                  src={url}
                  alt={title}
                  className="w-full rounded-lg object-cover border border-border/30 cursor-zoom-in"
                  onClick={() => {
                    const imgs: GeneratedImage[] = displayPairs.map(({ url: u, title: t }, idx) => ({
                      generated_image_id: `inline-${idx}`,
                      project_id: msg.project_id,
                      url: u,
                      title: t,
                      created_at: msg.created_at,
                      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
                    }));
                    openViewer(imgs, i);
                  }}
                  data-testid={`img-designer-concept-${i}`}
                />
                <span className="text-[11px] text-muted-foreground/70 text-center">{title}</span>
              </div>
            ))}
          </div>
        )}
        <span className="text-[10px] opacity-50 mt-2 block">
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, filter: "blur(6px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex flex-col h-auto md:h-screen bg-background md:overflow-hidden"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0 }}
      >
        <TopBar
          creditButtonRef={creditButtonRef}
        />
      </motion.div>

      <motion.main 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
        className="flex md:flex-1 flex-col md:flex-row md:overflow-hidden"
      >
        {/* Chat Area */}
        <div className="md:flex-1 flex flex-col md:min-w-0 bg-background/50 min-h-[calc(100svh-56px)] md:min-h-0">
          {isEmptyAuthenticatedProject ? (
            <EmptyStartScreen
              input={input}
              onInputChange={handleInputChange}
              onSendMessage={onSendMessage}
              isUploading={isUploading}
              isGenerating={isGenerating}
              isSending={isSending}
              onFileUpload={onFileUpload}
              fileInputRef={fileInputRef}
              inputRef={inputRef}
              uploadError={uploadError}
              attachedImageUrls={attachedImageUrls}
              onRemoveImage={removeAttachedImage}
              onUploadClick={openImageIntentModal}
            />
          ) : (
            <>
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="max-w-3xl mx-auto space-y-6 py-4">
                  <AnimatePresence initial={false}>
                    {currentMessages.map((msg) => (
                      <motion.div
                        key={msg.chat_message_id}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`flex ${msg.sender === 'system' ? 'justify-center' : msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        data-testid={`chat-message-${msg.sender}`}
                      >
                        {msg.sender === 'system' ? (
                          <div className="flex items-center gap-3 w-full max-w-md">
                            <span className="flex-1 h-px bg-border/40" />
                            <p className="text-[11px] text-muted-foreground/60 italic whitespace-nowrap">{msg.content}</p>
                            <span className="flex-1 h-px bg-border/40" />
                          </div>
                        ) : msg.sender === 'user' ? (
                          <div className="max-w-[85%] rounded-2xl p-4 shadow-sm bg-primary text-primary-foreground rounded-tr-none">
                            {renderMessageContent(msg as ChatMessage & { references?: string[] })}
                          </div>
                        ) : (
                          <div className="max-w-[85%] rounded-2xl p-4 shadow-sm bg-muted/80 text-foreground rounded-tl-none border border-border/50">
                            {renderDesignerContent(msg)}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {(isGenerating || isSending || showIntroTyping) && (
                    <div className="flex justify-start">
                      <div className="bg-muted/80 rounded-2xl rounded-tl-none p-4 flex items-center gap-3 border border-border/50">
                        <div className="flex items-center gap-1.5 px-1 py-1">
                          <style>{`
                            .thinking-dot {
                              width: 6px;
                              height: 6px;
                              border-radius: 999px;
                              background: currentColor;
                              opacity: 0.6;
                              animation: thinkingWave 1.2s infinite ease-in-out;
                            }
                            .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
                            .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
                            @keyframes thinkingWave {
                              0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                              40% { transform: scale(1); opacity: 1; }
                            }
                            .arrow-thinking {
                              animation: arrowPulseRotate 1.2s infinite ease-in-out;
                            }
                            @keyframes arrowPulseRotate {
                              0% { transform: rotate(0deg) scale(1); opacity: 0.8; }
                              50% { transform: rotate(15deg) scale(1.1); opacity: 1; }
                              100% { transform: rotate(0deg) scale(1); opacity: 0.8; }
                            }
                          `}</style>
                          <span className="thinking-dot text-primary"></span>
                          <span className="thinking-dot text-primary"></span>
                          <span className="thinking-dot text-primary"></span>
                        </div>
                        {(() => {
                          const txt = (isSending || isGenerating) ? getLoadingStatusText(loadingSeconds) : null;
                          return txt ? (
                            <span className="text-xs text-muted-foreground/70 italic select-none">{txt}</span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}
                  {genError && (
                    <div className="flex justify-start">
                      <div className="bg-destructive/10 text-destructive rounded-2xl rounded-tl-none p-4 border border-destructive/20" data-testid="text-gen-error">
                        <p className="text-sm">{genError}</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <AnimatePresence>
                {isLimitReached && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="mx-auto max-w-[640px] w-full px-4 mb-4"
                  >
                    <Card className="border-white/10 bg-black/40 backdrop-blur-xl p-6 py-6 relative overflow-hidden group shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                      <div className="relative z-10 flex flex-col items-center text-center space-y-3">
                        <img
                          src={logoIcon}
                          alt=""
                          className="h-10 w-10 transition-all duration-300 drop-shadow-[0_0_8px_rgba(124,58,237,0.4)] group-hover:scale-110 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.6)] group-hover:brightness-125"
                        />
                        <div className="space-y-1.5">
                          <h3 className="text-sm font-bold text-white tracking-tight">
                            You've reached your complimentary design session.
                          </h3>
                          <p className="text-xs text-white/50 leading-relaxed max-w-[280px] mx-auto pb-1">
                            Create your account to continue shaping your brand identity.
                          </p>
                        </div>
                        <div className="flex flex-col w-full gap-2 pt-1">
                          <Button
                            onClick={openAuthModal}
                            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-10 text-xs shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden upgrade-button-glow"
                          >
                            Continue My Brand Journey
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setIsLimitReached(false)}
                            className="w-full text-white/40 hover:text-white/60 hover:bg-white/5 h-8 text-[10px] transition-colors"
                          >
                            Maybe later
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {authState.isAuthenticated && Math.floor(creditsState.credits / 10) < 2 && Math.floor(creditsState.credits / 10) > 0 && (
                <div className="mx-4 mb-2">
                  <Card className="border-yellow-500/30 bg-yellow-500/10 p-4 transition-colors hover:bg-yellow-500/15">
                    <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
                      <div className="flex items-center gap-2 text-sm text-yellow-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-400" />
                        <span>You're running low on revisions — keep creating without interruptions.</span>
                      </div>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-100 border-none shrink-0"
                        onClick={() => setLocation("/checkout")}
                      >
                        View revisions
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {/* Action Bar + Chat Input */}
              <div className={`border-t border-border bg-background shrink-0 transition-opacity duration-300 ${isLimitReached ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <div className="relative max-w-3xl mx-auto p-4 flex flex-col gap-3">
                  {isCloudinaryUploading && (
                    <div className="flex items-center gap-2 px-1" data-testid="cloudinary-upload-loading">
                      <div className="w-20 h-20 rounded-lg border border-border/50 bg-muted/40 flex flex-col items-center justify-center gap-1.5 shrink-0">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        <span className="text-[10px] text-muted-foreground">Uploading…</span>
                      </div>
                    </div>
                  )}
                  {attachedImageUrls.length > 0 && (
                    <div className="flex gap-2 max-h-24 overflow-x-auto" data-testid="preview-tiles-container">
                      {attachedImageUrls.map((url, i) => (
                        <div key={i} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border/50">
                          <img src={url} alt={`Attached ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeAttachedImage(i)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                            data-testid={`button-remove-preview-${i}`}
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {uploadError && (
                    <p className="text-xs text-red-400 font-medium" data-testid="text-upload-error">{uploadError}</p>
                  )}
                  <form onSubmit={onSendMessage} className="relative flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={onFileUpload}
                      className="hidden"
                      accept="image/jpeg,image/png"
                    />
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 rounded-full hover:text-[#5B21B6] transition-colors duration-150"
                            onClick={openImageIntentModal}
                            disabled={isUploading || isGenerating || isSending}
                            data-testid="button-upload-image"
                          >
                            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-black text-white text-xs px-3 py-1.5 border-none">
                          Add reference images (PNG, JPG)
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => handleInputChange(e.target.value)}
                      placeholder="Describe your vision..."
                      className="h-12 rounded-full px-6 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/20"
                      data-testid="input-chat-message"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="shrink-0 rounded-full bg-primary text-primary-foreground"
                      disabled={!input.trim() || isSendLocked || isCloudinaryUploading}
                      data-testid="button-send-message"
                    >
                      {isSendLocked ? (
                        <style>{`
                          @keyframes lock-think {
                            0%, 100% {
                              transform: scale(1);
                              opacity: 0.8;
                              box-shadow: 0 0 8px rgba(167, 139, 250, 0.4);
                            }
                            50% {
                              transform: scale(1.15);
                              opacity: 1;
                              box-shadow: 0 0 12px rgba(167, 139, 250, 0.6);
                            }
                          }
                          .send-lock {
                            animation: lock-think 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                          }
                        `}</style>
                      ) : null}
                      {isSendLocked ? (
                        <div className="send-lock w-3 h-3 rounded-md bg-purple-400" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Gallery Panel */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.25 }}
          className={`${archiveOpen ? 'w-full md:w-64' : 'w-0 md:w-12'} flex flex-col md:shrink-0 border-l border-border bg-muted/10 transition-all duration-300 md:overflow-hidden`}
        >
          <div className="p-3 border-b border-border flex flex-col gap-3 bg-muted/20 min-w-0">
            <div className="flex items-center justify-between gap-2">
              {archiveOpen && (
                <>
                  <div 
                    className="flex items-center gap-2 overflow-hidden group cursor-pointer transition-all duration-150 ease-out hover:scale-[1.05]"
                    onClick={() => setLocation("/gallery")}
                  >
                    <ImageIcon className="w-4 h-4 text-primary group-hover:text-primary-foreground transition-colors" />
                    <h3 className="font-bold text-sm whitespace-nowrap group-hover:text-primary-foreground transition-colors">
                      Gallery
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setArchiveOpen(false)} className="hidden md:flex h-8 w-8" data-testid="button-collapse-panel">
                      <PanelRightClose className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
              {!archiveOpen && (
                <Button variant="ghost" size="icon" onClick={() => setArchiveOpen(true)} className="mx-auto" data-testid="button-expand-panel">
                  <PanelRightOpen className="w-4 h-4" />
                </Button>
              )}
            </div>
            {archiveOpen && (
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Search Projects..." 
                  className="h-8 pl-8 text-xs bg-background/50 border-border/50 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50"
                  value={search}
                  onFocus={() => {
                    if (search.trim() !== "") {
                      setIsSearchOpen(true);
                    }
                  }}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setIsSearchOpen(e.target.value.trim() !== "");
                    setHighlightIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (!isSearchOpen) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setHighlightIndex(prev =>
                        prev < filteredProjects.length - 1 ? prev + 1 : prev
                      );
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightIndex(prev => (prev > 0 ? prev - 1 : 0));
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const selected = filteredProjects[highlightIndex];
                      if (selected) {
                        activateProject(selected);
                      }
                    }
                    if (e.key === "Escape") {
                      setIsSearchOpen(false);
                      setSearch("");
                    }
                  }}
                />
                {isSearchOpen && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-lg bg-background border border-border shadow-xl max-h-60 overflow-y-auto
                               animate-in fade-in slide-in-from-top-1 duration-150"
                  >
                    {filteredProjects.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No projects found
                      </div>
                    ) : (
                      filteredProjects.map((proj, index) => {
                        const isHighlighted = index === highlightIndex;
                        return (
                          <div
                            key={proj.id}
                            onMouseEnter={() => setHighlightIndex(index)}
                            onClick={() => activateProject(proj)}
                            className={`px-3 py-2 text-xs cursor-pointer transition-all duration-150
                              ${isHighlighted
                                ? "bg-primary/10 border-l-2 border-primary"
                                : "hover:bg-muted/40"}
                            `}
                          >
                            {proj.name}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {archiveOpen && (
            <>
              <ScrollArea className="flex-1 p-3">
                <div className="flex flex-col gap-4 pb-20">
                  <div
                    className="cursor-pointer hover:bg-primary/10 transition-colors duration-150 ease-out border border-dashed border-primary/20 rounded-xl bg-muted/30 overflow-hidden"
                    onClick={() => setLocation("/gallery")}
                  >
                    {filteredImages.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs font-semibold text-white/90 tracking-tight">No concepts yet</p>
                        <p className="text-[10px] text-primary/50 mt-1 tracking-wide">Browse All Files</p>
                      </div>
                    ) : (
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Brand Gallery</p>
                          <p className="text-[10px] text-primary/60 tracking-wide">View All</p>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {filteredImages.slice(0, 8).map((img) => (
                            <img
                              key={img.generated_image_id}
                              src={img.url}
                              alt=""
                              className="w-full aspect-square rounded object-cover"
                              loading="lazy"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="pt-2">
                      <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              className="w-full h-[44px] border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 text-xs gap-2"
                              onClick={() => {
                                if (!authState.isAuthenticated) {
                                  requireAuth("new_project");
                                } else {
                                  startNewProject();
                                }
                              }}
                            >
                              <Sparkles className="w-3.5 h-3.5 text-primary" />
                              + New Project
                            </Button>
                          </TooltipTrigger>
                          {!authState.isAuthenticated && (
                            <TooltipContent className="bg-black text-white text-[10px] px-2 py-1 border-none">
                              Additional projects require an account.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-1">YOUR PROJECTS</h4>
                      <div className="space-y-1">
                        {projectList.map((proj) => {
                          const isActive = projectState.activeProject?.project_id === proj.id;
                          return (
                            <div 
                              key={proj.id}
                              id={`project-${proj.id}`}
                              onClick={() => activateProject(proj)}
                              className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-150 ${isActive ? 'bg-primary/15 border border-primary/30' : 'bg-muted/30 border border-transparent hover:bg-neutral-800'}`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                                <span className={`text-xs truncate font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{proj.name}</span>
                              </div>
                              <div
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="p-1 hover:bg-white/10 rounded">
                                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36">
                                    <DropdownMenuItem onClick={() => openRenameModal(proj)}>
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => openDeleteModal(proj)} className="text-red-500">
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          );
                        })}
                        {projectList.length === 0 && (
                          <p className="text-[10px] text-muted-foreground/50 italic px-2">Projects appear here</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
              {authState.isAuthenticated && (
                <div className="shrink-0 border-t border-border p-3 flex flex-col">
                  <div className="px-2 pb-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                    Account
                  </div>
                  <button
                    onClick={() => setLocation("/profile")}
                    className="group flex items-center justify-start gap-2 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 bg-primary/5 border border-primary/10 hover:bg-primary/10 hover:shadow-[0_0_18px_rgba(124,58,237,0.35)]"
                    data-testid="button-settings-billing"
                  >
                    <UserIcon className="w-5 h-5 text-primary/80 group-hover:text-white" />
                    <span className="text-sm text-primary/90 group-hover:text-white">
                      Settings & Billing
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </motion.main>

      {/* Fullscreen Viewer */}
      <AnimatePresence>
        {viewerOpen && viewerImages.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center"
            data-testid="mockup-viewer"
            onClick={() => setViewerOpen(false)}
          >
            <div className="absolute top-4 right-4 z-10">
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setViewerOpen(false); }} className="text-white/70 hover:text-white hover:bg-white/10" data-testid="button-close-viewer">
                <X className="w-6 h-6" />
              </Button>
            </div>
            <div className="flex-1 flex items-center justify-center w-full relative px-16" onClick={(e) => e.stopPropagation()}>
              {viewerImages.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewerIndex((viewerIndex - 1 + viewerImages.length) % viewerImages.length)}
                  className="absolute left-4 text-white/70 hover:text-white hover:bg-white/10"
                  data-testid="button-viewer-prev"
                >
                  <ChevronLeft className="w-8 h-8" />
                </Button>
              )}
              <img
                src={viewerImages[viewerIndex].url}
                alt={viewerImages[viewerIndex].title || `Concept ${viewerIndex + 1}`}
                className="max-w-full max-h-[75vh] object-contain rounded-md cursor-pointer"
                data-testid="img-viewer-current"
                onClick={() => { setViewerOpen(false); setLocation('/gallery'); }}
              />
              {viewerImages.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewerIndex((viewerIndex + 1) % viewerImages.length)}
                  className="absolute right-4 text-white/70 hover:text-white hover:bg-white/10"
                  data-testid="button-viewer-next"
                >
                  <ChevronRight className="w-8 h-8" />
                </Button>
              )}
            </div>
            <div className="p-6 w-full max-w-2xl flex flex-col sm:flex-row items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-1 text-center sm:text-left">
                <p className="text-sm font-bold text-white/90">
                  {viewerImages[viewerIndex].title || `Concept ${viewerIndex + 1}`}
                </p>
                <p className="text-xs text-white/50 flex items-center gap-1 justify-center sm:justify-start">
                  <Shield className="w-3 h-3" /> Click image to view in gallery · {viewerIndex + 1} of {viewerImages.length}
                </p>
              </div>
              <Button 
                className="rounded-full hover:scale-105 hover:brightness-110 transition-transform duration-200" 
                onClick={() => {
                  let url = viewerImages[viewerIndex].url;
                  const title = viewerImages[viewerIndex].title || `Concept ${viewerIndex + 1}`;
                  if (url.includes("res.cloudinary.com")) {
                    url = url.replace("/upload/", "/upload/fl_attachment/");
                  }
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }} 
                data-testid="button-download-mockup"
              >
                <Download className="w-4 h-4 mr-2" /> Download HQ
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal Overlay */}
      <AnimatePresence>
        {authModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            data-testid="auth-modal-overlay"
          >
            <div className="relative w-full max-w-[460px]">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setAuthModalOpen(false);
                  setIsLimitReached(false);
                  setAuthModalContext("default");
                }}
                className="absolute -top-2 -right-2 z-10 text-white/70 hover:text-white hover:bg-white/10 rounded-full"
                data-testid="button-close-auth-modal"
              >
                <X className="w-5 h-5" />
              </Button>
              <Auth
                embedded={true}
                defaultMode="signup"
                overrideTitle={
                  authModalContext === "image"
                    ? "Ready to bring your vision to life?"
                    : authModalContext === "generation"
                      ? "Ready to generate your custom concepts?"
                      : undefined
                }
                overrideSubtext={
                  authModalContext === "image"
                    ? "To use reference images and custom styles, please create a free account. This allows us to save your brand assets and personal preferences."
                    : authModalContext === "generation"
                      ? "Create a free account to run the design generation engine. This allows us to process your briefs, save your high-resolution assets, and build your brand system."
                      : undefined
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={projectModalOpen} onOpenChange={(open) => {
        if (!isCreatingProject) {
          setProjectModalOpen(open);
          if (!open) {
            setNewProjectName("");
            setProjectError(null);
          }
        }
      }}>
        <DialogContent className="sm:max-w-[425px] border-white/10 bg-[#0A0A0B] p-0 overflow-hidden outline-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="p-6 space-y-6"
          >
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Input
                  autoFocus
                  placeholder="Enter project name..."
                  value={newProjectName}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.length <= 60) {
                      setNewProjectName(val);
                      if (projectError) setProjectError(null);
                    }
                  }}
                  onBlur={() => {
                    if (!newProjectName.trim()) {
                      setProjectError("Project name cannot be empty.");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateProject();
                    }
                  }}
                  className={`h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 pr-16 transition-all duration-200 ${projectError ? 'border-red-500 ring-1 ring-red-500/20' : 'focus:border-primary/50'}`}
                />
                <div className={`absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono transition-colors ${
                  newProjectName.length === 60 ? 'text-red-500' : 
                  newProjectName.length >= 50 ? 'text-orange-400' : 'text-muted-foreground'
                }`}>
                  {newProjectName.length} / 60
                </div>
              </div>
              {projectError && (
                <motion.p 
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[11px] text-red-500 font-medium ml-1"
                >
                  {projectError}
                </motion.p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                onClick={() => setProjectModalOpen(false)}
                disabled={isCreatingProject}
                className="text-white/60 hover:text-white hover:bg-white/5 transition-opacity duration-140 hover:opacity-70"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={isCreatingProject || !newProjectName.trim()}
                className={`relative min-w-[100px] bg-primary text-white font-bold transition-all duration-160
                  ${!newProjectName.trim() || isCreatingProject ? 'opacity-45 cursor-not-allowed' : 'hover:-translate-y-px hover:shadow-[0_0_0_1px_rgba(124,58,237,0.4),0_6px_18px_rgba(124,58,237,0.25)] active:translate-y-0 active:shadow-sm'}`}
              >
                {isCreatingProject ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Create Project"
                )}
              </Button>
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteProject} onOpenChange={(open) => !open && setDeleteProject(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0A0A0B] p-6 outline-none sm:max-w-[425px]">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
              Deleting <span className="text-white font-semibold">"{deleteProject?.name}"</span> will permanently remove the project and all messages associated with it.
              <br />
              <br />
              Concepts related to this project will remain available in the Gallery for up to 30 days after they were generated.
              <br />
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteProject}
              className="flex-[1.5] h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] transition-all duration-200 border-none"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!renameProject} onOpenChange={(open) => !open && setRenameProject(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0A0A0B] p-6 outline-none sm:max-w-[425px]">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold text-white">Rename Project</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Input
                placeholder="Enter new name..."
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameProject();
                }}
                className="h-12 bg-white/5 border-white/10 focus:border-primary/50 focus:ring-primary/20 rounded-xl px-4 text-white placeholder:text-white/20 transition-all duration-200"
              />
            </div>
          </div>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200">
              Cancel
            </AlertDialogCancel>
            <Button 
              onClick={handleRenameProject}
              disabled={!renameValue.trim()}
              className="flex-[1.5] h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all duration-200 disabled:opacity-50 disabled:shadow-none"
            >
              Rename
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Intent Modal */}
      <Dialog open={showImageIntentModal} onOpenChange={setShowImageIntentModal}>
        <DialogContent className="sm:max-w-[480px] border-white/10 bg-[#0A0A0B] p-0 overflow-hidden outline-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="p-6 space-y-5"
          >
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white">How should we use this photo?</DialogTitle>
            </DialogHeader>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Visual Inspiration</p>
                  <p className="text-xs text-white/50 italic">"I want the design to feel like this."</p>
                </div>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Use this to help your Identity Brand Designer understand the aesthetic, mood, or layout you're aiming for. This helps the agent "see" your vision without trying to replicate the image exactly.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full mt-1 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white hover:border-white/20 rounded-lg font-medium transition-all duration-150"
                onClick={() => selectImageIntent("inspiration")}
                data-testid="button-intent-inspiration"
              >
                Use for Inspiration
              </Button>
            </div>
            <div className="rounded-xl border border-[#5B21B6]/40 bg-[#5B21B6]/10 p-4 space-y-2 hover:border-[#5B21B6]/60 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Image Reference</p>
                  <p className="text-xs text-white/50 italic">"I want this specific person or object in the result."</p>
                </div>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Use this if you want the AI to use the source image as a direct blueprint for the final output.
              </p>
              <p className="text-[11px] text-[#a78bfa] leading-relaxed">
                <span className="font-semibold">Expert note:</span> This will strongly influence the generation. It is highly recommended for thumbnails or any design where you want/need your face to be the core of the image.
              </p>
              <Button
                type="button"
                className="w-full mt-1 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_22px_rgba(124,58,237,0.5)] transition-all duration-150"
                onClick={() => selectImageIntent("reference")}
                data-testid="button-intent-reference"
              >
                Use for Reference
              </Button>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>

      {/* Out of Revisions Modal */}
      <AlertDialog open={showNoCreditsModal} onOpenChange={setShowNoCreditsModal}>
        <AlertDialogContent className="border-white/10 bg-[#0A0A0B] p-6 outline-none sm:max-w-[425px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <AlertDialogHeader className="space-y-3">
              <AlertDialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">✦</span>
                Out of Revisions
              </AlertDialogTitle>
              <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
                You have used all your available revisions. Please add more to continue designing with the agent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
              <AlertDialogCancel className="flex-1 h-11 rounded-xl border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200">
                Close
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { setShowNoCreditsModal(false); setLocation("/checkout"); }}
                className="flex-[1.5] h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all duration-200 border-none"
              >
                Add Revisions
              </AlertDialogAction>
            </AlertDialogFooter>
          </motion.div>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}