"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase";
import { useRouter, useParams } from "next/navigation";

type Journal = {
  id: number;
  created_at: string;
  emotion: string;
  transcript: string;
};

const emotionConfig: { [key: string]: { emoji: string; color: string; bg: string } } = {
  嬉しい: { emoji: "😊", color: "#fbbf24", bg: "rgba(251,191,36,0.05)" },
  悲しい: { emoji: "😢", color: "#7eb8f7", bg: "rgba(126,184,247,0.05)" },
  怒り:   { emoji: "😠", color: "#f4846a", bg: "rgba(244,132,106,0.05)" },
  不安:   { emoji: "😰", color: "#b8a4f8", bg: "rgba(184,164,248,0.05)" },
  穏やか: { emoji: "😌", color: "#7dd3b0", bg: "rgba(125,211,176,0.05)" },
  疲れ:   { emoji: "😴", color: "#8da0b8", bg: "rgba(141,160,184,0.05)" },
};

function formatDate(str: string) {
  const d = new Date(str);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function EmotionRoomPage() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const emotion = decodeURIComponent(params.emotion as string);
  const cfg = emotionConfig[emotion] || { emoji: "💭", color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.03)" };
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("journals")
        .select("*")
        .eq("emotion", emotion)
        .order("created_at", { ascending: false });
      setJournals(data || []);
      setLoading(false);
    };
    fetch();
  }, [emotion]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .room-root {
          min-height: 100vh;
          background: #0a0e1a;
          font-family: 'Noto Sans JP', sans-serif;
          padding-bottom: 80px;
        }

        .room-glow {
          position: fixed; top: -100px; left: 50%;
          transform: translateX(-50%);
          width: 500px; height: 260px;
          pointer-events: none; z-index: 0;
        }

        .room-header {
          position: sticky; top: 0; z-index: 10;
          padding: 20px 24px;
          display: flex; align-items: center; gap: 16px;
          background: rgba(10,14,26,0.9);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .room-back {
          font-size: 11px; color: rgba(139,92,246,0.45);
          background: none; border: none; cursor: pointer;
          font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.08em; transition: color 0.2s;
        }
        .room-back:hover { color: rgba(139,92,246,0.9); }
        .room-header-emoji { font-size: 20px; line-height: 1; }
        .room-header-title {
          font-family: 'Zen Old Mincho', serif;
          font-size: 14px; font-weight: 400;
          letter-spacing: 0.15em; margin: 0;
        }

        .room-body {
          position: relative; z-index: 1;
          max-width: 460px; margin: 0 auto;
          padding: 32px 20px 0;
        }

        /* "静かな本の目次"スタイル */
        .room-entry {
          display: flex; align-items: baseline;
          gap: 0;
          padding: 15px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          cursor: pointer;
          transition: opacity 0.2s;
          animation: entry-in 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes entry-in { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
        .room-entry:hover { opacity: 0.7; }
        .room-entry:first-child { border-top: 1px solid rgba(255,255,255,0.04); }

        .room-entry-date {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.06em;
          flex-shrink: 0;
          width: 100px;
        }
        .room-entry-text {
          flex: 1;
          font-size: 13px;
          color: rgba(255,255,255,0.38);
          line-height: 1.6;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: 0.02em;
        }
        .room-entry-arrow {
          font-size: 11px;
          color: rgba(255,255,255,0.1);
          flex-shrink: 0;
          margin-left: 12px;
        }

        .room-loading { display:flex; align-items:center; justify-content:center; min-height:40vh; }
        .room-loading-text { font-size:12px; color:rgba(255,255,255,0.18); animation:fade 2s ease-in-out infinite; }
        @keyframes fade { 0%,100%{opacity:0.3} 50%{opacity:1} }

        .room-empty { text-align:center; padding:80px 0; }
        .room-empty-text { font-size:13px; color:rgba(255,255,255,0.2); line-height:2; margin:0; }

        .room-count { font-size:11px; color:rgba(255,255,255,0.1); text-align:center; margin-top:36px; letter-spacing:0.1em; }
      `}</style>

      <div className="room-root">
        <div
          className="room-glow"
          style={{ background: `radial-gradient(ellipse, ${cfg.bg.replace("0.05", "0.12")} 0%, transparent 70%)` }}
        />

        <header className="room-header">
          <button className="room-back" onClick={() => router.push("/logs")}>← きろく</button>
          <span className="room-header-emoji">{cfg.emoji}</span>
          <h1 className="room-header-title" style={{ color: cfg.color }}>{emotion}の部屋</h1>
        </header>

        <div className="room-body">
          {loading ? (
            <div className="room-loading">
              <p className="room-loading-text">よみこみ中...</p>
            </div>
          ) : journals.length === 0 ? (
            <div className="room-empty">
              <p className="room-empty-text">まだきろくがないよ</p>
            </div>
          ) : (
            <>
              {journals.map((j, i) => (
                <div
                  key={j.id}
                  className="room-entry"
                  style={{ animationDelay: `${i * 0.04}s` }}
                  onClick={() => router.push(`/logs/${encodeURIComponent(emotion)}/${j.id}`)}
                >
                  <span className="room-entry-date">{formatDate(j.created_at)}</span>
                  <span className="room-entry-text">
                    {j.transcript || "（文字起こしなし）"}
                  </span>
                  <span className="room-entry-arrow">›</span>
                </div>
              ))}
              <p className="room-count">{journals.length} 件</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}