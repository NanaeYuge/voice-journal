import { NextRequest, NextResponse } from "next/server";
import { generateWeeklySummary } from "../../lib/ai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { journals, period, userId } = await request.json();
    const summary = await generateWeeklySummary(journals ?? [], period);

    if (summary && userId) {
      const now = new Date();
      const periodStart = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
      await supabase.from("weekly_summaries").insert({
        user_id: userId,
        period_days: period,
        period_start: periodStart.toISOString(),
        period_end: now.toISOString(),
        summary,
      });
    }

    return NextResponse.json({ summary });
  } catch (e: any) {
    console.error("weekly error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
