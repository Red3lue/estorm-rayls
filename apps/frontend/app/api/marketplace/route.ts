import { NextResponse } from "next/server";
import { fetchMarketplaceData } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchMarketplaceData();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch marketplace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
