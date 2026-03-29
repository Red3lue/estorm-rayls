import { NextResponse } from "next/server";
import { fetchGovernanceSnapshot } from "@/lib/governance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchGovernanceSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch governance data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
