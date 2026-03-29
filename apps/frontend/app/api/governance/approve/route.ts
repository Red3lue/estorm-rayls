import { NextResponse } from "next/server";
import { approveProposal } from "@/lib/governance";

export async function POST(request: Request) {
  try {
    const { proposalId } = (await request.json()) as { proposalId: number };
    const result = await approveProposal(proposalId);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to approve proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
