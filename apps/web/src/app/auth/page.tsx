import { Header } from "@/components/marketing/Header";
import { AuthCard } from "@/components/auth/AuthCard";

export const dynamic = "force-static";

export default function AuthPage() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 py-16">
        <div className="mx-auto flex justify-center px-6">
          <AuthCard />
        </div>
      </main>
    </>
  );
}
