"use client";

import type { InvestorAttestation } from "@/lib/investor";
import { PortfolioBreakdownView } from "./portfolio-breakdown";
import { YieldTimeline } from "./yield-timeline";

const DECISION_TYPE_LABELS: Record<number, string> = {
  0: "Rebalance",
  1: "Certification",
  2: "Issuance",
};

const ORIGIN_LABELS: Record<number, string> = {
  0: "AI_QUORUM",
  1: "HUMAN_APPROVED",
  2: "HUMAN_INITIATED",
};

interface AttestationDisclosureProps {
  attestation: InvestorAttestation;
}

/**
 * Generic attestation disclosure component.
 *
 * Reads whatever additional data fields the institution's Attestation.sol
 * contract exposes beyond the base fields (timestamp, type, origin, quorum, NAV, risk).
 * For our demo implementation, it renders `portfolioBreakdown` as a composition
 * table and `yieldHistory` as a historical timeline.
 *
 * Other institutions can deploy their own Attestation.sol with different schemas —
 * this component would be extended or replaced to render their custom fields.
 */
export function AttestationDisclosure({
  attestation,
}: AttestationDisclosureProps) {
  const breakdown = parseJsonField(attestation.portfolioBreakdown);
  const yields = parseJsonField(attestation.yieldHistory);
  const hasDisclosure = breakdown !== null || yields !== null;

  if (!hasDisclosure) return null;

  return (
    <div className="space-y-4">
      {breakdown !== null && (
        <PortfolioBreakdownView data={breakdown} />
      )}
      {yields !== null && (
        <YieldTimeline data={yields} />
      )}
    </div>
  );
}

function parseJsonField(raw: string): unknown | null {
  if (!raw || raw === "" || raw === "{}") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
