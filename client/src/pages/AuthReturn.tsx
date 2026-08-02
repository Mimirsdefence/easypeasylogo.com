import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/state/AuthContext";
import { useUser } from "@/state/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

function mapSupabaseUser(supaUser: any) {
  return {
    user_id: supaUser.id,
    email: supaUser.email || '',
    isAuthenticated: true,
    newsletterOptIn: false,
    created_at: supaUser.created_at || new Date().toISOString()
  };
}

export default function AuthReturn() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const { setUser } = useUser();

  useEffect(() => {
    const handleCallback = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setLocation("/auth?error=session_failed");
        return;
      }

      const session = data.session;
      const user = mapSupabaseUser(session.user);

      // Handle newsletter opt-in
      if (sessionStorage.getItem("newsletter_optin") === "1") {
        await supabase.from("newsletter_subscribers").insert({
          email: user.email.toLowerCase(),
          source: "signup"
        });
        sessionStorage.removeItem("newsletter_optin");
      }

      // Set auth state
      setAuth(true);
      setUser(user);

      // Redirect based on checkout intent
      const isNew = sessionStorage.getItem("post_auth_checkout") !== "1";
      if (isNew) {
        sessionStorage.setItem("post_auth_checkout", "1");
        setLocation("/checkout");
      } else {
        setLocation("/app");
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}