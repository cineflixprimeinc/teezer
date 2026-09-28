import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teezer Music Library - Upload Your Originals. Get Discovered.",
  description: "Join the Teezer Music Library and share your original music with creators, filmmakers, brands and content makers worldwide. You own your music.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
