"use client";

import { useState } from "react";
import { IconPhone } from "./icons";
import { CallbackModal } from "./CallbackModal";

type Mode = "worker" | "employer";

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

export function HotlineFinalCTA({ mode }: { mode: Mode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const isWorker = mode === "worker";
  const telHref = `tel:${HOTLINE.replace(/\s/g, "")}`;

  return (
    <>
      <section
        className="relative overflow-hidden py-20 text-white"
        style={{ background: "var(--gg-green)" }}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            opacity: 0.18,
            background:
              "radial-gradient(circle at 20% 50%, white 0%, transparent 35%), radial-gradient(circle at 80% 30%, white 0%, transparent 30%)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div
              className="mono mb-3 text-xs uppercase tracking-widest"
              style={{ letterSpacing: "0.14em", opacity: 0.85 }}
            >
              Ready when you are
            </div>
            <h2
              className="m-0 whitespace-pre-line font-extrabold leading-[1.05] tracking-tight"
              style={{ fontSize: "clamp(36px, 4.5vw, 56px)" }}
            >
              {isWorker
                ? "Pick up your phone.\nGet a job."
                : "Pick up your phone.\nFill the role."}
            </h2>
            <div className="mt-6 flex flex-wrap gap-3.5">
              <a
                href={telHref}
                className="inline-flex items-center gap-2.5 rounded-xl bg-white px-6 py-4 text-base font-bold"
                style={{ color: "var(--gg-green-dark)" }}
              >
                <IconPhone width={18} height={18} /> Call {HOTLINE}
              </a>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-xl border-[1.5px] px-5 py-4 text-[15px] font-semibold text-white"
                style={{ borderColor: "rgba(255,255,255,0.4)" }}
              >
                Have us call you
              </button>
            </div>
          </div>
          <div
            className="rounded-[22px] border p-7"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              borderColor: "rgba(255,255,255,0.18)",
            }}
          >
            <div
              className="mono mb-2.5 text-[13px]"
              style={{ opacity: 0.75 }}
            >
              QUICK FACT
            </div>
            <div className="text-[22px] font-bold leading-snug tracking-tight">
              {isWorker
                ? "94% of callers get their first match before they hang up — read out by our AI, live on the call."
                : "Recruiters who brief by voice fill roles 3.2× faster than via job-board posts."}
            </div>
          </div>
        </div>
      </section>

      <CallbackModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={mode}
      />
    </>
  );
}
