"use client";

import { formatUSD, formatPct, formatBps, riskColor } from "@/lib/format";
import type { VaultSnapshot } from "@/lib/types";

interface NavDisplayProps {
  snapshot: VaultSnapshot;
}

export function NavDisplay({ snapshot }: NavDisplayProps) {
  const totalYieldBps =
    snapshot.fungibles.length > 0
      ? snapshot.fungibles.reduce(
          (sum, a) => sum + a.yieldBps * (a.allocationPct / 100),
          0,
        )
      : 0;

  const avgRisk =
    snapshot.fungibles.length > 0
      ? Math.round(
          snapshot.fungibles.reduce(
            (sum, a) => sum + a.riskScore * (a.allocationPct / 100),
            0,
          ),
        )
      : 0;

  const nftTotalValue = snapshot.nonFungibles.reduce(
    (sum, n) => sum + n.valuationUSD,
    0,
  );

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        label="Net Asset Value"
        value={formatUSD(snapshot.nav)}
        accent
      />
      <MetricCard
        label="NFT Holdings"
        value={formatUSD(nftTotalValue)}
        sub={`${snapshot.nonFungibles.length} assets`}
      />
      <MetricCard
        label="Weighted Yield"
        value={formatBps(totalYieldBps)}
        sub="annualized"
      />
      <MetricCard
        label="Portfolio Risk"
        value={formatPct(avgRisk)}
        valueClassName={riskColor(avgRisk)}
        sub={`score ${avgRisk}/100`}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          accent ? "text-accent" : valueClassName ?? "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
