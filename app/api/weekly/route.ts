import { NextRequest, NextResponse } from "next/server";
import { generateWeeklySummary } from "../../lib/ai";
import { createClient } from "@supabase/supabase-js";
import { getSessionUserId } from "../../lib/supabase-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // user_id はセッションから取る。ボディで受け取っていた頃は、他人の user_id を
    // 渡せばその人のキャッシュ済みサマリーが読め、その人の名義で行を挿入できた。
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journals, period } = await request.json();

    // 期間境界は日単位で固定する。now を秒精度で使うと同日に画面を開くたびに
    // period_start/period_end が変わり、重複判定が効かず insert と OpenAI 呼び出しが
    // 毎回走ってしまうため（254件蓄積・課金漏れの原因）。
    const now = new Date();
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const periodStart = new Date(periodEnd.getTime() - period * 24 * 60 * 60 * 1000);
    const periodStartIso = periodStart.toISOString();
    const periodEndIso = periodEnd.toISOString();

    // 同一 user_id × period_start × period_end の行があれば再利用し、
    // OpenAI を呼ばずに既存 summary を返す（過去の重複行の削除はしない）。
    const { data: existing } = await supabase
      .from("weekly_summaries")
      .select("summary")
      .eq("user_id", userId)
      .eq("period_start", periodStartIso)
      .eq("period_end", periodEndIso)
      .order("created_at", { ascending: false })
      .limit(1);

    const cached = existing?.[0]?.summary;
    if (cached) {
      return NextResponse.json({ summary: cached });
    }

    const summary = await generateWeeklySummary(journals ?? [], period);

    if (summary) {
      await supabase.from("weekly_summaries").insert({
        user_id: userId,
        period_days: period,
        period_start: periodStartIso,
        period_end: periodEndIso,
        summary,
      });
    }

    return NextResponse.json({ summary });
  } catch (e: any) {
    console.error("weekly error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
