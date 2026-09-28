"use client";

import { BarChart3, Info } from "lucide-react";

const BARS = [22, 14, 10, 8, 12, 18, 24, 30, 36, 44, 52, 58, 64, 70, 60, 50, 56, 72, 92, 80, 64, 50, 38, 28];
const PEAK_INDEX = 18;

export function BestTimeCard() {
  return (
    <div className="rounded-2xl border border-[#eeeeee] bg-white p-3">
      <div className="flex items-center gap-1">
        <p className="text-[13px] font-bold text-black">Best time to post</p>
        <Info className="h-3 w-3 text-[#9aa1ad]" />
      </div>
      <p className="text-[10px] text-[#5f6675]">Based on your audience activity</p>

      <p className="mt-2 text-[16px] font-bold text-black">Today, 8:00 PM</p>

      <div className="mt-2 flex h-[44px] items-end gap-[2px]">
        {BARS.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${h}%`,
              background: i === PEAK_INDEX ? "#fd4605" : "#fde0e6",
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-[#9aa1ad]">
        <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>12AM</span>
      </div>

      <button
        type="button"
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-[#eeeeee] bg-white py-1.5 text-[10px] font-semibold text-black hover:border-[#fd4605] hover:text-[#fd4605]"
      >
        <BarChart3 className="h-3 w-3" />
        See full analytics
      </button>
    </div>
  );
}
