"use client";

import type { AttestationRecord } from "@/lib/attestations";
import { formatUSD, riskColor } from "@/lib/format";

const DECISION_TYPE_LABELS: Record<number, string> = {
  0: "Rebalance",
  1: "Certification",
  2: "Issuance",
};

const DECISION_TYPE_COLORS: Record<number, string> = {
  0: "bg-accent/10 text-accent",
  1: "bg-warning/10 text-warning",
  2: "bg-success/10 text-success",
};

const ORIGIN_LABELS: Record<number, string> = {
  0: "AI Quorum",
  1: "Human Approved",
  2: "Human Initiated",
};

interface DecisionLogProps {
  records: AttestationRecord[];
  loading: boolean;
  error: string | null;
}

export function DecisionLog({ records, loading, error }: DecisionLogProps) {
  if (loading && records.length === 0) {
    return <DecisionLogSkeleton />;
  }

  if (error && records.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
          AI Decision Log
        </h2>
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
          AI Decision Log
        </h2>
        <p className="py-12 text-center text-sm text-muted">
          No attestation events yet. The AI agent will record decisions here once
          the Attestation contract is deployed and the agent loop is running.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
          AI Decision Log
        </h2>
        <span className="text-xs text-muted tabular-nums">
          {records.length} event{records.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div
        role="log"
        aria-label="AI attestation events"
        aria-live="polite"
        className="divide-y divide-border/50"
      >
        {records.map((record, i) => (
          <DecisionEntry key={`${record.token}-${record.timestamp}-${i}`} record={record} />
        ))}
      </div>
    </div>
  );
}

function DecisionEntry({ record }: { record: AttestationRecord }) {
  const typeLabel = DECISION_TYPE_LABELS[record.decisionType] ?? "Unknown";
  const typeColor = DECISION_TYPE_COLORS[record.decisionType] ?? "bg-muted/10 text-muted";
  const originLabel = ORIGIN_LABELS[record.decisionOrigin] ?? "Unknown";
  const date = new Date(record.timestamp * 1000);

  return (
    <article className="px-5 py-4 hover:bg-surface-raised/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColor}`}>
            {typeLabel}
          </span>
          <span className="text-xs text-muted">
            {record.approved ? "Approved" : "Rejected"}
          </span>
        </div>
        <time
          dateTime={date.toISOString()}
          className="shrink-0 text-xs text-muted tabular-nums"
        >
          {date.toLocaleDateString()} {date.toLocaleTimeString()}
        </time>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-foreground">
        {record.reason || "No reasoning provided"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Confidence:{" "}
          <span className="font-medium text-foreground">{record.score}/100</span>
        </span>
        <span>
          Quorum:{" "}
          <span className="font-medium text-foreground">
            {record.quorumVotes}/{record.quorumTotal}
          </span>
        </span>
        <span>
          Origin:{" "}
          <span className="font-medium text-foreground">{originLabel}</span>
        </span>
        <span>
          NAV:{" "}
          <span className="font-medium text-foreground">
            {formatUSD(record.nav)}
          </span>
        </span>
        <span>
          Risk:{" "}
          <span className={`font-medium ${riskColor(record.riskScore)}`}>
            {record.riskScore}/100
          </span>
        </span>
      </div>
    </article>
  );
}

function DecisionLogSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 animate-pulse" aria-busy="true">
      <div className="mb-4 h-4 w-32 rounded bg-border" />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-border" />
            <div className="h-4 w-full rounded bg-border" />
            <div className="h-3 w-48 rounded bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}
