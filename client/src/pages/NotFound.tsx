import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4 text-center">
      <h1 className="error404Title">404</h1>
      <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
        <span className="inline-block headline-reveal-left">Easy Peasy Lemon Squeezy —</span><br />
        <span className="inline-block headline-reveal-right text-purple-400">Looks like you rolled off the page.</span>
      </h1>
      <Button asChild size="lg" className="rounded-xl bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] text-white font-bold px-8 mt-4 hover:scale-105 transition-all duration-200 shadow-[0_0_30px_rgba(124,58,237,0.4)] hover:shadow-[0_0_40px_rgba(124,58,237,0.6)] active:scale-95">
        <Link href="/">Back to Home</Link>
      </Button>
    </div>
  );
}