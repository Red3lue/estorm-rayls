"use client";

import { formatUSD, formatPct, formatBps, riskColor } from "@/lib/format";

interface BreakdownAsset {
  symbol: string;
  allocationPct: number;
  riskScore: number;
  yieldBps: number;
  valueUSD: number;
}

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#eab308",
  "#f97316",
];

interface PortfolioBreakdownViewProps {
  data: unknown;
}

export function PortfolioBreakdownView({ data }: PortfolioBreakdownViewProps) {
  const assets = normalizeBreakdown(data);
  if (assets.length === 0) return null;

  const total = assets.reduce((s, a) => s + a.valueUSD, 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        Disclosed Portfolio Composition
      </h3>

      <div className="mb-4 flex gap-1 rounded-lg overflow-hidden h-3" aria-label="Allocation bar">
        {assets.map((asset, i) => (
          <div
            key={asset.symbol}
            className="transition-all duration-500"
            style={{
              width: `${total > 0 ? (asset.valueUSD / total) * 100 : 0}%`,
              backgroundColor: COLORS[i % COLORS.length],
            }}
            title={`${asset.symbol}: ${asset.allocationPct}%`}
          />
        ))}
      </div>

      <div className="overflow-x-auto" role="group" tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">Disclosed asset composition from attestation</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted uppercase tracking-wide">
              <th scope="col" className="pb-2 pr-4 font-medium">Asset</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">Allocation</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">Value</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">Yield</th>
              <th scope="col" className="pb-2 font-medium text-right">Risk</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset, i) => (
              <tr key={asset.symbol} className="border-b border-border/30">
                <td className="py-2.5 pr-4">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-foreground">{asset.symbol}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right text-foreground tabular-nums">
                  {formatPct(asset.allocationPct)}
                </td>
                <td className="py-2.5 pr-4 text-right text-foreground tabular-nums">
                  {formatUSD(asset.valueUSD)}
                </td>
                <td className="py-2.5 pr-4 text-right text-success tabular-nums">
                  {formatBps(asset.yieldBps)}
                </td>
                <td className={`py-2.5 text-right tabular-nums ${riskColor(asset.riskScore)}`}>
                  {asset.riskScore}/100
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function normalizeBreakdown(data: unknown): BreakdownAsset[] {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data
      .filter((item) => item && typeof item === "object" && "symbol" in item)
      .map((item) => ({
        symbol: String(item.symbol ?? ""),
        allocationPct: Number(item.allocationPct ?? item.allocation ?? 0),
        riskScore: Number(item.riskScore ?? item.risk ?? 0),
        yieldBps: Number(item.yieldBps ?? item.yield ?? 0),
        valueUSD: Number(item.valueUSD ?? item.value ?? 0),
      }));
  }

  if (typeof data === "object" && data !== null && "assets" in data) {
    return normalizeBreakdown((data as { assets: unknown }).assets);
  }

  return [];
}
