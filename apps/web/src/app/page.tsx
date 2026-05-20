import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { HotlineHero } from "@/components/marketing/hotline/HotlineHero";
import { HotlineSteps } from "@/components/marketing/hotline/HotlineSteps";
import { HotlineProof } from "@/components/marketing/hotline/HotlineProof";
import { HotlineFinalCTA } from "@/components/marketing/hotline/HotlineFinalCTA";
import { SignedInRedirect } from "@/components/marketing/SignedInRedirect";

export default function WorkerLanding() {
  return (
    <>
      <SignedInRedirect />
      <Header />
      <main>
        <HotlineHero mode="worker" />
        <HotlineSteps mode="worker" />
        <HotlineProof mode="worker" />
        <HotlineFinalCTA mode="worker" />
      </main>
      <Footer />
    </>
  );
}
