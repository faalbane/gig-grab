import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gig-grab — Speak it. Match it. Get hired.",
  description:
    "Voice-first AI hiring agent. No CV. No forms. Just a quick voice chat with our AI recruiter — in any language — and we'll match you to live jobs.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
