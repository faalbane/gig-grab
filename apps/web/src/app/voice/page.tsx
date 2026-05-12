"use client";

import { Header } from "@/components/marketing/Header";
import { VoiceCallView } from "@/components/voice/VoiceCallView";

export default function VoicePage() {
  return (
    <>
      <Header compact />
      <main
        className="flex-1"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--gg-green-tint-2) 0%, transparent 45%), var(--gg-bg)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
          <header className="mb-8 max-w-3xl">
            <p
              className="mono text-xs font-semibold uppercase"
              style={{
                color: "var(--gg-green-dark)",
                letterSpacing: "0.14em",
              }}
            >
              Browser microphone
            </p>
            <h1
              className="m-0 mt-1.5 text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{ color: "var(--gg-ink)" }}
            >
              Talk to Sarah and watch your CV update live.
            </h1>
            <p
              className="mt-2 max-w-2xl text-[15px] leading-relaxed"
              style={{ color: "var(--gg-muted)" }}
            >
              Same conversation as the hotline — Sarah asks short questions in
              your language, you answer, and we build your CV as you talk.
              Headphones recommended so the mic doesn&apos;t pick up her voice.
            </p>
          </header>
          <VoiceCallView />
        </div>
      </main>
    </>
  );
}
