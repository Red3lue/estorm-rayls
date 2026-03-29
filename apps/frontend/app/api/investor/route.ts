import { NextResponse } from "next/server";
import { fetchInvestorData } from "@/lib/investor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchInvestorData();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch investor data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
