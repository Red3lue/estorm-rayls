"use client";

import { useState, useEffect, useCallback } from "react";
import { POLL_INTERVAL_MS } from "./config";
import type { IssuanceSnapshot } from "./issuance";

interface UseIssuanceResult {
  data: IssuanceSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useIssuance(): UseIssuanceResult {
  const [data, setData] = useState<IssuanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/issuance");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const result: IssuanceSnapshot = await res.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
