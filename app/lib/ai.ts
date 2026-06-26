console.log("[ai.ts] loaded version 2026-04-22-1");
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
  nuance: string;
  summary: string;
  insight: string;
};

type WeeklyJournalInput = {
  emotion?: string;
  trigger?: string;
  transcript?: string;
  nuance?: string;
  created_at?: string;
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

function sanitizeNuance(value: unknown): string {
  const text = sanitizeText(value);
  return text.slice(0, 40);
}

function sanitizeSummary(value: unknown): string {
  const text = sanitizeText(value);
  return text.slice(0, 200);
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
  return {
    emotion: "穏やか",
    trigger: "その他",
    message: "",
    nuance: "",
    summary: "",
    insight: "",
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

  if (!safeTranscript) {
    return fallbackEmotionAnalysis();
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `あなたは感情・思考の整理を支援するAPIです。
出力は必ずJSONオブジェクトのみ。前置き・説明・マークダウン・コードブロックは禁止。

返却形式:
{"emotion":"...","trigger":"...","nuance":"...","summary":"...","insight":"..."}

# emotion（内部集計用・UIには表示しない）
次のいずれか1つ:
"嬉しい","悲しい","怒り","不安","穏やか","疲れ"
- 厳密に断定しなくていい
- 判断しにくい場合は"穏やか"

# trigger（内部集計用）
次のいずれか1つ:
"人間関係","仕事","体調","睡眠","家族","お金","自分自身","その他"
- transcript全体の中心テーマを1つ選ぶ

# nuance（最重要・タイトルとしてユーザーに見せる）
- 8〜20文字
- その日・その瞬間に「何があったか」が一目でわかる
- 具体的な状況・人物・出来事を含める
- 感情ラベルを使わない
- 言い切り表現（「〜な感じ」「〜かな」「〜について」禁止）
- 話した内容を、その言い回しに近い形で素直に・端的に言い切る（述語で終える）
- 元の発話に無い抽象名詞（「感覚」「気持ち」「感じ」など）を足さない
- 言葉を不要に付け足さない

良い例:
"お腹がすいた"
"仕事が頭から離れず眠れない"
"夫に言いたいことが言えなかった"
"上司に怒られて落ち込んだ"

悪い例:
"お腹がすいた感覚" → 元の発話に無い「感覚」を足している（NG）
"眠れない夜" → 体言止めで状況をぼかしている
"不安が強い日" → 感情ラベル
"夫婦関係について" → 「について」禁止
"なんとなく疲れた" → 具体性なし

# summary（内部保存用・現在UIには表示しない）
以下の2点を含む2〜3文：
① 出来事（何があったか・具体的に）
② 感情（どう感じたか・文章で表現）
ルール:
- 共感・励まし・アドバイス・解決提案は禁止
- 感情ラベルを単独で使わない
- 80〜150文字以内

# insight（内部保存用・現在UIには表示しない）
- 1文・30〜60文字
- ユーザーが自分では気づいていない可能性のある視点を1つ
- 「〜かもしれない」「〜という傾向がある」のトーン
- 共感・励まし・アドバイスは禁止

必ずこの5つのキーを含めて返してください:
emotion, trigger, nuance, summary, insight`,
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
    const nuance = sanitizeNuance(parsed.nuance);
    const summary = sanitizeSummary(parsed.summary);
    const insight = sanitizeText(parsed.insight).slice(0, 100);

    return { emotion, trigger, message: "", nuance, summary, insight };
  } catch (error) {
    console.error("[analyzeEmotion] ERROR:", error);
    return fallbackEmotionAnalysis();
  }
}

// 振り返りに含めない重いキーワード
const sensitiveKeywords = [
  "詐欺", "DV", "暴力", "虐待", "死んだ", "死にたい", "自殺", "殺",
  "レイプ", "性的", "行方不明", "誘拐", "失踪", "事故死", "突然死",
];

export async function generateWeeklySummary(
  journals: WeeklyJournalInput[],
  period: number
): Promise<string | null> {
  console.log("[generateWeeklySummary] start");

  if (!journals.length) return null;

  const normalized = journals
    .map((journal) => {
      const trigger = sanitizeTrigger(journal.trigger);
      const nuance = sanitizeText(journal.nuance).slice(0, 40);
      const transcript = sanitizeText(journal.transcript).slice(0, 200);
      const created_at = sanitizeText(journal.created_at);
      return { trigger, nuance, transcript, created_at };
    })
    .filter((journal) => {
      if (!journal.nuance && !journal.transcript) return false;
      const text = journal.transcript + journal.nuance;
      return !sensitiveKeywords.some((kw) => text.includes(kw));
    })
    .slice(0, 20);

  if (!normalized.length) return null;

  const lines = `対象期間：直近${period}日間\n\n` + normalized
    .map((journal, index) => {
      const date = journal.created_at
        ? new Date(journal.created_at).toLocaleDateString("ja-JP", { month: "long", day: "numeric" })
        : "";
      const parts: string[] = [`${index + 1}. ${date} テーマ:${journal.trigger}`];
      if (journal.nuance) parts.push(`タイトル:${journal.nuance}`);
      if (journal.transcript) parts.push(`内容:${journal.transcript}`);
      return parts.join(" / ");
    })
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `あなたはユーザーの記録を静かに読み返すナレーターです。

# 役割
この期間の感情の流れを、物語のように描写する。
事実の羅列ではなく、その人がどう感じていたかを中心に書く。
解釈・分析・気づきの押しつけはしない。
余白を残して終わる。

# 出力構成（3〜4文）

① 時期＋その頃の感情・状況
- 具体的な時期と、その頃どんな気持ちが続いていたかを書く
- 感情を中心に：「〜が重かった」「〜で頭がいっぱいだった」「〜が胸に残っていた」

② 具体的なエピソードの断片
- 実際にあった場面・出来事を感情と一緒に描写する
- 体調の場合は症状レベルで具体的に：「頭痛が続いていた」「眠れない夜が重なっていた」「体が重い日が続いていた」
- 解決・前向きな変化があれば優先して描写する：「〜できた」「少し楽になった」「言葉が出てくるようになった」

③ 繰り返しや変化の観察
- 同じ感情・場面が繰り返されていたか、または変化があったかを描写する
- 「また同じ場面が来た」「少しずつ変わっていった」のように

④ 余白（結論を出さずに終わる）
- 問いかけなし・分析なし・励ましなし
- 描写で終わる。読んだ人が自分で感じられる空白を残す

# 禁止
- 「〜かもしれない」「〜傾向がある」「〜パターンがある」などの分析表現
- 問いかけ
- 励まし・共感・アドバイス
- 「考えることが増えていた」だけで終わる抽象表現
- 感情ラベルの羅列（「不安が多かった」だけではNG）
- 敬語・丁寧語
- 「前半」「後半」
- 冒頭に「最近の記録」「振り返ると」などの定型句

# 時期の表現
- 7日：「今週〜」
- 30日：「○月〜」
- 90日：「○月上旬ごろ〜」

# 良い例
"3月下旬は、夫とのやりとりが頭から離れない日が続いていた。会話の中で言葉が止まる瞬間が何度かあって、そのたびに胸に何かが残った。話し合いを重ねるうちに、少しずつ言葉が出てくるようになっていった。似たような夜が、それでも繰り返されていた。"

# 悪い例
"夫婦関係への不安が常に影を落としているかもしれない。" → 分析
"体調や気分について考えることが続いていた。" → 抽象すぎ・感情がない
"頑張っていますね。" → 励まし`,
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