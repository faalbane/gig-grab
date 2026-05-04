import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-emerald-600 text-sm font-bold text-white">
        GG
      </div>
      <span className="font-semibold tracking-tight">GigGrab</span>
    </Link>
  );
}
