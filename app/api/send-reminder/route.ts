import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);
const appUrl = process.env.APP_URL || "https://voice-journal-inky.vercel.app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Vercel Cron は GET で叩くため、認証を検証したうえで GET/POST の両方から
// 同じ本体(runReminders)を呼ぶ。CRON_SECRET 未設定時は常に拒否する
// （空文字の "Bearer " と一致してしまう事故を防ぐ）。
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  return handleReminder(request);
}

export async function POST(request: NextRequest) {
  return handleReminder(request);
}

async function handleReminder(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await runReminders();
    return NextResponse.json({ success: true, ...results });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runReminders() {
  // 本体は元POSTの実装をそのまま移設（差分最小化のためインデント維持）。
  {
    const today = new Date().toISOString().split("T")[0];

    // reminder_enabledがtrueのユーザーのみ取得
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("reminder_enabled", true);

    if (profilesError) throw profilesError;

    const results = { sent: 0, skipped: 0, failed: 0 };

    for (const profile of profiles || []) {
      try {
        // 二重送信チェック
        const { data: alreadySent } = await supabase
          .from("email_logs")
          .select("id")
          .eq("user_id", profile.id)
          .eq("type", "reminder")
          .eq("target_date", today)
          .single();

        if (alreadySent) {
          results.skipped++;
          continue;
        }

        // ユーザーのメールアドレスを取得
        const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
        const email = userData?.user?.email;
        if (!email) { results.skipped++; continue; }

        // 今日の記録を確認
        const { data: todayJournals } = await supabase
          .from("journals")
          .select("id, nuance")
          .eq("user_id", profile.id)
          .gte("created_at", `${today}T00:00:00`)
          .neq("source", "timecapsule")
          .order("created_at", { ascending: false });

        const hasRecord = (todayJournals?.length ?? 0) > 0;
        const latestNuance = todayJournals?.[0]?.nuance || "";

        // 文言を分岐
        let subject = "";
        let bodyText = "";

        if (!hasRecord) {
          const patterns = [
            {
              subject: "今日の気持ち、まだどこにも置いてないなら",
              body: "今日のこと、まだどこにも置いてないなら、ここに残していってもいいよ。<br>うまくまとまってなくても大丈夫。そのままの言葉で置いていける。",
            },
            {
              subject: "今夜、少しだけ話してみる？",
              body: "忙しい日ほど、気持ちは残ったままになりやすい。<br>少しだけでも、ここに置いていけるよ。",
            },
            {
              subject: "まだ言葉にしてないものがあったら",
              body: "今日の気持ち、まだどこにも置いてないなら<br>ここに置いていってもいいよ。",
            },
          ];
          const p = patterns[Math.floor(Math.random() * patterns.length)];
          subject = p.subject;
          bodyText = p.body;
        } else {
          const nuanceText = latestNuance
            ? `今日は、${latestNuance}みたいなものが少し残ってたのかもしれない。`
            : "今日は、少しだけ言葉にしてたね。";

          const patterns = [
            {
              subject: "今日の記録、まだ続きがあるかも",
              body: `${nuanceText}<br>続きがあるなら、ここに置いていってもいいよ。`,
            },
            {
              subject: "あの続き、少しだけ残してみる？",
              body: `${nuanceText}<br>途中で止まった気持ちがあるなら、そのままの形で残してもいい。`,
            },
            {
              subject: "今日の気持ち、まだ途中かもしれない",
              body: `${nuanceText}<br>まだまとまりきってないものがあるなら、少しだけ続きを話してみる？`,
            },
          ];
          const p = patterns[Math.floor(Math.random() * patterns.length)];
          subject = p.subject;
          bodyText = p.body;
        }

        // メール送信
        await resend.emails.send({
          from: "YORU <hello@yoru-voice.com>",
          to: email,
          subject,
          html: `
            <div style="background:#0a0e1a;color:#fff;font-family:'Hiragino Kaku Gothic ProN',sans-serif;max-width:480px;margin:0 auto;padding:48px 32px;">
              <p style="font-size:11px;letter-spacing:0.4em;color:rgba(167,139,250,0.6);margin:0 0 32px 0;">YORU</p>
              <p style="font-size:16px;font-weight:300;color:rgba(255,255,255,0.85);line-height:1.9;margin:0 0 36px 0;">
                ${bodyText}
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

        // 送信ログを記録
        await supabase.from("email_logs").insert({
          user_id: profile.id,
          type: "reminder",
          target_date: today,
        });

        results.sent++;
      } catch (e) {
        console.error(`Failed for user ${profile.id}:`, e);
        results.failed++;
      }
    }

    return results;
  }
}