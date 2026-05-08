import { Header } from "@/components/marketing/Header";
import { SettingsCard } from "@/components/settings/SettingsCard";

export const dynamic = "force-static";

export default function SettingsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage how we reach you.
        </p>
        <div className="mt-8">
          <SettingsCard />
        </div>
      </main>
    </>
  );
}
