"use client";

import { useInvestorData } from "@/lib/use-investor-data";
import { formatUSD, formatBps, riskColor } from "@/lib/format";
import type { InvestorData, InvestorAttestation, ReceiptTokenInfo } from "@/lib/investor";

const DECISION_TYPE_LABELS: Record<number, string> = {
  0: "Rebalance",
  1: "Certification",
  2: "Issuance",
};

const ORIGIN_LABELS: Record<number, string> = {
  0: "AI Quorum",
  1: "Human Approved",
  2: "Human Initiated",
};

export default function InvestorPage() {
  const { data, loading, error } = useInvestorData();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Investor Portal
        </h2>
        <p className="mt-1 text-sm text-muted">
          AI-managed vault performance and available investments
        </p>
      </div>

      {error && !data && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {loading && !data && <InvestorSkeleton />}

      {data && (
        <div className="flex flex-col gap-8">
          <MetricsSection metrics={data.metrics} />
          <ReceiptTokensSection tokens={data.receiptTokens} />
          <AttestationHistorySection attestations={data.attestations} />
        </div>
      )}
    </main>
  );
}

// ── Metrics Section ──────────────────────────────────────────────────────────

function MetricsSection({ metrics }: { metrics: InvestorData["metrics"] }) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <InvestorCard label="Net Asset Value" value={formatUSD(metrics.nav)} accent />
        <InvestorCard
          label="Portfolio Risk"
          value={`${metrics.riskScore}/100`}
          valueClassName={riskColor(metrics.riskScore)}
        />
        <InvestorCard
          label="Portfolio Yield"
          value={formatBps(metrics.portfolioYield)}
          sub="annualized"
        />
        <InvestorCard
          label="Share Price"
          value={metrics.sharePrice !== null ? formatUSD(metrics.sharePrice) : "Not issued"}
          sub={metrics.sharePrice !== null ? "per share" : undefined}
        />
        <InvestorCard
          label="Shares Outstanding"
          value={
            metrics.totalShares !== null
              ? metrics.totalShares.toLocaleString()
              : "N/A"
          }
        />
        <InvestorCard
          label="Vault Status"
          value="Active"
          valueClassName="text-emerald-400"
        />
      </div>
    </section>
  );
}

function InvestorCard({
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
        className={`mt-1 text-xl font-semibold tracking-tight ${
          accent ? "text-emerald-400" : valueClassName ?? "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

// ── Receipt Tokens Section ───────────────────────────────────────────────────

function ReceiptTokensSection({ tokens }: { tokens: ReceiptTokenInfo[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        Available Receipt Tokens
      </h3>
      {tokens.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No receipt tokens available yet. AI-certified assets will appear here
          once issued.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Receipt tokens">
          {tokens.map((token) => (
            <li key={token.symbol}>
              <ReceiptCard token={token} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReceiptCard({ token }: { token: ReceiptTokenInfo }) {
  return (
    <div className="rounded-lg border border-border/50 bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium text-foreground">{token.symbol}</h4>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            token.certified
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-warning/10 text-warning"
          }`}
        >
          {token.certified ? "AI Certified" : "Pending Certification"}
        </span>
      </div>
      <p className="text-xs text-muted">{token.assetLabel}</p>
      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">Backing Valuation</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatUSD(token.valuationUSD)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">AI Confidence</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {token.certScore}/100
          </dd>
        </div>
        <div>
          <dt className="text-muted">Risk Score</dt>
          <dd className={`font-medium tabular-nums ${riskColor(token.riskScore)}`}>
            {token.riskScore}/100
          </dd>
        </div>
        <div>
          <dt className="text-muted">Receipt Price</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatUSD(token.receiptPrice)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ── Attestation History Section ──────────────────────────────────────────────
// Shows only aggregated data — no reasoning, no asset names, no counterparties (AC #4)

function AttestationHistorySection({
  attestations,
}: {
  attestations: InvestorAttestation[];
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-sm font-medium tracking-wide text-muted uppercase">
          Attestation History
        </h3>
        <span className="text-xs text-muted tabular-nums">
          {attestations.length} record{attestations.length !== 1 ? "s" : ""}
        </span>
      </div>
      {attestations.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">
          No attestation records yet.
        </p>
      ) : (
        <div className="overflow-x-auto" role="group" tabIndex={0}>
          <table className="w-full text-sm">
            <caption className="sr-only">
              Vault attestation history
            </caption>
            <thead>
              <tr className="border-t border-border text-left text-xs text-muted uppercase tracking-wide">
                <th scope="col" className="px-5 py-3 font-medium">Date</th>
                <th scope="col" className="px-5 py-3 font-medium">Type</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">NAV</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Risk</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Quorum</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Origin</th>
              </tr>
            </thead>
            <tbody>
              {attestations.map((a, i) => {
                const date = new Date(a.timestamp * 1000);
                return (
                  <tr
                    key={`${a.timestamp}-${i}`}
                    className="border-t border-border/50 hover:bg-surface-raised/30 transition-colors"
                  >
                    <td className="px-5 py-3 text-muted tabular-nums whitespace-nowrap">
                      <time dateTime={date.toISOString()}>
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </td>
                    <td className="px-5 py-3 text-foreground">
                      {DECISION_TYPE_LABELS[a.decisionType] ?? "Unknown"}
                    </td>
                    <td className="px-5 py-3 text-right text-foreground tabular-nums">
                      {formatUSD(a.nav)}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums ${riskColor(a.riskScore)}`}>
                      {a.riskScore}
                    </td>
                    <td className="px-5 py-3 text-right text-foreground tabular-nums">
                      {a.quorumVotes}/{a.quorumTotal}
                    </td>
                    <td className="px-5 py-3 text-right text-muted">
                      {ORIGIN_LABELS[a.decisionOrigin] ?? "Unknown"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function InvestorSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse" aria-busy="true">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-48 rounded-xl border border-border bg-surface" />
      <div className="h-48 rounded-xl border border-border bg-surface" />
    </div>
  );
}
