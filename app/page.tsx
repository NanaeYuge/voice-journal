"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "./lib/supabase";
import { useRouter } from "next/navigation";

type AnalyzeResponse = {
  transcript?: string;
  emotion?: string;
  emoji?: string;
  message?: string;
  trigger?: string;
  nuance?: string;
  summary?: string;
  error?: string;
};

const emotionConfig: { [key: string]: { color: string; bg: string } } = {
  嬉しい: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)" },
  悲しい: { color: "#7eb8f7", bg: "rgba(126,184,247,0.08)" },
  怒り:   { color: "#f4846a", bg: "rgba(244,132,106,0.08)" },
  不安:   { color: "#b8a4f8", bg: "rgba(184,164,248,0.08)" },
  穏やか: { color: "#7dd3b0", bg: "rgba(125,211,176,0.08)" },
  疲れ:   { color: "#8da0b8", bg: "rgba(141,160,184,0.08)" },
};

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSilence, setIsSilence] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [result, setResult] = useState<{
    emotion: string;
    emoji: string;
    message: string;
    nuance: string;
    summary: string;
  } | null>(null);

  // 要約編集用
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summarySaved, setSummarySaved] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) { router.push("/login"); return; }
    };
    checkUser();
  }, [router, supabase]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      mimeTypeRef.current = mimeType;
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        await analyzeAndSave(blob);
      };
      mediaRecorder.start();
      setIsRecording(true);
      setResult(null);
      setSavedId(null);
      setIsEditingSummary(false);
      setSummarySaved(false);
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setIsSilence(true);
    setTimeout(() => { setIsSilence(false); setIsAnalyzing(true); }, 550);
  };

  const analyzeAndSave = async (blob: Blob) => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error("ユーザー取得に失敗しました");
      const user = userData.user;
      if (!user) throw new Error("ユーザーが見つかりません");

      const ext = mimeTypeRef.current.includes("mp4") ? "mp4" : "webm";
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("voice-logs")
        .upload(fileName, blob);
      if (uploadError) throw new Error(`音声アップロード失敗: ${uploadError.message}`);

      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data: AnalyzeResponse = await res.json();
      if (!res.ok) throw new Error(data.error || "感情解析APIでエラーが発生しました");

      const safeEmotion   = data.emotion   || "穏やか";
      const safeEmoji     = data.emoji     || "😌";
      const safeMessage   = data.message   || "話してくれてありがとう";
      const safeNuance    = data.nuance    || "少し言葉にしながら整理している感じ";
      const safeTranscript = data.transcript || "";
      const safeTrigger   = data.trigger   || "その他";
      const safeSummary   = data.summary   || "";

      const { data: inserted, error: insertError } = await supabase
        .from("journals")
        .insert({
          user_id: user.id,
          audio_path: fileName,
          emotion: safeEmotion,
          transcript: safeTranscript,
          emotion_trigger: safeTrigger,
          nuance: safeNuance,
          message: safeMessage,
          summary: safeSummary,
        })
        .select()
        .single();

      if (insertError) throw new Error(`DB保存失敗: ${insertError.message}`);
      if (inserted) setSavedId(inserted.id);

      setResult({
        emotion: safeEmotion,
        emoji: safeEmoji,
        message: safeMessage,
        nuance: safeNuance,
        summary: safeSummary,
      });
      setEditSummary(safeSummary);
    } catch {
      setResult({
        emotion: "穏やか",
        emoji: "😌",
        message: "話してくれてありがとう",
        nuance: "少し言葉にしながら整理している感じ",
        summary: "",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!savedId || !result) return;
    setIsSavingSummary(true);
    try {
      // テキスト修正→AI再分析
      const res = await fetch("/api/reanalyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: editSummary }),
      });
      const data = await res.json();

      await supabase.from("journals").update({
        summary: editSummary,
        emotion: data.emotion || result.emotion,
        message: data.message || result.message,
        nuance: data.nuance || result.nuance,
        emotion_trigger: data.trigger || "その他",
      }).eq("id", savedId);

      setResult({
        ...result,
        summary: editSummary,
        emotion: data.emotion || result.emotion,
        emoji: result.emoji,
        message: data.message || result.message,
        nuance: data.nuance || result.nuance,
      });
      setIsEditingSummary(false);
      setSummarySaved(true);
      setTimeout(() => setSummarySaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingSummary(false);
    }
  };

  const emotionCfg = result ? (emotionConfig[result.emotion] || { color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.03)" }) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .vj-root {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: #0a0e1a; font-family: 'Noto Sans JP', sans-serif;
          padding: 40px 24px; position: relative; overflow: hidden;
        }
        .vj-star { position: fixed; border-radius: 50%; background: rgba(255,255,255,0.55); pointer-events: none; z-index: 0; }
        .vj-star-1 { width: 2px; height: 2px; top: 18%; left: 72%; box-shadow: 0 0 6px rgba(255,255,255,0.3); animation: vj-star-twinkle 5s ease-in-out infinite; }
        .vj-star-2 { width: 1.5px; height: 1.5px; top: 31%; left: 20%; box-shadow: 0 0 4px rgba(255,255,255,0.2); animation: vj-star-twinkle 7s ease-in-out infinite; animation-delay: 2s; }
        @keyframes vj-star-twinkle { 0%,100%{opacity:0.55} 50%{opacity:0.15} }
        .vj-glow { position: fixed; top: -120px; left: 50%; transform: translateX(-50%); width: 600px; height: 300px; background: radial-gradient(ellipse, rgba(139,92,246,0.07) 0%, transparent 70%); pointer-events: none; z-index: 0; }

        .vj-content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 380px; }

        .vj-header { text-align: center; margin-bottom: 72px; }
        .vj-label { font-family: 'Zen Old Mincho', serif; font-size: 11px; font-weight: 400; letter-spacing: 0.4em; color: rgba(167,139,250,0.45); margin: 0 0 22px 0; }
        .vj-title { font-size: 21px; font-weight: 300; color: rgba(255,255,255,0.78); margin: 0; line-height: 1.7; letter-spacing: 0.03em; }
        .vj-hint { margin-top: 12px; font-size: 12px; color: rgba(255,255,255,0.2); letter-spacing: 0.08em; }

        .vj-btn-wrap { position: relative; width: 240px; height: 240px; display: flex; align-items: center; justify-content: center; }
        .vj-breath-ring { position: absolute; border-radius: 50%; animation: vj-breath 3.5s ease-in-out infinite; pointer-events: none; }
        .vj-breath-ring-1 { width: 148px; height: 148px; border: 1px solid rgba(139,92,246,0.22); }
        .vj-breath-ring-2 { width: 178px; height: 178px; border: 1px solid rgba(139,92,246,0.1); }
        .vj-breath-ring-3 { width: 208px; height: 208px; border: 1px solid rgba(139,92,246,0.04); }
        @keyframes vj-breath { 0%{transform:scale(0.97);opacity:0.6} 50%{transform:scale(1.04);opacity:1} 100%{transform:scale(0.97);opacity:0.6} }
        .vj-rec-ring { position: absolute; border-radius: 50%; animation: vj-recwave 3s ease-out infinite; pointer-events: none; }
        .vj-rec-ring-1 { width: 148px; height: 148px; border: 1px solid rgba(220,215,255,0.4); animation-delay: 0s; }
        .vj-rec-ring-2 { width: 185px; height: 185px; border: 1px solid rgba(220,215,255,0.18); animation-delay: 1s; }
        .vj-rec-ring-3 { width: 222px; height: 222px; border: 1px solid rgba(220,215,255,0.07); animation-delay: 2s; }
        @keyframes vj-recwave { 0%{transform:scale(0.95);opacity:0} 15%{opacity:1} 100%{transform:scale(1.12);opacity:0} }

        .vj-btn { position: relative; z-index: 10; width: 116px; height: 116px; border-radius: 50%; border: none; cursor: pointer; transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; font-family: 'Noto Sans JP', sans-serif; }
        .vj-btn:not(:disabled):hover { transform: scale(1.04); }
        .vj-btn:not(:disabled):active { transform: scale(0.97); }
        .vj-btn-idle { background: linear-gradient(150deg, #5b21b6 0%, #8b5cf6 100%); box-shadow: 0 0 0 1px rgba(139,92,246,0.25), 0 8px 32px rgba(91,33,182,0.45), inset 0 1px 0 rgba(255,255,255,0.1); }
        .vj-btn-recording { background: linear-gradient(150deg, #1a2340 0%, #c8d8f0 100%); box-shadow: 0 0 0 1px rgba(200,216,240,0.2), 0 8px 32px rgba(26,35,64,0.5), inset 0 1px 0 rgba(255,255,255,0.15); }
        .vj-btn-silence { background: #0d1220; box-shadow: 0 2px 12px rgba(0,0,0,0.5); opacity: 0.6; transform: scale(0.96); cursor: default; }
        .vj-btn-analyzing { background: #131929; box-shadow: 0 4px 20px rgba(0,0,0,0.4); cursor: not-allowed; }
        .vj-btn-icon { font-size: 22px; line-height: 1; color: rgba(255,255,255,0.9); }
        .vj-btn-label { font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.75); letter-spacing: 0.15em; }
        .vj-btn-silence .vj-btn-icon, .vj-btn-silence .vj-btn-label { opacity: 0; }

        .vj-dots { display: flex; gap: 6px; align-items: center; }
        .vj-dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(139,92,246,0.5); animation: vj-dot-float 2s ease-in-out infinite; }
        .vj-dot:nth-child(2) { animation-delay: 0.25s; }
        .vj-dot:nth-child(3) { animation-delay: 0.5s; }
        @keyframes vj-dot-float { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-5px);opacity:1} }

        /* 結果カード */
        .vj-result { margin-top: 52px; width: 100%; animation: vj-emerge 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes vj-emerge { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }

        .vj-result-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .vj-result-emoji { font-size: 32px; line-height: 1; }
        .vj-result-emotion-tag {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 12px; border-radius: 20px; padding: 4px 12px;
          letter-spacing: 0.06em; font-weight: 400;
        }
        .vj-result-nuance {
          font-family: 'Zen Old Mincho', serif;
          font-size: 15px; color: rgba(255,255,255,0.75);
          margin: 0; letter-spacing: 0.04em; line-height: 1.6;
        }

        .vj-divider { border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 16px 0; }

        /* 要約セクション */
        .vj-summary-section { margin-bottom: 16px; }
        .vj-summary-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .vj-summary-label { font-size: 10px; color: rgba(255,255,255,0.25); letter-spacing: 0.2em; font-family: 'Zen Old Mincho', serif; }
        .vj-summary-edit-btn { font-size: 10px; color: rgba(139,92,246,0.45); background: none; border: none; cursor: pointer; letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; padding: 0; }
        .vj-summary-edit-btn:hover { color: rgba(139,92,246,0.9); }
        .vj-summary-text { font-size: 13px; color: rgba(255,255,255,0.55); line-height: 1.75; letter-spacing: 0.03em; margin: 0; }
        .vj-summary-textarea {
          width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.25);
          border-radius: 10px; padding: 10px 12px; font-size: 13px; color: rgba(255,255,255,0.8);
          outline: none; resize: none; font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.03em; line-height: 1.7; box-sizing: border-box; transition: border-color 0.2s;
        }
        .vj-summary-textarea:focus { border-color: rgba(139,92,246,0.5); }
        .vj-summary-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 6px; }
        .vj-summary-save { font-size: 11px; color: rgba(167,139,250,0.9); background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.08em; transition: all 0.2s; }
        .vj-summary-save:hover { background: rgba(139,92,246,0.18); }
        .vj-summary-save:disabled { opacity: 0.4; cursor: not-allowed; }
        .vj-summary-cancel { font-size: 11px; color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.08em; transition: color 0.2s; padding: 6px 8px; }
        .vj-summary-cancel:hover { color: rgba(255,255,255,0.4); }
        .vj-summary-saved { font-size: 10px; color: rgba(139,92,246,0.6); letter-spacing: 0.08em; animation: vj-emerge 0.3s ease; }

        /* AIメッセージ */
        .vj-result-msg { font-size: 13px; color: rgba(167,139,250,0.7); line-height: 1.85; margin: 0; letter-spacing: 0.03em; }

        .vj-logs-link { display: inline-block; margin-top: 20px; font-size: 12px; color: rgba(139,92,246,0.45); background: none; border: none; cursor: pointer; letter-spacing: 0.1em; transition: color 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-logs-link:hover { color: rgba(139,92,246,0.9); }

        .vj-nav { position: fixed; top: 22px; right: 22px; z-index: 20; display: flex; gap: 8px; }
        .vj-nav-btn { font-size: 11px; color: rgba(255,255,255,0.18); background: none; border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 7px 18px; cursor: pointer; letter-spacing: 0.1em; transition: all 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-nav-btn:hover { color: rgba(255,255,255,0.45); border-color: rgba(255,255,255,0.12); }
        .vj-nav-btn--logout { color: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.04); }
        .vj-nav-btn--logout:hover { color: rgba(255,100,100,0.5); border-color: rgba(255,100,100,0.15); }
      `}</style>

      <div className="vj-root">
        <div className="vj-star vj-star-1" />
        <div className="vj-star vj-star-2" />
        <div className="vj-glow" />

        <nav className="vj-nav">
          <button className="vj-nav-btn" onClick={() => router.push("/logs")}>きろく</button>
          <button className="vj-nav-btn vj-nav-btn--logout" onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}>ログアウト</button>
        </nav>

        <div className="vj-content">
          <div className="vj-header">
            <p className="vj-label">Voice Journal</p>
            <h1 className="vj-title">
              {isRecording ? <>話してね<br />聴いてるよ</> : isSilence ? <span style={{ visibility: "hidden" }}>　</span> : <>今の気持ちを<br />話してみて</>}
            </h1>
            {!isRecording && !isSilence && !isAnalyzing && !result && (
              <p className="vj-hint">ボタンを押すだけで話せるよ</p>
            )}
          </div>

          <div className="vj-btn-wrap">
            {!isRecording && !isSilence && !isAnalyzing && (
              <>
                <div className="vj-breath-ring vj-breath-ring-1" />
                <div className="vj-breath-ring vj-breath-ring-2" />
                <div className="vj-breath-ring vj-breath-ring-3" />
              </>
            )}
            {isRecording && (
              <>
                <div className="vj-rec-ring vj-rec-ring-1" />
                <div className="vj-rec-ring vj-rec-ring-2" />
                <div className="vj-rec-ring vj-rec-ring-3" />
              </>
            )}
            <button
              className={`vj-btn ${isSilence ? "vj-btn-silence" : isRecording ? "vj-btn-recording" : isAnalyzing ? "vj-btn-analyzing" : "vj-btn-idle"}`}
              onClick={isRecording ? stopRecording : !isSilence && !isAnalyzing ? startRecording : undefined}
              disabled={isSilence || isAnalyzing}
            >
              {isAnalyzing ? (
                <div className="vj-dots">
                  <div className="vj-dot" /><div className="vj-dot" /><div className="vj-dot" />
                </div>
              ) : isSilence ? null : (
                <>
                  <span className="vj-btn-icon">{isRecording ? "■" : "●"}</span>
                  <span className="vj-btn-label">{isRecording ? "やめる" : "話す"}</span>
                </>
              )}
            </button>
          </div>

          {result && emotionCfg && (
            <div className="vj-result">
              {/* 感情タグ + nuance */}
              <div className="vj-result-top">
                <span className="vj-result-emoji">{result.emoji}</span>
                <div>
                  <span
                    className="vj-result-emotion-tag"
                    style={{ color: emotionCfg.color, background: emotionCfg.bg, border: `1px solid ${emotionCfg.color}33` }}
                  >
                    {result.emotion}
                  </span>
                  <p className="vj-result-nuance" style={{ marginTop: "8px" }}>{result.nuance}</p>
                </div>
              </div>

              <hr className="vj-divider" />

              {/* 要約セクション */}
              {(result.summary || isEditingSummary) && (
                <div className="vj-summary-section">
                  <div className="vj-summary-header">
                    <span className="vj-summary-label">話した内容</span>
                    {!isEditingSummary && (
                      <button className="vj-summary-edit-btn" onClick={() => { setIsEditingSummary(true); setEditSummary(result.summary); }}>
                        修正する
                      </button>
                    )}
                  </div>
                  {isEditingSummary ? (
                    <>
                      <textarea
                        className="vj-summary-textarea"
                        rows={3}
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                      />
                      <div className="vj-summary-footer">
                        {summarySaved && <span className="vj-summary-saved">更新したよ</span>}
                        <button className="vj-summary-cancel" onClick={() => { setIsEditingSummary(false); setEditSummary(result.summary); }}>キャンセル</button>
                        <button className="vj-summary-save" onClick={handleSaveSummary} disabled={isSavingSummary}>
                          {isSavingSummary ? "保存中..." : "この内容で保存"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="vj-summary-text">{result.summary}</p>
                  )}
                </div>
              )}

              {result.summary && <hr className="vj-divider" />}

              {/* AIメッセージ */}
              <p className="vj-result-msg">{result.message}</p>

              <button className="vj-logs-link" onClick={() => router.push("/logs")}>
                過去のきろくを見る →
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}