console.log("[ai.ts] loaded version 2026-03-26-1400");
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const allowedTriggers = [
  "人間関係",
  "仕事",
  "体調",
  "睡眠",
  "家族",
  "お金",
  "自分自身",
  "その他",
] as const;

const allowedEmotions = [
  "嬉しい",
  "悲しい",
  "怒り",
  "不安",
  "穏やか",
  "疲れ",
] as const;

type Trigger = (typeof allowedTriggers)[number];
type Emotion = (typeof allowedEmotions)[number];

export type EmotionAnalysis = {
  emotion: Emotion;
  trigger: Trigger;
  message: string;
  emoji: string;
  nuance: string;
  summary: string;
};

type WeeklyJournalInput = {
  emotion?: string;
  trigger?: string;
  transcript?: string;
  nuance?: string;
};

const emotionMap: Record<Emotion, string> = {
  嬉しい: "😊",
  悲しい: "😢",
  怒り: "😠",
  不安: "😟",
  穏やか: "😌",
  疲れ: "😴",
};

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeEmotion(value: unknown): Emotion {
  return allowedEmotions.includes(value as Emotion)
    ? (value as Emotion)
    : "穏やか";
}

function sanitizeTrigger(value: unknown): Trigger {
  return allowedTriggers.includes(value as Trigger)
    ? (value as Trigger)
    : "その他";
}

function sanitizeMessage(value: unknown): string {
  const fallback = "話してくれてありがとう";
  const text = sanitizeText(value);
  if (!text) return fallback;
  return text.slice(0, 32);
}

function sanitizeNuance(value: unknown): string {
  const fallback = "少し言葉にしながら整理している感じ";
  const text = sanitizeText(value);
  if (!text) return fallback;
  return text.slice(0, 40);
}

function sanitizeSummary(value: unknown): string {
  const fallback = "";
  const text = sanitizeText(value);
  if (!text) return fallback;
  return text.slice(0, 100);
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }
}

function fallbackEmotionAnalysis(): EmotionAnalysis {
  const emotion: Emotion = "穏やか";
  return {
    emotion,
    trigger: "その他",
    message: "話してくれてありがとう",
    emoji: emotionMap[emotion],
    nuance: "少し言葉にしながら整理している感じ",
    summary: "",
  };
}

export async function transcribeAudio(file: File): Promise<string> {
  console.log("[transcribeAudio] start");
  try {
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ja",
    });
    const text = transcription.text.trim();
    console.log("[transcribeAudio] success:", text);
    return text;
  } catch (error) {
    console.error("[transcribeAudio] ERROR:", error);
    throw error;
  }
}

export async function analyzeEmotion(
  transcript: string
): Promise<EmotionAnalysis> {
  console.log("[analyzeEmotion] start");

  const safeTranscript = transcript.trim();
  console.log("[analyzeEmotion] transcript:", safeTranscript);

  if (!safeTranscript) {
    console.log("[analyzeEmotion] empty transcript -> fallback");
    return {
      emotion: "穏やか",
      trigger: "その他",
      message: "話してくれてありがとう",
      emoji: emotionMap["穏やか"],
      nuance: "まだうまく言葉にならない感じ",
      summary: "",
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `あなたは感情整理アプリの分析APIです。
出力は必ずJSONオブジェクトのみ。前置き・説明・マークダウン・コードブロックは禁止。

返却形式:
{"emotion":"...","nuance":"...","message":"...","trigger":"...","summary":"..."}

emotion は次のいずれか1つ（内部集計用・基本的にユーザーには見せない）:
"嬉しい","悲しい","怒り","不安","穏やか","疲れ"

emotion のルール:
- これはユーザー表示用ではなく、内部集計用です
- 感情を厳密に断定する必要はありません
- 複雑で判断しにくい場合は "穏やか" に逃がして構いません
- ただし transcript 全体の雰囲気に明らかな特徴がある場合は近いものを選んでください

nuance（ユーザーに見せる気持ちの言葉）:
- 20〜40文字
- 感情を断定・分類しない
- 話した内容のニュアンスをやわらかく映し返す
- 「〜な気持ち」「〜な感じ」「〜かな」など、やさしい表現にする
- 複数の感情が混ざっている場合は、その混ざり方をそのまま表現する
- ラベルっぽくしない

良い例:
"少し疲れながらも、気持ちを整理したい感じ"
"家族のことがずっと心に引っかかっている感じ"
"ほっとした部分もあるけど、まだ複雑な気持ちかな"
"自分のことを責めながらも、整理したい気持ち"

悪い例:
"穏やかな気持ち"
"不安を感じています"
"怒りがあります"

summary（話した内容の要約）:
- 1〜2文、50文字以内
- 話した内容を客観的に短くまとめる
- 「〜について話した」「〜と感じていた」のような形で
- 感情の解釈ではなく、何を話したかの事実ベースで
- ユーザーが「あ、これで合ってる」と確認できる内容に

良い例:
"今日たくさん寝れて元気だと話した"
"夫との関係について悩んでいると話した"
"仕事がうまくいかない日が続いていると話した"

trigger は次のいずれか1つ:
"人間関係","仕事","体調","睡眠","家族","お金","自分自身","その他"

trigger のルール:
- 文全体を見て、最も中心的なテーマを1つだけ選ぶ
- 複数候補がある場合は、その記録の中心にあったものを優先する

message の条件:
- 12〜32文字
- 決めつけない
- アドバイスしない
- 命令しない
- 励ましすぎない
- 評価しない
- 敬語・丁寧語は禁止（「〜ですね」「〜ました」「〜です」は使わない）
- 他人行儀な表現は禁止（「〜でよかったね」「〜ですね」「〜でしたね」は使わない）
- そっと隣にいるような、一緒にいる感覚で書く
- 語尾は「〜だね」「〜かな」「〜だよ」「〜たんだね」のような自然な話し言葉にする
- transcript の内容に寄り添った言葉にする（内容と無関係な一般的な言葉にしない）
- ユーザーが言った言葉をそのまま繰り返さない
- 話した内容の「裏にある気持ち」や「言葉にならなかった部分」を返す
- 「あ、そこまで見てくれたんだ」と感じさせる一言にする

良い例:
"まだ心に残ってることがあるんだね"
"しんどかったんだね、よく話してくれた"
"少しずつでいいんだよ"
"結果より、自分が本気だったことが問われる気がするのかな"
"怖いって思えるのは、それだけ向き合ってきたからだよ"
"うまくいってほしいって気持ちが強いんだね"


禁止例:
"元気でよかったね" → 他人行儀、距離感がある
"素敵な気持ちですね" → 敬語、距離感がある
"しっかり休めて良かったです" → 敬語
"前向きに頑張りましょう" → 命令・アドバイス
- ユーザーが言ったフレーズをそのまま使わない
例：「結果を見るのが不安なんだね」→NG（言ったことの繰り返し）

必ずこの5つのキーを含めて返してください:
emotion, trigger, message, nuance, summary`,
        },
        {
          role: "user",
          content: safeTranscript,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    console.log("[analyzeEmotion] raw response:", raw);

    const parsed = safeJsonParse(raw);
    console.log("[analyzeEmotion] parsed:", parsed);

    const emotion = sanitizeEmotion(parsed.emotion);
    const trigger = sanitizeTrigger(parsed.trigger);
    const message = sanitizeMessage(parsed.message);
    const nuance = sanitizeNuance(parsed.nuance);
    const summary = sanitizeSummary(parsed.summary);

    return { emotion, trigger, message, emoji: emotionMap[emotion], nuance, summary };
  } catch (error) {
    console.error("[analyzeEmotion] ERROR:", error);
    return fallbackEmotionAnalysis();
  }
}

export async function generateWeeklySummary(
  journals: WeeklyJournalInput[],
  period: number
): Promise<string | null> {
  console.log("[generateWeeklySummary] start");

  if (!journals.length) return null;

  const normalized = journals
    .map((journal) => {
      const trigger = sanitizeTrigger(journal.trigger);
      const nuance = sanitizeText(journal.nuance).slice(0, 60);
      const transcript = sanitizeText(journal.transcript).slice(0, 100);
      return { trigger, nuance, transcript };
    })
    .filter((journal) => journal.nuance || journal.transcript)
    .slice(0, 20);

  if (!normalized.length) return null;

  const lines = normalized
    .map((journal, index) => {
      const parts: string[] = [`${index + 1}. テーマ:${journal.trigger}`];
      if (journal.nuance) parts.push(`ニュアンス:${journal.nuance}`);
      if (journal.transcript) parts.push(`内容:${journal.transcript}`);
      return parts.join(" / ");
    })
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  temperature: 0.6,
  max_tokens: 180,
  messages: [
    {
      role: "system",
      content: `あなたは、ユーザーの感情記録を深く読み解くナレーターです。
ユーザーの直近${period}日間の記録をもとに、ふりかえり文を1つ生成してください。

目的:
- ユーザー自身が気づいていない感情のパターン・繰り返している思考・矛盾を見つける
- 「自分ってそうだったのか」と静かに気づける一文にする
- 表面的な感情の羅列ではなく、「なぜその状態が続いていたか」まで一歩踏み込む
- ユーザーの心の「流れ」と「波」を時系列で捉える
- 前半と後半でコントラストがある場合は必ずそこに言及する
- 波の大きさも反映する（激しく揺れていたのか、穏やかな変化だったのか）

出力条件:
- 60〜80文字
- テキストのみ
- 感情ラベルをそのまま並べない
- 一般論・アドバイス・命令・評価は禁止
- 敬語・丁寧語は禁止
- ユーザーの具体的な傾向に言及すること（抽象的な総括にしない）
- 本質を突くニュアンス（傷つけないが、ドキッとするレベル）
- 語尾は「〜だったのかな」「〜だったのかもね」「〜してたのかもしれない」など
- 話した内容の事実だけでなく、「なぜそう感じていたか」まで一歩踏み込む
- ユーザーが「あ、そういうことだったのか」と気づける要約にする

良い例:
- 穏やかに見えた日も、誰かの言葉をずっと引きずってたのかもしれない
- 自分を後回しにしながら、それでも整理しようとしてた1ヶ月だったのかな
- しんどいと言えない日ほど、記録することで吐き出してたのかもしれない
- 前半は消耗してたけど、後半は少し自分のペースを取り戻せてたのかもしれない
- 体調の波がそのまま気持ちの波になってた期間だったのかな

悪い例:
- 心穏やかに過ごせた日々の中で、少しのイライラや感謝が交じっていたみたい
- 不安と疲れが多い1ヶ月でした
- 前向きに過ごせていたようです`,
    },
    {
      role: "user",
      content: lines,
    },
  ],
});

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    return summary || null;
  } catch (error) {
    console.error("[generateWeeklySummary] ERROR:", error);
    return null;
  }
}