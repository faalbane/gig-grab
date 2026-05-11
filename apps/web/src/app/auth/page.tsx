import { Header } from "@/components/marketing/Header";
import { AuthCard } from "@/components/auth/AuthCard";

export const dynamic = "force-static";

export default function AuthPage() {
  return (
    <>
      <Header />
      <main
        className="flex-1"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--gg-green-tint-2) 0%, transparent 55%), var(--gg-bg)",
        }}
      >
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(135deg, transparent 0 60px, rgba(14,159,74,0.025) 60px 61px)",
            }}
          />
          <div className="relative mx-auto grid place-items-center px-6 py-12 sm:py-16">
            <div>
              <AuthCard />
              <p
                className="mx-auto mt-6 max-w-sm text-center text-xs leading-snug"
                style={{ color: "var(--gg-muted)" }}
              >
                By logging in you agree to our{" "}
                <a
                  href="/legal/terms"
                  className="underline decoration-[var(--gg-line-2)] underline-offset-2"
                  style={{ color: "var(--gg-ink-2)" }}
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="/legal/privacy"
                  className="underline decoration-[var(--gg-line-2)] underline-offset-2"
                  style={{ color: "var(--gg-ink-2)" }}
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
