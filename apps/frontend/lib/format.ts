export function formatUSD(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString()}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatPct(pct: number): string {
  return `${pct}%`;
}

export function riskLevel(score: number): "low" | "medium" | "high" {
  if (score <= 35) return "low";
  if (score <= 65) return "medium";
  return "high";
}

export function riskColor(score: number): string {
  const level = riskLevel(score);
  if (level === "low") return "text-success";
  if (level === "medium") return "text-warning";
  return "text-danger";
}

export function certStatusLabel(
  certified: boolean,
  certScore: number,
): string {
  if (certified) return "Certified";
  if (certScore > 0) return "Pending";
  return "Uncertified";
}

export function certStatusColor(certified: boolean, certScore: number): string {
  if (certified) return "text-success";
  if (certScore > 0) return "text-warning";
  return "text-muted";
}
