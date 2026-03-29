"use client";

import { useState } from "react";
import { useIssuance } from "@/lib/use-issuance";
import { formatUSD } from "@/lib/format";
import type { Listing, IssuedToken, PendingTeleport } from "@/lib/issuance";

export default function IssuancePage() {
  const { data, loading, error, refresh } = useIssuance();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Primary Market Issuance
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Token issuance pipeline and marketplace listings
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

      {loading && !data && <IssuanceSkeleton />}

      {data && (
        <div className="flex flex-col gap-6">
          <SummaryCards
            totalCapital={data.totalCapitalRaised}
            issuedCount={data.issuedTokens.length}
            activeListings={data.listings.filter((l) => l.active).length}
          />
          <IssuedTokensPanel tokens={data.issuedTokens} />
          <ListingsPanel listings={data.listings} onRefresh={refresh} />
          <TeleportsPanel teleports={data.pendingTeleports} />
        </div>
      )}
    </main>
  );
}

// ── Summary Cards ───────────────────────────────────────────────────────────

function SummaryCards({
  totalCapital,
  issuedCount,
  activeListings,
}: {
  totalCapital: number;
  issuedCount: number;
  activeListings: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          Total Capital Raised
        </p>
        <p className="mt-1 text-2xl font-semibold text-accent tabular-nums">
          {formatUSD(totalCapital)}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          Issued Tokens
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
          {issuedCount}
        </p>
        <p className="mt-0.5 text-xs text-muted">shares + receipts</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          Active Listings
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
          {activeListings}
        </p>
        <p className="mt-0.5 text-xs text-muted">on marketplace</p>
      </div>
    </div>
  );
}

// ── Issued Tokens Panel ─────────────────────────────────────────────────────

function IssuedTokensPanel({ tokens }: { tokens: IssuedToken[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        Issued Tokens
      </h3>
      {tokens.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No tokens issued yet. VaultShareToken and ReceiptToken will appear
          here once deployed.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tokens.map((token) => (
            <div
              key={token.address}
              className="rounded-lg border border-border/50 bg-surface-raised p-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-foreground">{token.symbol}</h4>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    token.type === "share"
                      ? "bg-accent/10 text-accent"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {token.type === "share" ? "Vault Share" : "Receipt Token"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{token.name}</p>
              <p className="mt-2 text-sm tabular-nums text-foreground">
                Supply: {token.totalSupply.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Listings Panel ──────────────────────────────────────────────────────────

function ListingsPanel({
  listings,
  onRefresh,
}: {
  listings: Listing[];
  onRefresh: () => void;
}) {
  const [acting, setActing] = useState<number | null>(null);

  async function handleDelist(listingId: number) {
    setActing(listingId);
    try {
      const res = await fetch("/api/issuance/delist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delist failed");
      }
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delist failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-sm font-medium tracking-wide text-muted uppercase">
          Marketplace Listings
        </h3>
        <span className="text-xs text-muted tabular-nums">
          {listings.length} listing{listings.length !== 1 ? "s" : ""}
        </span>
      </div>
      {listings.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">
          No marketplace listings yet.
        </p>
      ) : (
        <div className="overflow-x-auto" role="group" tabIndex={0}>
          <table className="w-full text-sm">
            <caption className="sr-only">Marketplace listings</caption>
            <thead>
              <tr className="border-t border-border text-left text-xs text-muted uppercase tracking-wide">
                <th scope="col" className="px-5 py-3 font-medium">Token</th>
                <th scope="col" className="px-5 py-3 font-medium">Type</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Amount</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Price</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Capital Raised</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr
                  key={listing.id}
                  className="border-t border-border/50 hover:bg-surface-raised/30 transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-foreground">
                    {listing.tokenName}
                  </td>
                  <td className="px-5 py-3 text-muted capitalize">
                    {listing.tokenType}
                  </td>
                  <td className="px-5 py-3 text-right text-foreground tabular-nums">
                    {listing.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-foreground tabular-nums">
                    {formatUSD(listing.price)}
                  </td>
                  <td className="px-5 py-3 text-right text-foreground tabular-nums">
                    {formatUSD(listing.capitalRaised)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        listing.active
                          ? "bg-success/10 text-success"
                          : "bg-muted/10 text-muted"
                      }`}
                    >
                      {listing.active ? "Listed" : "Sold / Delisted"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {listing.active && (
                      <button
                        onClick={() => handleDelist(listing.id)}
                        disabled={acting === listing.id}
                        className="rounded-lg border border-border bg-surface-raised px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50"
                      >
                        {acting === listing.id ? "..." : "Delist"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Teleports Panel ─────────────────────────────────────────────────────────

function TeleportsPanel({ teleports }: { teleports: PendingTeleport[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        Pending Inbound Teleports
      </h3>
      {teleports.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          No pending teleports. Investor payments will appear here when in
          transit from Public Chain to Privacy Node.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Pending teleports">
          {teleports.map((t, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-raised px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t.direction}
                </p>
                <p className="text-xs text-muted">{t.status}</p>
              </div>
              <p className="text-sm font-medium text-foreground tabular-nums">
                {t.amount} wei
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function IssuanceSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-40 rounded-xl border border-border bg-surface" />
      <div className="h-48 rounded-xl border border-border bg-surface" />
      <div className="h-32 rounded-xl border border-border bg-surface" />
    </div>
  );
}
