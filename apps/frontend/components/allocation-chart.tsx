"use client";

import type { FungibleAsset } from "@/lib/types";
import { formatUSD, formatPct } from "@/lib/format";

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#22c55e", // green
  "#eab308", // yellow
  "#f97316", // orange
];

interface AllocationChartProps {
  fungibles: FungibleAsset[];
}

export function AllocationChart({ fungibles }: AllocationChartProps) {
  const total = fungibles.reduce((s, a) => s + a.valueUSD, 0);

  let cumulative = 0;
  const segments = fungibles.map((asset, i) => {
    const pct = total > 0 ? (asset.valueUSD / total) * 100 : 0;
    const start = cumulative;
    cumulative += pct;
    return { asset, pct, start, color: COLORS[i % COLORS.length] };
  });

  const radius = 80;
  const stroke = 24;
  const center = 100;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        Portfolio Allocation
      </h2>
      <div className="flex items-center gap-8">
        <svg
          viewBox="0 0 200 200"
          className="h-44 w-44 shrink-0"
          aria-label="Portfolio allocation donut chart"
          role="img"
        >
          {segments.map((seg) => (
            <circle
              key={seg.asset.symbol}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${(seg.pct / 100) * circumference} ${circumference}`}
              strokeDashoffset={-(seg.start / 100) * circumference}
              transform={`rotate(-90 ${center} ${center})`}
              className="transition-all duration-500"
            />
          ))}
          <text
            x={center}
            y={center - 6}
            textAnchor="middle"
            className="fill-foreground text-lg font-semibold"
            fontSize="18"
          >
            {formatUSD(total)}
          </text>
          <text
            x={center}
            y={center + 14}
            textAnchor="middle"
            className="fill-muted text-[10px]"
            fontSize="10"
          >
            Total Value
          </text>
        </svg>
        <ul className="flex flex-col gap-2.5 text-sm" aria-label="Asset legend">
          {segments.map((seg) => (
            <li key={seg.asset.symbol} className="flex items-center gap-2.5">
              <span
                className="inline-block h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: seg.color }}
                aria-hidden="true"
              />
              <span className="font-medium text-foreground">
                {seg.asset.symbol}
              </span>
              <span className="text-muted">
                {formatPct(seg.asset.allocationPct)} &middot;{" "}
                {formatUSD(seg.asset.valueUSD)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
