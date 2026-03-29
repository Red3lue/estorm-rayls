"use client";

import { useAttestations } from "@/lib/use-attestations";
import { DecisionLog } from "@/components/decision-log";

export default function DecisionsPage() {
  const { records, loading, error } = useAttestations();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <DecisionLog records={records} loading={loading} error={error} />
    </main>
  );
}
