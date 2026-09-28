"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { userService } from "@/services/user.service";
import { useAuthStore } from "@/store/auth.store";
import { apiMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { TeezerUser } from "@/types/user";

type FollowStatus = "none" | "pending" | "accepted";

type Props = {
  username: string;
  /**
   * Server-provided initial follow status. Can be:
   *  - "none"     → not following
   *  - "pending"  → follow request sent (private account)
   *  - "accepted" → following
   */
  initialFollowStatus?: FollowStatus;
  /** Kept for backwards-compat; maps true→accepted, false→none */
  initialFollowing?: boolean;
  variant?: "primary" | "outline" | "pill" | "avatar-plus";
  className?: string;
  onFollowChanged?: (isFollowing: boolean, followersCount?: number) => void;
};

export function FollowButton({
  username,
  initialFollowStatus,
  initialFollowing = false,
  variant = "outline",
  className,
  onFollowChanged,
}: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openAuthModal   = useAuthStore((s) => s.openAuthModal);
  const qc = useQueryClient();

  // Resolve initial status: prefer explicit prop, fall back to boolean compat
  const resolveInitial = (): FollowStatus => {
    if (initialFollowStatus) return initialFollowStatus;
    return initialFollowing ? "accepted" : "none";
  };

  const [confirmed,  setConfirmed]  = useState<FollowStatus>(resolveInitial);
  const [optimistic, setOptimistic] = useState<FollowStatus | null>(null);

  useEffect(() => {
    setConfirmed(resolveInitial());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFollowStatus, initialFollowing]);

  const status: FollowStatus = optimistic ?? confirmed;
  const isFollowing = status === "accepted";
  const isPending   = status === "pending";

  const [hovering, setHovering] = useState(false);

  type FollowMutResult = {
    success: boolean;
    following: boolean;
    follow_status: FollowStatus;
    followers_count?: number;
  };

  const mut = useMutation({
    mutationFn: (): Promise<FollowMutResult> =>
      // "none" → follow; "pending" → cancel request (unfollow); "accepted" → unfollow
      confirmed === "none"
        ? (userService.follow(username) as Promise<FollowMutResult>)
        : (userService.unfollow(username) as Promise<FollowMutResult>),

    onMutate: () => {
      if (confirmed === "none") {
        setOptimistic("pending"); // assume request for private; server returns actual status
      } else {
        setOptimistic("none");
      }
    },

    onError: (err) => {
      setOptimistic(null);
      toast.error(apiMessage(err));
    },

    onSuccess: (res) => {
      const newStatus: FollowStatus = res.follow_status === "pending"
        ? "pending"
        : res.following
          ? "accepted"
          : "none";

      setConfirmed(newStatus);
      setOptimistic(null);

      if (res.followers_count !== undefined) {
        qc.setQueryData<TeezerUser>(["profile", username], (old) =>
          old
            ? { ...old, followers_count: res.followers_count, is_following: res.following, follow_status: newStatus }
            : old,
        );
      }

      onFollowChanged?.(res.following, res.followers_count);
      void qc.invalidateQueries({ queryKey: ["profile", username] });
      void qc.invalidateQueries({ queryKey: ["follow-list"] });
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) { openAuthModal("login"); return; }
    if (mut.isPending) return;
    mut.mutate();
  };

  /* ── Avatar-plus variant ─────────────────────────────────────────────── */
  if (variant === "avatar-plus") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={mut.isPending}
        aria-label={isFollowing ? "Unfollow" : isPending ? "Requested" : "Follow"}
        className={cn(
          "absolute -bottom-1.5 left-1/2 -translate-x-1/2",
          "grid h-5 w-5 place-items-center rounded-full shadow ring-2 ring-white",
          "transition-colors duration-150 disabled:opacity-60",
          isFollowing ? "bg-[#10b981]" : isPending ? "bg-[#f59e0b]" : "bg-[#fd4605]",
          "text-white",
          className,
        )}
      >
        {mut.isPending ? (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white border-t-transparent" />
        ) : isFollowing ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : isPending ? (
          <Clock className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <svg viewBox="0 0 10 10" className="h-3 w-3 fill-white" aria-hidden>
            <path d="M4.5 1v8M1 4.5h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </button>
    );
  }

  /* ── Pill variant ────────────────────────────────────────────────────── */
  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={mut.isPending}
        className={cn(
          "rounded-full border px-3 py-0.5 text-[11px] font-semibold transition disabled:opacity-60",
          isFollowing || isPending
            ? "border-white/40 bg-white/10 text-white"
            : "border-white/60 text-white hover:bg-white/20",
          className,
        )}
      >
        {mut.isPending ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white border-t-transparent align-middle" />
        ) : isFollowing ? "Following" : isPending ? "Requested" : "Follow"}
      </button>
    );
  }

  /* ── Primary variant ─────────────────────────────────────────────────── */
  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={mut.isPending}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          "flex h-10 min-w-[124px] items-center justify-center gap-2 rounded-[10px] px-5 text-[13.5px] font-bold transition disabled:opacity-60",
          isPending
            ? hovering
              ? "border border-amber-200 bg-amber-50 text-amber-600"
              : "border border-[#eeeeee] bg-white text-[#5f6675]"
            : isFollowing
              ? hovering
                ? "border border-red-200 bg-red-50 text-[#fd4605]"
                : "border border-[#eeeeee] bg-white text-[#111827]"
              : "bg-[#fd4605] text-white shadow-[0_4px_14px_rgba(253,70,5,0.25)] hover:bg-[#e03e04]",
          className,
        )}
      >
        {mut.isPending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : isPending ? (
          hovering ? (
            <><UserX className="h-[15px] w-[15px]" />Cancel Request</>
          ) : (
            <><Clock className="h-[15px] w-[15px]" />Requested</>
          )
        ) : isFollowing ? (
          hovering ? (
            <><UserX className="h-[15px] w-[15px]" />Unfollow</>
          ) : (
            <><UserCheck className="h-[15px] w-[15px]" />Following</>
          )
        ) : (
          "Follow"
        )}
      </button>
    );
  }

  /* ── Outline variant (default) ───────────────────────────────────────── */
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mut.isPending}
      className={cn(
        "flex-shrink-0 rounded-[8px] border px-3 py-[6px] text-[11.5px] font-bold transition disabled:opacity-60",
        isFollowing
          ? "border-[#eeeeee] bg-white text-[#5f6675] hover:border-[#fd4605] hover:text-[#fd4605]"
          : isPending
            ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100"
            : "border-[#fd4605] bg-[#fd4605] text-white hover:bg-[#e03e04]",
        className,
      )}
    >
      {mut.isPending ? (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent align-middle" />
      ) : isFollowing ? "Following" : isPending ? "Requested" : "Follow"}
    </button>
  );
}
