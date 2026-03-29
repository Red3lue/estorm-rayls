import { NextResponse } from "next/server";
import { fetchAttestations } from "@/lib/attestations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = await fetchAttestations();
    return NextResponse.json({ records });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch attestations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
