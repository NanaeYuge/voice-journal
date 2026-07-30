import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, analyzeEmotion } from "../../lib/ai";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!audio) {
      return NextResponse.json({ error: "No audio" }, { status: 400 });
    }

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Invalid audio file" }, { status: 400 });
    }

    const audioBuffer = await audio.arrayBuffer();
    const originalType = audio.type || "audio/mp4";
    const ext =
      originalType.includes("mp4") || originalType.includes("m4a")
        ? "m4a"
        : "webm";

    const audioFile = new File([audioBuffer], `recording.${ext}`, {
      type: originalType,
    });

    const transcript = await transcribeAudio(audioFile);
    const result = await analyzeEmotion(transcript);

    return NextResponse.json({
      transcript,
      emotion: result.emotion,
      trigger: result.trigger,
      nuance: result.nuance,
      summary: result.summary,
      insight: result.insight,
      signals: result.signals,
      message: "",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json(
      {
        error: message,
        transcript: "",
        emotion: "穏やか",
        trigger: "その他",
        nuance: "",
        summary: "",
        insight: "",
        signals: null,
        message: "",
      },
      { status: 500 }
    );
  }
}