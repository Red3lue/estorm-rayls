"use client";

import { useState, useEffect, useCallback } from "react";
import { POLL_INTERVAL_MS } from "./config";
import type { AttestationRecord } from "./attestations";

interface UseAttestationsResult {
  records: AttestationRecord[];
  loading: boolean;
  error: string | null;
}

export function useAttestations(): UseAttestationsResult {
  const [records, setRecords] = useState<AttestationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/attestations");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRecords(data.records);
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

  return { records, loading, error };
}
