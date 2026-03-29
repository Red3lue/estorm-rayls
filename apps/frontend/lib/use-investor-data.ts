"use client";

import { useState, useEffect, useCallback } from "react";
import { POLL_INTERVAL_MS } from "./config";
import type { InvestorData } from "./investor";

interface UseInvestorDataResult {
  data: InvestorData | null;
  loading: boolean;
  error: string | null;
}

export function useInvestorData(): UseInvestorDataResult {
  const [data, setData] = useState<InvestorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/investor");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const result: InvestorData = await res.json();
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

  return { data, loading, error };
}
