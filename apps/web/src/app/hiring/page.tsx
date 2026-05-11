import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { HotlineHero } from "@/components/marketing/hotline/HotlineHero";
import { HotlineSteps } from "@/components/marketing/hotline/HotlineSteps";
import { HotlineProof } from "@/components/marketing/hotline/HotlineProof";
import { HotlineFinalCTA } from "@/components/marketing/hotline/HotlineFinalCTA";

export default function EmployerLanding() {
  return (
    <>
      <Header />
      <main>
        <HotlineHero mode="employer" />
        <HotlineSteps mode="employer" />
        <HotlineProof mode="employer" />
        <HotlineFinalCTA mode="employer" />
      </main>
      <Footer />
    </>
  );
}
