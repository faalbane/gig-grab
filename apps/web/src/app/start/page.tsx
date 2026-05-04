import { Header } from "@/components/marketing/Header";
import { VerifyForm } from "@/components/start/VerifyForm";

export default function StartPage() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 py-16">
        <div className="mx-auto flex justify-center px-6">
          <VerifyForm audience="worker" />
        </div>
      </main>
    </>
  );
}
