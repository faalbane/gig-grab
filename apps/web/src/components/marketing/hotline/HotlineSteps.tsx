import { IconPhone, IconMic, IconBolt } from "./icons";

type Mode = "worker" | "employer";

export function HotlineSteps({ mode }: { mode: Mode }) {
  const steps =
    mode === "worker"
      ? [
          {
            n: "01",
            icon: <IconPhone width={20} height={20} />,
            title: "Dial the hotline",
            body: "Call from any phone, in any country. Free.",
          },
          {
            n: "02",
            icon: <IconMic width={20} height={20} />,
            title: "Talk for 2 minutes",
            body: "Tell our AI what you do, where, and when — in your language.",
          },
          {
            n: "03",
            icon: <IconBolt width={20} height={20} />,
            title: "Get matched live",
            body: "We text + email ranked roles you can apply to with one tap.",
          },
        ]
      : [
          {
            n: "01",
            icon: <IconPhone width={20} height={20} />,
            title: "Dial the hotline",
            body: "Call when you have a role. Free, 24/7.",
          },
          {
            n: "02",
            icon: <IconMic width={20} height={20} />,
            title: "Brief us by voice",
            body: "Walk through the role naturally. We turn it into a structured JD.",
          },
          {
            n: "03",
            icon: <IconBolt width={20} height={20} />,
            title: "Receive ranked candidates",
            body: "Top vetted talent in your inbox within the hour. Auto-interviews on request.",
          },
        ];

  return (
    <section
      className="border-t py-20"
      style={{ borderTopColor: "var(--gg-line)" }}
    >
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div
              className="mono mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{
                color: "var(--gg-green-dark)",
                letterSpacing: "0.12em",
              }}
            >
              How the hotline works
            </div>
            <h2 className="m-0 text-[40px] font-extrabold tracking-tight">
              One call. Three steps.
            </h2>
          </div>
          <div
            className="max-w-sm text-[15px] leading-snug"
            style={{ color: "var(--gg-muted)" }}
          >
            {mode === "worker"
              ? "No app to download. No CV to upload. Just the phone in your pocket."
              : "No platform login. No long briefs. Just a quick voice call."}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-2xl border bg-white p-7"
              style={{ borderColor: "var(--gg-line)" }}
            >
              <div
                className="mono text-[13px] font-semibold"
                style={{ color: "var(--gg-muted)" }}
              >
                {s.n}
              </div>
              <div
                className="my-4 grid h-11 w-11 place-items-center rounded-xl"
                style={{
                  background: "var(--gg-green-tint)",
                  color: "var(--gg-green-dark)",
                }}
              >
                {s.icon}
              </div>
              <div className="mb-1.5 text-[19px] font-bold tracking-tight">
                {s.title}
              </div>
              <div
                className="text-[14.5px] leading-snug"
                style={{ color: "var(--gg-muted)" }}
              >
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
