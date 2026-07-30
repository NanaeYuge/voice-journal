import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// Resend の生成はモジュール読み込み時ではなく、実際に送る直前まで遅らせる。
// モジュール先頭で new すると、環境変数が注入されないビルド時の評価
// （next build の "Collecting page data"）でコンストラクタが投げ、ビルドごと落ちる。
// 生成のタイミングだけを変えたもので、送信の宛先・文面・条件は変えていない。
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

const appUrl = process.env.APP_URL || "https://voice-journal-inky.vercel.app";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

    await getResend().emails.send({
      from: "YORU <hello@yoru-voice.com>",
      to: email,
      subject: "はじめまして。YORUです。",
      html: `
        <div style="background:#0a0e1a;color:#fff;font-family:'Hiragino Kaku Gothic ProN',sans-serif;max-width:480px;margin:0 auto;padding:48px 32px;">
          <p style="font-size:11px;letter-spacing:0.4em;color:rgba(167,139,250,0.6);margin:0 0 32px 0;">YORU</p>
          <h1 style="font-size:18px;font-weight:300;color:rgba(255,255,255,0.85);line-height:1.7;margin:0 0 32px 0;">
            はじめまして。YORUです。
          </h1>
          <p style="font-size:14px;color:rgba(255,255,255,0.55);line-height:2;margin:0 0 32px 0;">
            ここは、誰かの話を評価したり、<br>
            正しさを決める場所ではありません。<br><br>
            うまく話そうとしなくていいし、<br>
            まとまっていなくても大丈夫。<br><br>
            今日のことでも、<br>
            なんとなく頭に残ってることでも、<br>
            そのまま言葉にして、<br>
            ここに置いておける場所です。
          </p>
          <p style="font-size:14px;color:rgba(255,255,255,0.55);line-height:2;margin:0 0 40px 0;">
            もし今夜、少し話せそうだったら<br>
            短くてもいいので残してみてください。
          </p>
          <a href="${appUrl}" style="display:inline-block;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.35);color:rgba(167,139,250,0.9);font-size:13px;letter-spacing:0.1em;padding:14px 28px;border-radius:24px;text-decoration:none;">
            今の気持ちを話す
          </a>
          <p style="font-size:11px;color:rgba(255,255,255,0.15);margin:48px 0 0 0;line-height:1.8;">
            このメールはYORUからお送りしています。<br>
            設定画面からリマインドをオフにできます。
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}