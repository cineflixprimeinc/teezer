"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { userService, type FollowRequest } from "@/services/user.service";

export default function FollowRequestsPage() {
  const [requests, setRequests]   = useState<FollowRequest[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [working,  setWorking]    = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await userService.followRequests();
        setRequests(data);
      } catch {
        toast.error("Failed to load follow requests");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const accept = async (id: number) => {
    setWorking(prev => ({ ...prev, [id]: true }));
    try {
      await userService.acceptFollowRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      toast.success("Follow request accepted");
    } catch {
      toast.error("Failed to accept request");
    } finally {
      setWorking(prev => ({ ...prev, [id]: false }));
    }
  };

  const decline = async (id: number) => {
    setWorking(prev => ({ ...prev, [id]: true }));
    try {
      await userService.declineFollowRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      toast.success("Follow request declined");
    } catch {
      toast.error("Failed to decline request");
    } finally {
      setWorking(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="mx-auto max-w-[560px] px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff0f4]">
          <UserPlus className="h-5 w-5 text-[#fe2c55]" />
        </div>
        <div>
          <h1 className="text-[17px] font-extrabold text-[#111827]">Follow Requests</h1>
          <p className="text-[12px] text-[#5f6675]">People who want to follow your private account</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-[#fe2c55]" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#eeeeee] bg-white py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6]">
            <UserCheck className="h-7 w-7 text-[#9aa1ad]" />
          </div>
          <p className="text-[14px] font-semibold text-[#111827]">No pending requests</p>
          <p className="text-[12px] text-[#5f6675]">When someone requests to follow you, it will show here</p>
        </div>
      ) : (
        <div className="divide-y divide-[#f3f4f6] overflow-hidden rounded-2xl border border-[#eeeeee] bg-white">
          {requests.map(req => (
            <div key={req.id} className="flex items-center gap-3 px-4 py-3.5">
              {/* Avatar */}
              <Link href={`/profile/${req.user.username}`} className="flex-shrink-0">
                {req.user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={req.user.avatar}
                    alt={req.user.name}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#fe2c55] to-[#c02040] text-[15px] font-bold text-white">
                    {req.user.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>

              {/* Name / username */}
              <div className="min-w-0 flex-1">
                <Link href={`/profile/${req.user.username}`} className="hover:opacity-80">
                  <p className="truncate text-[13.5px] font-semibold text-[#111827]">{req.user.name}</p>
                  <p className="text-[11px] text-[#5f6675]">@{req.user.username}</p>
                </Link>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={working[req.id]}
                  onClick={() => accept(req.id)}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-[#fe2c55] px-4 text-[12px] font-bold text-white transition hover:bg-[#e02449] disabled:opacity-60"
                >
                  {working[req.id] ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Accept
                </button>
                <button
                  type="button"
                  disabled={working[req.id]}
                  onClick={() => decline(req.id)}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-[#eeeeee] bg-white px-4 text-[12px] font-semibold text-[#5f6675] transition hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-60"
                >
                  {working[req.id] ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {requests.length > 0 && (
        <div className="mt-3 flex items-center justify-between px-1">
          <p className="text-[12px] text-[#9aa1ad]">{requests.length} pending request{requests.length !== 1 ? "s" : ""}</p>
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`Decline all ${requests.length} requests?`)) return;
              const ids = requests.map(r => r.id);
              await Promise.allSettled(ids.map(id => userService.declineFollowRequest(id)));
              setRequests([]);
              toast.success("All requests declined");
            }}
            className="text-[12px] font-semibold text-[#fe2c55] hover:underline"
          >
            Decline all
          </button>
        </div>
      )}
    </div>
  );
}
