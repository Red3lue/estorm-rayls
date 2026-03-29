import { NextResponse } from "next/server";
import { setCategoryPermission } from "@/lib/governance";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      category?: unknown;
      allowed?: unknown;
    };

    const category = Number(payload.category);
    if (!Number.isInteger(category) || category < 0 || category > 255) {
      return NextResponse.json(
        { error: "Invalid category; expected an integer between 0 and 255" },
        { status: 400 },
      );
    }

    if (typeof payload.allowed !== "boolean") {
      return NextResponse.json(
        { error: "Invalid allowed flag; expected boolean" },
        { status: 400 },
      );
    }

    const result = await setCategoryPermission(category, payload.allowed);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to set category permission";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
