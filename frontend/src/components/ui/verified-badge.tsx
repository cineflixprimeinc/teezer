import { cn } from "@/lib/utils";

type Props = {
  size?: number;
  className?: string;
  /** Show the explanatory hover card on hover. Default false - the badge is a
   *  plain seal everywhere; the info popup is enabled only where wanted (the
   *  user profile page header). */
  tooltip?: boolean;
};

/** The blue verification seal (no tooltip). */
function Seal({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Verified"
    >
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="#1d8cff"
      />
      <path
        d="m8.5 12 2.5 2.5 4.5-5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VerifiedBadge({ size = 18, className, tooltip = false }: Props) {
  if (!tooltip) return <Seal size={size} className={className} />;

  return (
    <span className={cn("group/verified relative inline-block align-middle", className)}>
      <Seal size={size} />

      {/* Hover info card - appears below the badge on hover. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-[232px] rounded-2xl border border-[#eaecef] bg-white p-4 text-left font-normal normal-case leading-normal text-[#111827] shadow-[0_10px_34px_rgba(0,0,0,0.14)] group-hover/verified:block"
      >
        <span className="flex items-center gap-2">
          <Seal size={18} />
          <span className="text-[14px] font-bold text-[#111827]">Verified badge</span>
        </span>
        <span className="mt-1.5 block text-[12.5px] leading-snug text-[#5f6675]">
          This badge confirms that Teezer has verified this account as authentic and notable.
        </span>
        <span className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1d8cff]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" strokeLinecap="round" />
            <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
          </svg>
          Learn more
        </span>
      </span>
    </span>
  );
}
