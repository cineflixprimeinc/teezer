'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAdminModerationSettings,
  getScannerHealth,
  updateAdminModerationSettings,
} from '@/services/moderation.service';
import { ModerationSettings, ScannerHealth } from '@/types/moderation';

export default function ModerationSettingsPanel() {
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [health, setHealth] = useState<(ScannerHealth & { reachable: boolean }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        getAdminModerationSettings(),
        getScannerHealth(),
      ]);
      setSettings(s);
      setHealth(h);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updateAdminModerationSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-neutral-400 text-sm">
        Loading settings…
      </div>
    );
  }

  if (!settings) {
    return <p className="text-red-400 text-sm">Failed to load settings.</p>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Scanner health */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Scanner Status</h3>
          <button
            onClick={fetchData}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Refresh
          </button>
        </div>

        {health ? (
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: 'Reachable',
                value: health.reachable ? 'Yes' : 'No',
                ok: health.reachable,
              },
              {
                label: 'Models',
                value: health.models_loaded ? 'Loaded' : 'Not loaded',
                ok: health.models_loaded,
              },
              {
                label: 'NudeNet',
                value: health.nudenet_loaded ? 'Ready' : 'Unavailable',
                ok: health.nudenet_loaded,
              },
              {
                label: 'OpenNSFW2',
                value: health.nsfw_loaded ? 'Ready' : 'Unavailable',
                ok: health.nsfw_loaded,
              },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-neutral-900/60 p-3 text-center">
                <p
                  className={`text-sm font-semibold ${
                    s.ok ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {s.value}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-red-400">Scanner unreachable</p>
        )}
      </div>

      {/* Global toggle */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/40 p-5">
        <h3 className="font-semibold text-white mb-4">Global Settings</h3>
        <div className="flex flex-col gap-4">
          <Toggle
            label="Moderation Enabled"
            description="When off, all uploads are auto-approved without scanning."
            value={settings.moderation_enabled}
            onChange={(v) => setSettings((s) => s && { ...s, moderation_enabled: v })}
          />
          <Toggle
            label="Auto-Reject Enabled"
            description="Automatically reject content above rejection thresholds. When off, high-risk content is queued for manual review instead."
            value={settings.auto_reject_enabled}
            onChange={(v) => setSettings((s) => s && { ...s, auto_reject_enabled: v })}
          />
          <Toggle
            label="Admin Review Required for High Risk"
            description="Always require manual admin review for content above pending thresholds."
            value={settings.admin_review_required_for_high_risk}
            onChange={(v) =>
              setSettings((s) => s && { ...s, admin_review_required_for_high_risk: v })
            }
          />
        </div>
      </div>

      {/* Thresholds */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/40 p-5">
        <h3 className="font-semibold text-white mb-1">Detection Thresholds</h3>
        <p className="text-xs text-neutral-400 mb-4">
          Scores are 0.0-1.0. Reject threshold must be &gt; pending threshold.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="NSFW Pending Threshold"
            value={settings.nsfw_pending_threshold}
            onChange={(v) => setSettings((s) => s && { ...s, nsfw_pending_threshold: v })}
          />
          <SliderField
            label="NSFW Reject Threshold"
            value={settings.nsfw_reject_threshold}
            onChange={(v) => setSettings((s) => s && { ...s, nsfw_reject_threshold: v })}
          />
          <SliderField
            label="Nudity Pending Threshold"
            value={settings.nudity_pending_threshold}
            onChange={(v) => setSettings((s) => s && { ...s, nudity_pending_threshold: v })}
          />
          <SliderField
            label="Nudity Reject Threshold"
            value={settings.nudity_reject_threshold}
            onChange={(v) => setSettings((s) => s && { ...s, nudity_reject_threshold: v })}
          />
        </div>
      </div>

      {/* Video scan settings */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/40 p-5">
        <h3 className="font-semibold text-white mb-4">Video Scan Settings</h3>
        <div className="grid grid-cols-3 gap-4">
          <NumberField
            label="Frame Interval (s)"
            description="Seconds between extracted frames (default scan)"
            value={settings.video_default_frame_interval_seconds}
            min={1}
            max={30}
            onChange={(v) =>
              setSettings((s) => s && { ...s, video_default_frame_interval_seconds: v })
            }
          />
          <NumberField
            label="Scan Duration (s)"
            description="First N seconds to scan (default scan)"
            value={settings.video_default_scan_duration_seconds}
            min={10}
            max={3600}
            onChange={(v) =>
              setSettings((s) => s && { ...s, video_default_scan_duration_seconds: v })
            }
          />
          <NumberField
            label="Full Scan Interval (s)"
            description="Frame interval for suspicious/reported content"
            value={settings.video_full_scan_frame_interval_seconds}
            min={1}
            max={10}
            onChange={(v) =>
              setSettings((s) => s && { ...s, video_full_scan_frame_interval_seconds: v })
            }
          />
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-neutral-100 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && (
          <span className="text-sm text-green-400">Settings saved successfully.</span>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        onClick={() => onChange(!value)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${
          value ? 'bg-white' : 'bg-neutral-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-neutral-400 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-neutral-400">{label}</label>
        <span className="text-xs font-mono text-white">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-white h-1 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-neutral-600">
        <span>0.0</span>
        <span>1.0</span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-neutral-300">{label}</label>
      {description && <p className="text-xs text-neutral-500">{description}</p>}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || min)}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-500"
      />
    </div>
  );
}
