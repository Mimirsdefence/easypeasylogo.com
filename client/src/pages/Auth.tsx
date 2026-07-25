import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/state/AuthContext";
import { useUser } from "@/state/UserContext";
import { loginWithGoogle, loginWithEmail, signUpWithEmail } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, CheckCircle2, Circle, Eye, EyeOff, X } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Helmet } from "react-helmet-async";

export default function Auth(props: {
  embedded?: boolean;
  defaultMode?: 'login' | 'signup';
  overrideTitle?: string;
  overrideSubtext?: string;
  onClose?: () => void;
  [key: string]: any;
}) {
  const { embedded = false, defaultMode, overrideTitle, overrideSubtext, onClose } = props;
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const { setUser } = useUser();
  
  const searchParams = new URLSearchParams(window.location.search);
  const initialMode = defaultMode || (searchParams.get('mode') === 'create' || window.location.search.includes("signup") ? 'signup' : 'login');
  
  const [mode, setMode] = useState<'login' | 'signup' | 'verify-email'>(initialMode as any);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);
  
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  
  const [emailError, setEmailError] = useState("");
  const [passwordRules, setPasswordRules] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    symbol: false
  });
  const [isTypingPassword, setIsTypingPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (embedded) return;
    if (window.location.search.includes("signup") || window.location.search.includes("create")) {
      setMode("signup");
    } else {
      setMode("login");
    }
  }, [window.location.search, embedded]);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    setError(null);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (val.length > 0 && !emailRegex.test(val)) {
      setEmailError("Please enter a valid email address.");
    } else {
      setEmailError("");
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    setError(null);
    setIsTypingPassword(true);
    setPasswordRules({
      length: val.length >= 10,
      upper: /[A-Z]/.test(val),
      lower: /[a-z]/.test(val),
      number: /[0-9]/.test(val),
      symbol: /[^A-Za-z0-9]/.test(val)
    });
  };

  const handleAuthSuccess = (user: any) => {
    setAuth(true);
    setUser({
      ...user,
      newsletterOptIn: mode === 'signup' ? newsletterOptIn : false
    });
  };

  const onGoogleLogin = async () => {
    try {
      if (mode === "signup" && newsletterOptIn) {
        sessionStorage.setItem("newsletter_optin", "1");
      }
      setGoogleLoading(true);
      setError(null);
      const user = await loginWithGoogle();
      handleAuthSuccess(user);
    } catch (err) {
      setError("Failed to sign in with Google. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const onEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    if (emailError) return;

    if (mode === 'signup') {
      const allRulesPass = Object.values(passwordRules).every(Boolean);
      if (!allRulesPass) {
        setError("Password must be 10+ chars, include upper, lower, number, and symbol.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }
    
    try {
      setEmailLoading(true);
      setError(null);
      const user = mode === 'signup'
        ? await signUpWithEmail(email, password)
        : await loginWithEmail(email, password);
      
      if (mode === 'signup') {
        if (newsletterOptIn) {
          await supabase.from("newsletter_subscribers").insert({
            email: email,
            source: "signup"
          });
        }
        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 600);
        setMode('verify-email');
      } else {
        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 600);
        handleAuthSuccess(user);
        setTimeout(() => setLocation("/app"), 400);
      }
    } catch (err: any) {
      setError(err?.message || (mode === 'login' ? "Invalid email or password." : "Failed to create account."));
    } finally {
      setEmailLoading(false);
    }
  };

  // --- Helper to render close button ---
  const renderCloseButton = () => {
    if (embedded) {
      if (onClose) {
        return (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 text-white/50 hover:text-white transition-colors z-10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        );
      }
      return null;
    }
    // Standalone: go to home
    return (
      <button
        onClick={() => setLocation("/")}
        className="absolute top-2 right-2 text-white/50 hover:text-white transition-colors z-10"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
    );
  };

  // 🔹 SEO: If embedded in modal, skip meta (the page itself is not indexed separately)
  if (!embedded) {
    // This runs only on the standalone Auth page (which is indexable)
  }

  if (mode === 'verify-email') {
    return (
      <>
        {!embedded && (
          <Helmet>
            <title>Verify Email – EasyPeasyLogo</title>
            <meta name="description" content="Verify your email address to complete your EasyPeasyLogo account setup and start designing your brand identity." />
            <meta property="og:title" content="Verify Email – EasyPeasyLogo" />
            <meta property="og:description" content="Verify your email address to complete your EasyPeasyLogo account setup." />
            <meta property="og:url" content="https://easypeasylogo.com/auth" />
            <meta property="og:type" content="website" />
            <meta property="og:image" content="https://easypeasylogo.com/og-image.png" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content="Verify Email – EasyPeasyLogo" />
            <meta name="twitter:description" content="Verify your email address to complete your EasyPeasyLogo account setup." />
            <link rel="canonical" href="https://easypeasylogo.com/auth" />
          </Helmet>
        )}
        <div className={`flex items-center justify-center ${embedded ? '' : 'min-h-screen'} bg-background p-4`}>
          <Card className="w-full max-w-[420px] border-none bg-muted/30 animate-fadeIn relative">
            {renderCloseButton()}
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-3xl font-bold tracking-tight">Check your email</CardTitle>
              <CardDescription>
                We've sent a verification link to <span className="text-white font-medium">{email}</span>. 
                Please click the link to continue to checkout.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary animate-pulse" />
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const Rule = ({ met, label }: { met: boolean; label: string }) => (
    <div className={`flex items-center gap-2 text-xs transition-colors ${met ? 'text-emerald-400' : 'text-muted-foreground'}`}>
      {met ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
      <span>{label}</span>
    </div>
  );

  return (
    <>
      {!embedded && (
        <Helmet>
          <title>Sign In or Create Account – EasyPeasyLogo</title>
          <meta name="description" content="Sign in to your EasyPeasyLogo account or create a new account to start designing your brand identity with our AI designer." />
          <meta property="og:title" content="Sign In or Create Account – EasyPeasyLogo" />
          <meta property="og:description" content="Sign in to your EasyPeasyLogo account or create a new account to start designing your brand identity with our AI designer." />
          <meta property="og:url" content="https://easypeasylogo.com/auth" />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="https://easypeasylogo.com/og-image.png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Sign In or Create Account – EasyPeasyLogo" />
          <meta name="twitter:description" content="Sign in to your EasyPeasyLogo account or create a new account to start designing your brand identity with our AI designer." />
          <meta name="twitter:image" content="https://easypeasylogo.com/og-image.png" />
          <link rel="canonical" href="https://easypeasylogo.com/auth" />
        </Helmet>
      )}

      <div className={`flex items-center justify-center ${embedded ? '' : 'min-h-screen'} bg-background p-4`}>
        <Card key={mode} className="w-full max-w-[420px] border-none bg-muted/30 animate-fadeIn relative">
          {renderCloseButton()}
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">
              {mode === 'login' ? 'Welcome back' : (overrideTitle || 'Create account')}
            </CardTitle>
            <CardDescription>
              {mode === 'login' 
                ? 'Enter your details to sign in to your account' 
                : (overrideSubtext || 'Sign up to start designing your brand identity')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button 
              variant="outline" 
              className="w-full h-12 rounded-full gap-2 border-border/50 hover:bg-muted/50"
              onClick={onGoogleLogin}
              disabled={googleLoading || emailLoading}
            >
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SiGoogle className="w-4 h-4" />}
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground italic">Or continue with email</span>
              </div>
            </div>

            <form onSubmit={onEmailAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@example.com" 
                  className={`h-11 rounded-xl bg-background border-border/50 transition-colors ${emailError ? 'border-red-400/50 focus-visible:ring-red-400/20' : ''}`}
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  disabled={googleLoading || emailLoading}
                  required
                />
                {emailError && (
                  <p className="text-[10px] text-red-400 font-medium px-1 leading-none">{emailError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    className="h-11 rounded-xl bg-background border-border/50 pr-10"
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    disabled={googleLoading || emailLoading}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'signup' && isTypingPassword && (
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 px-1 pt-1">
                    <Rule met={passwordRules.length} label="10+ characters" />
                    <Rule met={passwordRules.upper} label="Uppercase letter" />
                    <Rule met={passwordRules.lower} label="Lowercase letter" />
                    <Rule met={passwordRules.number} label="Number" />
                    <Rule met={passwordRules.symbol} label="Symbol" />
                  </div>
                )}
              </div>

              {mode === 'signup' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Input 
                        id="confirmPassword" 
                        type={showPassword ? "text" : "password"} 
                        className="h-11 rounded-xl bg-background border-border/50 pr-10"
                        value={confirmPassword}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfirmPassword(val);
                          setError(null);
                          if (val === password) {
                            setError(null);
                          }
                        }}
                        disabled={googleLoading || emailLoading}
                        required
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox 
                      id="newsletter" 
                      checked={newsletterOptIn}
                      onCheckedChange={(checked) => setNewsletterOptIn(checked as boolean)}
                      disabled={googleLoading || emailLoading}
                    />
                    <label 
                      htmlFor="newsletter" 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground"
                    >
                      Sign up for our newsletter
                    </label>
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm font-medium text-destructive text-center animate-in fade-in slide-in-from-top-1">
                  {error}
                </p>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 rounded-full font-bold bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] text-white shadow-[0_0_22px_rgba(124,58,237,0.35)] hover:scale-[1.03] transition-all duration-200"
                disabled={googleLoading || emailLoading}
              >
                {emailLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSuccess ? (
                  "✓ Subscribed"
                ) : (
                  <>{mode === 'login' ? 'Sign in' : 'Create account'} <Mail className="ml-2 w-4 h-4" /></>
                )}
              </Button>
            </form>

            <div className="text-center">
              {mode === 'login' ? (
                <p className="text-sm text-muted-foreground">
                  New here?{" "}
                  <button 
                    type="button"
                    onClick={() => setMode("signup")} 
                    className="text-purple-400 hover:text-purple-300 transition font-medium"
                  >
                    Create your account
                  </button>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button 
                    type="button"
                    onClick={() => setMode("login")} 
                    className="text-purple-400 hover:text-purple-300 transition font-medium"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}