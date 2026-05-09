import { Header } from "@/components/marketing/Header";
import { VoiceCallView } from "@/components/voice/VoiceCallView";

export const dynamic = "force-static";

export default function VoicePage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Talk to Sarah from your browser
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Same intake call as the phone version — uses your computer or phone
          microphone instead. Headphones recommended.
        </p>
        <div className="mt-8">
          <VoiceCallView />
        </div>
      </main>
    </>
  );
}
