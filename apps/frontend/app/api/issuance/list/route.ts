import { NextResponse } from "next/server";
import { listToken } from "@/lib/issuance";

export async function POST(request: Request) {
  try {
    const params = (await request.json()) as {
      tokenAddress: string;
      assetType: number;
      tokenId: number;
      amount: number;
      price: number;
    };
    const result = await listToken(params);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
