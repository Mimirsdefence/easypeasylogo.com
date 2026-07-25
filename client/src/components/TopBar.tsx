import { Link, useLocation } from "wouter";
import { useAuth } from "@/state/AuthContext";
import { useUser } from "@/state/UserContext";
import { useCredits } from "@/state/CreditsContext";
import { logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogOut, User as UserIcon } from "lucide-react";
import logoIcon from "@assets/logo.webp";
import React from "react";

type TopBarProps = {
  creditButtonRef?: React.RefObject<HTMLButtonElement>;
};

export default function TopBar({ creditButtonRef }: TopBarProps = {}) {
  const [, setLocation] = useLocation();
  const { state: authState, setAuth } = useAuth();
  const { state: userState, setUser } = useUser();
  const { state: creditsState } = useCredits();

  const handleLogout = async () => {
    await logout();
    setAuth(false);
    setUser(null);

    // --- CLEAR GUEST SESSION DATA ---
    localStorage.removeItem("easypeasy_session_id");
    localStorage.removeItem("easypeasy_session_project_id");

    // Force a hard reload to reset all React state and contexts
    window.location.href = "/";
  };

  const goHome = () => {
    setLocation("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-3 md:px-6 shrink-0 bg-black/70 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.6)] z-50 sticky top-0 relative">

      {/* LOGO */}
      <div
        onClick={goHome}
        className="group font-bold text-lg tracking-tighter flex items-center cursor-pointer hover-glow-text no-default-hover-elevate no-default-active-elevate"
      >
        <span className="hidden md:inline">EasyPeasyLogo</span>
        <img
          src={logoIcon}
          alt=""
          className="h-8 w-8 md:ml-2 transition-all duration-200 drop-shadow-[0_0_6px_rgba(124,58,237,0.5)] group-hover:scale-105 group-hover:drop-shadow-[0_0_18px_rgba(255,255,255,0.8)] group-hover:brightness-150"
        />
      </div>

      {/* CENTER SPACER */}
      <div className="flex-1" />

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-1.5 md:gap-3">

        {!authState.isAuthenticated ? (
          <>
            <Button 
              variant="ghost" 
              size="sm" 
              asChild
              className="px-2 md:px-3 text-xs md:text-sm hover-glow-text no-default-hover-elevate no-default-active-elevate transition-all duration-200 hover:text-[#7C3AED] hover:[text-shadow:0_0_8px_rgba(124,58,237,0.6)]"
            >
              <Link href="/auth?mode=login">Log in</Link>
            </Button>

            <Button size="sm" className="relative h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm rounded-full bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] text-white shadow-[0_0_22px_rgba(124,58,237,0.35)] transition-all duration-200 hover:shadow-[0_0_28px_rgba(124,58,237,0.6)] hover:brightness-110 no-default-hover-elevate no-default-active-elevate overflow-hidden group/btn border border-white/30 hover:border-[#5B21B6] transition-colors duration-200" asChild>
              <Link href="/auth?mode=create">
                <div className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div 
                    className="absolute inset-[-100%] bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.3),transparent)] bg-[length:200%_100%] animate-edgeMove"
                    style={{
                      maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      maskComposite: 'exclude',
                      WebkitMaskComposite: 'destination-out',
                      padding: '1px'
                    }}
                  />
                </div>
                <span className="relative z-10">Create account</span>
              </Link>
            </Button>
          </>
        ) : (
          <>
            {/* CREDITS BADGE */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  ref={creditButtonRef}
                  onClick={() => setLocation("/checkout")}
                >
                  <Badge
                    variant="secondary"
                    className="relative overflow-hidden bg-[#5B21B6]/20 text-[#7C3AED] border-[#5B21B6]/30 transition-all duration-200"
                  >
                    {Math.floor(creditsState.credits / 10)} revisions

                    {creditsState.credits === 0 && (
                      <span className="absolute inset-0 pointer-events-none wave-glow" />
                    )}
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-black text-white text-xs px-3 py-1.5 border-none">
                Add Revisions
              </TooltipContent>
            </Tooltip>

            {/* EMAIL -> DESIGNER */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setLocation("/app")}
                  className="flex items-center gap-2 text-sm text-muted-foreground ml-2 px-2 py-1 hover:text-white transition-colors duration-150 rounded-lg"
                >
                  <UserIcon className="w-4 h-4" />
                  <span className="hidden md:inline max-w-[120px] truncate">
                    {userState.user?.email}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-black text-white text-xs px-3 py-1.5 border-none">
                Open Designer
              </TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground hidden sm:flex ml-1"
            >
              <LogOut className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}