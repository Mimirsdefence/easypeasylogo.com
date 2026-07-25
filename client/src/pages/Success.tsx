import { useCredits } from "@/state/CreditsContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import TopBar from "@/components/TopBar";
import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Success() {
  const { state: creditsState, setCredits } = useCredits();
  const [isLoading, setIsLoading] = useState(false);
  const [finalCredits, setFinalCredits] = useState<number | null>(null);
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);
  const preCheckoutBalanceRef = useRef<number | null>(null);
  const hasSessionIdRef = useRef(false);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    hasSessionIdRef.current = !!sessionId;

    if (!sessionId) {
      return;
    }

    let mounted = true;
    let retryCount = 0;
    const maxRetries = 8;
    const retryIntervalMs = 1500;
    preCheckoutBalanceRef.current = creditsState.credits;

    setIsLoading(true);

    const fetchAndConfirmCredits = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;

        const { data, error } = await supabase
          .from("user_credits")
          .select("balance")
          .eq("user_id", user.id)
          .single();

        if (error && error.code === "PGRST116") {
          if (mounted) {
            setFinalCredits(0);
            setCredits(0);
            setIsLoading(false);
          }
          return;
        }

        if (error) {
          console.error("Failed to fetch credits:", error);
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(fetchAndConfirmCredits, retryIntervalMs);
          } else {
            if (mounted) setIsLoading(false);
          }
          return;
        }

        const newBalance = data?.balance ?? 0;

        if (newBalance !== preCheckoutBalanceRef.current) {
          if (mounted) {
            setFinalCredits(newBalance);
            setCredits(newBalance);
            setIsLoading(false);
            setShowTimeoutMessage(false);
          }
          return;
        }

        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(fetchAndConfirmCredits, retryIntervalMs);
        } else {
          if (mounted) {
            setFinalCredits(newBalance);
            setCredits(newBalance);
            setIsLoading(false);
            setShowTimeoutMessage(true);
          }
        }
      } catch (err) {
        console.error("Error confirming credits:", err);
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(fetchAndConfirmCredits, retryIntervalMs);
        } else {
          if (mounted) setIsLoading(false);
        }
      }
    };

    fetchAndConfirmCredits();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, filter: "blur(12px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex flex-col min-h-screen bg-background"
    >
      <TopBar />
      <main className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        {hasSessionIdRef.current && isLoading ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Finalizing your purchase…</h2>
              <p className="text-muted-foreground">Updating your revisions...</p>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
              className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(168,85,247,0.2)] cursor-default hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-shadow"
            >
              <CheckCircle2 className="w-10 h-10 text-purple-500" />
            </motion.div>
            
            <h1 className="text-4xl font-bold mb-4">Payment successful</h1>
            <p className="text-muted-foreground mb-8">
              {showTimeoutMessage ? "Your revisions will update shortly." : "Your revisions have been updated."}
            </p>

            {finalCredits !== null && preCheckoutBalanceRef.current !== null && Math.floor((finalCredits - preCheckoutBalanceRef.current) / 10) > 0 && (
              <p className="text-base text-foreground mb-6" data-testid="text-revisions-added">
                You've successfully added {Math.floor((finalCredits - preCheckoutBalanceRef.current) / 10)} Revisions to your account.
              </p>
            )}
            
            <motion.div 
              whileHover={{
                boxShadow: "0 0 25px rgba(168,85,247,0.35)",
                borderColor: "rgba(168,85,247,0.5)"
              }}
              className="bg-card/50 border border-purple-500/20 p-6 rounded-2xl mb-12 min-w-[200px] shadow-[0_0_15px_rgba(168,85,247,0.15)] cursor-default transition-all"
            >
              <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Revisions Remaining</div>
              <div className="text-5xl font-bold text-purple-500" data-testid="text-credits-count">
                {Math.floor((finalCredits !== null ? finalCredits : creditsState.credits) / 10)}
              </div>
              <div className="text-xs text-muted-foreground mt-2">Revisions</div>
            </motion.div>

            <Button asChild size="lg" className="rounded-xl bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] text-white font-bold px-12 hover:scale-105 transition-all duration-200 hover:shadow-[0_0_22px_rgba(124,58,237,0.6)] active:scale-95">
              <Link href="/app">Continue designing</Link>
            </Button>
          </>
        )}
      </main>
    </motion.div>
  );
}
