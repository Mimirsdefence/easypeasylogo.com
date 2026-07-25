import { useAuth } from "@/state/AuthContext";
import { useGeneration } from "@/state/GenerationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ChevronLeft, Search, Download, X } from "lucide-react";
import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import { motion } from "framer-motion";
import { GeneratedImage } from "@/types";
import { supabase } from "@/lib/supabaseClient";
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

// Group images by the row ID (removing the -1 or -2 suffix)
function groupImagesByRow(images: GeneratedImage[]) {
  const groups: { rowId: string; concept1: GeneratedImage; concept2: GeneratedImage | null }[] = [];
  const map = new Map<string, { concept1: GeneratedImage | null; concept2: GeneratedImage | null }>();

  images.forEach((img) => {
    let rowId: string;
    let index: "concept1" | "concept2";

    const lastDashIdx = img.generated_image_id.lastIndexOf('-');
    if (lastDashIdx > 0) {
      rowId = img.generated_image_id.substring(0, lastDashIdx);
      const suffix = img.generated_image_id.substring(lastDashIdx + 1);
      index = suffix === "1" ? "concept1" : "concept2";
    } else {
      rowId = img.generated_image_id;
      index = "concept1";
    }

    if (!map.has(rowId)) {
      map.set(rowId, { concept1: null, concept2: null });
    }
    const entry = map.get(rowId)!;
    entry[index] = img;
  });

  map.forEach((entry, rowId) => {
    if (entry.concept1) {
      groups.push({
        rowId,
        concept1: entry.concept1,
        concept2: entry.concept2 || null,
      });
    }
  });

  return groups;
}

export default function Gallery() {
  const [, setLocation] = useLocation();
  const { state: authState } = useAuth();
  const { state: generationState, setImages } = useGeneration();
  const [search, setSearch] = useState("");
  const [groupToDelete, setGroupToDelete] = useState<{
    rowId: string;
    concept1: GeneratedImage;
    concept2: GeneratedImage | null;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [frontImageMap, setFrontImageMap] = useState<Record<string, "concept1" | "concept2">>({});
  const [hovered, setHovered] = useState<Record<string, { front: boolean; back: boolean }>>({});

  const filteredImages = useMemo(() => {
    const term = search.toLowerCase();
    return generationState.generatedImages.filter(img => {
      const matchesSearch = !term ||
        (img.title?.toLowerCase().includes(term)) ||
        img.url.toLowerCase().includes(term);
      return matchesSearch;
    });
  }, [generationState.generatedImages, search]);

  const filteredGroups = useMemo(() => {
    return groupImagesByRow(filteredImages);
  }, [filteredImages]);

  const handleDelete = async () => {
    if (!groupToDelete || !authState.isAuthenticated) {
      alert("You must be logged in to delete.");
      return;
    }
    setIsDeleting(true);

    try {
      const rowId = groupToDelete.rowId;
      const { error } = await supabase
        .from("logo_gallery")
        .delete()
        .eq("logo_id", rowId);

      if (error) {
        console.error("Delete error:", error);
        alert("Delete failed: " + error.message);
        setIsDeleting(false);
        return;
      }

      const updated = generationState.generatedImages.filter(
        (img) => !img.generated_image_id.startsWith(rowId + '-')
      );
      setImages(updated);

      setGroupToDelete(null);
    } catch (err: any) {
      console.error("Delete error:", err);
      alert("Unexpected error: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleFrontImage = (rowId: string, target?: "concept1" | "concept2") => {
    setFrontImageMap((prev) => {
      const current = prev[rowId] || "concept1";
      const next = target || (current === "concept1" ? "concept2" : "concept1");
      return {
        ...prev,
        [rowId]: next,
      };
    });
  };

  const handleDownload = (img: GeneratedImage) => {
    let url = img.url;
    const title = img.title || "Concept";
    if (url.includes("res.cloudinary.com")) {
      url = url.replace("/upload/", "/upload/fl_attachment/");
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const setHover = (rowId: string, type: "front" | "back", value: boolean) => {
    setHovered((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [type]: value,
      },
    }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="container mx-auto pt-24 pb-12 px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <Button
              variant="ghost"
              className="mb-4 -ml-4 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/app")}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Designer
            </Button>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="text-3xl font-bold"
            >
              Brand Gallery
            </motion.h1>
            <p className="text-sm text-muted-foreground mt-1">
              Showing all account concepts
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search concepts..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative flex flex-col items-center justify-center py-24 border-2 border-dashed border-primary/30 rounded-xl bg-muted/20 overflow-hidden"
          >
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 1.4, ease: "easeInOut", delay: 0.3 }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent pointer-events-none"
            />
            <p className="text-foreground text-lg mb-4 font-semibold tracking-[0.04em]">No concepts found</p>
            <Button
              onClick={() => setLocation("/app")}
              className="h-[44px] border-2 border-primary/50 hover:border-primary hover:shadow-[0_0_12px_rgba(124,58,237,0.35)] transition-all duration-200 hover:scale-[1.03] ease-out"
            >
              Start Designing
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-16 gap-y-8">
            {filteredGroups.map((group) => {
              const rowId = group.rowId;
              const frontKey = frontImageMap[rowId] || "concept1";
              const frontImg = frontKey === "concept1" ? group.concept1 : group.concept2;
              const backImg = frontKey === "concept1" ? group.concept2 : group.concept1;
              const isFrontHovered = hovered[rowId]?.front || false;
              const isBackHovered = hovered[rowId]?.back || false;

              return (
                <motion.div
                  key={rowId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="group"
                >
                  <div className="relative aspect-square">
                    {/* BACK IMAGE – scale same as front, slide further right on hover */}
                    {backImg && (
                      <div
                        className="absolute inset-0 transition-all duration-300 z-0"
                        style={{
                          transform: isBackHovered
                            ? 'scale(1.05) translateX(48px) rotate(-2deg)'
                            : 'translateX(24px) rotate(-2deg)',
                        }}
                        onClick={() => toggleFrontImage(rowId)}
                        onMouseEnter={() => setHover(rowId, 'back', true)}
                        onMouseLeave={() => setHover(rowId, 'back', false)}
                      >
                        <img
                          src={backImg.url}
                          alt={backImg.title || "Concept"}
                          className="w-full h-full object-cover rounded-lg border-2 border-border/30 shadow-md"
                        />
                      </div>
                    )}

                    {/* FRONT IMAGE + OVERLAY + BUTTONS – scale 1.05 on hover */}
                    <div
                      className="absolute inset-0 transition-transform duration-300 z-10 cursor-pointer"
                      style={{
                        transform: isFrontHovered ? 'scale(1.05)' : 'scale(1)',
                      }}
                      onClick={() => toggleFrontImage(rowId)}
                      onMouseEnter={() => setHover(rowId, 'front', true)}
                      onMouseLeave={() => setHover(rowId, 'front', false)}
                    >
                      <img
                        src={frontImg.url}
                        alt={frontImg.title || "Concept"}
                        className="w-full h-full object-cover rounded-lg shadow-lg"
                      />

                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg pointer-events-none" />

                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                        <div className="pointer-events-auto">
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(frontImg);
                            }}
                            className="hover:outline hover:outline-2 hover:outline-primary hover:shadow-[0_0_12px_rgba(124,58,237,0.35)] transition-all duration-200 hover:scale-[1.05]"
                          >
                            <Download className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>

                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                        <div className="pointer-events-auto">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-white/70 hover:text-red-500 hover:bg-red-500/20 transition-all duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setGroupToDelete(group);
                            }}
                          >
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Titles – clickable, mt-4 */}
                  <div className="mt-4 px-1 flex flex-col gap-0.5">
                    <div
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => toggleFrontImage(rowId, "concept1")}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${frontKey === "concept1" ? "bg-primary" : "bg-muted-foreground/30"}`} />
                      <span className={`text-xs font-medium ${frontKey === "concept1" ? "text-primary" : "text-muted-foreground/60"}`}>
                        {group.concept1.title || "Concept 1"}
                      </span>
                    </div>
                    {group.concept2 && (
                      <div
                        className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => toggleFrontImage(rowId, "concept2")}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${frontKey === "concept2" ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        <span className={`text-xs font-medium ${frontKey === "concept2" ? "text-primary" : "text-muted-foreground/60"}`}>
                          {group.concept2.title || "Concept 2"}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <AlertDialog open={!!groupToDelete} onOpenChange={(open) => !open && setGroupToDelete(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0A0A0B] p-6 outline-none sm:max-w-[425px]">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-red-500">⚠️</span> Delete Both Concepts?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
              You are about to permanently delete both concepts from your gallery:
              <br />
              <br />
              <span className="text-white font-semibold">
                • {groupToDelete?.concept1?.title || "Concept 1"}
                {groupToDelete?.concept2 && (
                  <>
                    <br />• {groupToDelete.concept2.title || "Concept 2"}
                  </>
                )}
              </span>
              <br />
              <br />
              <span className="text-red-400 font-semibold">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="flex-[1.5] h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] transition-all duration-200 border-none"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}