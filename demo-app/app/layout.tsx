import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShieldEx — Privacy-Preserving Agent Payments",
  description:
    "AI agents that spend autonomously within policy limits. Identity never revealed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#070b0f] text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
