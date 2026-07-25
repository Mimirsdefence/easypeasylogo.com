import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import TopBar from "@/components/TopBar";
import { Helmet } from "react-helmet-async";

export default function Legal() {
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (id) {
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth" });
        }, 120);
      }
    }
  }, []);

  return (
    <>
      <Helmet>
        <title>Legal – EasyPeasyLogo</title>
        <meta name="description" content="EasyPeasyLogo legal information – Terms of Service, Privacy Policy, and Refund Policy for AI brand identity design services." />
        <meta property="og:title" content="Legal – EasyPeasyLogo" />
        <meta property="og:description" content="EasyPeasyLogo legal information – Terms of Service, Privacy Policy, and Refund Policy for AI brand identity design services." />
        <meta property="og:url" content="https://easypeasylogo.com/legal" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://easypeasylogo.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Legal – EasyPeasyLogo" />
        <meta name="twitter:description" content="EasyPeasyLogo legal information – Terms of Service, Privacy Policy, and Refund Policy for AI brand identity design services." />
        <meta name="twitter:image" content="https://easypeasylogo.com/og-image.png" />
        <link rel="canonical" href="https://easypeasylogo.com/legal" />
      </Helmet>

      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <style>{`html { scroll-behavior: smooth; }`}</style>
        <TopBar />
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12 space-y-16">

          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight mb-2" data-testid="text-legal-page-title">Legal</h1>
            <p className="text-muted-foreground text-sm">EasyPeasyLogo is operated by EasyPeasyLogo, based in Sweden. Contact: support@easypeasylogo.com</p>
          </div>

          {/* TERMS OF SERVICE */}
          <section id="terms" className="scroll-mt-24 space-y-6">
            <h2 className="text-2xl font-bold border-b border-border pb-4" data-testid="text-terms-heading">Terms of Service</h2>
            <div className="space-y-4 text-[rgba(255,255,255,0.78)] leading-relaxed text-sm">
              <p>By accessing or using EasyPeasyLogo ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
              <p>EasyPeasyLogo is an AI-assisted design platform. No guarantee of uniqueness or trademark safety is provided for any generated output.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">License and Use of Generated Visual Outputs</h3>
              <p>Subject to compliance with these Terms, EasyPeasyLogo grants users a perpetual, worldwide, royalty-free license to use, modify, reproduce, publish, display, and commercially exploit visual outputs generated through the Service, including logos, banners, thumbnails, branding assets, and related materials.</p>
              <p>To the extent permitted by applicable law and third-party provider terms, any rights EasyPeasyLogo may hold in the generated outputs are assigned to the user upon successful generation.</p>
              <p>Generated outputs are created through automated systems and may not be unique or eligible for intellectual property protection. EasyPeasyLogo does not guarantee trademark availability, copyright ownership, exclusivity, or legal compliance of generated materials.</p>
              <p>Users are solely responsible for reviewing and verifying legal suitability before commercial use.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">AI Protection &amp; Platform Role</h3>
              <p>EasyPeasyLogo provides automated design tools and does not provide legal, trademark, or intellectual property advice.</p>
              <p>Users acknowledge that generated visuals may resemble existing designs or publicly available content due to the nature of AI systems.</p>
              <p>EasyPeasyLogo shall not be responsible for trademark conflicts, brand disputes, or legal claims arising from user-selected designs.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">Advanced AI Platform Shield</h3>
              <p>Users understand that EasyPeasyLogo acts solely as a technology platform facilitating automated visual generation. All creative selections, brand decisions, and final usage choices are made by the user.</p>
              <p>By using the Service, users agree that EasyPeasyLogo is not the creator, publisher, or legal owner of user-selected outputs and shall not be held liable for downstream commercial use, brand identity conflicts, intellectual property disputes, or third-party claims related to such use.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">Trademark Collision Awareness</h3>
              <p>Users acknowledge that logo and brand designs generated through the Service may unintentionally resemble existing trademarks, logos, or brand identities.</p>
              <p>EasyPeasyLogo does not perform trademark searches, legal clearance, or intellectual property verification. Users agree that it is their sole responsibility to conduct independent trademark checks, legal reviews, or professional consultations before commercial use or brand registration.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">Liability Limitation</h3>
              <p>To the maximum extent permitted by applicable law, EasyPeasyLogo shall not be liable for any indirect, incidental, consequential, special, or punitive damages, including but not limited to loss of profits, revenue, data, goodwill, or business opportunities, arising from or related to use of the Service or generated outputs.</p>
              <p>In all cases, EasyPeasyLogo's total cumulative liability shall not exceed the total amount paid by the user to EasyPeasyLogo during the thirty (30) days immediately preceding the event giving rise to the claim.</p>
              <p>Users acknowledge that pricing of the Service reflects this allocation of risk and limitation of liability.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">User Content Processing</h3>
              <p>User inputs may be processed by automated systems solely to provide generation services. EasyPeasyLogo does not claim ownership of uploaded content.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">EU Digital Goods Waiver</h3>
              <p>By purchasing revisions, you agree to immediate delivery of digital content and waive statutory withdrawal rights to the extent permitted by law.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">Termination</h3>
              <p>EasyPeasyLogo may suspend or terminate access at any time for security, legal, or operational reasons.</p>
            </div>
          </section>

          {/* PRIVACY POLICY */}
          <section id="privacy" className="scroll-mt-24 space-y-6">
            <h2 className="text-2xl font-bold border-b border-border pb-4" data-testid="text-privacy-heading">Privacy Policy</h2>
            <div className="space-y-4 text-[rgba(255,255,255,0.78)] leading-relaxed text-sm">
              <p>EasyPeasyLogo respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard information when you use our Service.</p>
              <p>Uploaded images are processed temporarily and used only as reference material for design generation. Files are not stored permanently and are deleted after processing.</p>
              <p>We collect only the information necessary to provide the Service, including email addresses for account creation and session management.</p>
              <p>User inputs may be processed by automated systems solely to provide generation services. EasyPeasyLogo does not claim ownership of uploaded content.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">Cookies &amp; Analytics</h3>
              <p>Cookies or similar technologies may be used for authentication, security, and analytics purposes.</p>

              <h3 className="text-lg font-semibold text-foreground pt-4">Data Protection</h3>
              <p>We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.</p>
              <p>For questions about your data or to request deletion, contact us at support@easypeasylogo.com.</p>
            </div>
          </section>

          {/* REFUND POLICY */}
          <section id="refund" className="scroll-mt-24 space-y-6">
            <h2 className="text-2xl font-bold border-b border-border pb-4" data-testid="text-refund-heading">Refund Policy</h2>
            <div className="space-y-4 text-[rgba(255,255,255,0.78)] leading-relaxed text-sm">
              <p>Revisions purchased on EasyPeasyLogo are digital goods. No refunds are issued after revisions have been added to your account.</p>
              <p>Failed concepts are never charged.</p>
              <p>By purchasing revisions, you agree to immediate delivery of digital content and waive statutory withdrawal rights to the extent permitted by applicable law (including EU consumer protection regulations for digital goods).</p>
              <p>If you experience a technical issue that prevents you from using purchased revisions, please contact support@easypeasylogo.com and we will investigate on a case-by-case basis.</p>
            </div>
          </section>

          <div className="pt-8 pb-12 flex flex-col items-center gap-4 border-t border-border">
            <Button variant="outline" asChild className="rounded-full border-border hover:border-[rgba(140,100,255,0.8)] transition-[border-color] duration-250" data-testid="button-back-legal-info">
              <Link href="/legal-info">Back to Legal Overview</Link>
            </Button>
            <Button variant="outline" asChild className="rounded-full border-border hover:border-[rgba(140,100,255,0.8)] transition-[border-color] duration-250" data-testid="button-back-home">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </main>
      </div>
    </>
  );
}