"use client";

import { useState } from "react";
import {
  ArrowRight, BadgeCheck, BarChart2, ChevronRight, DollarSign,
  Globe, MapPin, Menu, Music, Play, Shield, Star, Upload, Users, X,
  Zap,
} from "lucide-react";

// ─── Waveform decoration ──────────────────────────────────────────────────────

function Waveform({ playing = false, bars = 28 }: { playing?: boolean; bars?: number }) {
  const heights = [14, 22, 36, 50, 42, 60, 48, 30, 55, 45, 28, 60, 52, 38,
                   22, 44, 58, 46, 32, 55, 40, 26, 48, 60, 35, 20, 42, 50];
  return (
    <div className="flex items-center gap-[3px]" style={{ height: 40 }}>
      {heights.slice(0, bars).map((h, i) => (
        <div
          key={i}
          className="rounded-full shrink-0 transition-all duration-300"
          style={{
            width: 3,
            height: h,
            background: playing
              ? `hsl(${340 + i * 1.5}, 90%, ${50 + (i % 5) * 3}%)`
              : "#fe2c55",
            opacity: playing ? 0.8 + (i % 3) * 0.07 : 0.6 + (i % 4) * 0.1,
          }}
        />
      ))}
    </div>
  );
}

// ─── Track player card ────────────────────────────────────────────────────────

function TrackCard() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-black/10 p-5 border border-[#f0f0f0] w-72">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af] mb-3">Your Track</p>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#fe2c55] to-[#ff6b8a] grid place-items-center shrink-0 shadow-sm">
          <Music className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-[14px] font-bold text-[#111827]">Midnight Drive</p>
          <p className="text-[12px] text-[#9ca3af]">Indie Pop</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(p => !p)}
          className="h-9 w-9 rounded-full bg-[#fe2c55] grid place-items-center shrink-0 hover:bg-[#e0264b] active:scale-95 transition-all shadow-md shadow-[#fe2c55]/30"
        >
          {playing
            ? <div className="flex gap-0.5"><div className="h-3 w-0.5 bg-white rounded-full"/><div className="h-3 w-0.5 bg-white rounded-full"/></div>
            : <Play className="h-4 w-4 text-white fill-current ml-0.5" />}
        </button>
        <div className="flex-1">
          <Waveform playing={playing} />
        </div>
        <span className="text-[11px] text-[#9ca3af] tabular-nums shrink-0">03:24</span>
      </div>
    </div>
  );
}

// ─── Artist card ──────────────────────────────────────────────────────────────

function ArtistCard() {
  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-black/10 p-5 border border-[#f0f0f0] w-64">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative h-12 w-12 shrink-0">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] grid place-items-center text-white font-bold text-[16px]">
            R
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-[#fe2c55] grid place-items-center border-2 border-white">
            <BadgeCheck className="h-3 w-3 text-white fill-current" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <p className="text-[14px] font-bold text-[#111827]">Riley West</p>
            <BadgeCheck className="h-3.5 w-3.5 text-[#fe2c55] fill-current" />
          </div>
          <p className="text-[11px] text-[#9ca3af]">Independent Artist</p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[#9ca3af] mb-4">
        <MapPin className="h-3 w-3 shrink-0" />
        Los Angeles, CA
      </div>
      <div className="grid grid-cols-3 divide-x divide-[#f4f5f7] border border-[#f4f5f7] rounded-xl overflow-hidden">
        {[
          { label: "Tracks",    value: "23" },
          { label: "Followers", value: "12.4K" },
          { label: "Plays",     value: "98K" },
        ].map(({ label, value }) => (
          <div key={label} className="py-2.5 text-center">
            <p className="text-[14px] font-bold text-[#111827]">{value}</p>
            <p className="text-[10px] text-[#9ca3af]">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2.5 bg-[#fafafa] rounded-xl p-2.5">
        <div className="h-7 w-7 rounded-full bg-[#fff0f4] grid place-items-center shrink-0">
          <Users className="h-3.5 w-3.5 text-[#fe2c55]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-[#9ca3af]">Featured in</p>
          <p className="text-[12px] font-semibold text-[#111827]">Creator Playlists</p>
        </div>
        <div className="flex -space-x-1.5">
          {["#f97316", "#8b5cf6", "#ec4899"].map((c, i) => (
            <div key={i} className="h-6 w-6 rounded-full border-2 border-white grid place-items-center text-[9px] font-bold text-white" style={{ background: c }}>
              {["J", "A", "S"][i]}
            </div>
          ))}
          <div className="h-6 w-6 rounded-full border-2 border-white bg-[#f4f5f7] grid place-items-center">
            <ChevronRight className="h-3 w-3 text-[#9ca3af]" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dot grid decoration ──────────────────────────────────────────────────────

function DotGrid() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #e5e7eb 1px, transparent 1px)", backgroundSize: "24px 24px", opacity: 0.5 }} />
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#f0f0f0]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-[#fe2c55] grid place-items-center shadow-sm shadow-[#fe2c55]/30">
            <span className="text-white font-black text-[18px] leading-none">R</span>
          </div>
          <span className="text-[15px] font-bold text-[#111827] hidden sm:block">Teezer Music Library</span>
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-7">
          {[
            { label: "Home",         href: "#home",     active: true },
            { label: "Browse Music", href: "#browse" },
            { label: "For Artists",  href: "#artists" },
            { label: "Pricing",      href: "#pricing" },
            { label: "About",        href: "#about" },
          ].map(({ label, href, active }) => (
            <a key={label} href={href}
              className={`text-[14px] font-medium transition-colors ${active ? "text-[#fe2c55] border-b-2 border-[#fe2c55] pb-0.5" : "text-[#374151] hover:text-[#fe2c55]"}`}>
              {label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <a href="#signin" className="hidden sm:block text-[13px] font-semibold text-[#374151] hover:text-[#fe2c55] transition-colors">
            Sign In
          </a>
          <a href="#signup"
            className="flex items-center gap-1.5 h-9 px-5 rounded-xl bg-[#fe2c55] text-white text-[13px] font-bold hover:bg-[#e0264b] active:scale-95 transition-all shadow-md shadow-[#fe2c55]/25 whitespace-nowrap">
            Sign Up <ArrowRight className="h-3.5 w-3.5" />
          </a>
          <button onClick={() => setMobileOpen(o => !o)} className="md:hidden p-2 rounded-lg hover:bg-[#f4f5f7] transition-colors">
            {mobileOpen ? <X className="h-5 w-5 text-[#374151]" /> : <Menu className="h-5 w-5 text-[#374151]" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#f0f0f0] bg-white px-6 py-4 space-y-1">
          {["Home", "Browse Music", "For Artists", "Pricing", "About"].map(l => (
            <a key={l} href="#" onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] hover:text-[#fe2c55] transition-colors">
              {l}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section id="home" className="relative overflow-hidden bg-white">
      <DotGrid />
      {/* Pink blob */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at 70% 30%, rgba(254,44,85,0.07) 0%, transparent 70%)" }} />

      <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-6 items-center">
          {/* Left */}
          <div className="max-w-xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#fff0f4] border border-[#ffd4dc] text-[#fe2c55] text-[12px] font-semibold mb-7">
              <Music className="h-3.5 w-3.5 shrink-0" />
              Built for Original Artists. Made for Creators.
            </div>

            {/* Headline */}
            <h1 className="text-[48px] sm:text-[56px] lg:text-[62px] font-black text-[#111827] leading-[1.05] tracking-tight mb-6">
              Upload Your<br />Originals.<br />
              <span className="text-[#fe2c55]">Get Discovered.</span>
            </h1>

            {/* Subtext */}
            <p className="text-[16px] text-[#6b7280] leading-relaxed mb-8 max-w-lg">
              Join the Teezer Music Library and share your original music with creators, filmmakers, brands and content makers worldwide.{" "}
              <span className="text-[#fe2c55] font-semibold">You own your music.</span>{" "}
              We help you reach the world.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <a href="#upload"
                className="flex items-center gap-2 h-13 px-7 rounded-2xl bg-[#fe2c55] text-white text-[15px] font-bold hover:bg-[#e0264b] active:scale-[0.98] transition-all shadow-xl shadow-[#fe2c55]/30">
                <Upload className="h-4.5 w-4.5" />
                Upload Your Originals
              </a>
              <a href="#join"
                className="flex items-center gap-2 h-13 px-7 rounded-2xl border-2 border-[#e8eaed] text-[#374151] text-[15px] font-bold hover:border-[#fe2c55] hover:text-[#fe2c55] transition-all">
                <Users className="h-4.5 w-4.5" />
                Join as Artist
              </a>
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {["#fe2c55", "#f97316", "#8b5cf6", "#3b82f6"].map((c, i) => (
                  <div key={i}
                    className="h-9 w-9 rounded-full border-2 border-white grid place-items-center text-[11px] font-bold text-white shadow-sm"
                    style={{ background: c }}>
                    {["A", "J", "M", "S"][i]}
                  </div>
                ))}
                <div className="h-9 w-9 rounded-full border-2 border-white bg-[#111827] grid place-items-center text-[9px] font-black text-white shadow-sm">
                  10K+
                </div>
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#111827]">10,000+ Independent Artists</p>
                <p className="text-[12px] text-[#9ca3af]">trust Teezer to share their music</p>
              </div>
            </div>
          </div>

          {/* Right - floating cards */}
          <div className="relative flex justify-center lg:justify-end">
            {/* Background image placeholder / gradient */}
            <div className="relative w-full max-w-md">
              {/* Person silhouette gradient bg */}
              <div className="relative h-[480px] rounded-3xl overflow-hidden"
                style={{ background: "linear-gradient(135deg, #fff0f4 0%, #ffd4dc 40%, #ffb3c6 100%)" }}>
                {/* Decorative circles */}
                <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-[#fe2c55]/10" />
                <div className="absolute bottom-10 -left-6 h-32 w-32 rounded-full bg-[#fe2c55]/8" />

                {/* Headphone icon large */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-44 w-44 rounded-full bg-white/40 grid place-items-center backdrop-blur-sm">
                    <Music className="h-20 w-20 text-[#fe2c55]/40" />
                  </div>
                </div>

                {/* Track card - top left */}
                <div className="absolute top-6 left-4 right-4">
                  <TrackCard />
                </div>
              </div>

              {/* Artist card - overlapping below */}
              <div className="absolute -bottom-6 left-4">
                <ArtistCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Feature strip ────────────────────────────────────────────────────────────

function FeatureStrip() {
  const features = [
    { icon: Shield,  title: "Creator First",          sub: "You own 100% of your music." },
    { icon: Globe,   title: "Global Reach",            sub: "Get discovered by creators worldwide." },
    { icon: Zap,     title: "Real Opportunities",      sub: "Pitch, sync and grow your audience." },
    { icon: BadgeCheck, title: "Safe & Transparent",   sub: "Secure licensing. Fair terms." },
  ];

  return (
    <section className="bg-white border-y border-[#f0f0f0] mt-16">
      <div className="max-w-7xl mx-auto px-6 py-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[#f0f0f0]">
          {features.map(({ icon: Icon, title, sub }) => (
            <div key={title} className="flex items-center gap-3.5 px-6 py-4">
              <div className="h-10 w-10 rounded-2xl bg-[#fff0f4] grid place-items-center shrink-0">
                <Icon className="h-5 w-5 text-[#fe2c55]" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#111827]">{title}</p>
                <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-snug">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Stats section ────────────────────────────────────────────────────────────

function StatsSection() {
  const stats = [
    { icon: Music,    value: "100%",    label: "Original Tracks",         sub: "Only original music from independent artists." },
    { icon: Users,    value: "10K+",    label: "Independent Artists",     sub: "A growing community of creators worldwide." },
    { icon: Shield,   value: "Creator‑Safe", label: "Clear Licensing",    sub: "Build for creators. Safe for YouTube, Reels, TikTok & more." },
    { icon: DollarSign, value: "Monetization Safe", label: "You Keep Control", sub: "You own your music. We help you earn more." },
  ];

  return (
    <section id="about" className="bg-[#fafafa] py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ icon: Icon, value, label, sub }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#f0f0f0] p-5 hover:shadow-lg hover:shadow-black/5 transition-shadow">
              <div className="h-11 w-11 rounded-2xl bg-[#fff0f4] grid place-items-center mb-4">
                <Icon className="h-5 w-5 text-[#fe2c55]" />
              </div>
              <p className="text-[18px] font-black text-[#111827] leading-tight">{value}</p>
              <p className="text-[13px] font-bold text-[#374151] mt-0.5">{label}</p>
              <p className="text-[11px] text-[#9ca3af] mt-1.5 leading-relaxed">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { num: "01", title: "Create your profile",     sub: "Sign up as an independent artist and build your public profile in minutes." },
    { num: "02", title: "Upload your originals",   sub: "Upload your music tracks with full metadata - genre, mood, BPM, ISRC and more." },
    { num: "03", title: "Get licensed",             sub: "Creators find your music and license it for their Reels, videos and stories." },
    { num: "04", title: "Earn & grow",              sub: "Track your plays, earnings, and grow your fanbase through creator exposure." },
  ];

  return (
    <section id="artists" className="bg-white py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#fff0f4] text-[#fe2c55] text-[12px] font-bold mb-4">
            <Zap className="h-3.5 w-3.5" /> For Artists
          </div>
          <h2 className="text-[36px] font-black text-[#111827] leading-tight mb-3">
            How It Works
          </h2>
          <p className="text-[15px] text-[#6b7280] max-w-xl mx-auto">
            From upload to discovery - your music journey starts here.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(({ num, title, sub }, i) => (
            <div key={num} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-7 left-full w-full h-px bg-[#f0f0f0] z-0" style={{ width: "calc(100% - 28px)", left: "calc(50% + 14px)" }} />
              )}
              <div className="relative bg-[#fafafa] rounded-2xl border border-[#f0f0f0] p-6 hover:border-[#ffd4dc] hover:bg-[#fff8f9] transition-all">
                <div className="h-12 w-12 rounded-2xl bg-[#fe2c55] grid place-items-center mb-5 shadow-md shadow-[#fe2c55]/25">
                  <span className="text-white font-black text-[14px]">{num}</span>
                </div>
                <p className="text-[15px] font-bold text-[#111827] mb-2">{title}</p>
                <p className="text-[13px] text-[#6b7280] leading-relaxed">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Browse section ───────────────────────────────────────────────────────────

function BrowseSection() {
  const genres = [
    { name: "Pop",        color: "#fe2c55", tracks: "2.4K" },
    { name: "Hip-hop",    color: "#f97316", tracks: "1.8K" },
    { name: "Electronic", color: "#8b5cf6", tracks: "3.1K" },
    { name: "Jazz",       color: "#0ea5e9", tracks: "890" },
    { name: "Rock",       color: "#ef4444", tracks: "1.2K" },
    { name: "Classical",  color: "#64748b", tracks: "650" },
    { name: "R&B / Soul", color: "#ec4899", tracks: "980" },
    { name: "Lo-fi",      color: "#78716c", tracks: "2.7K" },
  ];

  return (
    <section id="browse" className="bg-[#fafafa] py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#fff0f4] text-[#fe2c55] text-[12px] font-bold mb-4">
              <Music className="h-3.5 w-3.5" /> Browse Music
            </div>
            <h2 className="text-[36px] font-black text-[#111827] leading-tight">
              Explore by Genre
            </h2>
          </div>
          <a href="#all" className="hidden sm:flex items-center gap-1.5 text-[13px] font-semibold text-[#fe2c55] hover:underline">
            View all genres <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {genres.map(({ name, color, tracks }) => (
            <button key={name}
              className="group relative rounded-2xl overflow-hidden h-24 text-white text-left p-4 hover:scale-[1.02] active:scale-[0.99] transition-all shadow-md hover:shadow-xl"
              style={{ background: `linear-gradient(135deg, ${color}dd 0%, ${color}99 100%)` }}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.1)" }} />
              <p className="text-[15px] font-black relative z-10">{name}</p>
              <p className="text-[11px] font-medium opacity-80 mt-0.5 relative z-10">{tracks} tracks</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

function Pricing() {
  const plans = [
    {
      name:  "Free",
      price: "$0",
      sub:   "Forever free",
      color: "#374151",
      features: ["Upload up to 5 tracks", "Basic profile page", "Teezer discovery listing", "Standard licensing"],
    },
    {
      name:  "Artist Pro",
      price: "$9",
      sub:   "per month",
      color: "#fe2c55",
      popular: true,
      features: ["Unlimited track uploads", "Verified artist badge", "Priority discovery placement", "Advanced analytics", "Custom profile URL", "Direct creator messaging"],
    },
    {
      name:  "Label",
      price: "$29",
      sub:   "per month",
      color: "#8b5cf6",
      features: ["Everything in Artist Pro", "Up to 20 artist accounts", "Label dashboard", "Bulk upload tools", "Revenue reporting", "Dedicated support"],
    },
  ];

  return (
    <section id="pricing" className="bg-white py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#fff0f4] text-[#fe2c55] text-[12px] font-bold mb-4">
            <Star className="h-3.5 w-3.5" /> Pricing
          </div>
          <h2 className="text-[36px] font-black text-[#111827] mb-3">Simple, Transparent Pricing</h2>
          <p className="text-[15px] text-[#6b7280]">No hidden fees. Cancel anytime.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map(({ name, price, sub, color, popular, features }) => (
            <div key={name} className={`rounded-3xl border p-7 relative ${popular ? "border-[#fe2c55] shadow-2xl shadow-[#fe2c55]/15 scale-[1.02]" : "border-[#f0f0f0]"}`}>
              {popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#fe2c55] text-white text-[11px] font-bold whitespace-nowrap shadow-md">
                  Most Popular
                </div>
              )}
              <p className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color }}>{name}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[42px] font-black text-[#111827] leading-none">{price}</span>
                <span className="text-[13px] text-[#9ca3af]">{sub}</span>
              </div>
              <div className="h-px bg-[#f0f0f0] my-5" />
              <ul className="space-y-3 mb-8">
                {features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                    <div className="h-4.5 w-4.5 rounded-full grid place-items-center shrink-0 mt-0.5" style={{ background: color + "18" }}>
                      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="w-full h-11 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98]"
                style={popular ? { background: color, color: "white", boxShadow: `0 4px 16px ${color}35` } : { border: `2px solid ${color}`, color }}>
                Get started
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Upload CTA ───────────────────────────────────────────────────────────────

function UploadCTA() {
  return (
    <section className="py-20 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #fe2c55 0%, #c2185b 100%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/5 pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 text-white text-[12px] font-bold mb-6 backdrop-blur-sm">
          <Music className="h-3.5 w-3.5" /> Start for free today
        </div>
        <h2 className="text-[40px] font-black text-white leading-tight mb-4">
          Your music deserves<br />to be heard.
        </h2>
        <p className="text-[15px] text-white/80 mb-10 leading-relaxed">
          Join 10,000+ independent artists already sharing their original music on Teezer. No contracts. No lock-in. Just music.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a href="#upload"
            className="flex items-center gap-2 h-13 px-8 rounded-2xl bg-white text-[#fe2c55] text-[15px] font-black hover:bg-[#f9fafb] active:scale-[0.98] transition-all shadow-xl">
            <Upload className="h-4.5 w-4.5" />
            Upload Your Originals
          </a>
          <a href="#browse"
            className="flex items-center gap-2 h-13 px-8 rounded-2xl border-2 border-white/40 text-white text-[15px] font-bold hover:border-white hover:bg-white/10 transition-all">
            Browse Music <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-5 text-[12px] text-white/60">
          ✓ Free forever plan &nbsp;·&nbsp; ✓ No credit card required &nbsp;·&nbsp; ✓ You own your music
        </p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-[#111827] text-white py-14">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-9 w-9 rounded-xl bg-[#fe2c55] grid place-items-center">
                <span className="text-white font-black text-[18px]">R</span>
              </div>
              <span className="text-[14px] font-bold text-white">Teezer Music</span>
            </div>
            <p className="text-[13px] text-[#6b7280] leading-relaxed">
              The home for independent artists and original music. Built for creators, by creators.
            </p>
          </div>

          {/* Links */}
          {[
            { title: "For Artists",  links: ["Upload Music", "Artist Profile", "Analytics", "Pricing"] },
            { title: "For Creators", links: ["Browse Library", "Licensing Info", "Creator FAQ", "Trending"] },
            { title: "Company",      links: ["About", "Blog", "Careers", "Contact"] },
          ].map(({ title, links }) => (
            <div key={title}>
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#4b5563] mb-4">{title}</p>
              <ul className="space-y-2.5">
                {links.map(l => (
                  <li key={l}><a href="#" className="text-[13px] text-[#6b7280] hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-[#1f2937] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-[#4b5563]">© 2026 Teezer. All rights reserved.</p>
          <div className="flex items-center gap-5">
            {["Privacy Policy", "Terms of Service", "Cookie Policy"].map(l => (
              <a key={l} href="#" className="text-[12px] text-[#4b5563] hover:text-white transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MusicLandingPage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <FeatureStrip />
      <StatsSection />
      <HowItWorks />
      <BrowseSection />
      <Pricing />
      <UploadCTA />
      <Footer />
    </main>
  );
}
