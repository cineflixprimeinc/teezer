import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Find answers, tips and guides to help you make the most of Teezer. Search articles, browse help topics, or contact support.",
  alternates: { canonical: "https://help.teezer.live" },
};

export default function HelpCenterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
