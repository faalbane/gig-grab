import { Header } from "@/components/marketing/Header";
import { CallingCard } from "@/components/start/CallingCard";

export const dynamic = "force-static";

export default function CallingPage() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 py-16">
        <div className="mx-auto flex justify-center px-6">
          <CallingCard />
        </div>
      </main>
    </>
  );
}
