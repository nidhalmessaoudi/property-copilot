import { NextResponse } from "next/server";
import { z } from "zod";
import { runCopilot } from "@/lib/ai";

const requestSchema = z.object({ message: z.string().trim().min(1, "A message is required").max(4000, "Message is too long") });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  try {
    const result = await runCopilot(parsed.data.message);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Copilot route error", error);
    return NextResponse.json({ error: "Unable to process your request" }, { status: 500 });
  }
}
