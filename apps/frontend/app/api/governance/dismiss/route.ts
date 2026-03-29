import { NextResponse } from "next/server";
import { dismissProposal } from "@/lib/governance";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { proposalId?: unknown };
    const proposalId = Number(payload.proposalId);
    if (!Number.isInteger(proposalId) || proposalId <= 0) {
      return NextResponse.json(
        { error: "Invalid proposalId; expected a positive integer" },
        { status: 400 },
      );
    }
    const result = await dismissProposal(proposalId);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to dismiss proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
