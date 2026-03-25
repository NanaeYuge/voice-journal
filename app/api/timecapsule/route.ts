import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたはYORUというアプリのAIです。
ユーザーの過去の日記の一部を読んで、今のユーザーに向けた短い一言を返してください。
ルール：
- 否定しない、評価しない
- 「頑張ってたんだね」「しんどそうだったね」など、過去の気持ちに寄り添う
- 1〜2文、40文字以内
- 優しく、静かなトーンで`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      max_tokens: 100,
    });

    const message = completion.choices[0].message.content ?? "";
    return NextResponse.json({ message });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg, message: "あの頃のあなた、よく話してくれたね" }, { status: 500 });
  }
}