console.log("[ai.ts] loaded version 2026-04-20-1");
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
- 体言止めまたは短文

良い例:
"息子の誕生日前日の迷い"
"夫に言えなかったこと"
"仕事を断れなかった夜"
"ひとりで抱えすぎた週末"
"上司に怒られた帰り道"
"久しぶりに泣いた夜"

悪い例:
"思い通りにいかない苛立ち" → 状況が見えない
"伝わらないもどかしさ" → 抽象的すぎる
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
    .filter((journal) => journal.nuance || journal.transcript)
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
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `あなたはユーザーの記録を静かに読み返すナレーターです。

# 役割
この期間に何があったかを、事実として淡々と描写する。
解釈・意味付け・気づきの提示は一切しない。
ユーザーが自分で気づけるよう、手前で止める。

# 出力内容（2点のみ）

① この期間に多かったテーマ・状況
- 具体的なテーマ・人物・状況を使う
- 「〜についての記録が多かった」「〜が続いていた」「〜について考えることが増えていた」で表現

② 繰り返し見られた状況や流れ
- 同じ状況・場面が繰り返されていたか
- 「〜が繰り返されていた」「〜が重なっていた」で表現

# 禁止
- 解釈・意味付け・分析
- 「〜かもしれない」「〜傾向がある」「〜パターンがある」などの分析表現
- 共感・励まし・アドバイス・問いかけ
- 感情ラベルの羅列
- 敬語・丁寧語
- 「前半」「後半」という表現
- 冒頭に「最近の記録」「振り返ると」などの定型句

# 出力形式
- 2〜3文
- 1文あたり20〜35文字
- 冒頭から具体的な時期またはテーマで始める
- 7日：「今週〜」、30日：「○月〜」、90日：「○月上旬ごろ〜」

# 良い例
"4月は夫婦のことについて話すことが多かった。子どもの体調のことが続いていた。"

# 悪い例
"夫婦関係への不安が常に影を落としているかもしれない。" → 分析・解釈
"自分の感情を言葉にする習慣が身についてきている。" → 意味付け
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