"use client";

import { useVaultSnapshot } from "@/lib/use-vault-snapshot";
import { NavDisplay } from "@/components/nav-display";
import { AllocationChart } from "@/components/allocation-chart";
import { FungibleTable } from "@/components/fungible-table";
import { NftInventory } from "@/components/nft-inventory";

export default function ManagerDashboard() {
  const { snapshot, loading, error, refresh } = useVaultSnapshot();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
          Vault Overview
        </h2>
        <div className="flex items-center gap-3">
          {snapshot && (
            <span className="text-xs text-muted tabular-nums">
              Updated {new Date(snapshot.timestamp).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50"
            aria-label="Refresh vault data"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && !snapshot && (
        <div
          className="rounded-xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger"
          role="alert"
        >
          <p className="font-medium">Failed to load vault data</p>
          <p className="mt-1 text-danger/80">{error}</p>
        </div>
      )}

      {loading && !snapshot && <SkeletonDashboard />}

      {snapshot && (
        <div className="flex flex-col gap-6">
          <NavDisplay snapshot={snapshot} />
          <div className="grid gap-6 lg:grid-cols-2">
            <AllocationChart fungibles={snapshot.fungibles} />
            <NftInventory nonFungibles={snapshot.nonFungibles} />
          </div>
          <FungibleTable fungibles={snapshot.fungibles} />
        </div>
      )}
    </main>
  );
}

function SkeletonDashboard() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-border bg-surface"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-xl border border-border bg-surface" />
        <div className="h-64 rounded-xl border border-border bg-surface" />
      </div>
      <div className="h-48 rounded-xl border border-border bg-surface" />
    </div>
  );
}
