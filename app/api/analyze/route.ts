import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const emojiMap: Record<string, string> = {
  嬉しい: "😊",
  悲しい: "😢",
  怒り: "😠",
  不安: "😟",
  穏やか: "😌",
  疲れ: "😴",
};

const allowedEmotions = ["嬉しい", "悲しい", "怒り", "不安", "穏やか", "疲れ"];
const allowedTriggers = ["人間関係", "仕事", "体調", "睡眠", "家族", "お金", "自分自身", "その他"];

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

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "ja",
    });

    const transcript = transcription.text;
    console.log("transcript:", transcript);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたは感情整理アプリの分析APIです。
出力は必ずJSONオブジェクトのみ。前置き・説明・マークダウン・コードブロックは禁止。

返却形式:
{"emotion":"...","message":"...","trigger":"..."}

emotion は次のいずれか1つ:
"嬉しい","悲しい","怒り","不安","穏やか","疲れ"

判定基準:
しんどい/疲れた → 疲れ
悲しい/寂しい → 悲しい
イライラ/怒った → 怒り
心配/不安 → 不安
嬉しい/よかった → 嬉しい
穏やか/落ち着いた → 穏やか

trigger は次のいずれか1つ（文全体を見て最も中心的な原因を1つだけ選ぶ）:
"人間関係","仕事","体調","睡眠","家族","お金","自分自身","その他"

判定基準:
人や関係性の話 → 人間関係
職場/勉強/タスクの話 → 仕事
体の疲れ/病気/頭痛 → 体調
眠れない/寝すぎ → 睡眠
家族/パートナーの話 → 家族
お金/費用の話 → お金
自分の気持ち/将来/自己嫌悪 → 自分自身
それ以外 → その他

複数当てはまる場合は感情の直接原因を優先する。
例: 家族のことで眠れない → 家族 / 仕事が忙しくて疲れた → 仕事 / 将来が不安で眠れない → 自分自身

message の条件:
- 20文字以内
- 決めつけない
- アドバイスしない
- 命令しない
- 励ましすぎない
- 評価しない
- やさしく受け止める一言のみ

良い例: "話してくれてありがとう" / "少し疲れてたのかな" / "大変だったかもしれないね"
悪い例: "もっと休んでください" / "前向きに考えましょう" / "頑張ってね"`
        },
        { role: "user", content: transcript },
      ],
    });

    const raw = completion.choices[0].message.content || "{}";
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      console.error("parse error:", raw);
    }

    const emotion = allowedEmotions.includes(parsed.emotion) ? parsed.emotion : "穏やか";
    const trigger = allowedTriggers.includes(parsed.trigger) ? parsed.trigger : "その他";
    const message = parsed.message || "話してくれてありがとう";
    const emoji = emojiMap[emotion];

    return NextResponse.json({ transcript, emotion, emoji, message, trigger });
  } catch (e: any) {
    console.error("API error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}