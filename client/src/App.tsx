import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/state/AuthContext";
import { Helmet } from "react-helmet-async";
import { SITE_NAME, TAGLINE } from "@shared/seo";
import Home from "@/pages/Home";
import Faq from "@/pages/Faq";
import Auth from "@/pages/Auth";
import AppPage from "@/pages/AppPage";
import Checkout from "@/pages/Checkout";
import Success from "@/pages/Success";
import Profile from "@/pages/Profile";
import Gallery from "@/pages/Gallery";
import Legal from "@/pages/Legal";
import LegalInfo from "@/pages/LegalInfo";
import AuthReturn from "@/pages/AuthReturn";
import NotFound from "@/pages/NotFound";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/faq" component={Faq} />
      <Route path="/auth" component={Auth} />
      <Route path="/auth-return" component={AuthReturn} />
      <Route path="/profile" component={Profile} />
      <Route path="/gallery" component={Gallery} />
      <Route path="/app" component={AppPage} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/success" component={Success} />
      <Route path="/legal-info" component={LegalInfo} />
      <Route path="/legal" component={Legal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { state } = useAuth();

  // Prevent designer flash by waiting for initial auth check
  if (state.loading) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        Loading...
      </div>
    );
  }

  return (
    <>
      {/* 🌐 Global defaults only. Every public page sets its own tags via
          <Seo />, which reads from shared/seo.ts - the same source the
          build-time prerenderer uses. No titleTemplate here, so page titles
          stand on their own. */}
      <Helmet defaultTitle={`${SITE_NAME} — ${TAGLINE}`}>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0a0f" />
      </Helmet>

      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </>
  );
}

export default App;