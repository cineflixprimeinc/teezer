"use client";

import { Check, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaType } from "./types";

export type ChecklistItemKey =
  | "media" | "title" | "audience" | "visibility" | "category"
  | "duration" | "thumbnail" | "resolution"
  | "description" | "hashtags" | "interactions";

export type ChecklistState = Record<ChecklistItemKey, boolean>;

type ItemDef = {
  key:       ChecklistItemKey;
  label:     string;
  required:  boolean;
  videoOnly: boolean;
  helper:    string;
};

const ITEMS: ItemDef[] = [
  { key: "media",       label: "Media file selected",       required: true,  videoOnly: false, helper: "Pick a video or image file to get started." },
  { key: "category",    label: "Category chosen",           required: true,  videoOnly: false, helper: "Pick a category so people can find your post." },
  { key: "thumbnail",   label: "Cover thumbnail set",       required: false, videoOnly: true,  helper: "Select or upload a cover thumbnail." },
  { key: "title",       label: "Title / Description added", required: false, videoOnly: false, helper: "A caption boosts search discoverability." },
  { key: "description", label: "Description written",       required: false, videoOnly: false, helper: "A description boosts discoverability." },
  { key: "hashtags",    label: "Hashtags added",            required: false, videoOnly: false, helper: "Add 3-10 hashtags to reach more viewers." },
];

const TIPS: { when: (s: ChecklistState) => boolean; text: string }[] = [
  { when: (s) => !s.media,               text: "Start by picking a video or image file." },
  { when: (s) => !s.category,            text: "Choosing a category helps reach the right audience." },
  { when: (s) => s.media && !s.title,    text: "Add a caption to boost discoverability (optional)." },
  { when: (s) => s.media && !s.hashtags, text: "Posts with 3-10 hashtags see up to 40% more reach." },
];

function getDynamicTip(state: ChecklistState): string {
  for (const { when, text } of TIPS) {
    if (when(state)) return text;
  }
  return "All items complete - your post is ready to go!";
}

export function UploadChecklist({
  state,
  mediaType,
}: {
  state: ChecklistState;
  mediaType: MediaType | null;
}) {
  const isImage = mediaType === "image" || mediaType === "image_carousel";

  const applicable = ITEMS.filter((item) => !(item.videoOnly && isImage));
  const required   = applicable.filter((i) => i.required);
  const optional   = applicable.filter((i) => !i.required);

  const done     = applicable.filter((i) => state[i.key]).length;
  const total    = applicable.length;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
  const reqDone  = required.filter((i) => state[i.key]).length;
  const nextReq  = required.find((i) => !state[i.key]);

  const allReqDone = reqDone === required.length;
  const allDone    = done === total;

  const tip = getDynamicTip(state);

  return (
    <div className="rounded-2xl border border-[#eeeeee] bg-white p-3">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-bold text-black">Upload checklist</p>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
            allDone    ? "bg-[#ecfdf5] text-[#059669]" :
            allReqDone ? "bg-[#fffbeb] text-[#d97706]" :
                         "bg-[#fef2f2] text-[#dc2626]",
          )}
        >
          {done} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            allDone    ? "bg-[#10b981]" :
            allReqDone ? "bg-[#f59e0b]" :
                         "bg-[#fd4605]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Required section */}
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#9aa1ad]">Required</p>
      <ul className="mb-2 space-y-1">
        {required.map((item) => (
          <ChecklistRow key={item.key} item={item} done={state[item.key]} />
        ))}
      </ul>

      {/* Optional section */}
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#9aa1ad]">Optional</p>
      <ul className="mb-2 space-y-1">
        {optional.map((item) => (
          <ChecklistRow key={item.key} item={item} done={state[item.key]} />
        ))}
      </ul>

      {/* Next required action */}
      {nextReq && (
        <div className="mb-2 rounded-lg bg-[#fef2f2] px-2 py-1.5">
          <p className="text-[10px] leading-snug text-[#dc2626]">
            <span className="font-bold">Next: </span>{nextReq.helper}
          </p>
        </div>
      )}

      {/* Dynamic tip */}
      <div className="flex items-start gap-1.5 rounded-lg bg-[#fffaf0] p-2">
        <Lightbulb className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#f59e0b]" />
        <p className="text-[10px] leading-snug text-[#78350f]">
          <span className="font-bold">Tip: </span>{tip}
        </p>
      </div>
    </div>
  );
}

function ChecklistRow({ item, done }: { item: ItemDef; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded-full transition-colors",
          done
            ? "bg-[#10b981] text-white"
            : item.required
              ? "border-2 border-[#fd4605] bg-white"
              : "border border-[#cccccc] bg-white",
        )}
      >
        {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span
        className={cn(
          "text-[11px] transition-colors",
          done ? "text-black" : item.required ? "text-[#fd4605]" : "text-[#5f6675]",
        )}
      >
        {item.label}
      </span>
    </li>
  );
}
