"use client";

import { useState, useEffect, useCallback } from "react";
import { POLL_INTERVAL_MS } from "./config";
import type { GovernanceSnapshot } from "./governance";

interface UseGovernanceResult {
  data: GovernanceSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGovernance(): UseGovernanceResult {
  const [data, setData] = useState<GovernanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/governance");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const result: GovernanceSnapshot = await res.json();
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
