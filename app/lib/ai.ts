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

// 音声ファイルを文字起こし
export async function transcribeAudio(file: File): Promise<string> {
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ja",
  });
  return transcription.text;
}

// テキストから感情・トリガー・メッセージを解析
export async function analyzeEmotion(transcript: string): Promise<{
  emotion: string;
  trigger: string;
  message: string;
  emoji: string;
}> {
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
家族/パートナー/夫婦/恋人/結婚の話 → 家族
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
悪い例: "もっと休んでください" / "前向きに考えましょう" / "頑張ってね"`,
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

  return { emotion, trigger, message, emoji };
}

// 週次ふりかえりを生成
export async function generateWeeklySummary(
  journals: { emotion: string; trigger?: string; transcript?: string }[],
  period: number
): Promise<string | null> {
  if (journals.length === 0) return null;

  const lines = journals
    .slice(0, 20)
    .map((j) => `・${j.emotion}（${(j as any).emotion_trigger ?? j.trigger ?? "不明"}）: ${j.transcript?.slice(0, 60) ?? ""}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `あなたは感情整理アプリの優しいナレーターです。
ユーザーの${period}日間のきろくをもとに、ふりかえりの一言を生成してください。

条件：
- 60文字以内
- 決めつけない・アドバイスしない・評価しない
- ただ静かに受け止める文体
- 出力はテキストのみ（JSONや記号不要）`,
      },
      { role: "user", content: lines },
    ],
    max_tokens: 120,
  });

  return completion.choices[0].message.content?.trim() ?? null;
}