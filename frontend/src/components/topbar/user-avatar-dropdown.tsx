"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown, ChevronLeft, LogOut, Loader2,
  Settings, Shield, User, UserPlus, Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ReelsooUser } from "@/types/user";

type SavedAccount = {
  id: number;
  name: string;
  username: string;
  avatar: string | null;
  token: string;
  lastUsed: number;
};

function UserAvatar({ user, size }: { user: ReelsooUser | null; size: number }) {
  const src     = user?.avatar ?? null;
  const initial = (user?.name?.[0] ?? user?.username?.[0] ?? "U").toUpperCase();
  const fontSize = Math.round(size * 0.38);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={user?.name ?? "Profile"}
        referrerPolicy="no-referrer"
        className="flex-shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex-shrink-0 rounded-full grid place-items-center font-bold text-white bg-[#fe2c55]"
      style={{ width: size, height: size, fontSize }}
    >
      {initial}
    </div>
  );
}

export function UserAvatarDropdown() {
  const router = useRouter();
  const hydrated = useHydrated();
  const {
    user, isAuthenticated, authReady, isLoading, logout, openAuthModal,
    savedAccounts: storeSavedAccounts,
    login, switchAccount, addAccountToSaved, removeAccountFromSaved,
  } = useAuthStore();

  const [open,        setOpen]        = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLogin,    setAddLogin]    = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addLoading,  setAddLoading]  = useState(false);
  const [addError,    setAddError]    = useState("");

  const wrapperRef = useRef<HTMLDivElement>(null);

  /* Seed current account into saved list when dropdown opens */
  useEffect(() => {
    if (!open || !isAuthenticated || !user) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("reelsoo_token") : null;
    if (token) {
      addAccountToSaved({
        id: user.id as number,
        name: user.name ?? "",
        username: user.username ?? "",
        avatar: (user as any).avatar ?? null,
        token,
        lastUsed: Date.now(),
      });
    }
    setShowAddForm(false);
    setAddLogin(""); setAddPassword(""); setAddError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAuthenticated, user]);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function switchToAccount(acc: SavedAccount) {
    setOpen(false);
    await switchAccount(acc.id, acc.token);
  }

  function removeAccount(id: number) {
    removeAccountFromSaved(id);
  }

  async function handleAddAccount() {
    if (!addLogin || !addPassword) { setAddError("Enter email / username and password."); return; }
    setAddLoading(true); setAddError("");
    try {
      await login({ login: addLogin, password: addPassword });
      setShowAddForm(false); setAddLogin(""); setAddPassword("");
    } catch (e: any) {
      setAddError(e?.response?.data?.message || e?.message || "Login failed.");
    } finally {
      setAddLoading(false);
    }
  }

  // Render a neutral placeholder until the auth state is genuinely known.
  //
  // `!hydrated` covers the server render: `authReady` seeds from localStorage,
  // which the server cannot read, so it is always true there and a logged-in
  // visitor looks exactly like a guest - without this the guest button gets
  // baked into the HTML and painted before any JS runs.
  // `!authReady || isLoading` then covers the client window while fetchMe()
  // verifies the stored token.
  if (!hydrated || !authReady || isLoading) {
    return <div aria-hidden className="h-9 w-9 flex-shrink-0 rounded-full bg-[#f1f2f4] animate-pulse" />;
  }

  if (!isAuthenticated) {
    return (
      <Button
        variant="outline"
        onClick={() => openAuthModal("login")}
        className="h-9 rounded-[22px] px-5 text-sm font-semibold border-[#e5e7eb] bg-white text-black hover:border-[#fe2c55] hover:bg-white whitespace-nowrap"
      >
        Login / Signup
      </Button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-1 bg-transparent border-none p-0 outline-none"
      >
        <UserAvatar user={user} size={36} />
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[#111827] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[240px] rounded-2xl border border-[#eeeeee] bg-white p-2 shadow-lg z-[200]">

          {showAddForm ? (
            <div className="p-1">
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddError(""); }}
                  className="grid h-7 w-7 place-items-center rounded-full text-[#5f6675] hover:bg-[#f3f4f6]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-[13px] font-bold text-black">Add Account</p>
              </div>
              <input
                type="text"
                value={addLogin}
                onChange={e => { setAddLogin(e.target.value); setAddError(""); }}
                placeholder="Email or username"
                className="mb-2 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]"
              />
              <input
                type="password"
                value={addPassword}
                onChange={e => { setAddPassword(e.target.value); setAddError(""); }}
                placeholder="Password"
                onKeyDown={e => e.key === "Enter" && handleAddAccount()}
                className="mb-2 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]"
              />
              {addError && <p className="mb-2 text-[12px] text-red-500">{addError}</p>}
              <button
                onClick={handleAddAccount}
                disabled={addLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#fe2c55] py-2 text-[13px] font-bold text-white transition hover:bg-[#e0243d] disabled:opacity-60"
              >
                {addLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {addLoading ? "Signing in…" : "Sign In & Save"}
              </button>
            </div>
          ) : (
            <>
              {/* Current account header */}
              <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                <UserAvatar user={user} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-black leading-tight">{user?.name}</p>
                  <p className="truncate text-xs text-[#5f6675] leading-tight mt-0.5">@{user?.username}</p>
                </div>
                <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold text-[#16a34a]">Active</span>
              </div>

              {/* Other saved accounts */}
              {(storeSavedAccounts as SavedAccount[])
                .filter(a => a.id !== (user?.id as number))
                .map(acc => (
                  <div key={acc.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[#f8f9fb]">
                    {acc.avatar
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={acc.avatar} alt={acc.name} className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
                      : <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#6b7280] text-[12px] font-bold text-white">{acc.name[0]?.toUpperCase()}</div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-black leading-tight">{acc.name}</p>
                      <p className="truncate text-[11px] text-[#9ca3af]">@{acc.username}</p>
                    </div>
                    <button
                      onClick={() => switchToAccount(acc)}
                      className="rounded-lg bg-[#f3f4f6] px-2 py-1 text-[11px] font-bold text-[#374151] hover:bg-[#e5e7eb] flex-shrink-0"
                    >
                      Switch
                    </button>
                    <button
                      onClick={() => removeAccount(acc.id)}
                      className="ml-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[#9ca3af] hover:bg-[#fee2e2] hover:text-red-500"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}

              <div className="my-1.5 border-t border-[#eeeeee]" />

              <Link
                href={`/profile/${user?.username}`}
                onClick={() => setOpen(false)}
                className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm text-black hover:bg-[#f8f9fb] transition-colors"
              >
                <User className="h-4 w-4 flex-shrink-0 text-[#5f6675]" />
                View Profile
              </Link>
              <Link
                href="/settings/account"
                onClick={() => setOpen(false)}
                className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm text-black hover:bg-[#f8f9fb] transition-colors"
              >
                <Settings className="h-4 w-4 flex-shrink-0 text-[#5f6675]" />
                Account Settings
              </Link>

              {(user?.creatorStatus === "approved" || user?.role === "creator") && (
                <Link
                  href="/studio"
                  onClick={() => setOpen(false)}
                  className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm text-black hover:bg-[#f8f9fb] transition-colors"
                >
                  <Video className="h-4 w-4 flex-shrink-0 text-[#5f6675]" />
                  Teezer Studio
                </Link>
              )}

              {(user?.role === "admin" || user?.role === "super_admin") && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm text-black hover:bg-[#f8f9fb] transition-colors"
                >
                  <Shield className="h-4 w-4 flex-shrink-0 text-[#5f6675]" />
                  Admin Panel
                </Link>
              )}

              <button
                onClick={() => setShowAddForm(true)}
                className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm text-black hover:bg-[#f8f9fb] transition-colors"
              >
                <UserPlus className="h-4 w-4 flex-shrink-0 text-[#5f6675]" />
                Add Account
              </button>

              <div className="my-1.5 border-t border-[#eeeeee]" />

              <button
                onClick={() => { logout(); setOpen(false); }}
                className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm font-semibold text-[#fe2c55] hover:bg-[#fff0f3] transition-colors"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                Logout
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
