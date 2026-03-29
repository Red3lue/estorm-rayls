import { NextResponse } from "next/server";
import { delistListing } from "@/lib/issuance";

export async function POST(request: Request) {
  try {
    const { listingId } = (await request.json()) as { listingId: number };
    const result = await delistListing(listingId);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
