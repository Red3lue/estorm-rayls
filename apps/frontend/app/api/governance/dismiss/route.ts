import { NextResponse } from "next/server";
import { dismissProposal } from "@/lib/governance";

export async function POST(request: Request) {
  try {
    const { proposalId } = (await request.json()) as { proposalId: number };
    const result = await dismissProposal(proposalId);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to dismiss proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
