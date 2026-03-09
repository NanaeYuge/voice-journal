"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase";
import { useRouter } from "next/navigation";

type Journal = {
  id: number;
  created_at: string;
  emotion: string;
  transcript: string;
  trigger?: string;
};

const emotionConfig: { [key: string]: { emoji: string; color: string; bg: string; whisper: string } } = {
  嬉しい: { emoji: "😊", color: "#fbbf24", bg: "rgba(251,191,36,0.05)",  whisper: "いい瞬間があったんだね" },
  悲しい: { emoji: "😢", color: "#7eb8f7", bg: "rgba(126,184,247,0.05)", whisper: "静かな日もあったね" },
  怒り:   { emoji: "😠", color: "#f4846a", bg: "rgba(244,132,106,0.05)", whisper: "最近ちょっと忙しかった？" },
  不安:   { emoji: "😰", color: "#b8a4f8", bg: "rgba(184,164,248,0.05)", whisper: "いろいろ考えてたんだね" },
  穏やか: { emoji: "😌", color: "#7dd3b0", bg: "rgba(125,211,176,0.05)", whisper: "落ち着けてる日が多い" },
  疲れ:   { emoji: "😴", color: "#8da0b8", bg: "rgba(141,160,184,0.05)", whisper: "ゆっくりできてる？" },
};

const PERIODS = [
  { label: "7日",  days: 7 },
  { label: "30日", days: 30 },
  { label: "90日", days: 90 },
];

function buildSparkBar(dates: string[], periodDays: number): string {
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇"];
  const buckets = 6;
  const now = Date.now();
  const periodMs = periodDays * 24 * 60 * 60 * 1000;
  const bucketMs = periodMs / buckets;
  const counts = Array(buckets).fill(0);

  dates.forEach((d) => {
    const diff = now - new Date(d).getTime();
    if (diff < periodMs) {
      const idx = Math.min(Math.floor(diff / bucketMs), buckets - 1);
      counts[buckets - 1 - idx]++;
    }
  });

  const max = Math.max(...counts, 1);
  return counts.map((c) => bars[Math.round((c / max) * (bars.length - 1))]).join("");
}

export default function LogsPage() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchJournals = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("journals")
        .select("*")
        .order("created_at", { ascending: false });
      setJournals(data || []);
      setLoading(false);
    };
    fetchJournals();
  }, []);

  // period または journals が変わったら自動生成
  useEffect(() => {
    if (journals.length === 0) return;
    const targetJournals = journals.filter(
      (j) => new Date(j.created_at).getTime() > Date.now() - period * 24 * 60 * 60 * 1000
    );
    generateSummary(targetJournals);
  }, [period, journals]);

    const generateSummary = async (targetJournals: Journal[]) => {
    if (targetJournals.length === 0) {
    setWeeklySummary(null);
    return;
    }
    setIsGenerating(true);
    setWeeklySummary(null);
    try {
        const { data: userData } = await supabase.auth.getUser();
    const res = await fetch("/api/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        journals: targetJournals,
        period,
        userId: userData.user?.id,
        }),
    });
    const data = await res.json();
    setWeeklySummary(data.summary ?? null);
    } catch (e) {
    console.error(e);
    } finally {
    setIsGenerating(false);
    }
};

  const cutoff = Date.now() - period * 24 * 60 * 60 * 1000;
  const filtered = journals.filter((j) => new Date(j.created_at).getTime() > cutoff);

  const emotionMap: { [key: string]: Journal[] } = {};
  filtered.forEach((j) => {
    if (!emotionMap[j.emotion]) emotionMap[j.emotion] = [];
    emotionMap[j.emotion].push(j);
  });

  const sorted = Object.entries(emotionMap).sort((a, b) => b[1].length - a[1].length);

  const triggerMap: { [key: string]: number } = {};
  filtered.forEach((j) => {
    if (j.trigger) triggerMap[j.trigger] = (triggerMap[j.trigger] || 0) + 1;
  });
  const sortedTriggers = Object.entries(triggerMap).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .logs-root {
          min-height: 100vh;
          background: #0a0e1a;
          font-family: 'Noto Sans JP', sans-serif;
          padding-bottom: 80px;
        }

        .logs-star {
          position: fixed;
          width: 2px; height: 2px;
          border-radius: 50%;
          background: rgba(255,255,255,0.5);
          top: 14%; right: 18%;
          box-shadow: 0 0 5px rgba(255,255,255,0.25);
          pointer-events: none;
          z-index: 0;
          animation: logs-twinkle 6s ease-in-out infinite;
        }
        @keyframes logs-twinkle { 0%,100%{opacity:0.5} 50%{opacity:0.12} }

        .logs-glow {
          position: fixed;
          top: -100px; left: 50%;
          transform: translateX(-50%);
          width: 500px; height: 260px;
          background: radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .logs-header {
          position: sticky; top: 0; z-index: 10;
          padding: 20px 24px;
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(10,14,26,0.9);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .logs-header-left { display: flex; align-items: center; gap: 16px; }
        .logs-title {
          font-family: 'Zen Old Mincho', serif;
          font-size: 14px; font-weight: 400;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.18em; margin: 0;
        }
        .logs-back {
          font-size: 11px; color: rgba(139,92,246,0.45);
          background: none; border: none; cursor: pointer;
          letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif;
          transition: color 0.2s;
        }
        .logs-back:hover { color: rgba(139,92,246,0.9); }
        .logs-logout {
          font-size: 11px; color: rgba(255,255,255,0.12);
          background: none; border: none; cursor: pointer;
          letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif;
          transition: color 0.2s;
        }
        .logs-logout:hover { color: rgba(255,100,100,0.5); }

        .period-tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 20px;
          padding: 3px;
        }
        .period-tab {
          font-size: 11px; font-weight: 400;
          color: rgba(255,255,255,0.25);
          background: none; border: none;
          border-radius: 16px;
          padding: 5px 12px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.06em;
        }
        .period-tab:hover { color: rgba(255,255,255,0.5); }
        .period-tab--active {
          background: rgba(139,92,246,0.2);
          color: rgba(167,139,250,0.9);
        }

        .logs-body {
          position: relative; z-index: 1;
          max-width: 460px; margin: 0 auto;
          padding: 32px 20px 0;
        }

        .logs-section-label {
          font-family: 'Zen Old Mincho', serif;
          font-size: 11px; letter-spacing: 0.3em;
          color: rgba(255,255,255,0.4);
          margin: 0 0 20px 2px;
        }

        .emotion-room {
          display: flex; align-items: center;
          gap: 14px;
          border-radius: 14px;
          padding: 18px 20px;
          margin-bottom: 8px;
          border: 1px solid rgba(255,255,255,0.05);
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s;
          animation: room-in 0.5s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes room-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .emotion-room:hover { border-color: rgba(255,255,255,0.1); transform: translateY(-1px); }

        .emotion-room-emoji { font-size: 24px; flex-shrink: 0; line-height: 1; }
        .emotion-room-main { flex: 1; min-width: 0; }

        .emotion-room-top {
          display: flex; align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .emotion-room-name { font-size: 15px; font-weight: 400; }

        .emotion-room-spark-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }
        .emotion-room-spark-label {
          font-size: 9px;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.1em;
        }
        .emotion-room-spark {
          font-size: 12px;
          letter-spacing: 0.12em;
          opacity: 0.8;
        }

        .emotion-room-bottom {
          display: flex; align-items: baseline;
          gap: 10px;
        }
        .emotion-room-count {
          font-size: 13px; font-weight: 300;
          color: rgba(255,255,255,0.55);
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .emotion-room-whisper {
          font-size: 11px;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.04em;
          margin: 0;
        }

        .emotion-room-arrow {
          font-size: 12px;
          color: rgba(255,255,255,0.);
          flex-shrink: 0;
        }

        .logs-empty { text-align: center; padding: 80px 0; }
        .logs-empty-icon { font-size: 36px; opacity: 0.3; margin-bottom: 16px; }
        .logs-empty-text { font-size: 13px; color: rgba(255,255,255,0.2); line-height: 2; margin: 0; }

        .logs-loading { display:flex; align-items:center; justify-content:center; min-height:40vh; }
        .logs-loading-text { font-size:12px; color:rgba(255,255,255,0.18); letter-spacing:0.12em; animation:logs-fade 2s ease-in-out infinite; }
        @keyframes logs-fade { 0%,100%{opacity:0.3} 50%{opacity:1} }

        .logs-total {
          font-size: 11px; color: rgba(255,255,255,0.3);
          text-align: center; margin-top: 40px; letter-spacing: 0.1em;
        }

        .summary-emerge {
          animation: summary-in 0.8s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes summary-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="logs-root">
        <div className="logs-star" />
        <div className="logs-glow" />

        <header className="logs-header">
          <div className="logs-header-left">
            <h1 className="logs-title">きろく</h1>
            <button className="logs-back" onClick={() => router.push("/")}>← 話す</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="period-tabs">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  className={`period-tab ${period === p.days ? "period-tab--active" : ""}`}
                  onClick={() => setPeriod(p.days)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button className="logs-logout" onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}>ログアウト</button>
          </div>
        </header>

        <div className="logs-body">
          {loading ? (
            <div className="logs-loading">
              <p className="logs-loading-text">よみこみ中...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="logs-empty">
              <div className="logs-empty-icon">🌙</div>
              <p className="logs-empty-text">この期間のきろくはまだないよ<br />何か話してみて</p>
            </div>
          ) : (
            <>
              <p className="logs-section-label">この{period}日の心</p>
              {sorted.map(([emotion, items], i) => {
                const cfg = emotionConfig[emotion] || {
                  emoji: "💭",
                  color: "rgba(255,255,255,0.4)",
                  bg: "rgba(255,255,255,0.03)",
                  whisper: "",
                };
                const spark = buildSparkBar(items.map((j) => j.created_at), period);
                return (
                  <div
                    key={emotion}
                    className="emotion-room"
                    style={{ background: cfg.bg, animationDelay: `${i * 0.07}s` }}
                    onClick={() => router.push(`/logs/${encodeURIComponent(emotion)}`)}
                  >
                    <span className="emotion-room-emoji">{cfg.emoji}</span>
                    <div className="emotion-room-main">
                      <div className="emotion-room-top">
                        <span className="emotion-room-name" style={{ color: cfg.color }}>{emotion}</span>
                        <div className="emotion-room-spark-wrap">
                          <span className="emotion-room-spark-label">最近の流れ →</span>
                          <span className="emotion-room-spark" style={{ color: cfg.color }}>{spark}</span>
                        </div>
                      </div>
                      <div className="emotion-room-bottom">
                        <span className="emotion-room-count">{items.length}件</span>
                        <p className="emotion-room-whisper">{cfg.whisper}</p>
                      </div>
                    </div>
                    <span className="emotion-room-arrow">›</span>
                  </div>
                );
              })}

              {/* トリガー */}
              {sortedTriggers.length > 0 && (
                <div style={{ marginTop: "40px" }}>
                  <p className="logs-section-label">よく出るトリガー</p>
                  <div style={{
                    borderRadius: "14px",
                    border: "1px solid rgba(255,255,255,0.05)",
                    overflow: "hidden",
                  }}>
                    {sortedTriggers.map(([trigger, count], i) => {
                      const ratio = count / sortedTriggers[0][1];
                      return (
                        <div
                          key={trigger}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "13px 18px",
                            borderBottom: i < sortedTriggers.length - 1
                              ? "1px solid rgba(255,255,255,0.04)"
                              : "none",
                            background: "rgba(255,255,255,0.015)",
                          }}
                        >
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", width: "16px", textAlign: "right", flexShrink: 0 }}>
                            {i + 1}
                          </span>
                          <span style={{ flex: 1, fontSize: "13px", color: "rgba(255,255,255,0.65)", letterSpacing: "0.04em" }}>
                            {trigger}
                          </span>
                          <div style={{ width: "72px", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                            <div style={{ width: `${ratio * 100}%`, height: "100%", borderRadius: "2px", background: "rgba(139,92,246,0.6)" }} />
                          </div>
                          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", flexShrink: 0, width: "24px", textAlign: "right" }}>
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ふりかえり */}
              <div style={{ marginTop: "40px" }}>
                <p className="logs-section-label">この{period}日のふりかえり</p>
                <div style={{
                  borderRadius: "14px",
                  border: "1px solid rgba(139,92,246,0.15)",
                  background: "rgba(139,92,246,0.04)",
                  padding: "20px 22px",
                  minHeight: "64px",
                  display: "flex",
                  alignItems: "center",
                }}>
                  {isGenerating ? (
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.18)", letterSpacing: "0.12em", margin: 0, animation: "logs-fade 2s ease-in-out infinite" }}>
                      よみとり中...
                    </p>
                  ) : weeklySummary ? (
                    <p className="summary-emerge" style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", lineHeight: "1.9", letterSpacing: "0.04em", margin: 0 }}>
                      {weeklySummary}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="logs-total">合計 {filtered.length} 件のきろく</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
