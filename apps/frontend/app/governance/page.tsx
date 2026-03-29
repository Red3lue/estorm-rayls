"use client";

import { useState } from "react";
import { useGovernance } from "@/lib/use-governance";
import { formatUSD } from "@/lib/format";
import type {
  Proposal,
  GovernanceSettings,
} from "@/lib/governance";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/governance";

export default function GovernancePage() {
  const { data, loading, error, refresh } = useGovernance();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Governance Dashboard
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            On-chain control over AI vault operations via VaultPolicy.sol
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && !data && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {loading && !data && <GovernanceSkeleton />}

      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PendingProposalPanel
                proposal={data.pending}
                paused={data.settings.paused}
                onRefresh={refresh}
              />
            </div>
            <EmergencyPanel
              paused={data.settings.paused}
              onRefresh={refresh}
            />
          </div>
          <SettingsPanel settings={data.settings} />
          <ProposalHistoryPanel history={data.history} />
        </div>
      )}
    </main>
  );
}

// ── Pending Proposal Panel ──────────────────────────────────────────────────

function PendingProposalPanel({
  proposal,
  paused,
  onRefresh,
}: {
  proposal: Proposal | null;
  paused: boolean;
  onRefresh: () => void;
}) {
  const [acting, setActing] = useState(false);

  async function handleAction(action: "approve" | "dismiss") {
    if (!proposal) return;
    setActing(true);
    try {
      const res = await fetch(`/api/governance/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to ${action}`);
      }
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  if (paused) {
    return (
      <div className="rounded-xl border-2 border-danger/50 bg-danger/5 p-5">
        <h3 className="text-sm font-medium tracking-wide text-danger uppercase">
          Emergency Stop Active
        </h3>
        <p className="mt-2 text-sm text-danger/80">
          All vault operations are halted. Resume operations to allow AI
          proposals.
        </p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">
          Pending Proposal
        </h3>
        <p className="py-6 text-center text-sm text-muted">
          No pending proposals — AI operating within permitted rules
        </p>
      </div>
    );
  }

  const date = new Date(proposal.createdAt * 1000);

  return (
    <div className="rounded-xl border-2 border-warning/40 bg-warning/5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium tracking-wide text-warning uppercase">
          Pending Proposal #{proposal.id}
        </h3>
        <time className="text-xs text-muted tabular-nums" dateTime={date.toISOString()}>
          {date.toLocaleString()}
        </time>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Category</dt>
          <dd className="font-medium text-foreground">
            {CATEGORY_LABELS[proposal.category] ?? `Category ${proposal.category}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Transaction Value</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatUSD(proposal.valueUSD)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Quorum Votes</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {proposal.quorumVotes}/4 agents approved
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Status</dt>
          <dd className="font-medium text-warning">
            {STATUS_LABELS[proposal.status] ?? "Unknown"}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-xs text-muted">AI Reasoning</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          {proposal.reasoning || "No reasoning provided"}
        </p>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={() => handleAction("approve")}
          disabled={acting}
          className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/80 disabled:opacity-50"
        >
          {acting ? "Processing..." : "Approve & Execute"}
        </button>
        <button
          onClick={() => handleAction("dismiss")}
          disabled={acting}
          className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Emergency Panel ─────────────────────────────────────────────────────────

function EmergencyPanel({
  paused,
  onRefresh,
}: {
  paused: boolean;
  onRefresh: () => void;
}) {
  const [acting, setActing] = useState(false);

  async function handleEmergency() {
    setActing(true);
    try {
      const res = await fetch("/api/governance/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: paused ? "resume" : "stop" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Emergency action failed");
      }
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col justify-between">
      <div>
        <h3 className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">
          Emergency Controls
        </h3>
        <p className="text-xs text-muted leading-relaxed">
          {paused
            ? "All operations are halted. Resume to allow the AI agent to continue."
            : "Halt all vault operations immediately. The AI agent will stop proposing actions."}
        </p>
      </div>
      <button
        onClick={handleEmergency}
        disabled={acting}
        className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          paused
            ? "bg-success text-white hover:bg-success/80"
            : "bg-danger text-white hover:bg-danger/80"
        }`}
      >
        {acting
          ? "Processing..."
          : paused
            ? "Resume Operations"
            : "Emergency Stop"}
      </button>
    </div>
  );
}

// ── Settings Panel ──────────────────────────────────────────────────────────

function SettingsPanel({ settings }: { settings: GovernanceSettings }) {
  const windowMinutes = Math.round(settings.windowDuration / 60);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        Governance Rules
      </h3>
      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Value Threshold</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
            {formatUSD(settings.valueThreshold)}
          </p>
          <p className="text-xs text-muted">Max auto-execution value</p>
        </div>
        <div>
          <p className="text-xs text-muted">Rate Limit</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
            {settings.maxTxPerWindow} tx / {windowMinutes}min
          </p>
          <p className="text-xs text-muted">Max AI transactions per window</p>
        </div>
        <div>
          <p className="text-xs text-muted">Vault Status</p>
          <p className={`mt-0.5 text-lg font-semibold ${settings.paused ? "text-danger" : "text-success"}`}>
            {settings.paused ? "Paused" : "Active"}
          </p>
          <p className="text-xs text-muted">
            {settings.paused ? "All operations halted" : "AI operating normally"}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-3 text-xs font-medium text-muted uppercase tracking-wide">
          Category Permissions
        </p>
        <div className="flex flex-wrap gap-2">
          {settings.categoryPermissions.map((allowed, i) => (
            <span
              key={i}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                allowed
                  ? "bg-success/10 text-success"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {CATEGORY_LABELS[i] ?? `Cat ${i}`}: {allowed ? "AI-managed" : "Human-only"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Proposal History Panel ──────────────────────────────────────────────────

function ProposalHistoryPanel({ history }: { history: Proposal[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-sm font-medium tracking-wide text-muted uppercase">
          Activity Log
        </h3>
        <span className="text-xs text-muted tabular-nums">
          {history.length} proposal{history.length !== 1 ? "s" : ""}
        </span>
      </div>
      {history.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">No proposal history yet.</p>
      ) : (
        <div className="overflow-x-auto" role="group" tabIndex={0}>
          <table className="w-full text-sm">
            <caption className="sr-only">Proposal history</caption>
            <thead>
              <tr className="border-t border-border text-left text-xs text-muted uppercase tracking-wide">
                <th scope="col" className="px-5 py-3 font-medium">ID</th>
                <th scope="col" className="px-5 py-3 font-medium">Date</th>
                <th scope="col" className="px-5 py-3 font-medium">Category</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Value</th>
                <th scope="col" className="px-5 py-3 font-medium">Quorum</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => {
                const date = new Date(p.createdAt * 1000);
                const statusColor = statusColorMap(p.status);
                return (
                  <tr
                    key={p.id}
                    className="border-t border-border/50 hover:bg-surface-raised/30 transition-colors"
                  >
                    <td className="px-5 py-3 text-muted tabular-nums">#{p.id}</td>
                    <td className="px-5 py-3 text-muted tabular-nums whitespace-nowrap">
                      <time dateTime={date.toISOString()}>
                        {date.toLocaleDateString()}{" "}
                        {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </td>
                    <td className="px-5 py-3 text-foreground">
                      {CATEGORY_LABELS[p.category] ?? `Cat ${p.category}`}
                    </td>
                    <td className="px-5 py-3 text-right text-foreground tabular-nums">
                      {formatUSD(p.valueUSD)}
                    </td>
                    <td className="px-5 py-3 text-foreground tabular-nums">
                      {p.quorumVotes}/4
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
                        {STATUS_LABELS[p.status] ?? "Unknown"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusColorMap(status: number): string {
  switch (status) {
    case 1: return "bg-accent/10 text-accent";
    case 2: return "bg-success/10 text-success";
    case 3: return "bg-danger/10 text-danger";
    case 4: return "bg-muted/10 text-muted";
    default: return "bg-warning/10 text-warning";
  }
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function GovernanceSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-48 rounded-xl border border-border bg-surface" />
        <div className="h-48 rounded-xl border border-border bg-surface" />
      </div>
      <div className="h-40 rounded-xl border border-border bg-surface" />
      <div className="h-48 rounded-xl border border-border bg-surface" />
    </div>
  );
}
