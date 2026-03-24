import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, analyzeEmotion } from "../../lib/ai";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  console.log("[/api/analyze] POST start");

  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!audio) {
      console.error("[/api/analyze] audio not found in formData");
      return NextResponse.json({ error: "No audio" }, { status: 400 });
    }

    if (!(audio instanceof File)) {
      console.error("[/api/analyze] audio is not a File:", typeof audio);
      return NextResponse.json({ error: "Invalid audio file" }, { status: 400 });
    }

    console.log("[/api/analyze] audio type:", audio.type);
    console.log("[/api/analyze] audio size:", audio.size);

    const audioBuffer = await audio.arrayBuffer();
    const originalType = audio.type || "audio/mp4";
    const ext =
      originalType.includes("mp4") || originalType.includes("m4a")
        ? "m4a"
        : "webm";

    const audioFile = new File([audioBuffer], `recording.${ext}`, {
      type: originalType,
    });

    console.log("[/api/analyze] before transcribeAudio");
    const transcript = await transcribeAudio(audioFile);
    console.log("[/api/analyze] transcript:", transcript);

    console.log("[/api/analyze] before analyzeEmotion");
    const result = await analyzeEmotion(transcript);
    console.log("[/api/analyze] after analyzeEmotion:", result);

    const responsePayload = {
      __route_version: "2026-03-24-1345",
      transcript,
      emotion: result.emotion,
      emoji: result.emoji,
      message: result.message,
      trigger: result.trigger,
      nuance: result.nuance || "少し言葉にしながら整理している感じ",
    };

    console.log("[/api/analyze] final response payload:", responsePayload);

    return NextResponse.json(responsePayload);
  } catch (e: unknown) {
    console.error("[/api/analyze] ERROR full:", e);

    const message =
      e instanceof Error ? e.message : "Unknown server error";

    console.error("[/api/analyze] ERROR message:", message);

    return NextResponse.json(
      {
        error: message,
        transcript: "",
        emotion: "穏やか",
        emoji: "😌",
        message: "話してくれてありがとう",
        trigger: "その他",
        nuance: "少し言葉にしながら整理している感じ",
      },
      { status: 500 }
    );
  }
}