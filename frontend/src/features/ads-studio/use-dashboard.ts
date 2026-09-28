"use client";

import { useCallback, useEffect, useState } from "react";
import { adsService, type AdDashboard } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { useDateRange } from "./date-range";

/** Fetch the consolidated Ads Manager dashboard for the active date range. */
export function useDashboard() {
  const { range } = useDateRange();
  const [data, setData] = useState<AdDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adsService.dashboard(range.from, range.to));
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
