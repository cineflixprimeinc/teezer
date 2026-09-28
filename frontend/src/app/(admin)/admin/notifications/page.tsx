"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Send, Users, Star, User } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { Input, Select } from "@/admin-panel/components/ui/input";
import { adminService } from "@/admin-panel/services/admin.service";

export default function NotificationsPage() {
  const [title,  setTitle]  = useState("");
  const [body,   setBody]   = useState("");
  const [target, setTarget] = useState("all");

  const broadcast = useMutation({
    mutationFn: () => adminService.broadcastNotification(title, body, target),
    onSuccess: (data) => {
      toast.success((data as { message?: string })?.message ?? "Notification sent");
      setTitle(""); setBody("");
    },
    onError: () => toast.error("Failed to send notification"),
  });

  const targets = [
    { value: "all",      label: "All Users",    icon: Users, desc: "Send to every registered user" },
    { value: "creators", label: "Creators Only", icon: Star,  desc: "Send only to creator accounts" },
    { value: "users",    label: "Regular Users", icon: User,  desc: "Send only to non-creator accounts" },
  ];

  return (
    <AdminShell title="Notifications">
      <div className="space-y-5">

        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Broadcast Notifications</h2>
          <p className="text-[13px] text-[#6b7280]">Send platform-wide announcements to all users or specific roles.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">

          {/* Compose card */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-[#fe2c55]" />Compose Notification</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-[#374151] mb-1.5 block">Title *</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notification title..." maxLength={100} />
                <p className="text-[11px] text-[#9ca3af] mt-1">{title.length}/100 chars</p>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#374151] mb-1.5 block">Message *</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your notification message..." rows={4} maxLength={500}
                  className="w-full rounded-xl border border-[#e8eaed] p-3 text-[13px] text-[#374151] outline-none focus:border-[#fe2c55] resize-none transition-colors"
                />
                <p className="text-[11px] text-[#9ca3af] mt-1">{body.length}/500 chars</p>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#374151] mb-2 block">Target Audience</label>
                <div className="grid gap-2">
                  {targets.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button key={t.value} onClick={() => setTarget(t.value)}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors
                          ${target === t.value ? "border-[#fe2c55] bg-[#fff0f4]" : "border-[#e8eaed] hover:border-[#fe2c55]/30"}`}>
                        <Icon className={`h-4 w-4 shrink-0 ${target === t.value ? "text-[#fe2c55]" : "text-[#6b7280]"}`} />
                        <div>
                          <p className={`text-[13px] font-semibold ${target === t.value ? "text-[#fe2c55]" : "text-[#111827]"}`}>{t.label}</p>
                          <p className="text-[11px] text-[#9ca3af]">{t.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button variant="primary" className="w-full"
                disabled={broadcast.isPending || !title.trim() || !body.trim()}
                onClick={() => broadcast.mutate()}>
                <Send className="h-4 w-4" />
                {broadcast.isPending ? "Sending…" : "Send Notification"}
              </Button>
            </CardBody>
          </Card>

          {/* Preview card */}
          <Card>
            <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
            <CardBody>
              <div className="rounded-2xl border border-[#e8eaed] bg-[#f9fafb] p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fe2c55]">
                    <Bell className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-[#111827]">{title || "Notification title will appear here"}</p>
                    <p className="text-[13px] text-[#6b7280] mt-0.5">{body || "Your message will appear here..."}</p>
                    <p className="text-[11px] text-[#9ca3af] mt-2">Just now · Teezer</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[12px] text-[#9ca3af]">
                This notification will be sent to: <strong>{targets.find((t) => t.value === target)?.label}</strong>
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
