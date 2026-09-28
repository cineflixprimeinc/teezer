"use client";

import { Eye, FolderClosed, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  uploading?: boolean;
  progress?: number;
  requiredComplete?: boolean;
  onPreview:  () => void;
  onSaveDraft: () => void;
  onPostNow: () => void;
};

export function UploadActions({
  disabled,
  uploading,
  progress = 0,
  requiredComplete = false,
  onPreview,
  onSaveDraft,
  onPostNow,
}: Props) {
  const postReady = requiredComplete && !uploading;

  return (
    <div className="grid grid-cols-[auto_auto_1fr] gap-1.5">
      <button
        type="button"
        onClick={onPreview}
        disabled={disabled || uploading}
        className={cn(
          "inline-flex h-[42px] items-center justify-center gap-1.5 rounded-[10px] border border-[#eeeeee] bg-white px-3 text-[12px] font-semibold text-black transition",
          "hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        Preview
      </button>

      <button
        type="button"
        onClick={onSaveDraft}
        disabled={disabled || uploading}
        className={cn(
          "inline-flex h-[42px] items-center justify-center gap-1.5 rounded-[10px] border border-[#eeeeee] bg-white px-3 text-[12px] font-semibold text-black transition",
          "hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <FolderClosed className="h-3.5 w-3.5" />
        Save draft
      </button>

      <button
        type="button"
        onClick={onPostNow}
        disabled={uploading}
        className={cn(
          "inline-flex h-[42px] items-center justify-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold text-white shadow-sm transition",
          postReady
            ? "bg-[#fe2c55] shadow-[#fe2c55]/20 hover:bg-[#e0243d] disabled:opacity-60 disabled:cursor-not-allowed"
            : "bg-[#c0c4cc] shadow-[#c0c4cc]/20 hover:bg-[#aab0ba] cursor-pointer",
        )}
      >
        <Send className="h-3.5 w-3.5" />
        {uploading ? `Posting… ${progress}%` : "Post now"}
      </button>
    </div>
  );
}
