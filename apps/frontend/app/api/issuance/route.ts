import { NextResponse } from "next/server";
import { fetchIssuanceData } from "@/lib/issuance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchIssuanceData();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch issuance data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
