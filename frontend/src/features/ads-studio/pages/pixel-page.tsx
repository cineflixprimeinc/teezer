"use client";

import { Copy, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHead, PageHeader } from "@/features/ads-studio/ui";
import { useAuthStore } from "@/store/auth.store";

const STANDARD_EVENTS: { name: string; desc: string }[] = [
  { name: "PageView", desc: "A visitor loads a page on your site." },
  { name: "ViewContent", desc: "Someone views a product or key page." },
  { name: "AddToCart", desc: "A product is added to the shopping cart." },
  { name: "InitiateCheckout", desc: "A visitor starts the checkout flow." },
  { name: "Purchase", desc: "An order is completed and paid for." },
  { name: "Lead", desc: "Someone submits a lead or sign-up form." },
  { name: "CompleteRegistration", desc: "An account registration is finished." },
];

const SETUP_STEPS: { title: string; desc: string }[] = [
  { title: "Install base code", desc: "Add the pixel snippet to every page of your website, inside the <head> tag." },
  { title: "Add event code to key actions", desc: "Fire standard events like Purchase or Lead where those actions happen." },
  { title: "Verify events", desc: "Load your site and confirm events arrive here before you rely on them." },
  { title: "Create conversion campaigns", desc: "Optimize delivery toward the conversions your pixel reports." },
];

export function PixelPage() {
  const { user } = useAuthStore();
  const pixelId = `RSPX-${user?.id ?? "000000"}`;

  const snippet = `<!-- Teezer Pixel -->
<script>
  !function(r,s){r.rspx=r.rspx||function(){(r.rspx.q=r.rspx.q||[]).push(arguments)};
  var e=s.createElement('script');e.async=1;e.src='https://pixel.teezer.live/rspx.js';
  var t=s.getElementsByTagName('script')[0];t.parentNode.insertBefore(e,t)}(window,document);
  rspx('init','${pixelId}'); rspx('track','PageView');
</script>`;

  const copy = (text: string, message: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(message),
      () => toast.error("Couldn't copy to clipboard"),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teezer Pixel"
        subtitle="Track website actions to measure and optimize conversions."
      />

      {/* Status */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#9ca3af]">
              Pixel ID
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-[#eef0f3] bg-[#f8f9fb] px-3.5 py-1.5 font-mono text-[13px] font-semibold text-[#111827]">
                {pixelId}
              </span>
              <button
                type="button"
                onClick={() => copy(pixelId, "Pixel ID copied")}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#374151] transition hover:bg-[#f9fafb]"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-3 py-1.5 text-[12px] font-bold text-[#b45309]">
            <CircleAlert className="h-3.5 w-3.5" />
            Not receiving events yet
          </span>
        </div>
      </Card>

      {/* Base code */}
      <Card>
        <CardHead
          title="Install the base code"
          subtitle="Paste this snippet into the <head> of every page you want to track."
          action={
            <button
              type="button"
              onClick={() => copy(snippet, "Base code copied")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#fe2c55] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#e0243d]"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy code
            </button>
          }
        />
        <div className="px-5 pb-5 pt-3">
          <pre className="overflow-x-auto rounded-xl bg-[#0f172a] p-4 text-[12px] leading-relaxed text-[#e2e8f0]">
            <code>{snippet}</code>
          </pre>
        </div>
      </Card>

      {/* Events */}
      <Card>
        <CardHead
          title="Events"
          subtitle="Standard events the pixel can report. Add event code to start receiving them."
        />
        <div className="mt-3 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                <th className="px-3 pb-2 font-bold">Event</th>
                <th className="px-3 pb-2 font-bold">Description</th>
                <th className="px-3 pb-2 text-right font-bold">Last received</th>
                <th className="px-3 pb-2 text-right font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD_EVENTS.map((e) => (
                <tr key={e.name} className="border-t border-[#f1f3f5]">
                  <td className="px-3 py-3">
                    <span className="font-mono text-[12px] font-bold text-[#111827]">{e.name}</span>
                  </td>
                  <td className="px-3 text-[13px] text-[#6b7280]">{e.desc}</td>
                  <td className="px-3 text-right text-[13px] tabular-nums text-[#9ca3af]">-</td>
                  <td className="px-3 text-right">
                    <span className="inline-block rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-[11px] font-bold text-[#6b7280]">
                      No activity
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Setup steps */}
      <Card>
        <CardHead title="Setup steps" subtitle="Follow these to get accurate conversion tracking." />
        <ol className="divide-y divide-[#f1f3f5] px-5 pb-5 pt-2">
          {SETUP_STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3.5 py-3.5">
              <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#fff0f4] text-[13px] font-extrabold text-[#fe2c55]">
                {i + 1}
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-[#111827]">{s.title}</p>
                <p className="mt-0.5 text-[13px] text-[#6b7280]">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
