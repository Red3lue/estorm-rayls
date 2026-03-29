"use client";

import type { NonFungibleAsset } from "@/lib/types";
import {
  formatUSD,
  riskColor,
  certStatusLabel,
  certStatusColor,
} from "@/lib/format";

const NFT_LABELS: Record<string, string> = {
  "ART-PICASSO-01": "Picasso",
  "ART-WARHOL-01": "Warhol",
};

interface NftInventoryProps {
  nonFungibles: NonFungibleAsset[];
}

export function NftInventory({ nonFungibles }: NftInventoryProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted uppercase">
        NFT Inventory (ERC-721)
      </h2>
      {nonFungibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No NFT assets in vault
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="NFT holdings">
          {nonFungibles.map((nft) => (
            <li key={`${nft.address}-${nft.tokenId}`}>
              <NftCard nft={nft} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NftCard({ nft }: { nft: NonFungibleAsset }) {
  const status = certStatusLabel(nft.certified, nft.certScore);
  const statusColor = certStatusColor(nft.certified, nft.certScore);
  const label = NFT_LABELS[nft.symbol] ?? nft.symbol;

  return (
    <div className="rounded-lg border border-border/50 bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent text-lg font-bold">
          {label.charAt(0)}
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor} ${
            nft.certified
              ? "bg-success/10"
              : nft.certScore > 0
                ? "bg-warning/10"
                : "bg-muted/10"
          }`}
        >
          {status}
        </span>
      </div>
      <h3 className="font-medium text-foreground">{nft.symbol}</h3>
      <p className="mt-0.5 text-xs text-muted">Token #{nft.tokenId}</p>
      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">Valuation</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatUSD(nft.valuationUSD)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Risk Score</dt>
          <dd className={`font-medium tabular-nums ${riskColor(nft.riskScore)}`}>
            {nft.riskScore}/100
          </dd>
        </div>
        <div>
          <dt className="text-muted">Cert Score</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {nft.certScore}/100
          </dd>
        </div>
        <div>
          <dt className="text-muted">Receipt Token</dt>
          <dd className="font-medium text-foreground">
            {nft.certified ? "Issued" : "No"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
