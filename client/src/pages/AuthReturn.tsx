import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";

export default function AuthReturn() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;

      if (session?.user?.email && sessionStorage.getItem("newsletter_optin") === "1") {
        await supabase.from("newsletter_subscribers").insert({
          email: session.user.email.toLowerCase(),
          source: "signup"
        });
        sessionStorage.removeItem("newsletter_optin");
      }

      const isNew = sessionStorage.getItem("post_auth_checkout") !== "1";

      if (session && isNew) {
        sessionStorage.setItem("post_auth_checkout", "1");
        setLocation("/checkout");
      } else {
        setLocation("/app");
      }
    });
  }, []);

  return null;
}
