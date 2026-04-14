console.log("[ai.ts] loaded version 2026-04-13-1300");
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
  return text.slice(0, 60);
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
      temperature: 0.3,
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

# nuance（ユーザーに見せる・タイトル的な役割）
- 10〜25文字
- その記録の「核心」を一言で言い切る
- 言い切り表現（「〜な感じ」「〜かな」は禁止）
- 感情ラベルを使わない
- 名詞または短文で表現する

良い例:
"思い通りにいかない苛立ち"
"伝わらないもどかしさ"
"夫婦関係の出口が見えない感覚"
"仕事の重さが積み重なった日"

# summary（ユーザーに見せる・メイン）
以下の2点を含む2〜3文：

① 出来事（何があったか・具体的に）
② 感情（どう感じたか・文章で表現）

ルール:
- 共感・励まし・アドバイス・解決提案は禁止
- 感情ラベルを単独で使わない
- 80〜150文字以内

# insight（ユーザーに見せる・気づき）
- 1文・30〜60文字
- ユーザーが自分では気づいていない可能性のある視点を1つ
- 「あ、そういうことか」と静かにハッとさせる内容
- 断定しすぎず、でも曖昧すぎない
- 「〜かもしれない」「〜という傾向がある」のトーン
- 共感・励まし・アドバイスは禁止
- 感情ラベルを使わない

良い例:
"うまくやろうとするほど、自分を追い込んでいる傾向があるかもしれない"
"相手への期待より、自分への失望が積み重なっているのかもしれない"
"言葉にしようとするたびに、感情より先に理由を探してしまうのかもしれない"
"解決したいというより、ただ聞いてほしかっただけなのかもしれない"

悪い例:
"頑張っているね" → 励まし
"不安が強い" → 感情ラベル
"少し休んでみては" → アドバイス
"つらかったんだね" → 共感

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
      const transcript = sanitizeText(journal.transcript).slice(0, 200);
      const created_at = sanitizeText(journal.created_at);
      return { trigger, nuance, transcript, created_at };
    })
    .filter((journal) => journal.nuance || journal.transcript)
    .slice(0, 20);

  if (!normalized.length) return null;

  const lines = `対象期間：直近${period}日間\n\n` + normalized
    .map((journal, index) => {
      const date = journal.created_at
        ? new Date(journal.created_at).toLocaleDateString("ja-JP", { month: "long", day: "numeric" })
        : "";
      const parts: string[] = [`${index + 1}. ${date} テーマ:${journal.trigger}`];
      if (journal.nuance) parts.push(`核心:${journal.nuance}`);
      if (journal.transcript) parts.push(`内容:${journal.transcript}`);
      return parts.join(" / ");
    })
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content: `あなたはユーザーの記録を分析し、パターンと気づきを抽出するナレーターです。

# 必須要素（必ず3点すべて含める）

① 感情・テーマの傾向
- この期間に何が多かったか
- 具体的なテーマ名を使う（人間関係・体調・仕事など）

② 繰り返しパターン
- 同じ状況・感情・反応が繰り返されているか
- 状況は違っても反応が同じ場合も含める

③ 一言の気づき（最重要）
- ユーザーが「ハッとする」内容
- 短く・明確に・断言する
- 「〜という傾向がある」「〜かもしれない」のトーン

# 禁止事項
- 共感・励まし・アドバイス・解決提案
- 感情ラベルの羅列（「不安が多い」だけではNG）
- 薄いまとめ（「様々な感情があった」など）
- 敬語・丁寧語
- 「前半」「後半」という表現
- 冒頭に「最近の記録」「振り返ると」などの定型句

# 出力形式
- 3〜4文
- 1文あたり25〜40文字
- 冒頭から具体的な時期（○月上旬など）または具体的なテーマで始める
- 7日の場合は「今週○曜日ごろ」など
- 30日・90日は「○月○旬ごろ」で表現

# 良い例
"4月上旬は夫婦間のすれ違いが中心で、言葉が出てこない場面が繰り返されていた。体調が悪い日に感情が溢れやすいパターンがある。自分の限界を超えてから声に出す傾向があるのかもしれない。"

# 悪い例
"不安や疲れが多い1ヶ月でした。頑張っていますね。"`,
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