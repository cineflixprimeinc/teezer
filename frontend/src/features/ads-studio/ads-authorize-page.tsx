"use client";

/**
 * Full-page authorization (consent) screen shown after login, before the Ads
 * Manager - TikTok-for-Business style: the two accounts with a swap glyph, the
 * requested permissions as checkboxes (Basic profile required) with a Select all
 * toggle, and Terms/Privacy at the bottom. Continue records the grant.
 */

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, User2, Mail, Building2, Megaphone, Check } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { ssoService, type SsoConsentClient } from "@/services/sso.service";
import { apiMessage } from "@/services/api";

const SCOPE_ICON: Record<string, React.ElementType> = {
  profile: User2,
  email: Mail,
  business: Building2,
  "ads.manage": Megaphone,
};
const REQUIRED = new Set(["profile"]);
const TERMS_URL = "https://teezer.live/terms";
const PRIVACY_URL = "https://teezer.live/privacy";

function Avatar({ src, name, size = 64 }: { src?: string | null; name?: string; size?: number }) {
  if (src) {
    return <Image src={src} alt={name ?? ""} width={size} height={size} className="rounded-full object-cover" unoptimized />;
  }
  return (
    <span className="grid place-items-center rounded-full bg-[#111827] font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(name ?? "R").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function AdsAuthorizePage({ onGranted }: { onGranted: () => void }) {
  const { user, logout } = useAuthStore();
  const [client, setClient] = useState<SsoConsentClient | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    ssoService
      .grantStatus()
      .then((r) => {
        if (!on) return;
        if (r.granted) { onGranted(); return; }
        setClient(r.client);
        setSelected(r.client.scopes.map((s) => s.key));
      })
      .catch(() => {});
    return () => { on = false; };
  }, [onGranted]);

  const toggle = useCallback((key: string) => {
    if (REQUIRED.has(key)) return;
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }, []);

  const cont = useCallback(async () => {
    setBusy(true);
    try {
      await ssoService.grant(selected);
      onGranted();
    } catch (e) {
      toast.error(apiMessage(e));
      setBusy(false);
    }
  }, [selected, onGranted]);

  const switchAccount = useCallback(async () => {
    await logout();
    window.location.href = "/";
  }, [logout]);

  const scopes = client?.scopes ?? [];
  const optional = scopes.filter((s) => !REQUIRED.has(s.key));
  const allSelected = optional.length > 0 && optional.every((s) => selected.includes(s.key));
  const toggleAll = () =>
    setSelected(() => (allSelected ? scopes.filter((s) => REQUIRED.has(s.key)).map((s) => s.key) : scopes.map((s) => s.key)));

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f5f7] px-4 py-10">
      <div className="w-full max-w-[480px] rounded-2xl border border-[#eef0f3] bg-white p-8 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h1 className="text-center text-[22px] font-extrabold leading-snug tracking-tight text-[#111827]">
          Teezer Ads wants to access<br />your Teezer account
        </h1>

        {/* Two accounts with a swap glyph */}
        <div className="mt-7 flex items-start justify-center gap-6">
          <div className="flex w-[120px] flex-col items-center text-center">
            <Avatar src={user?.avatar} name={user?.name} />
            <p className="mt-2 line-clamp-1 text-[13.5px] font-bold text-[#111827]">{user?.name ?? "Your account"}</p>
            <button type="button" onClick={switchAccount} className="mt-0.5 text-[12px] font-semibold text-[#fd4605]">
              Switch account
            </button>
          </div>
          <ArrowLeftRight className="mt-5 h-5 w-5 flex-shrink-0 text-[#9ca3af]" />
          <div className="flex w-[120px] flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-[#fff3ec]">
              <Image src="/teezer-logo.png" alt="Teezer Ads" width={64} height={64} unoptimized className="h-9 w-9 object-contain" />
            </span>
            <p className="mt-2 text-[13.5px] font-bold text-[#111827]">Teezer Ads</p>
          </div>
        </div>

        <div className="my-6 h-px bg-[#eef0f3]" />

        {/* Permissions */}
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-[#111827]">Teezer Ads will be able to</p>
          {optional.length > 0 && (
            <button type="button" onClick={toggleAll} className="text-[12px] font-bold text-[#fd4605]">
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
        </div>

        {scopes.length === 0 ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-[#f1f3f5]" />)}
          </div>
        ) : (
          <ul className="mt-2 space-y-1">
            {scopes.map((s) => {
              const Icon = SCOPE_ICON[s.key] ?? Check;
              const checked = selected.includes(s.key);
              const required = REQUIRED.has(s.key);
              return (
                <li key={s.key}>
                  <label className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition ${required ? "" : "cursor-pointer hover:bg-[#f8f9fb]"}`}>
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#fff3ec]">
                      <Icon className="h-[18px] w-[18px] text-[#fd4605]" />
                    </span>
                    <span className="flex-1 text-[13.5px] text-[#374151]">
                      {s.label}
                      {required && <span className="ml-1.5 text-[11px] font-semibold text-[#9ca3af]">(required)</span>}
                    </span>
                    <span className={`grid h-[22px] w-[22px] place-items-center rounded-md border transition ${checked ? "border-[#fd4605] bg-[#fd4605]" : "border-[#d1d5db] bg-white"} ${required ? "opacity-70" : ""}`}>
                      {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                    </span>
                    <input type="checkbox" className="sr-only" checked={checked} disabled={required} onChange={() => toggle(s.key)} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {/* Terms */}
        <p className="mt-5 text-[11.5px] leading-relaxed text-[#9ca3af]">
          By continuing, you agree to Teezer Ads&apos;s{" "}
          <a href={TERMS_URL} target="_blank" rel="noreferrer" className="font-semibold text-[#6b7280] underline">Terms of Service</a>{" "}
          and acknowledge that you have read the{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="font-semibold text-[#6b7280] underline">Privacy Policy</a>.
          You can always see or remove access in your Teezer settings.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={switchAccount}
            disabled={busy}
            className="h-12 flex-1 rounded-full border border-[#e5e7eb] bg-white text-[14px] font-bold text-[#374151] transition hover:bg-[#f9fafb] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={cont}
            disabled={busy || scopes.length === 0}
            className="h-12 flex-1 rounded-full bg-[#fd4605] text-[14px] font-bold text-white transition hover:bg-[#e03e04] disabled:opacity-60"
          >
            {busy ? "Authorizing…" : "Continue"}
          </button>
        </div>
      </div>
    </main>
  );
}
