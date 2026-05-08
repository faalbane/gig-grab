import Link from "next/link";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";

export function Header() {
  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Logo />
        <nav className="hidden gap-7 text-sm text-gray-700 sm:flex">
          <Link href="/" className="hover:text-gray-900">
            For workers
          </Link>
          <Link href="/hiring" className="hover:text-gray-900">
            For employers
          </Link>
          <Link href="/pricing" className="hover:text-gray-900">
            Pricing
          </Link>
          <Link href="/about" className="hover:text-gray-900">
            About
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
