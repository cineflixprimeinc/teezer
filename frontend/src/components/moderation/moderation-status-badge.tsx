'use client';

import { ModerationStatus } from '@/types/moderation';
import { getModerationUserMessage } from '@/services/moderation.service';

interface Props {
  status: ModerationStatus;
  showMessage?: boolean;
  className?: string;
}

const CONFIG: Record<
  ModerationStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: {
    label: 'Checking…',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    dot: 'bg-yellow-400 animate-pulse',
  },
  scanning: {
    label: 'Scanning…',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    dot: 'bg-blue-400 animate-pulse',
  },
  approved: {
    label: 'Published',
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dot: 'bg-green-400',
  },
  pending_review: {
    label: 'Under Review',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
  },
  rejected: {
    label: 'Not Published',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-400',
  },
};

export default function ModerationStatusBadge({
  status,
  showMessage = false,
  className = '',
}: Props) {
  const cfg = CONFIG[status] ?? CONFIG.pending;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>

      {showMessage && status !== 'approved' && (
        <p className="text-xs text-neutral-400 leading-snug">
          {getModerationUserMessage(status)}
        </p>
      )}
    </div>
  );
}
