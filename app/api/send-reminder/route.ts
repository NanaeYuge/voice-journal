import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);
const appUrl = process.env.APP_URL || "https://voice-journal-inky.vercel.app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── リマインドの文面（すべてここに集約する。将来ここだけ見れば全文が読める）──
// 本文一行目は journals.emotion の辞書引きだけで決める。
// journals.nuance は「具体的な状況・人物・出来事を含める」指示で生成されるため
// （app/lib/ai.ts）、強い出来事語がそのまま入る。メールには一切引用しない。
const REMINDER_COPY = {
  // ケースA/B 共通の述部。emotion がここに無い場合（穏やか・未分類・null・
  // 想定外の値、そのすべて）は各ケースの neutral にフォールバックする。
  predicateByEmotion: {
    不安: "不安な気持ちを話してくれたね。",
    疲れ: "疲れていることを話してくれたね。",
    悲しい: "悲しい気持ちを話してくれたね。",
    怒り: "もやもやした気持ちを話してくれたね。",
    嬉しい: "うれしかったことを話してくれたね。",
  } as Record<string, string | undefined>,
  // A: 前日（JST基準で1日前）に記録あり
  A: {
    subject: "昨日の気持ち、その後どう？",
    prefix: "昨日は、",
    neutral: "昨日のこと、話してくれたね。",
  },
  // B: JST基準で2〜7日前に記録あり。経過日数には言及しない。
  B: {
    subject: "このあいだの気持ち、その後どう？",
    prefix: "このあいだは、",
    neutral: "このあいだのこと、話してくれたね。",
  },
  // C: 記録なし、または8日以上前。想起しない。
  C: {
    subject: "今日は、どんな日だった？",
    line: "今日は、どんな時間だったろう。",
  },
  question: "今の気持ちはどう？",
  cta: "今の気持ちを話す",
  tail: "話したくない日は、そのままで大丈夫。",
};

type ReminderCase = "A" | "B" | "C";

// 日付境界はJST(UTC+9)固定で計算する。
// TODO: per-user timezone 対応(user_profiles.timezone が未使用のため)
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// UTCの瞬間を「JSTでの暦日(YYYY-MM-DD)」に落とす
function toJstDateString(instant: Date): string {
  return new Date(instant.getTime() + JST_OFFSET_MS).toISOString().split("T")[0];
}

// JSTの暦日どうしの差を日数で返す（どちらもUTC正午基準ではなく暦日文字列で比較する）
function jstDayDiff(fromJstDate: string, toJstDate: string): number {
  const from = Date.parse(`${fromJstDate}T00:00:00Z`);
  const to = Date.parse(`${toJstDate}T00:00:00Z`);
  return Math.round((to - from) / 86400000);
}

function resolveCase(daysAgo: number | null): ReminderCase {
  if (daysAgo === null) return "C"; // 記録なし
  if (daysAgo === 1) return "A";
  if (daysAgo >= 2 && daysAgo <= 7) return "B";
  return "C"; // 8日以上前：記録があっても想起しない
}

function buildFirstLine(kase: ReminderCase, emotion: string | null): string {
  if (kase === "C") return REMINDER_COPY.C.line;
  const copy = REMINDER_COPY[kase];
  const predicate = emotion ? REMINDER_COPY.predicateByEmotion[emotion] : undefined;
  return predicate ? `${copy.prefix}${predicate}` : copy.neutral;
}

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
    // 送信日・二重送信チェックの単位もJSTの暦日に揃える
    const todayJst = toJstDateString(new Date());

    // reminder_enabledがtrueのユーザーのみ取得。
    // user_profiles に行が無いユーザーはここで対象外になる（意図的。行が無い既存
    // ユーザーへの配信再開は別途設計するため、ここでON扱いに"直さない"こと）。
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("reminder_enabled", true);

    if (profilesError) throw profilesError;

    const results = { sent: 0, skipped: 0, failed: 0 };

    for (const profile of profiles || []) {
      try {
        // 記録を一度も残していないユーザーには送らない（会員登録だけのユーザーを
        // ここで構造的に外す）。「記録」の定義は下の想起クエリと揃える:
        // 本人が削除した行(deleted_at)とタイムカプセルは数えない。
        const { count: journalCount } = await supabase
          .from("journals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .is("deleted_at", null)
          .neq("source", "timecapsule");

        if (!journalCount) {
          results.skipped++;
          continue;
        }

        // 二重送信チェック
        const { data: alreadySent } = await supabase
          .from("email_logs")
          .select("id")
          .eq("user_id", profile.id)
          .eq("type", "reminder")
          .eq("target_date", todayJst)
          .single();

        if (alreadySent) {
          results.skipped++;
          continue;
        }

        // ユーザーのメールアドレスを取得
        const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
        const email = userData?.user?.email;
        if (!email) { results.skipped++; continue; }

        // JST当日0:00より前の最新1件だけを参照する。
        // 本人が削除した記録（deleted_at）は絶対に引かない。
        // 参照するのは emotion のみ。nuance は引かない（本文に出来事語を再現しないため）。
        const { data: recentJournals } = await supabase
          .from("journals")
          .select("created_at, emotion")
          .eq("user_id", profile.id)
          .lt("created_at", `${todayJst}T00:00:00+09:00`)
          .is("deleted_at", null)
          .neq("source", "timecapsule")
          .order("created_at", { ascending: false })
          .limit(1);

        // 最新1件がJST基準で何日前かを出し、A/B/C を決める。
        const latest = recentJournals?.[0];
        const daysAgo = latest
          ? jstDayDiff(toJstDateString(new Date(latest.created_at)), todayJst)
          : null;
        const kase = resolveCase(daysAgo);

        // 本文は「一行目（辞書引き） + 固定の問い」の2文。
        // 解釈・採点・督促・許可/提案文はしない（憲法準拠）。
        const subject = REMINDER_COPY[kase].subject;
        const bodyText = `${buildFirstLine(kase, latest?.emotion ?? null)}<br>${REMINDER_COPY.question}`;

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
                ${REMINDER_COPY.cta}
              </a>
              <p style="font-size:13px;font-weight:300;color:rgba(255,255,255,0.55);margin:20px 0 0 0;line-height:1.8;">
                ${REMINDER_COPY.tail}
              </p>
              <p style="font-size:12px;color:rgba(255,255,255,0.45);margin:48px 0 0 0;line-height:1.8;">
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
          target_date: todayJst,
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