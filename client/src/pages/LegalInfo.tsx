import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import TopBar from "@/components/TopBar";
import { FileText, Shield, CreditCard, Upload } from "lucide-react";

export default function LegalInfo() {
  const [, setLocation] = useLocation();

  const sections = [
    {
      title: "Privacy Policy",
      icon: <Shield className="w-5 h-5 text-purple-400" />,
      content: [
        "Uploaded images processed temporarily.",
        "Files used only as reference material."
      ],
      clickable: true,
      href: "/legal#privacy"
    },
    {
      title: "Terms of Service",
      icon: <FileText className="w-5 h-5 text-purple-400" />,
      content: [
        "AI-assisted design platform.",
        "No guarantee of uniqueness or trademark safety."
      ],
      clickable: true,
      href: "/legal#terms"
    },
    {
      title: "Refund Policy",
      icon: <CreditCard className="w-5 h-5 text-purple-400" />,
      content: [
        "Revisions are digital goods.",
        "No refunds after revisions are issued.",
        "Failed concepts are never charged."
      ],
      clickable: true,
      href: "/legal#refund"
    },
    {
      title: "Upload Rules",
      icon: <Upload className="w-5 h-5 text-purple-400" />,
      content: [
        "Accepted formats: PNG, JPG, JPEG",
        "Max file size: 50MB"
      ],
      clickable: false,
      href: ""
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopBar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <h1 className="text-4xl font-bold tracking-tight mb-8 text-foreground" data-testid="text-legal-title">Legal Information</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {sections.map((section, i) => (
            <div 
              key={i} 
              onClick={() => {
                if (section.clickable) setLocation(section.href);
              }}
              className={`p-6 rounded-xl border border-border bg-card/50 space-y-4 transition-colors duration-250 ${
                section.clickable ? 'cursor-pointer hover:border-[#7C3AED]/50 hover:bg-card/80' : 'cursor-default'
              }`}
              data-testid={`card-legal-${section.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-3">
                {section.icon}
                <h2 className="text-xl font-bold">{section.title}</h2>
              </div>
              <ul className="space-y-2">
                {section.content.map((item, j) => (
                  <li key={j} className="text-muted-foreground text-sm flex items-start gap-2">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-purple-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button variant="outline" asChild className="rounded-full border-border hover:border-[rgba(140,100,255,0.8)] transition-[border-color] duration-250" data-testid="button-back-home">
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
