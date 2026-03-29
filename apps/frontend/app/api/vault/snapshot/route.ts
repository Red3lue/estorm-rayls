import { NextResponse } from "next/server";
import { fetchVaultSnapshot } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchVaultSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch vault snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
