import { useAuth } from "@/state/AuthContext";
import { useUser } from "@/state/UserContext";
import { useCredits } from "@/state/CreditsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ChevronLeft, LogOut, CreditCard, Shield, User, AlertTriangle } from "lucide-react";
import TopBar from "@/components/TopBar";
import { logout } from "@/lib/auth";
import { motion } from "framer-motion";
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
import { useState } from "react";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { state: authState, setAuth } = useAuth();
  const { state: userState, setUser } = useUser();
  const { state: creditsState } = useCredits();
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [cancelAt, setCancelAt] = useState<string | null | undefined>(undefined);
  const [hasSubscription, setHasSubscription] = useState<boolean | undefined>(undefined);

  if (!authState.isAuthenticated) {
    setLocation("/auth");
    return null;
  }

  const handleLogout = async () => {
    await logout();
    setAuth(false);
    setUser(null);
    setLocation("/");
  };

  const handleBillingPortal = async () => {
    setIsOpeningPortal(true);
    setPortalError(null);

    try {
      if (!userState.user?.user_id) {
        throw new Error("User information not available");
      }

      const response = await fetch("/api/create-billing-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userState.user.user_id }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setPortalError("No active subscription found.");
        } else {
          setPortalError("Failed to open billing portal. Please try again.");
        }
        setIsOpeningPortal(false);
        return;
      }

      if (data.url) {
        setIsRedirectingToStripe(true);
        window.location.href = data.url;
      }
    } catch (error: any) {
      setPortalError("Failed to open billing portal. Please try again.");
      console.error("Billing portal error:", error);
      setIsOpeningPortal(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationInput !== "DELETE") return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userState.user?.user_id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete account");
      }

      // Account deleted successfully, logout and redirect
      setAuth(false);
      setUser(null);
      setLocation("/");
    } catch (error: any) {
      setDeleteError(error.message || "An error occurred while deleting your account");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="container max-w-2xl mx-auto pt-24 pb-12 px-4">
        <Button 
          variant="ghost" 
          className="mb-8 -ml-4 text-muted-foreground hover:text-foreground"
          onClick={() => setLocation("/app")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Designer
        </Button>

        <h1 className="text-3xl font-bold mb-8">Profile & Settings</h1>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, show: { transition: { delayChildren: 0.05, staggerChildren: 0.12 } } }}
          className="space-y-6"
        >
          {/* Account Card */}
          <motion.div
            variants={{ 
              hidden: { opacity: 0, x: -40 }, 
              show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } 
            }}
            className="p-6 rounded-xl border border-[#7C3AED]/40 ring-1 ring-[#7C3AED]/20 bg-card/50 space-y-4 hover:border-[#8c64ff] hover:shadow-[0_0_20px_rgba(140,100,255,0.15)] transition-colors transition-shadow shadow-[0_0_25px_rgba(124,58,237,0.35)]"
          >
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-primary" />
                Account
              </h2>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{userState.user?.email}</span>
              </div>
              <Button 
                className="w-full mt-4 border-[#7C3AED]/20 hover:border-[#7C3AED]/50 font-bold transition-colors duration-200 rounded-xl" 
                variant="outline"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </motion.div>

          {/* Credits Card */}
          <motion.div
            variants={{ 
              hidden: { opacity: 0, x: 40 }, 
              show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } 
            }}
            className="p-6 rounded-xl border border-[#7C3AED]/40 ring-1 ring-[#7C3AED]/20 bg-card/50 space-y-4 hover:border-[#8c64ff] hover:shadow-[0_0_20px_rgba(140,100,255,0.15)] transition-colors transition-shadow shadow-[0_0_25px_rgba(124,58,237,0.35)]"
          >
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-primary" />
                Revisions
              </h2>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Revisions Remaining</span>
                <span className="text-2xl font-bold text-primary">{Math.floor(creditsState.credits / 10)}</span>
              </div>
              <Button 
                className="w-full mt-2 bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] text-white font-bold hover:scale-[1.04] transition-all duration-200 hover:shadow-[0_0_22px_rgba(124,58,237,0.6)] active:scale-95 hover:ring-purple-500/40 rounded-xl"
                onClick={() => setLocation("/checkout")}
              >
                Add Revisions
              </Button>
            </div>
          </motion.div>

          {/* Billing Card */}
          <motion.div
            variants={{ 
              hidden: { opacity: 0, x: -40 }, 
              show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } 
            }}
            className="p-6 rounded-xl border border-[#7C3AED]/40 ring-1 ring-[#7C3AED]/20 bg-card/50 space-y-4 hover:border-[#8c64ff] hover:shadow-[0_0_20px_rgba(140,100,255,0.15)] transition-colors transition-shadow shadow-[0_0_25px_rgba(124,58,237,0.35)]"
          >
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-primary" />
                Billing
              </h2>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Manage your invoices, payment methods, and subscription status.
              </p>
              <Button 
                variant="outline" 
                className="w-full border-[#7C3AED]/20 hover:border-[#7C3AED]/50 font-bold transition-colors duration-200 rounded-xl"
                onClick={handleBillingPortal}
                disabled={isOpeningPortal || isRedirectingToStripe}
              >
                {isRedirectingToStripe ? "Redirecting to Stripe..." : isOpeningPortal ? "Opening Portal..." : "Manage Billing Portal"}
              </Button>
              {portalError && (
                <p className="text-red-500 text-sm font-medium">{portalError}</p>
              )}
            </div>
          </motion.div>

          {/* Danger Zone Card */}
          <motion.div
            variants={{ 
              hidden: { opacity: 0, x: 40 }, 
              show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } 
            }}
            className="group p-6 rounded-xl border border-red-500/40 ring-1 ring-red-500/20 bg-destructive/5 space-y-4 hover:border-red-500/80 hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-colors transition-shadow shadow-[0_0_20px_rgba(239,68,68,0.2)]"
          >
            <div>
              <h2 className="text-xl font-bold text-destructive flex items-center gap-2 mb-4 group-hover:text-red-500 transition-colors">
                Danger Zone
              </h2>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button 
                variant="destructive" 
                className="w-full font-bold transition-all duration-200 active:scale-95 rounded-xl hover:bg-red-600"
                onClick={async () => {
                  setShowDeleteAccountModal(true);
                  setDeleteConfirmationInput("");
                  setDeleteError(null);
                  setCancelAt(undefined);
                  setHasSubscription(undefined);
                  
                  try {
                    const response = await fetch("/api/check-subscription-cancel-at", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: userState.user?.user_id }),
                    });
                    const data = await response.json();
                    setCancelAt(data.cancel_at);
                    setHasSubscription(data.has_subscription);
                  } catch (error) {
                    console.error("Error checking subscription status:", error);
                    setCancelAt(null);
                    setHasSubscription(false);
                  }
                }}
              >
                Delete Account
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <AlertDialog open={showDeleteAccountModal} onOpenChange={(open) => {
        if (!isDeleting) {
          setShowDeleteAccountModal(open);
          if (!open) {
            setDeleteConfirmationInput("");
            setDeleteError(null);
          }
        }
      }}>
        <AlertDialogContent className="border-white/10 bg-[#0A0A0B] p-6 outline-none sm:max-w-[425px]">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Account
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
              Deleting your account will permanently remove:
              <br />
              <br />
              • Your account and all associated data
              <br />
              • All projects and chat messages
              <br />
              • All generated concepts and designs
              <br />
              • Your revisions and subscription records
              <br />
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-white/70 text-sm font-medium">Type <span className="font-bold text-white">DELETE</span> to confirm:</p>
            <Input
              placeholder="Type DELETE to confirm"
              value={deleteConfirmationInput}
              onChange={(e) => {
                setDeleteConfirmationInput(e.target.value.toUpperCase());
                setDeleteError(null);
              }}
              disabled={hasSubscription === true && cancelAt == null}
              className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {hasSubscription === true && cancelAt == null && (
              <p className="text-red-500 text-sm font-medium">You must cancel your subscription before you can delete your account.</p>
            )}
            {deleteError && (
              <p className="text-red-500 text-sm font-medium">{deleteError}</p>
            )}
          </div>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
            <AlertDialogCancel 
              className="flex-1 h-11 rounded-xl border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200"
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAccount}
              disabled={deleteConfirmationInput !== "DELETE" || isDeleting || (hasSubscription === true && cancelAt == null)}
              className="flex-[1.5] h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] transition-all duration-200 border-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-500"
            >
              {isDeleting ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
