import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "../../lib/ai";
import { getSessionUserId } from "../../lib/supabase-server";

export const maxDuration = 30;

// 音声 → テキストのみ。対話ループの各ターン（声で答える）用。
export async function POST(request: NextRequest) {
  try {
    // ログイン必須。未ログインの要求はここで弾く（OpenAIを呼ばせない）。
    if (!(await getSessionUserId())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: "No audio" }, { status: 400 });
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
    return NextResponse.json({ transcript });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json({ error: message, transcript: "" }, { status: 500 });
  }
}
