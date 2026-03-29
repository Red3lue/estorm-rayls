"use client";

import { useState, useEffect, useCallback } from "react";
import { POLL_INTERVAL_MS } from "./config";
import type { VaultSnapshot } from "./types";

interface UseVaultSnapshotResult {
  snapshot: VaultSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useVaultSnapshot(): UseVaultSnapshotResult {
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/vault/snapshot");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: VaultSnapshot = await res.json();
      setSnapshot(data);
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

  return { snapshot, loading, error, refresh: fetchData };
}
