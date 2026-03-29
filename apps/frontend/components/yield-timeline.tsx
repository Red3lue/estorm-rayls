"use client";

import { formatBps } from "@/lib/format";

interface YieldEntry {
  period: string;
  yieldBps: number;
}

interface YieldTimelineProps {
  data: unknown;
}

export function YieldTimeline({ data }: YieldTimelineProps) {
  const entries = normalizeYieldHistory(data);
  if (entries.length === 0) return null;

  const maxYield = Math.max(...entries.map((e) => e.yieldBps), 1);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        Historical Yield
      </h3>
      <div className="flex items-end gap-2" style={{ height: 120 }} role="img" aria-label="Yield history bar chart">
        {entries.map((entry) => {
          const height = maxYield > 0 ? (entry.yieldBps / maxYield) * 100 : 0;
          return (
            <div key={entry.period} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted tabular-nums">
                {formatBps(entry.yieldBps)}
              </span>
              <div
                className="w-full rounded-t bg-emerald-500/70 transition-all duration-500"
                style={{ height: `${height}%`, minHeight: entry.yieldBps > 0 ? 4 : 0 }}
              />
              <span className="text-[10px] text-muted truncate max-w-full">
                {entry.period}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeYieldHistory(data: unknown): YieldEntry[] {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        period: String(item.period ?? item.date ?? item.label ?? ""),
        yieldBps: Number(item.yieldBps ?? item.yield ?? item.value ?? 0),
      }));
  }

  if (typeof data === "object" && data !== null && "entries" in data) {
    return normalizeYieldHistory((data as { entries: unknown }).entries);
  }

  return [];
}
