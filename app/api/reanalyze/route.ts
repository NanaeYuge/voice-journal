import { NextRequest, NextResponse } from "next/server";
import { analyzeEmotion } from "../../lib/ai";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();
    if (!transcript) {
      return NextResponse.json({ error: "No transcript" }, { status: 400 });
    }
    const result = await analyzeEmotion(transcript);
    return NextResponse.json({
      emotion: result.emotion,
      nuance: result.nuance,
      summary: result.summary,
      insight: result.insight,
      trigger: result.trigger,
      message: "",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}