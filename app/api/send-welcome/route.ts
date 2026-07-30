import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

// Resend と同じ理由で、生成はモジュール読み込み時ではなく呼ばれた時まで遅らせる。
// モジュール先頭で作ると、環境変数が注入されないビルド時の評価
// （next build の "Collecting page data"）で throw し、ビルドごと落ちる。
let supabaseClient: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabaseClient;
}

// このルートだけは getUser() で守れない。呼ばれるのは signUp() の直後
// （app/login/page.tsx）で、メール確認方式のためセッションがまだ存在しない。
// ブラウザから呼ばれるので共有シークレットも使えない（バンドルに載る）。
//
// 代わりに二段で絞る:
//   1. 宛先は受け取らない。userId から auth.users を引き、登録済みの本人の
//      アドレスにだけ送る（任意のアドレスへ送るための踏み台にならない）。
//   2. email_logs に type='welcome' の行があれば送らない（重複送信の防止）。
//      リマインドの重複判定は type='reminder' で絞っているので干渉しない。
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "No userId" }, { status: 400 });
    }

    // 実在するユーザーか確認し、宛先はDB側の値を使う（クライアントの申告は信じない）
    const { data: userData } = await getSupabase().auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Unknown user" }, { status: 404 });
    }

    // すでに送っていれば何もしない
    const { data: alreadySent } = await getSupabase()
      .from("email_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "welcome")
      .limit(1);

    if (alreadySent && alreadySent.length > 0) {
      return NextResponse.json({ success: true, skipped: true });
    }

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

    // 送信済みを記録する（次回以降は上の重複チェックで止まる）。
    // target_date は日次のリマインド用の列なので welcome では入れない。
    await getSupabase().from("email_logs").insert({ user_id: userId, type: "welcome" });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}