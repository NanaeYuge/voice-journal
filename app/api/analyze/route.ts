import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File;
    if (!audio) return NextResponse.json({ error: "No audio" }, { status: 400 });

    console.log("audio type:", audio.type, "size:", audio.size);

    const audioBuffer = await audio.arrayBuffer();
    const audioFile = new File([audioBuffer], "recording.m4a", { type: "audio/mp4" });

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
        { role: "system", content: "感情分析してJSONのみ返して。形式:{\"emotion\":\"嬉しい/悲しい/怒り/不安/穏やか/疲れのどれか\",\"emoji\":\"絵文字\",\"message\":\"20文字以内\"}。しんどい/疲れた→疲れ、悲しい→悲しい、イライラ→怒り、心配→不安、嬉しい→嬉しい。マークダウン不要。" },
        { role: "user", content: transcript },
      ],
    });

    const raw = completion.choices[0].message.content || "{}";
    let emotionData = { emotion: "穏やか", emoji: "😌", message: "話してくれてありがとう" };
    try {
      emotionData = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      console.error("parse error:", raw);
    }

    return NextResponse.json({ transcript, ...emotionData });
  } catch (e: any) {
    console.error("API error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}