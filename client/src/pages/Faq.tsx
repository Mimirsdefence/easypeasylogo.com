import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import TopBar from "@/components/TopBar";
import { ChevronDown } from "lucide-react";
import { Helmet } from "react-helmet-async";

const FAQ_DATA = [
  {
    question: "1. What is EasyPeasyLogo and how does it work?",
    answer: "You begin by chatting with the Identity Brand Designer, describing your brand, audience, and where your visuals will be used. Instead of generating random logos instantly, it gathers clear direction first. Once enough information is collected, it creates structured design concepts tailored to your needs."
  },
  {
    question: "2. Is this AI or a real designer?",
    answer: "A smart automation built to feel like working with a real professional. It asks focused questions, understands your direction, and produces organized brand concepts instead of random outputs."
  },
  {
    question: "3. How does it know the correct sizes for my platforms?",
    answer: "You simply tell the designer where you plan to use the visuals — YouTube, websites, social media, or business branding. The system automatically generates designs in the correct dimensions, layouts, and safe areas."
  },
  {
    question: "4. What files do I receive?",
    answer: "You receive high-resolution visuals, including 4K exports and master design files ready for professional use."
  },
  {
    question: "5. Are designs optimized for YouTube, Facebook and websites?",
    answer: "Yes. Banners, profile images, and logos are created in platform-specific formats so text and visuals remain perfectly visible."
  },
  {
    question: "6. Will text and important elements be placed correctly?",
    answer: "Yes. Layout positioning is handled automatically so important content stays inside safe viewing areas across devices."
  },
  {
    question: "7. How do revisions work?",
    answer: "Each package includes a set number of revisions. After each concept delivery, you can request changes or adjustments to refine your direction."
  },
  {
    question: "8. Can I request completely different styles?",
    answer: "Yes. Within your revision allowance, you can explore new directions or adjust the creative approach."
  },
  {
    question: "9. Why is it so affordable compared to agencies?",
    answer: "The Identity Brand Designer automates much of the traditional workflow, reducing cost while still delivering structured professional results."
  },
  {
    question: "10. How long does it take to receive concepts?",
    answer: "Once the designer has enough information about your brand, concept creation begins immediately and results are delivered quickly."
  },
  {
    question: "11. Do I need design experience?",
    answer: "No. The system guides you through the process step by step, making professional branding accessible even if you’ve never designed before."
  },
  {
    question: "12. Can I use the designs commercially?",
    answer: "Yes. Designs are created for business use, including branding, marketing and online presence."
  },
  {
    question: "13. What makes this different from normal logo generators?",
    answer: "Instead of generating random images instantly, EasyPeasyLogo follows a guided identity design process before creating concepts."
  },
  {
    question: "14. Can businesses use this for full branding?",
    answer: "Yes. The system supports logos, banners, profile visuals and other brand assets needed across platforms."
  },
  {
    question: "15. What happens after I finish describing my brand?",
    answer: "Once enough direction is collected, the Identity Brand Designer begins generating tailored concept visuals based on your goals and preferred formats."
  }
];

function FaqCard({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left p-6 rounded-xl border transition-all duration-300 backdrop-blur-sm ${
          isOpen 
            ? "border-border bg-white/[0.02] ring-0 shadow-none" 
            : "bg-card/50 border-border hover:border-primary/40 hover:shadow-[0_0_20px_rgba(140,100,255,0.15)]"
        }`}
        style={isOpen ? { boxShadow: 'none', textShadow: 'none', filter: 'none', transition: 'none' } : {
          transition: 'box-shadow 0.25s ease, border-color 0.25s ease, filter 0.25s ease'
        }}
      >
        <div className="flex justify-between items-center gap-4">
          <h3 className="text-lg font-medium">{question}</h3>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            className="shrink-0 text-muted-foreground group-hover:text-primary"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </div>
        
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <p className="mt-4 text-[rgba(255,255,255,0.78)] leading-relaxed pt-4 border-t border-border/50">
                {answer}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Edge Glow effect - ONLY for closed items on hover */}
      <AnimatePresence>
        {!isOpen && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl">
            <div 
              className="absolute inset-[-1px] bg-[linear-gradient(90deg,transparent,rgba(140,100,255,0.6),transparent)] bg-[length:200%_100%] animate-[edgeMove_2.4s_linear_infinite] [animation-delay:120ms] rounded-xl"
              style={{
                maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
                WebkitMaskComposite: 'destination-out',
                padding: '1px'
              }}
            />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Faq() {
  return (
    <>
      <Helmet>
        <title>FAQ – EasyPeasyLogo</title>
        <meta name="description" content="Frequently asked questions about EasyPeasyLogo's AI brand identity design process, revisions, pricing, and commercial use." />
        <meta property="og:title" content="FAQ – EasyPeasyLogo" />
        <meta property="og:description" content="Frequently asked questions about EasyPeasyLogo's AI brand identity design process, revisions, pricing, and commercial use." />
        <meta property="og:url" content="https://easypeasylogo.com/faq" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://easypeasylogo.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FAQ – EasyPeasyLogo" />
        <meta name="twitter:description" content="Frequently asked questions about EasyPeasyLogo's AI brand identity design process, revisions, pricing, and commercial use." />
        <meta name="twitter:image" content="https://easypeasylogo.com/og-image.png" />
        <link rel="canonical" href="https://easypeasylogo.com/faq" />
      </Helmet>

      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <TopBar />
        
        <main className="flex-1 py-20 px-4 relative overflow-hidden">
          {/* Background Gradients */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-primary/5 blur-[120px] pointer-events-none" />
          
          <div className="max-w-3xl mx-auto space-y-12 relative z-10">
            <div className="text-center space-y-4">
              <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl md:text-5xl font-bold"
              >
                FAQ
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-muted-foreground text-lg"
              >
                Common questions about our Design Process.
              </motion.p>
            </div>

            <div className="space-y-4 pb-20">
              {FAQ_DATA.map((item, i) => (
                <FaqCard key={i} index={i} {...item} />
              ))}
            </div>
          </div>
        </main>

        <footer className="py-12 px-4 border-t border-border mt-auto">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Back to Home</Link>
            <div className="flex items-center gap-6">
              <Link href="/legal-info" className="hover:text-foreground transition-colors">Legal</Link>
              <Link href="/legal#privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/legal#terms" className="hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}