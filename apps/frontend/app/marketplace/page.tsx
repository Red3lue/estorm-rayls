"use client";

import { useState } from "react";
import { useMarketplace } from "@/lib/use-marketplace";
import { formatUSD } from "@/lib/format";
import type {
  MarketplaceListing,
  TokenHolding,
  ShareInfo,
} from "@/lib/marketplace";

const EXPLORER_URL = "https://testnet-explorer.rayls.com";

export default function MarketplacePage() {
  const { data, loading, error, refresh } = useMarketplace();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Marketplace
        </h2>
        <p className="mt-1 text-sm text-muted">
          Browse and purchase vault shares and receipt tokens
        </p>
      </div>

      {error && !data && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {loading && !data && <MarketplaceSkeleton />}

      {data && (
        <div className="flex flex-col gap-8">
          {data.shareInfo && <ShareInfoBar info={data.shareInfo} />}
          <AvailableToBuy
            listings={data.listings}
            onRefresh={refresh}
          />
          <MyHoldings holdings={data.holdings} />
        </div>
      )}
    </main>
  );
}

// ── Share Info Bar ──────────────────────────────────────────────────────────

function ShareInfoBar({ info }: { info: ShareInfo }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs text-muted">NAV</p>
        <p className="mt-0.5 text-lg font-semibold text-emerald-400 tabular-nums">
          {formatUSD(info.nav)}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs text-muted">Share Price</p>
        <p className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
          {formatUSD(info.sharePrice)}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs text-muted">Risk Score</p>
        <p className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
          {info.riskScore}/100
        </p>
      </div>
    </div>
  );
}

// ── Available to Buy ────────────────────────────────────────────────────────

function AvailableToBuy({
  listings,
  onRefresh,
}: {
  listings: MarketplaceListing[];
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-medium tracking-wide text-muted uppercase">
          Available to Buy
        </h3>
      </div>
      {listings.length === 0 ? (
        <p className="px-5 pb-5 py-8 text-center text-sm text-muted">
          No listings available yet. Vault shares and receipt tokens will appear
          here once listed on the marketplace.
        </p>
      ) : (
        <ul className="divide-y divide-border/50" aria-label="Available listings">
          {listings.map((listing) => (
            <li key={listing.id}>
              <ListingRow listing={listing} onRefresh={onRefresh} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListingRow({
  listing,
  onRefresh,
}: {
  listing: MarketplaceListing;
  onRefresh: () => void;
}) {
  const [buying, setBuying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleBuy() {
    setBuying(true);
    try {
      const res = await fetch("/api/marketplace/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          price: listing.price,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Purchase failed");
      }
      const result = await res.json();
      setTxHash(result.txHash);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBuying(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex-1">
        <div className="flex items-center gap-2.5">
          <span className="font-medium text-foreground">
            {listing.tokenSymbol}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              listing.tokenType === "share"
                ? "bg-accent/10 text-accent"
                : "bg-warning/10 text-warning"
            }`}
          >
            {listing.tokenType === "share" ? "Vault Share" : "Receipt"}
          </span>
        </div>
        {listing.certSummary && (
          <p className="mt-1 text-xs text-muted leading-relaxed">
            {listing.certSummary}
          </p>
        )}
        <div className="mt-1.5 flex gap-4 text-xs text-muted">
          <span>
            Price: <span className="text-foreground tabular-nums">{formatUSD(listing.price)}</span>
          </span>
          <span>
            Available: <span className="text-foreground tabular-nums">{listing.amount.toLocaleString()}</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <button
          onClick={handleBuy}
          disabled={buying}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {buying ? "Buying..." : "Buy"}
        </button>
        {txHash && (
          <a
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            View on explorer
          </a>
        )}
      </div>
    </div>
  );
}

// ── My Holdings ─────────────────────────────────────────────────────────────

function MyHoldings({ holdings }: { holdings: TokenHolding[] }) {
  const hasAny = holdings.some((h) => h.balance > 0);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        My Holdings
      </h3>
      {!hasAny ? (
        <p className="py-6 text-center text-sm text-muted">
          You don't hold any vault tokens yet. Purchase from the listings above
          to start investing.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {holdings
            .filter((h) => h.balance > 0)
            .map((h) => (
              <div
                key={h.address}
                className="rounded-lg border border-border/50 bg-surface-raised p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{h.symbol}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      h.type === "share"
                        ? "bg-accent/10 text-accent"
                        : "bg-warning/10 text-warning"
                    }`}
                  >
                    {h.type === "share" ? "Share" : "Receipt"}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-foreground tabular-nums">
                  {h.balance.toLocaleString()}
                </p>
                <p className="text-xs text-muted">tokens held</p>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function MarketplaceSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse" aria-busy="true">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-48 rounded-xl border border-border bg-surface" />
      <div className="h-32 rounded-xl border border-border bg-surface" />
    </div>
  );
}
