"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowRight, Bell, ChevronRight, CloudUpload, FileText, Film,
  FolderOpen, Globe, Mail, MessageCircle, Search, Shield, User, X,
} from "lucide-react";

const SUPPORT_MAIL = "mailto:support@teezer.live?subject=Help%20Center%20Support";

/* ── Data ──────────────────────────────────────────────────────── */
interface Topic { key: string; icon: React.ElementType; title: string; desc: string; }
interface Article { id: string; title: string; body: string; }

const TOPICS: Topic[] = [
  { key: "getting-started", icon: CloudUpload, title: "Getting Started", desc: "New to Teezer? Learn the basics and get started in a few simple steps." },
  { key: "create-edit", icon: Film, title: "Create & Edit", desc: "Learn how to upload, edit and enhance your videos." },
  { key: "drafts", icon: FolderOpen, title: "Drafts", desc: "Save, manage and continue your drafts anytime." },
  { key: "privacy-safety", icon: Shield, title: "Privacy & Safety", desc: "Learn about privacy settings and how we keep you safe." },
  { key: "notifications", icon: Bell, title: "Notifications", desc: "Manage your notifications and stay updated." },
  { key: "account-settings", icon: User, title: "Account & Settings", desc: "Manage your account, profile and preferences." },
];

const ARTICLES: Article[] = [
  {
    id: "upload-video", title: "How to upload a video on Teezer",
    body: "1. Tap the + button in the bottom bar.\n2. Record in-app or choose a video from your gallery.\n3. Trim your clip, add a sound, captions and hashtags.\n4. Set who can view, comment and Duet in the privacy options.\n5. Tap Post.\n\nFor best quality, film vertically in good lighting. Teezer automatically streams every video in multiple qualities so it plays smoothly on any connection.",
  },
  {
    id: "edit-videos", title: "How to edit your videos",
    body: "While creating a reel you can trim clips, adjust their order, add trending sounds, layer captions and stickers, and apply effects. Tap any element to fine-tune it, preview the result, and keep editing until it's right before you post. You can also save an unfinished edit to Drafts and come back later.",
  },
  {
    id: "manage-drafts", title: "How to manage your drafts",
    body: "Any reel you save before posting goes to Drafts, found on your profile. Open a draft to keep editing and post it, or delete drafts you no longer need. Drafts are stored on your account so you can pick up where you left off across sessions.",
  },
  {
    id: "privacy-settings", title: "How to change privacy settings",
    body: "Go to Settings → Privacy. There you can make your account private (so new followers need approval), and control who can message you, comment on your videos, tag you, Duet with your content, and download your videos. You can also manage blocked accounts and hidden words from the same place.",
  },
  {
    id: "reset-password", title: "How to reset your password",
    body: "On the login screen, tap \"Forgot password\" and enter the email on your account. We'll send you a secure link to set a new password. For extra protection afterwards, turn on two-factor authentication in Settings → Security so a password alone can never be enough to access your account.",
  },
];

const TOPIC_ARTICLES: Record<string, Article> = {
  "getting-started": { id: "getting-started", title: "Getting Started on Teezer", body: "Welcome to Teezer! Create an account with your email or with Google/Apple, verify it, then pick a username and a few interests so your For You feed is tailored from day one. From there you can watch, like, follow creators, and tap + to post your first reel. Explore trending sounds and hashtags to find your community." },
  "create-edit": ARTICLES[1],
  "drafts": ARTICLES[2],
  "privacy-safety": ARTICLES[3],
  "notifications": { id: "notifications", title: "Managing Notifications", body: "Open Settings → Notifications to choose exactly which push, email and SMS alerts you receive - likes, comments, new followers, mentions, messages, live notifications and more. If you're not getting notifications at all, also check that notifications are allowed for Teezer in your device's system settings." },
  "account-settings": { id: "account-settings", title: "Account & Settings", body: "Manage everything about your account from Settings: edit your profile (name, username, bio, photo, links), secure your login with two-factor authentication and session management, tune your feed in Content Preferences, and control your privacy. You can also download a copy of your data or delete your account from Account Settings." },
};

const POPULAR_SEARCHES = ["Upload", "Edit Video", "Drafts", "Privacy", "Account & Settings"];

/* ── Article modal ─────────────────────────────────────────────── */
function ArticleModal({ article, onClose }: { article: Article; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff3ec]">
              <FileText className="h-5 w-5 text-[#fd4605]" />
            </span>
            <h3 className="text-lg font-extrabold text-gray-900">{article.title}</h3>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <p className="whitespace-pre-line text-[14px] leading-7 text-gray-700">{article.body}</p>
          <a href={SUPPORT_MAIL} className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-[#fff3ec] py-3 text-[13px] font-bold text-[#fd4605] transition hover:bg-[#ffe0e9]">
            <MessageCircle className="h-4 w-4" /> Still need help? Contact support
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function HelpCenterPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Article | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ARTICLES.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-white">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="https://teezer.live" aria-label="Teezer home">
            <Image src="/teezer-logo.png" alt="Teezer" width={210} height={54} className="h-8 w-auto" priority />
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            {[["Home", "https://teezer.live"], ["Features", "https://teezer.live"], ["Pricing", "https://teezer.live"], ["Blog", "https://teezer.live"]].map(([l, h]) => (
              <a key={l} href={h} className="text-sm font-semibold text-gray-600 hover:text-gray-900">{l}</a>
            ))}
            <span className="text-sm font-bold text-[#fd4605]">Help</span>
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-sm font-semibold text-gray-600 sm:flex">
              <Globe className="h-4 w-4" /> English
            </span>
            <a href="https://teezer.live" className="flex items-center gap-1.5 rounded-full bg-[#fd4605] px-5 py-2 text-sm font-bold text-white hover:bg-[#e03e04]">
              Go to App <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#fff6f1] to-white px-5 pb-16 pt-14">
        {/* Soft decorative blobs */}
        <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-[#ffe0e9] opacity-50 blur-2xl" />
        <div className="pointer-events-none absolute -right-16 top-24 h-64 w-64 rounded-full bg-[#ffe8ef] opacity-60 blur-2xl" />

        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff3ec] px-4 py-1.5 text-xs font-bold text-[#fd4605]">
            <MessageCircle className="h-3.5 w-3.5" /> Help Center
          </span>
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            How can we <span className="text-[#fd4605]">help</span> you?
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-gray-500">
            Find answers, tips and guides to help you make the most of Teezer.
          </p>

          {/* Search */}
          <div className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for articles, topics or keywords..."
              className="flex-1 bg-transparent px-4 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none"
            />
            <button className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#fd4605] text-white hover:bg-[#e03e04]" aria-label="Search">
              <Search className="h-5 w-5" />
            </button>
          </div>

          {/* Popular searches */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[13px] font-bold text-gray-700">Popular searches:</span>
            {POPULAR_SEARCHES.map((s) => (
              <button key={s} onClick={() => setQuery(s)} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[12px] font-medium text-gray-600 hover:border-[#fd4605] hover:text-[#fd4605]">
                {s}
              </button>
            ))}
          </div>

          {/* Live search results */}
          {results && (
            <div className="mx-auto mt-6 max-w-2xl overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm">
              {results.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-gray-400">No articles found for &ldquo;{query}&rdquo;.</p>
              ) : results.map((a, i) => (
                <button key={a.id} onClick={() => setOpen(a)} className={`flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-[#fff8f9] ${i < results.length - 1 ? "border-b border-gray-100" : ""}`}>
                  <FileText className="h-4 w-4 flex-shrink-0 text-[#fd4605]" />
                  <span className="flex-1 text-[14px] font-semibold text-gray-800">{a.title}</span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat illustration (approximated) */}
        <div className="pointer-events-none absolute right-6 top-16 hidden lg:block">
          <div className="relative">
            <div className="flex h-40 w-40 items-center justify-center rounded-[36px] bg-white shadow-[0_20px_60px_rgba(253,70,5,0.18)]">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[#fd4605] shadow-lg">
                <MessageCircle className="h-11 w-11 text-white" fill="white" strokeWidth={0} />
                <span className="absolute flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#fd4605]" /><span className="h-1.5 w-1.5 rounded-full bg-[#fd4605]" /><span className="h-1.5 w-1.5 rounded-full bg-[#fd4605]" /></span>
              </div>
            </div>
            <div className="absolute -bottom-3 -right-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fd4605] shadow-lg">
              <Search className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Browse Help Topics ── */}
      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">Browse Help Topics</h2>
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-[#fd4605]" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setOpen(TOPIC_ARTICLES[t.key])}
                className="group relative flex flex-col rounded-3xl border border-gray-100 bg-white p-6 text-left shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-1 hover:border-[#fd4605]/30 hover:shadow-[0_12px_36px_rgba(253,70,5,0.12)]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff3ec]">
                  <Icon className="h-6 w-6 text-[#fd4605]" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-gray-900">{t.title}</h3>
                <p className="mt-2 max-w-[85%] text-[13px] leading-relaxed text-gray-500">{t.desc}</p>
                <span className="absolute bottom-6 right-6 flex h-9 w-9 items-center justify-center rounded-full bg-[#fff3ec] transition-colors group-hover:bg-[#fd4605]">
                  <ArrowRight className="h-4 w-4 text-[#fd4605] transition-colors group-hover:text-white" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Popular Articles + Still need help ── */}
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Popular Articles */}
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
          <h3 className="text-xl font-extrabold text-gray-900">Popular Articles</h3>
          <div className="mt-4">
            {ARTICLES.map((a, i) => (
              <button key={a.id} onClick={() => setOpen(a)} className={`flex w-full items-center gap-3 py-3.5 text-left ${i < ARTICLES.length - 1 ? "border-b border-gray-100" : ""}`}>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#fff3ec]">
                  <FileText className="h-4 w-4 text-[#fd4605]" />
                </span>
                <span className="flex-1 text-[14px] font-semibold text-gray-800 hover:text-[#fd4605]">{a.title}</span>
                <ChevronRight className="h-4 w-4 text-[#fd4605]" />
              </button>
            ))}
          </div>
          <a href={SUPPORT_MAIL} className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-[#fd4605] hover:underline">
            View all articles <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Still need help */}
        <div className="rounded-3xl bg-[#fff6f1] p-6">
          <h3 className="text-xl font-extrabold text-gray-900">Still need help?</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-500">Our support team is here for you. Choose the best way to reach us.</p>

          <a href={SUPPORT_MAIL} className="mt-5 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#fd4605]">
              <Mail className="h-5 w-5 text-white" />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-extrabold text-gray-900">Contact Support</span>
              <span className="block text-[12px] text-gray-500">Send us an email and we&apos;ll get back to you.</span>
            </span>
            <ChevronRight className="h-5 w-5 text-[#fd4605]" />
          </a>

          <a href={SUPPORT_MAIL} className="mt-3 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#fd4605]">
              <MessageCircle className="h-5 w-5 text-white" />
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-2 text-[14px] font-extrabold text-gray-900">
                Live Chat
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16a34a]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" /> Online
                </span>
              </span>
              <span className="block text-[12px] text-gray-500">Chat with our support team in real time.</span>
            </span>
            <ChevronRight className="h-5 w-5 text-[#fd4605]" />
          </a>
        </div>
      </section>

      {/* ── Newsletter ── */}
      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="flex flex-col items-center gap-6 rounded-3xl bg-[#fff6f1] p-8 md:flex-row md:justify-between">
          <div className="flex items-center gap-5">
            <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-[#fd4605] shadow-lg">
              <Mail className="h-7 w-7 text-white" />
            </span>
            <div>
              <h3 className="text-xl font-extrabold text-gray-900">Stay in the loop</h3>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-gray-500">Subscribe to our newsletter for product updates, tips and helpful guides.</p>
            </div>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); alert("Thanks! You're subscribed."); }}
            className="flex w-full max-w-md items-center gap-2 rounded-2xl bg-white p-2 shadow-sm"
          >
            <input type="email" required placeholder="Enter your email" className="flex-1 bg-transparent px-3 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none" />
            <button type="submit" className="flex-shrink-0 rounded-xl bg-[#fd4605] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#e03e04]">Subscribe</button>
          </form>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-6 border-t border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-8 sm:flex-row sm:justify-between">
          <a href="https://teezer.live" aria-label="Teezer home">
            <Image src="/teezer-logo.png" alt="Teezer" width={200} height={52} className="h-7 w-auto" />
          </a>
          <nav className="flex flex-wrap items-center justify-center gap-6">
            {["Home", "Features", "Pricing", "Blog", "Help"].map((l) => (
              <a key={l} href={l === "Help" ? "/help-center" : "https://teezer.live"} className="text-sm font-semibold text-gray-600 hover:text-gray-900">{l}</a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            {[Facebook, Instagram, Twitter, Youtube].map((Icon, i) => (
              <a key={i} href="https://teezer.live" className="text-gray-900 hover:text-[#fd4605]" aria-label="Teezer social"><Icon className="h-5 w-5" /></a>
            ))}
          </div>
        </div>
        <p className="pb-8 text-center text-xs text-gray-400">© {new Date().getFullYear()} Teezer. All rights reserved.</p>
      </footer>

      {open && <ArticleModal article={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* Inline brand SVGs - this lucide-react version doesn't export the social icons. */
function Facebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}
function Instagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 3.68A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.4-10.4a1.44 1.44 0 1 1-1.44-1.44 1.44 1.44 0 0 1 1.44 1.44Z" />
    </svg>
  );
}
function Twitter({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93Zm-1.29 19.5h2.04L6.48 3.24H4.29L17.61 20.65Z" />
    </svg>
  );
}
function Youtube({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14C4.5 20.45 12 20.45 12 20.45s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.24 3.6Z" />
    </svg>
  );
}
