import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/state/AuthContext";
import { useCredits } from "@/state/CreditsContext";
import TopBar from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { motion, useAnimation, useMotionValue, useAnimationFrame, useTransform, animate } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { ArrowRight } from "lucide-react";
import { Helmet } from "react-helmet-async";
import logoIcon from "@assets/logo.webp";

// ---- Dynamic image imports (all 22 images) ----
const imageModules = import.meta.glob("@assets/*.{png,webp}", { eager: true, import: "default" });
const imagePaths = Object.keys(imageModules)
  .filter((path) => {
    const name = path.split("/").pop() || "";
    return /^[0-9]+\.(png|webp)$/.test(name) && parseInt(name, 10) <= 22;
  })
  .sort((a, b) => {
    const n1 = parseInt(a.split("/").pop() || "0", 10);
    const n2 = parseInt(b.split("/").pop() || "0", 10);
    return n1 - n2;
  });
const allImages = imagePaths.map((path) => imageModules[path]);

// Split into two sets
const topImages = allImages.slice(0, 11);   // 1.webp … 11.webp
const bottomImages = allImages.slice(11, 22); // 12.webp … 22.webp

// ---- Typewriter and WordReveal components (unchanged) ----
function Typewriter({ 
  text, 
  className, 
  delay = 0, 
  onComplete 
}: { 
  text: string; 
  className?: string; 
  delay?: number;
  onComplete?: () => void;
}) {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  useEffect(() => {
    if (!inView) return;
    
    let timer: NodeJS.Timeout;
    const type = () => {
      if (count >= text.length) {
        onComplete?.();
        return;
      }
      
      const char = text[count];
      let nextDelay = Math.floor(Math.random() * (20 - 12 + 1) + 12);
      nextDelay += Math.floor(Math.random() * 31) - 15;
      if (nextDelay < 5) nextDelay = 5;
      if (char === ",") nextDelay += Math.floor(Math.random() * (80 - 40 + 1) + 40);
      if (char === "." || char === "!") nextDelay += Math.floor(Math.random() * (140 - 100 + 1) + 100);
      if (count > 0 && count % (Math.floor(Math.random() * 6) + 10) === 0) {
        nextDelay += Math.floor(Math.random() * 100) + 50;
      }
      timer = setTimeout(() => { setCount(prev => prev + 1); }, nextDelay);
    };
    if (count === 0) timer = setTimeout(type, delay * 1000);
    else type();
    return () => clearTimeout(timer);
  }, [count, text, inView, delay, onComplete]);

  return (
    <p ref={ref} className={`${className} relative whitespace-pre-wrap`}>
      {text.slice(0, count)}
      {count < text.length && (
        <span className="inline-block w-[2px] h-[1em] bg-white/50 ml-1 animate-pulse align-middle" />
      )}
      <span className="invisible whitespace-pre-wrap">{text.slice(count)}</span>
    </p>
  );
}

function WordReveal({ text }: { text: string }) {
  const [wordCount, setWordCount] = useState(0);
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const words = text.split(" ");
  useEffect(() => {
    if (!inView || wordCount >= words.length) return;
    const timer = setTimeout(() => { setWordCount(prev => prev + 1); }, 40 + Math.random() * 30);
    return () => clearTimeout(timer);
  }, [wordCount, inView, words.length]);
  return (
    <span ref={ref}>
      {words.slice(0, wordCount).join(" ")}
      {wordCount < words.length && wordCount > 0 && " "}
      {wordCount < words.length && (
        <span className="opacity-30">{words.slice(wordCount).join(" ")}</span>
      )}
    </span>
  );
}

function StepCard({ 
  number, 
  title, 
  content, 
  index,
  active
}: { 
  number: number; 
  title: string; 
  content: string; 
  index: number;
  active: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -60 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.5, ease: "easeOut" }}
      className="flex flex-col items-center text-center space-y-4 p-6"
    >
      <div className="relative group">
        <div className="w-12 h-12 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center text-primary font-bold text-xl transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(124,58,237,0.8)] group-hover:border-primary/40">
          {number}.
        </div>
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="text-muted-foreground leading-relaxed min-h-[4.5em]">
        <WordReveal text={content} />
      </p>
    </motion.div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { state: authState } = useAuth();
  const { state: creditsState } = useCredits();

  const handleStartDesigning = () => setLocation("/app");

  const heroLines: { text: string; dir: "left" | "right"; delay: number; highlight?: boolean }[] = [
    { text: "Easy branding.", dir: "left", delay: 0 },
    { text: "Clean results.", dir: "right", delay: 0.15 },
    { text: "Done fast.", dir: "left", delay: 0.3, highlight: true },
  ];

  const steps = [
    {
      number: 1,
      title: "Talk it through",
      content: "Your AI identity designer starts the way a real one would: by understanding the brand before trying to design it. Through back-and-forth conversation, it helps uncover the tone, taste, positioning, and emotional direction that actually matter."
    },
    {
      number: 2,
      title: "Refine what matters",
      content: "It doesn't settle for vague input or generic creative shortcuts. It keeps refining the direction with you, asking for clarity where needed, pushing past weak ideas, and helping shape something that feels more distinct and well considered."
    },
    {
      number: 3,
      title: "Create from clarity",
      content: "Only once the direction is strong enough does it begin creating visual identity concepts. That means the work is grounded in real understanding, so what gets made feels more intentional, aligned, and worth building on."
    }
  ];

  // ---- IMAGE BELTS (INFINITE) ----
  const topCount = topImages.length > 0 ? topImages.length : 11;
  const bottomCount = bottomImages.length > 0 ? bottomImages.length : 11;
  const beltSpeed = 0.025;

  const itemWidth = 280; // w-64 (256) + gap-6 (24)
  const topTotalWidth = topCount * itemWidth;
  const bottomTotalWidth = bottomCount * itemWidth;

  // Number of copies to display (must be at least 3 to fill screen)
  const copies = 5;

  // Top belt: moves right → left
  const topX = useMotionValue(-topTotalWidth); // start at beginning of second copy
  // Bottom belt: moves left → right
  const bottomX = useMotionValue(-bottomTotalWidth); // start at beginning of second copy

  useAnimationFrame((t, delta) => {
    const step = delta * beltSpeed;

    let newTop = topX.get() - step;
    // Reset when we have passed one full set from the start
    if (newTop < -topTotalWidth * (copies - 1)) {
      newTop += topTotalWidth * (copies - 1);
    }
    topX.set(newTop);

    let newBottom = bottomX.get() + step;
    if (newBottom > bottomTotalWidth * (copies - 1)) {
      newBottom -= bottomTotalWidth * (copies - 1);
    }
    bottomX.set(newBottom);
  });

  // ---- TESTIMONIALS (INFINITE) ----
  const testimonials = [
    { name: "Maria K.", role: "Founder", content: "Fastest way ive found to test branding ideas." },
    { name: "Daniel R.", role: "Startup Founder", content: "clean resluts and very easy to use." },
    { name: "Ahmad H.", role: "Entrepreneur", content: "Saved me alot of time honestly." },
    { name: "Lena F.", role: "Designer", content: "good starting direction for visuals." },
    { name: "Michael T.", role: "Developer", content: "smooth workflow and fast generation." },
    { name: "Sofia M.", role: "Marketer", content: "clients liked the first concept already." },
    { name: "Noah P.", role: "Builder", content: "simple tool but powerful output." },
    { name: "Olivia C.", role: "Brand Strategist", content: "feels modern and easy to use." },
    { name: "Elias G.", role: "Founder", content: "helped us move faster than usual." },
    { name: "Arman A.", role: "Creator", content: "really helpful when starting from zero." },
    { name: "Victor L.", role: "Agency", content: "Great for early visual direction." },
    { name: "Isabelle L.", role: "Creative Lead", content: "animations feel premium." },
    { name: "Lucas B.", role: "Indie Maker", content: "fastest branding workflow ive tried." },
    { name: "Emily D.", role: "Designer", content: "colors feel balanced without tweaking." },
    { name: "Jonas W.", role: "Founder", content: "simple idea executed really well." },
    { name: "Maya S.", role: "Creator", content: "branding direction in minutes." },
    { name: "Farid A.", role: "Developer", content: "clean export files which i like." },
    { name: "Theo M.", role: "Indie Hacker", content: "makes ideation faster than usual tools." },
    { name: "Sara A.", role: "Founder", content: "very helpful for early branding." },
    { name: "Marco B.", role: "Designer", content: "minimal and effective workflow." },
    { name: "Hikari Labs", role: "Startup", content: "helped us test brand directions quickly." },
    { name: "Leo A.", role: "Builder", content: "quick results without overthinking." },
    { name: "Nyx", role: "Creator", content: "honestly fun to play with." },
    { name: "KittyCup", role: "Founder", content: "didnt expect it to be this fast lol." },
    { name: "Amir K.", role: "Developer", content: "ui feels modern and fast." },
    { name: "Julia N.", role: "Marketer", content: "helped clarify our visual direction." },
    { name: "Rami K.", role: "Startup Owner", content: "really helpful when starting from zero." },
    { name: "Victor & Co", role: "Agency", content: "great early branding concepts." },
    { name: "Lukas S.", role: "Designer", content: "nice gradients and glow styling." },
    { name: "Ava C.", role: "Creator", content: "super smooth experience overall." },
    { name: "Hassan J.", role: "Entrepreneur", content: "I showed it to my team and they loved it." },
    { name: "PixelNomad", role: "Designer", content: "use it when clients need fast ideas." },
    { name: "NeonCat", role: "Creator", content: "fun tool but also useful." },
    { name: "Atlas Studio", role: "Agency", content: "great for early concepting." },
    { name: "Daniel W.", role: "Founder", content: "branding used to take weeks for me." },
    { name: "Mika T.", role: "Builder", content: "kept generating concepts just for fun." },
    { name: "Zara K.", role: "Marketer", content: "clients reacted fast to visuals." },
    { name: "Noor A.", role: "Creator", content: "simple onboarding flow." },
    { name: "Riz H.", role: "Maker", content: "super fast to test ideas." },
    { name: "Aya M.", role: "Marketer", content: "branding direction in minutes." },
    { name: "NeoMint", role: "Designer", content: "works great for ideation." },
    { name: "Rami A.", role: "Entrepreneur", content: "fast results without confusion." },
    { name: "CloudFox", role: "Creator", content: "honestly fun to use." },
    { name: "Zed", role: "Developer", content: "minimal setup which i like." },
    { name: "KitNova", role: "Founder", content: "feels polished already." },
    { name: "Oasis Labs", role: "Startup", content: "helped us decide colors quickly." },
    { name: "Nyx Studio", role: "Designer", content: "clean modern outputs." },
    { name: "Juno P.", role: "Creator", content: "good tool for early stage founders." },
    { name: "Axel R.", role: "Builder", content: "super smooth experience overall." },
    { name: "Mariah L.", role: "Founder", content: "fast branding ideas without stress." },
    { name: "Tariq H.", role: "Startup Owner", content: "easy branding for our team." },
    { name: "VoltKid", role: "Maker", content: "not perfect but very useful." },
    { name: "Aria S.", role: "Designer", content: "good starting point for identity systems." },
    { name: "Nico F.", role: "Founder", content: "makes ideation faster than figma tbh." },
    { name: "BlueKoala", role: "Creator", content: "workflow just makes sense." },
    { name: "Kai L.", role: "Builder", content: "great for mvp stage brands." }
  ];

  const cardWidth = 350;
  const gap = 24;
  const itemTotal = cardWidth + gap;
  const testimonialSpeed = 0.025;

  const testCopies = 4;
  const allTestimonials = [];
  for (let i = 0; i < testCopies; i++) {
    allTestimonials.push(...testimonials);
  }
  const totalTestimonialWidth = allTestimonials.length * itemTotal;

  // Start in the middle of the second copy to avoid empty space
  const testX = useMotionValue(-totalTestimonialWidth / testCopies);

  // ---- HOVER SLOWDOWN ----
  const [testimonialSpeedMultiplier, setTestimonialSpeedMultiplier] = useState(1);

  useAnimationFrame((t, delta) => {
    const step = delta * testimonialSpeed * testimonialSpeedMultiplier;
    let newX = testX.get() - step;
    // Reset when we've passed one full set
    if (newX < -totalTestimonialWidth * (testCopies - 1) / testCopies) {
      newX += totalTestimonialWidth / testCopies;
    }
    testX.set(newX);
  });

  // ---- Newsletter ----
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agree, setAgree] = useState(false);

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (!validateEmail(value) && value.length > 0) setError("Enter a valid email address.");
    else setError("");
  };

  const handleSubscribe = async () => {
    if (loading) return;
    setError("");
    if (!validateEmail(email)) { setError("Enter a valid email address."); return; }
    if (!agree) { setError("You must agree to the privacy policy."); return; }
    try {
      setLoading(true);
      const { error: subError } = await supabase.from("newsletter_subscribers").insert([{ email: email.trim().toLowerCase(), source: "landing" }]);
      if (subError) { console.error(subError); setError("Something went wrong. Try again."); setLoading(false); return; }
      setSuccess(true); setEmail(""); setAgree(false); setLoading(false);
      setTimeout(() => setSuccess(false), 600);
    } catch (err) { console.error(err); setError("Something went wrong. Try again."); setLoading(false); }
  };

  // ---- Structured Data (JSON-LD) ----
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "EasyPeasyLogo",
    "url": "https://easypeasylogo.com",
    "logo": "https://easypeasylogo.com/logo.png",
    "description": "AI-powered brand identity design tool. Create logos, banners, and social media visuals in minutes.",
    "sameAs": [
      "https://twitter.com/easypeasylogo",
      "https://youtube.com/..."
    ]
  };

  return (
    <>
      <Helmet>
        <title>AI Brand Identity Designer – EasyPeasyLogo</title>
        <meta name="description" content="Design your brand identity with an AI designer. Get logos, banners, thumbnails, and social media visuals in minutes. Start your free trial now." />
        <meta property="og:title" content="AI Brand Identity Designer – EasyPeasyLogo" />
        <meta property="og:description" content="Design your brand identity with an AI designer. Get logos, banners, thumbnails, and social media visuals in minutes." />
        <meta property="og:url" content="https://easypeasylogo.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://easypeasylogo.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AI Brand Identity Designer – EasyPeasyLogo" />
        <meta name="twitter:description" content="Design your brand identity with an AI designer. Get logos, banners, thumbnails, and social media visuals in minutes." />
        <meta name="twitter:image" content="https://easypeasylogo.com/og-image.png" />
        <link rel="canonical" href="https://easypeasylogo.com/" />
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <TopBar />

        {/* ---- HERO SECTION WITH TWO SEPARATE BELTS ---- */}
        <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-4 py-20 overflow-hidden">

          {/* Top belt (1-11) – moving right → left, occupies top half */}
          <div className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden pointer-events-none z-0">
            <motion.div 
              className="flex gap-6 h-full items-center"
              style={{ x: topX }}
            >
              {Array(copies).fill(topImages).flat().map((img, i) => (
                <div key={`top-${i}`} className="shrink-0 w-64 h-64 md:w-80 md:h-80 relative rounded-2xl overflow-hidden">
                  <img src={img} alt="" className="w-full h-full object-contain blur opacity-50 brightness-[0.35]" />
                </div>
              ))}
            </motion.div>
          </div>

          {/* Bottom belt (12-22) – moving left → right, back to bottom-[20%] */}
          <div className="absolute bottom-[20%] left-0 right-0 h-1/2 overflow-hidden pointer-events-none z-0">
            <motion.div 
              className="flex gap-6 h-full items-end"
              style={{ x: bottomX }}
            >
              {Array(copies).fill(bottomImages).flat().map((img, i) => (
                <div key={`bottom-${i}`} className="shrink-0 w-64 h-64 md:w-80 md:h-80 relative rounded-2xl overflow-hidden">
                  <img src={img} alt="" className="w-full h-full object-contain blur opacity-50 brightness-[0.35]" />
                </div>
              ))}
            </motion.div>
          </div>

          {/* Gradient overlays */}
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />

          {/* Hero content - moved UP with -mt-16 */}
          <div className="relative z-20 max-w-4xl mx-auto -mt-16">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Badge
                variant="outline"
                className="group rounded-full px-4 py-1.5 border-primary/20 bg-primary/5 text-primary cursor-pointer transition-all duration-200 hover:bg-primary/15 hover:text-white hover:shadow-[0_0_16px_rgba(124,58,237,0.4)] [text-shadow:0_0_20px_rgba(0,0,0,0.9),0_0_40px_rgba(0,0,0,0.6)]"
                onClick={handleStartDesigning}
                data-testid="badge-ai-powered"
              >
                <img src={logoIcon} alt="" className="w-8 h-8 mr-2 inline-block transition-all duration-200 drop-shadow-[0_0_6px_rgba(124,58,237,0.5)] group-hover:scale-105 group-hover:drop-shadow-[0_0_18px_rgba(255,255,255,0.8)] group-hover:brightness-150" />
                AI-Powered Brand Identity
              </Badge>
            </motion.div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-balance leading-[1.1] mt-6 [text-shadow:0_0_30px_rgba(0,0,0,0.9),0_0_60px_rgba(0,0,0,0.6)]" data-testid="text-headline">
              {heroLines.map((line, i) => (
                <motion.span
                  key={i}
                  className={`block ${line.highlight ? "text-primary" : ""}`}
                  initial={{ opacity: 0, x: line.dir === "left" ? -40 : 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: line.delay, ease: "easeOut" }}
                >
                  {line.text}
                </motion.span>
              ))}
            </h1>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.5 }}
            >
              <Typewriter
                text="Work with an AI identity designer that thinks through your brand with you, refining direction, taste, and meaning."
                delay={0.6}
                className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto min-h-[3em] mt-4 [text-shadow:0_0_20px_rgba(0,0,0,0.9),0_0_40px_rgba(0,0,0,0.6)]"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6"
            >
              <Button 
                size="lg" 
                onClick={handleStartDesigning}
                data-testid="button-start-designing"
                className="relative bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] text-white font-bold hover:scale-105 transition-all duration-200 shadow-[0_0_22px_rgba(124,58,237,0.35)] hover:shadow-[0_0_22px_rgba(124,58,237,0.6)] active:scale-95 rounded-xl px-8 h-12 overflow-hidden group/btn"
              >
                <div className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div 
                    className="absolute inset-[-100%] bg-[linear-gradient(90deg,transparent,rgba(140,100,255,0.6),transparent)] bg-[length:200%_100%] animate-[edgeMove_2.2s_linear_infinite]"
                    style={{
                      maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      maskComposite: 'exclude',
                      WebkitMaskComposite: 'destination-out',
                      padding: '1px'
                    }}
                  />
                </div>
                <span className="relative z-10 flex items-center">
                  Start designing <ArrowRight className="ml-2 w-4 h-4" />
                </span>
              </Button>
            </motion.div>
          </div>
        </section>

        {/* ---- HOW IT WORKS ---- */}
        <section className="relative py-24 px-4 bg-muted/30 overflow-hidden">
          <div className="relative z-10 max-w-6xl mx-auto">
            <motion.h2 initial={{ opacity: 0, y: -80 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8, ease: "easeOut" }} className="text-3xl md:text-4xl font-bold text-center mb-16">How it works</motion.h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
              {steps.map((step, i) => <StepCard key={i} index={i} number={step.number} title={step.title} content={step.content} active={true} />)}
            </div>
          </div>
        </section>

        {/* ---- LOVED BY FOUNDERS (testimonials) ---- */}
        <section className="py-24 px-4 overflow-hidden">
          <div className="max-w-6xl mx-auto">
            <motion.h2 initial={{ opacity: 0, x: -120 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: "easeOut" }} className="text-3xl md:text-4xl font-bold text-center mb-16">Loved by founders</motion.h2>
            <div 
              className="relative group"
              onMouseEnter={() => setTestimonialSpeedMultiplier(0.2)}
              onMouseLeave={() => setTestimonialSpeedMultiplier(1)}
            >
              <motion.div className="flex gap-6" style={{ x: testX }}>
                {allTestimonials.map((t, i) => (
                  <Card key={i} className="min-w-[300px] md:min-w-[350px] bg-muted/50 border-none shrink-0">
                    <CardContent className="pt-6">
                      <p className="italic text-lg mb-6">"{t.content}"</p>
                      <div>
                        <p className="font-bold">{t.name}</p>
                        <p className="text-sm text-muted-foreground">{t.role}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        <div className="px-4 -mt-16 mb-4"><p className="text-[10px] text-white/20 leading-tight">Displayed comments are simulated for demonstration purposes.</p></div>

        {/* ---- NEWSLETTER & FOOTER ---- */}
        <motion.section initial={{ opacity: 0, filter: "blur(12px)", y: 24 }} whileInView={{ opacity: 1, filter: "blur(0px)", y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: "easeOut" }} className="py-24 px-4 bg-primary/5">
          <div className="max-w-xl mx-auto text-center space-y-8">
            <div className="space-y-4"><h2 className="text-3xl font-bold">Stay updated</h2><p className="text-muted-foreground">Get tips on branding and early access to new features.</p></div>
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Input type="email" placeholder="Enter your email" value={email} onChange={onEmailChange} className="h-12 rounded-full px-6 bg-background border-border focus-visible:ring-0 focus:border-primary/60 focus:shadow-[0_0_0_1px_rgba(140,100,255,0.6),0_0_12px_rgba(140,100,255,0.25)] transition-all duration-200 caret-primary placeholder:transition-opacity focus:placeholder:opacity-50" />
                {error && <p className="text-red-400 text-sm mt-2 px-4 text-center">{error}</p>}
                {success && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-emerald-400 text-sm mt-2 text-left px-4">{success}</motion.p>}
              </div>
              <div className="flex items-center justify-center gap-2">
                <Checkbox id="newsletter" checked={agree} onCheckedChange={(checked) => setAgree(checked as boolean)} />
                <label htmlFor="newsletter" className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">I agree to the privacy policy</label>
              </div>
              <Button variant="outline" disabled={!success && (!validateEmail(email) || !agree)} onClick={handleSubscribe} className={`relative h-12 rounded-full px-8 bg-transparent text-white border-white transition-all duration-300 overflow-hidden group/btn no-default-hover-elevate no-default-active-elevate hover:border-[#8c64ff] hover:shadow-[0_0_0_1px_rgba(140,100,255,0.7),0_0_12px_rgba(140,100,255,0.25)] hover:scale-[1.02] active:scale-[0.98] ${!success && !loading && (!validateEmail(email) || !agree) ? 'opacity-50 grayscale pointer-events-none' : 'opacity-100 grayscale-0'}`}>
                <div className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="absolute inset-[-100%] bg-[linear-gradient(90deg,transparent,rgba(140,100,255,0.6),transparent)] bg-[length:200%_100%] animate-[edgeMove_2.2s_linear_infinite]" style={{ maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', maskComposite: 'exclude', WebkitMaskComposite: 'destination-out', padding: '1px' }} />
                </div>
                <motion.span animate={success ? { opacity: 0, scale: 0.5 } : { opacity: 1, scale: 1 }} className="relative z-10 flex items-center gap-2">{success ? "✓ Subscribed" : loading ? "Subscribing..." : "Subscribe"}</motion.span>
                {success && <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1.1 }} className="absolute inset-0 flex items-center justify-center z-20 text-white"><motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.4 }}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></motion.div></motion.div>}
              </Button>
            </div>
          </div>
        </motion.section>

        <footer className="py-20 px-4 border-t border-border mt-auto">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 items-center md:items-start">
            <div className="flex flex-col items-center md:items-start gap-4 -mt-4">
              <button onClick={() => { setLocation("/"); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="group flex items-center gap-2 hover-glow-text no-default-hover-elevate no-default-active-elevate">
                <span className="font-bold text-xl tracking-tighter text-white">EasyPeasyLogo</span>
                <img src={logoIcon} alt="" className="h-8 w-8 transition-all duration-200 drop-shadow-[0_0_6px_rgba(124,58,237,0.5)] group-hover:scale-105 group-hover:drop-shadow-[0_0_18px_rgba(255,255,255,0.8)] group-hover:brightness-150" />
              </button>
              <div className="text-xs text-white/40 leading-relaxed text-center md:text-left"><p>© 2026 EasyPeasyLogo. All rights reserved.</p><p>Sjofartsgatan 7, 120 62, Nacka</p><p>Stockholm, Sweden</p></div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <Link href="/faq" className="group relative px-8 py-3 transition-all duration-300 text-white hover:text-[#c4a3ff] hover:[text-shadow:0_0_8px_rgba(140,100,255,0.6),0_0_18px_rgba(140,100,255,0.25)]"><span className="text-3xl md:text-4xl font-display font-bold relative z-10 transition-all duration-300">FAQ</span></Link>
            </div>
            <nav className="flex items-center justify-center md:justify-end gap-8 text-sm text-muted-foreground">
              <Link href="/legal-info" className="hover:text-foreground transition-colors">Legal</Link>
              <Link href="/legal#privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/legal#terms" className="hover:text-foreground transition-colors">Terms</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}