import { NextResponse } from "next/server";
import { buyListing } from "@/lib/marketplace";

export async function POST(request: Request) {
  try {
    const { listingId, price } = (await request.json()) as {
      listingId: number;
      price: number;
    };
    const result = await buyListing(listingId, price);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Purchase failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
