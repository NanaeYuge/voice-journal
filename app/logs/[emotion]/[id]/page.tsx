"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "../../../lib/supabase";
import { useRouter, useParams } from "next/navigation";

type Journal = {
  id: number;
  created_at: string;
  emotion: string;
  transcript: string;
  audio_path: string;
  message?: string;
  nuance?: string;
  emotion_trigger?: string;
};

const emotionConfig: { [key: string]: { emoji: string; color: string } } = {
  嬉しい: { emoji: "😊", color: "#fbbf24" },
  悲しい: { emoji: "😢", color: "#7eb8f7" },
  怒り:   { emoji: "😠", color: "#f4846a" },
  不安:   { emoji: "😰", color: "#b8a4f8" },
  穏やか: { emoji: "😌", color: "#7dd3b0" },
  疲れ:   { emoji: "😴", color: "#8da0b8" },
};

function formatDateFull(str: string) {
  const d = new Date(str);
  const days = ["日","月","火","水","木","金","土"];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${days[d.getDay()]}）${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function JournalDetailPage() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeDone, setReanalyzeDone] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoSaved, setMemoSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const router = useRouter();
  const params = useParams();
  const emotion = decodeURIComponent(params.emotion as string);
  const id = params.id as string;
  const cfg = emotionConfig[emotion] || { emoji: "💭", color: "rgba(255,255,255,0.4)" };
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("journals")
        .select("*")
        .eq("id", id)
        .single();
      if (data) {
        setJournal(data);
        setMemo(data.memo || "");
        setEditText(data.transcript || "");
        if (data.audio_path) {
          const { data: urlData } = await supabase.storage
            .from("voice-logs")
            .createSignedUrl(data.audio_path, 3600);
          if (urlData) setAudioUrl(urlData.signedUrl);
        }
      }
      setLoading(false);
    };
    fetch();
  }, [id]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const saveMemo = async () => {
    await supabase.from("journals").update({ memo }).eq("id", id);
    setMemoSaved(true);
    setTimeout(() => setMemoSaved(false), 2000);
  };

  const handleReanalyze = async () => {
    if (!editText.trim() || !journal) return;
    setIsReanalyzing(true);
    try {
      const res = await fetch("/api/reanalyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: editText }),
      });
      const data = await res.json();

      await supabase.from("journals").update({
        transcript: editText,
        emotion: data.emotion || journal.emotion,
        message: data.message || journal.message,
        nuance: data.nuance || journal.nuance,
        emotion_trigger: data.trigger || journal.emotion_trigger,
      }).eq("id", id);

      setJournal({
        ...journal,
        transcript: editText,
        emotion: data.emotion || journal.emotion,
        message: data.message || journal.message,
        nuance: data.nuance || journal.nuance,
        emotion_trigger: data.trigger || journal.emotion_trigger,
      });

      setIsEditing(false);
      setReanalyzeDone(true);
      setTimeout(() => setReanalyzeDone(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsReanalyzing(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#0a0e1a", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ fontSize:"12px", color:"rgba(255,255,255,0.18)", letterSpacing:"0.12em" }}>よみこみ中...</p>
    </div>
  );

  if (!journal) return null;

  const currentEmotion = journal.emotion || emotion;
  const currentCfg = emotionConfig[currentEmotion] || cfg;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .detail-root { min-height: 100vh; background: #0a0e1a; font-family: 'Noto Sans JP', sans-serif; padding-bottom: 80px; }
        .detail-header { position: sticky; top: 0; z-index: 10; padding: 20px 24px; display: flex; align-items: center; gap: 14px; background: rgba(10,14,26,0.9); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.04); }
        .detail-back { font-size: 11px; color: rgba(139,92,246,0.45); background: none; border: none; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.08em; transition: color 0.2s; }
        .detail-back:hover { color: rgba(139,92,246,0.9); }
        .detail-header-date { font-size: 12px; color: rgba(255,255,255,0.45); letter-spacing: 0.06em; margin: 0; }
        .detail-body { max-width: 460px; margin: 0 auto; padding: 40px 24px 0; }
        .detail-emotion { display: flex; align-items: center; gap: 10px; margin-bottom: 36px; }
        .detail-emotion-emoji { font-size: 32px; line-height: 1; }
        .detail-emotion-name { font-family: 'Zen Old Mincho', serif; font-size: 20px; font-weight: 400; letter-spacing: 0.06em; }
        .detail-player { display: flex; align-items: center; gap: 16px; padding: 18px 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; margin-bottom: 24px; cursor: pointer; transition: border-color 0.2s; }
        .detail-player:hover { border-color: rgba(255,255,255,0.1); }
        .detail-play-btn { width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); font-size: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
        .detail-play-btn:hover { background: rgba(255,255,255,0.09); }
        .detail-player-label { font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 0.08em; }
        .detail-section-label { font-size: 12px; color: rgba(255,255,255,0.65); letter-spacing: 0.25em; margin: 0 0 10px 0; font-family: 'Zen Old Mincho', serif; }
        .detail-ai-message { font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.85; letter-spacing: 0.03em; margin: 0 0 32px 0; padding-left: 12px; border-left: 2px solid rgba(139,92,246,0.2); }
        .detail-divider { border: none; border-top: 1px solid rgba(255,255,255,0.04); margin: 28px 0; }

        /* 文字起こし */
        .detail-transcript-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .detail-transcript-toggle { font-size: 11px; color: rgba(255,255,255,0.45); background: none; border: none; cursor: pointer; letter-spacing: 0.1em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; padding: 0; }
        .detail-transcript-toggle:hover { color: rgba(255,255,255,0.7); }
        .detail-transcript-edit-btn { font-size: 11px; color: rgba(139,92,246,0.45); background: none; border: none; cursor: pointer; letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; padding: 0; }
        .detail-transcript-edit-btn:hover { color: rgba(139,92,246,0.9); }
        .detail-transcript { font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.85; letter-spacing: 0.02em; margin: 0 0 16px 0; animation: fadein 0.3s ease; }
        @keyframes fadein { from{opacity:0} to{opacity:1} }

        /* 編集モード */
        .detail-edit-area { margin-bottom: 12px; animation: fadein 0.3s ease; }
        .detail-edit-textarea {
          width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.25);
          border-radius: 10px; padding: 13px 15px; font-size: 13px; color: rgba(255,255,255,0.8);
          outline: none; resize: none; font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.03em; line-height: 1.7; box-sizing: border-box; transition: border-color 0.2s;
        }
        .detail-edit-textarea:focus { border-color: rgba(139,92,246,0.5); }
        .detail-edit-footer { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
        .detail-edit-save {
          font-size: 12px; color: rgba(167,139,250,0.9); background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 7px 16px;
          cursor: pointer; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.08em;
          transition: all 0.2s;
        }
        .detail-edit-save:hover { background: rgba(139,92,246,0.18); }
        .detail-edit-save:disabled { opacity: 0.4; cursor: not-allowed; }
        .detail-edit-cancel { font-size: 12px; color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.08em; transition: color 0.2s; padding: 7px 12px; }
        .detail-edit-cancel:hover { color: rgba(255,255,255,0.4); }
        .detail-reanalyze-done { font-size: 11px; color: rgba(139,92,246,0.6); letter-spacing: 0.08em; animation: fadein 0.3s ease; }

        /* メモ */
        .detail-memo-wrap { margin-top: 8px; }
        .detail-memo { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 13px 15px; font-size: 13px; color: rgba(255,255,255,0.75); outline: none; resize: none; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.03em; line-height: 1.7; box-sizing: border-box; transition: border-color 0.2s; }
        .detail-memo::placeholder { color: rgba(255,255,255,0.35); }
        .detail-memo:focus { border-color: rgba(139,92,246,0.25); }
        .detail-memo-footer { display: flex; justify-content: flex-end; margin-top: 8px; gap: 12px; align-items: center; }
        .detail-memo-saved { font-size: 11px; color: rgba(139,92,246,0.5); letter-spacing: 0.06em; }
        .detail-memo-btn { font-size: 11px; color: rgba(139,92,246,0.45); background: none; border: none; cursor: pointer; letter-spacing: 0.1em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; }
        .detail-memo-btn:hover { color: rgba(139,92,246,0.9); }
      `}</style>

      <div className="detail-root">
        <header className="detail-header">
          <button className="detail-back" onClick={() => router.push(`/logs/${encodeURIComponent(emotion)}`)}>
            ← {emotion}の部屋
          </button>
          <p className="detail-header-date">{formatDateFull(journal.created_at)}</p>
        </header>

        <div className="detail-body">
          <div className="detail-emotion">
            <span className="detail-emotion-emoji">{currentCfg.emoji}</span>
            <span className="detail-emotion-name" style={{ color: currentCfg.color }}>
              {journal.nuance || currentEmotion}
            </span>
          </div>

          {/* 音声プレイヤー */}
          {audioUrl && (
            <>
              <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />
              <div className="detail-player" onClick={togglePlay}>
                <div className="detail-play-btn">{isPlaying ? "■" : "▶"}</div>
                <span className="detail-player-label">{isPlaying ? "再生中..." : "音声を聴く"}</span>
              </div>
            </>
          )}

          {/* AIの一言 */}
          {journal.message && (
            <>
              <p className="detail-section-label">AIからの一言</p>
              <p className="detail-ai-message">{journal.message}</p>
            </>
          )}

          <hr className="detail-divider" />

          {/* 文字起こし */}
          {journal.transcript && (
            <>
              <div className="detail-transcript-header">
                <button className="detail-transcript-toggle" onClick={() => { setShowTranscript(!showTranscript); if (!showTranscript) setIsEditing(false); }}>
                  {showTranscript ? "▾ 文字起こしを閉じる" : "▸ 文字起こしを見る"}
                </button>
                {showTranscript && !isEditing && (
                  <button className="detail-transcript-edit-btn" onClick={() => { setIsEditing(true); setEditText(journal.transcript); }}>
                    修正する
                  </button>
                )}
              </div>

              {showTranscript && (
                isEditing ? (
                  <div className="detail-edit-area">
                    <textarea
                      className="detail-edit-textarea"
                      rows={5}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="detail-edit-footer">
                      {reanalyzeDone && <span className="detail-reanalyze-done">更新したよ</span>}
                      <button className="detail-edit-cancel" onClick={() => { setIsEditing(false); setEditText(journal.transcript); }}>
                        キャンセル
                      </button>
                      <button className="detail-edit-save" onClick={handleReanalyze} disabled={isReanalyzing}>
                        {isReanalyzing ? "再生成中..." : "この内容で保存"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="detail-transcript">{journal.transcript}</p>
                )
              )}
            </>
          )}

          <hr className="detail-divider" />

          {/* 気づきメモ */}
          <div className="detail-memo-wrap">
            <p className="detail-section-label">気づきメモ（任意）</p>
            <textarea
              className="detail-memo"
              rows={2}
              placeholder="ひとことだけ残すなら..."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
            <div className="detail-memo-footer">
              {memoSaved && <span className="detail-memo-saved">保存したよ</span>}
              <button className="detail-memo-btn" onClick={saveMemo}>保存する</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
