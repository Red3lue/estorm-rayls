"use client";

import type { FungibleAsset } from "@/lib/types";
import { formatUSD, formatPct, formatBps, riskColor, riskLevel } from "@/lib/format";

interface FungibleTableProps {
  fungibles: FungibleAsset[];
}

export function FungibleTable({ fungibles }: FungibleTableProps) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
          Fungible Assets (ERC-20)
        </h2>
      </div>
      <div className="overflow-x-auto" role="group" tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">Fungible asset holdings</caption>
          <thead>
            <tr className="border-t border-border text-left text-xs text-muted uppercase tracking-wide">
              <th scope="col" className="px-5 py-3 font-medium">
                Asset
              </th>
              <th scope="col" className="px-5 py-3 font-medium text-right">
                Value
              </th>
              <th scope="col" className="px-5 py-3 font-medium text-right">
                Allocation
              </th>
              <th scope="col" className="px-5 py-3 font-medium text-right">
                Yield
              </th>
              <th scope="col" className="px-5 py-3 font-medium text-right">
                Risk
              </th>
            </tr>
          </thead>
          <tbody>
            {fungibles.map((asset) => (
              <tr
                key={asset.address}
                className="border-t border-border/50 hover:bg-surface-raised/50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-foreground">
                  {asset.symbol}
                </td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">
                  {formatUSD(asset.valueUSD)}
                </td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${asset.allocationPct}%` }}
                      />
                    </div>
                    {formatPct(asset.allocationPct)}
                  </div>
                </td>
                <td className="px-5 py-3 text-right text-success tabular-nums">
                  {formatBps(asset.yieldBps)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <span className={riskColor(asset.riskScore)}>
                    {asset.riskScore}
                  </span>
                  <span className="ml-1 text-xs text-muted">
                    /{riskLevel(asset.riskScore)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
