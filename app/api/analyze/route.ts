import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, analyzeEmotion } from "../../lib/ai";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File;
    if (!audio) return NextResponse.json({ error: "No audio" }, { status: 400 });

    console.log("audio type:", audio.type, "size:", audio.size);

    const audioBuffer = await audio.arrayBuffer();
    const originalType = audio.type || "audio/mp4";
    const ext = originalType.includes("mp4") || originalType.includes("m4a") ? "m4a" : "webm";
    const audioFile = new File([audioBuffer], `recording.${ext}`, { type: originalType });

    const transcript = await transcribeAudio(audioFile);
    console.log("transcript:", transcript);

    const { emotion, trigger, message, emoji, nuance } = await analyzeEmotion(transcript);

    return NextResponse.json({ transcript, emotion, emoji, message, trigger, nuance });
  } catch (e: any) {
    console.error("API error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}