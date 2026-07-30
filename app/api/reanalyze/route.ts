import { NextRequest, NextResponse } from "next/server";
import { analyzeEmotion } from "../../lib/ai";
import { getSessionUserId } from "../../lib/supabase-server";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    // ログイン必須。未ログインの要求はここで弾く（OpenAIを呼ばせない）。
    if (!(await getSessionUserId())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      // signals は analyzeEmotion 内で sanitizeSignals 済み（indirect は 0.4 にクランプ）。
      // 対話セッションの finalize でそのまま journals.signals に保存する。
      signals: result.signals,
      message: "",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}