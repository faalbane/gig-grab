import Link from "next/link";
import { Logo } from "./Logo";
import { LocaleBadge } from "./LocaleBadge";

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-gray-600">
            Voice-first hiring. We match vetted workers to live roles — in any
            language.
          </p>
        </div>

        <FooterColumn
          heading="Product"
          links={[
            ["For workers", "/"],
            ["For employers", "/hiring"],
            ["Pricing", "/pricing"],
            ["ATS integrations", "/ats"],
          ]}
        />
        <FooterColumn
          heading="Company"
          links={[
            ["About", "/about"],
            ["Careers", "/careers"],
            ["Press", "/press"],
            ["Contact", "/contact"],
          ]}
        />
        <FooterColumn
          heading="Legal"
          links={[
            ["Privacy", "/legal/privacy"],
            ["Terms", "/legal/terms"],
            ["Cookies", "/legal/cookies"],
            ["Modern Slavery", "/legal/modern-slavery"],
          ]}
        />
      </div>

      <div className="border-t border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 text-sm text-gray-500">
          <p>© 2026 GigGrab Ltd. All rights reserved.</p>
          <LocaleBadge />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">{heading}</p>
      <ul className="mt-4 space-y-3 text-sm text-gray-600">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="hover:text-gray-900">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
