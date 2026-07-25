import { useState, useEffect, useRef } from "react";
import { Loader2, Send, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EmptyStartScreenProps {
  input: string;
  onInputChange: (value: string) => void;
  onSendMessage: (e?: React.FormEvent) => void;
  isUploading: boolean;
  isGenerating: boolean;
  isSending: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  uploadError: string | null;
  attachedImageUrls: string[];
  onRemoveImage: (index: number) => void;
  onUploadClick: () => void;
}

export default function EmptyStartScreen({
  input,
  onInputChange,
  onSendMessage,
  isUploading,
  isGenerating,
  isSending,
  onFileUpload,
  fileInputRef,
  inputRef,
  uploadError,
  attachedImageUrls,
  onRemoveImage,
  onUploadClick,
}: EmptyStartScreenProps) {
  const [displayText, setDisplayText] = useState("");
  const animationRef = useRef<NodeJS.Timeout>();

  const fullText = "Design Your Brand.";

  useEffect(() => {
    let i = 0;
    animationRef.current = setInterval(() => {
      setDisplayText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) {
        clearInterval(animationRef.current);
      }
    }, 25);

    return () => {
      if (animationRef.current) clearInterval(animationRef.current);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-background/50">
      {/* Main centered content area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 -translate-y-14">

        {/* Title with Typewriter Animation */}
        <h1 className="start-title" style={{ letterSpacing: "-0.02em" }}>
          {displayText}
        </h1>
        <style>{`
          .start-title {
            font-size: 34px;
            font-weight: 500;
            letter-spacing: -0.02em;
            color: #ffffff;
            text-align: center;
            margin: 0;
          }
        `}</style>

        {/* Chat Input in Center */}
        <div className="w-full max-w-2xl flex flex-col gap-3">
          {/* Preview tiles for attached images */}
          {attachedImageUrls.length > 0 && (
            <div className="flex gap-2 max-h-24 overflow-x-auto px-4">
              {attachedImageUrls.map((url, i) => (
                <div key={i} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border/50">
                  <img src={url} alt={`Attached ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                  >
                    <span className="text-white text-xs font-bold">×</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadError && (
            <p className="text-xs text-red-400 font-medium px-4">{uploadError}</p>
          )}

          <form onSubmit={onSendMessage} className="relative flex items-center gap-2 px-4">
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
                    onClick={onUploadClick}
                    disabled={isUploading || isGenerating || isSending}
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
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Describe your vision..."
              className="h-12 rounded-full px-6 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/20"
              disabled={isGenerating || isSending}
            />

            <Button
              type="submit"
              size="icon"
              className="shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-white hover:text-primary transition-colors duration-150"
              disabled={!input.trim() || isGenerating || isSending}
            >
              <Send className={`w-4 h-4 ${isGenerating || isSending ? "arrow-thinking" : ""}`} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
