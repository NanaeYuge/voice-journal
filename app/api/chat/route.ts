import { NextRequest, NextResponse } from "next/server";
import { continueReflection, type ReflectionTurn } from "../../lib/ai";

export const maxDuration = 30;

// 会話履歴（発話者つき）を受け取り、YORUの次の返答＋状態を返す。
// LLMは状態を持たないので、messages全体が文脈の役割を担う。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

    const messages: ReflectionTurn[] = rawMessages
      .map((m: unknown) => {
        const o = (m ?? {}) as Record<string, unknown>;
        const role = o.role === "yoru" ? "yoru" : "user";
        const content = typeof o.content === "string" ? o.content : "";
        return { role, content } as ReflectionTurn;
      })
      .filter((m: ReflectionTurn) => m.content.trim().length > 0);

    const result = await continueReflection(messages);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json(
      {
        error: message,
        reply: "うまく言葉を返せなかったみたい。でも、話してくれたことはちゃんとここにあるよ。",
        state: "close",
        crisis: false,
      },
      { status: 500 }
    );
  }
}
