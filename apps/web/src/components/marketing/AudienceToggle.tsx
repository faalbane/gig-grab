import Link from "next/link";

type Props = { active: "worker" | "employer" };

export function AudienceToggle({ active }: Props) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors";
  return (
    <div className="mx-auto inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
      <Link
        href="/"
        className={`${base} ${
          active === "worker"
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span aria-hidden>👷</span> I&apos;m looking for work
      </Link>
      <Link
        href="/hiring"
        className={`${base} ${
          active === "employer"
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span aria-hidden>💼</span> I&apos;m hiring
      </Link>
    </div>
  );
}
