import { useCredits } from "@/state/CreditsContext";
import { useUser } from "@/state/UserContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TopBar from "@/components/TopBar";
import { CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";

export default function Checkout() {
  const { state: creditsState, setCredits } = useCredits();
  const { state: userState, setUser } = useUser();
  const [, setLocation] = useLocation();

  const [hasPurchased, setHasPurchased] = useState<boolean | null>(null);
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

  useEffect(() => {
    const checkPurchaseStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_credits")
        .select("has_purchased")
        .eq("user_id", user.id)
        .maybeSingle();

      setHasPurchased(data?.has_purchased ?? false);
    };

    checkPurchaseStatus();
  }, []);

  const [topUpQuantities, setTopUpQuantities] = useState({
    100: 1,
    500: 1,
    1000: 1
  });

  const handleQuantityChange = (amount: number, delta: number) => {
    setTopUpQuantities(prev => ({
      ...prev,
      [amount]: Math.max(1, prev[amount as keyof typeof prev] + delta)
    }));
  };

  const handlePurchase = async (priceId: string, isStarter: boolean = false) => {
    setLoadingPriceId(priceId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingPriceId(null);
        return;
      }

      // Determine amount based on priceId (new Live IDs)
      let amount = 100; // default for starter or 5-revision pack
      if (isStarter) {
        amount = 100;
      } else if (priceId === 'price_1TvG7j0IfYdAlbaaANQOBR0F') { // 50 revisions
        amount = 1000;
      } else if (priceId === 'price_1TvG7l0IfYdAlbaawtqWABhv') { // 25 revisions
        amount = 500;
      } else {
        amount = 100; // 5 revisions or others
      }

      const quantity = isStarter ? 1 : topUpQuantities[amount as keyof typeof topUpQuantities];

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          quantity,
          userId: user.id
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoadingPriceId(null);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setLoadingPriceId(null);
    }
  };

  const isStarterVisible = hasPurchased === false;

  const topUpPacks = [
    {
      amount: 100,
      price: 7.49,
      badge: "Instant",
      displayRevisions: 5,
      displayConcepts: 10,
      desc: "Quick fuel for your next 10 concepts.",
      priceId: "price_1TvG7o0IfYdAlbaaq4hLeJYL"  // ✅ Live ID
    },
    {
      amount: 500,
      price: 34.99,
      badge: "Best Value",
      displayRevisions: 25,
      displayConcepts: 50,
      desc: "Perfect for ongoing design projects (50 concepts).",
      priceId: "price_1TvG7l0IfYdAlbaawtqWABhv"  // ✅ Live ID
    },
    {
      amount: 1000,
      price: 59.99,
      badge: "Power Pack",
      displayRevisions: 50,
      displayConcepts: 100,
      desc: "Built for serious creative runs (100 concepts).",
      priceId: "price_1TvG7j0IfYdAlbaaANQOBR0F"  // ✅ Live ID
    }
  ];

  const cardClasses = "p-6 rounded-xl border border-[#7C3AED]/40 ring-1 ring-[#7C3AED]/20 bg-card/50 space-y-4 hover:border-[#8c64ff] hover:shadow-[0_0_20px_rgba(140,100,255,0.15)] transition-colors transition-shadow shadow-[0_0_25px_rgba(124,58,237,0.35)]";
  const starterCardClasses = "p-6 rounded-xl border border-[#7C3AED]/50 outline outline-2 outline-[#7C3AED]/30 bg-card/50 space-y-4 hover:border-[#8c64ff] hover:shadow-[0_0_35px_rgba(168,85,247,0.45)] transition-all shadow-[0_0_30px_rgba(124,58,237,0.45)]";

  if (hasPurchased === null) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopBar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-12 overflow-visible">
        <motion.div
          initial={{ opacity: 0, filter: "blur(6px)", y: -8, scale: 0.98 }}
          whileInView={{ opacity: 1, filter: "blur(0px)", y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold tracking-tight mb-4 text-foreground">Boost Your Creative Power</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">Choose a plan that fits your brand's growth. Revisions never expire and failed concepts are never charged. Each revision generates 2 new design directions (concepts).</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold border-b pb-4 border-border">{isStarterVisible ? "Don't like subscriptions? Get revisions instead" : "Top-Ups"}</h2>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-2">Use revisions at your own pace — buy once, use anytime.</p>
            </div>

            {isStarterVisible ? (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { delayChildren: 0.05, staggerChildren: 0.12 } } }}
              >
                <motion.div
                  variants={{
                    hidden: { opacity: 0, x: -40 },
                    show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }
                  }}
                  whileHover={{
                    scale: 1.03,
                    outlineColor: "rgba(168, 85, 247, 0.4)"
                  }}
                  className={`${cardClasses} scale-[1.02] border-[#7C3AED]/40 ring-1 ring-[#7C3AED]/20 shadow-[0_0_25px_rgba(124,58,237,0.35)] hover:shadow-[0_0_35px_rgba(168,85,247,0.45)]`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[#8c64ff] text-xs font-medium tracking-wide">BEST FIRST STEP</span>
                      <h3 className="text-xl font-bold">Creator Kickstart</h3>
                      <p className="text-muted-foreground text-sm mb-1">Shape your identity with your first professional revisions.</p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div className="text-2xl font-bold">$9.99</div>
                      <Badge className="bg-[#5B21B6] text-white text-[10px] shadow-[0_0_10px_rgba(124,58,237,0.5)]">5 Revisions • 10 Concepts</Badge>
                    </div>
                  </div>
                  <ul className="space-y-1.5 pt-1">
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" /> 5 Professional Revisions (Never expire)
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" /> 10 Unique Concepts (2 per revision)
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" /> Logos, Banners, &amp; Social Media Thumbnails
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" /> Full Commercial Rights &amp; High-Res Exports
                    </li>
                  </ul>
                  <Button
                    onClick={() => handlePurchase("price_1TvG7n0IfYdAlbaaeFio0fDS", true)} // ✅ Live ID
                    disabled={loadingPriceId !== null}
                    className="w-full bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] text-white font-bold hover:scale-105 transition-all duration-200 hover:shadow-[0_0_22px_rgba(124,58,237,0.6)] active:scale-95 hover:ring-purple-500/40 rounded-xl"
                    data-testid="button-purchase-starter"
                  >
                    {loadingPriceId === "price_1TvG7n0IfYdAlbaaeFio0fDS" ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting to Stripe...</>
                    ) : "Get Starter Pack"}
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                variants={{ hidden: {}, show: { transition: { delayChildren: 0.05, staggerChildren: 0.12 } } }}
                className="space-y-4"
              >
                {topUpPacks.map((pack) => {
                  const qty = topUpQuantities[pack.amount as keyof typeof topUpQuantities];
                  return (
                    <motion.div
                      key={pack.amount}
                      variants={{
                        hidden: { opacity: 0, x: -40 },
                        show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }
                      }}
                      className={cardClasses}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[#8c64ff] text-xs font-medium tracking-wide">{pack.badge}</span>
                          <h3 className="text-xl font-bold">{pack.displayRevisions * qty} Revisions</h3>
                          <p className="text-muted-foreground text-sm">{pack.desc}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">${(pack.price * qty).toFixed(2)}</div>
                        </div>
                      </div>

                      <ul className="space-y-1.5 pt-1 pb-1">
                        <li className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" /> Logos, Banners, &amp; Social Media Thumbnails
                        </li>
                      </ul>

                      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-2">
                        <div className="flex items-center gap-3 bg-background/50 p-1 rounded-lg border border-border">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md"
                            onClick={() => handleQuantityChange(pack.amount, -1)}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center font-bold">{qty}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md"
                            onClick={() => handleQuantityChange(pack.amount, 1)}
                          >
                            +
                          </Button>
                        </div>
                        <Button
                          onClick={() => handlePurchase(pack.priceId)}
                          disabled={loadingPriceId !== null}
                          variant="outline"
                          className="w-full sm:w-auto px-8 border-[#7C3AED]/20 hover:border-[#7C3AED]/50 font-bold transition-colors duration-200 rounded-xl"
                          data-testid={`button-purchase-topup-${pack.amount}`}
                        >
                          {loadingPriceId === pack.priceId ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting to Stripe...</>
                          ) : "Buy Now"}
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>

          <div className="space-y-8">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold border-b pb-4 border-border">Monthly Subscriptions</h2>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-2">All plans include commercial usage rights.</p>
            </div>
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={{ hidden: {}, show: { transition: { delayChildren: 0.05, staggerChildren: 0.12 } } }}
              className="grid grid-cols-1 gap-6"
            >
              {[
                {
                  price: "$13.99",   // updated price
                  credits: 200,
                  label: "Pro",
                  badge: "Recommended",
                  bonusLabel: "+5 BONUS REVISIONS FIRST MONTH",
                  priceId: "price_1TvG7p0IfYdAlbaatlAQEsF7", // ✅ Live ID
                  features: [
                    "10 Monthly Revisions",
                    "Total of 20 Monthly Unique Concepts (2 per revision)",
                    "Logos, Banners, & Social Media Thumbnails",
                    "Priority generation",
                    "Extended designer memory"
                  ]
                },
                {
                  price: "$27.00",   // updated price
                  credits: 600,
                  label: "Studio",
                  badge: "Launch Bonus",
                  bonusLabel: "+10 BONUS REVISIONS FIRST MONTH",
                  priceId: "price_1TvG7p0IfYdAlbaartzEYmnh", // ✅ Live ID
                  featured: true,
                  includes: "Everything in Pro +",
                  features: [
                    "30 Monthly Revisions",
                    "Total of 60 Monthly Unique Concepts (2 per revision)",
                    "Logos, Banners, & Social Media Thumbnails",
                    "Faster mockups",
                    "Advanced typography intelligence",
                    "Deeper designer memory"
                  ]
                },
                {
                  price: "$49.99",   // updated price
                  credits: 1200,
                  label: "Enterprise",
                  badge: "Premium Tier",
                  bonusLabel: "+15 BONUS REVISIONS FIRST MONTH",
                  priceId: "price_1TvG7j0IfYdAlbaaVeUVBov0", // ✅ Live ID
                  includes: "Everything in Studio +",
                  features: [
                    "60 Monthly Revisions",
                    "Total of 120 Monthly Unique Concepts (2 per revision)",
                    "Logos, Banners, & Social Media Thumbnails",
                    "Maximum designer intelligence",
                    "Brand continuity system",
                    "Ultra-priority generation"
                  ]
                }
              ].map((sub, i) => (
                <motion.div
                  key={i}
                  variants={{
                    hidden: { opacity: 0, x: 40 },
                    show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }
                  }}
                  className={`${cardClasses} ${sub.featured ? 'border-[#7C3AED]/40 ring-1 ring-[#7C3AED]/20 shadow-[0_0_25px_rgba(124,58,237,0.35)] scale-[1.02]' : ''}`}
                >
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      {sub.badge && <div className="text-[#8c64ff] text-xs font-medium tracking-wide mb-1">{sub.badge}</div>}
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        {sub.label} {sub.featured && <Sparkles className="w-4 h-4 text-[#7C3AED]" />}
                      </h3>
                      {sub.includes && <p className="text-[10px] text-muted-foreground italic mb-1">{sub.includes}</p>}
                      <p className="text-[#7C3AED] text-[10px] font-bold uppercase tracking-wider">{sub.bonusLabel}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{sub.price}</div>
                      <div className="text-xs text-muted-foreground">/ month</div>
                    </div>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {sub.features.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" /> {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handlePurchase(sub.priceId)}
                    disabled={loadingPriceId !== null}
                    variant="outline"
                    className="w-full font-bold transition-colors duration-200 rounded-xl border-[#7C3AED]/20 hover:border-[#7C3AED]/50"
                    data-testid={`button-subscribe-${sub.label.toLowerCase()}`}
                  >
                    {loadingPriceId === sub.priceId ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting to Stripe...</>
                    ) : "Start Subscription"}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}