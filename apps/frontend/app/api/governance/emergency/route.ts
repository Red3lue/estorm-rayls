import { NextResponse } from "next/server";
import { emergencyStop, resumeOperations } from "@/lib/governance";

export async function POST(request: Request) {
  try {
    const { action } = (await request.json()) as { action: "stop" | "resume" };
    const result =
      action === "stop" ? await emergencyStop() : await resumeOperations();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Emergency action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
