"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "./lib/supabase";
import { useRouter } from "next/navigation";

type SignalItem = { type: string; label: string; raw: string; confidence: number };
type CycleHintItem = SignalItem & { basis: "explicit" | "indirect"; evidence: string[] };
type SignalsData = { body: SignalItem[]; emotion: SignalItem[]; rhythm: SignalItem[]; cycle_hint: CycleHintItem[] };

type AnalyzeResponse = {
  transcript?: string;
  emotion?: string;
  message?: string;
  trigger?: string;
  nuance?: string;
  summary?: string;
  insight?: string;
  signals?: SignalsData | null;
  error?: string;
};

function getAfterword(transcriptLength: number): string {
  const hour = new Date().getHours();

  const isShort = transcriptLength < 100;
  const isLong = transcriptLength >= 300;

  const isDeepNight = hour >= 22 || hour < 5;
  const isMorning = hour >= 5 && hour < 11;

  if (isDeepNight) {
    if (isLong) return "こんな時間まで、全部聞いてたよ。ここに残ってるよ。";
    return "こんな時間に来てくれたんだね。ちゃんとここにいたよ。";
  }

  if (isMorning) {
    if (isShort) return "今日の始まりに、少しだけ話してくれた。ここに残ってるよ。";
    return "今日の始まりに話してくれた。ちゃんとここに残ってるよ。";
  }

  if (isShort) return "少しだけでも、ここに残ってるよ。";
  if (isLong) return "たくさん話してくれたね。全部、ちゃんとここに残ってるよ。";
  return "気づけたこと、ちゃんとここに残ってるよ。";
}

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSilence, setIsSilence] = useState(false);
  const [result, setResult] = useState<{
    afterword: string;
  } | null>(null);

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

      const safeEmotion    = data.emotion    || "穏やか";
      const safeNuance     = data.nuance     || "";
      const safeTranscript = data.transcript || "";
      const safeTrigger    = data.trigger    || "その他";
      const safeSummary    = data.summary    || "";
      const safeInsight    = data.insight    || "";

      await supabase
        .from("journals")
        .insert({
          user_id: user.id,
          audio_path: fileName,
          emotion: safeEmotion,
          transcript: safeTranscript,
          emotion_trigger: safeTrigger,
          nuance: safeNuance,
          message: "",
          summary: safeSummary,
          insight: safeInsight,
          signals: data.signals ?? null,
        });

      const afterword = getAfterword(safeTranscript.length);
      setResult({ afterword });
    } catch {
      setResult({ afterword: "気づけたこと、ちゃんとここに残ってるよ。" });
    } finally {
      setIsAnalyzing(false);
    }
  };

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
        .vj-label { font-family: 'Zen Old Mincho', serif; font-size: 44px; font-weight: 600; letter-spacing: 0.1em; color: #e8d5a0; text-shadow: 0 0 24px rgba(232,213,160,0.1); margin: 0 0 22px 0; }
        .vj-title { font-size: 21px; font-weight: 300; color: rgba(255,255,255,0.9); margin: 0; line-height: 1.7; letter-spacing: 0.03em; }
        .vj-hint { margin-top: 12px; font-size: 12px; color: rgba(255,255,255,0.55); letter-spacing: 0.08em; }

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

        .vj-memo-link { margin-top: 24px; font-size: 11px; color: rgba(255,255,255,0.5); background: none; border: none; cursor: pointer; letter-spacing: 0.1em; transition: color 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-memo-link:hover { color: rgba(139,92,246,0.6); }
        .vj-memo-link .vj-memo-accent { color: rgba(167,139,250,0.9); text-decoration: underline; text-underline-offset: 3px; }

        .vj-result { display: flex; flex-direction: column; align-items: center; animation: vj-emerge 1.2s cubic-bezier(0.16,1,0.3,1) forwards; text-align: center; }
        @keyframes vj-emerge { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .vj-afterword { font-family: 'Zen Old Mincho', serif; font-size: 16px; font-weight: 400; color: rgba(255,255,255,0.55); line-height: 2; letter-spacing: 0.08em; text-align: center; margin: 0 0 36px 0; }

        .vj-logs-link { font-size: 11px; color: rgba(139,92,246,0.35); background: none; border: none; cursor: pointer; letter-spacing: 0.12em; transition: color 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-logs-link:hover { color: rgba(139,92,246,0.7); }

        .vj-nav { position: fixed; top: 22px; right: 22px; z-index: 20; display: flex; gap: 8px; }
        .vj-nav-btn { font-size: 11px; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.22); border-radius: 20px; padding: 7px 18px; cursor: pointer; letter-spacing: 0.1em; transition: all 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-nav-btn:hover { color: rgba(255,255,255,0.95); border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.1); }

      `}</style>

      <div className="vj-root">
        <div className="vj-star vj-star-1" />
        <div className="vj-star vj-star-2" />
        <div className="vj-glow" />

        <nav className="vj-nav">
          <button className="vj-nav-btn" onClick={() => router.push("/logs")}>きろく</button>
          <button className="vj-nav-btn" onClick={() => router.push("/menu")}>設定</button>
        </nav>

        <div className="vj-content">
          <div className="vj-header">
            <p className="vj-label">YORU</p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", letterSpacing: "0.12em", margin: "0 0 18px 0" }}>
              {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
            </p>
            <h1 className="vj-title">
              {isRecording ? <>話してね<br />聴いてるよ</> : isSilence ? <span style={{ visibility: "hidden" }}>　</span> : result ? <></> : <>今の気持ちを<br />話してみて</>}
            </h1>
            {!isRecording && !isSilence && !isAnalyzing && !result && (
              <p className="vj-hint">ボタンを押すだけで話せるよ</p>
            )}
          </div>

          <div className="vj-btn-wrap">
            {!isRecording && !isSilence && !isAnalyzing && !result && (
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
            {!result && (
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
            )}
            {result && (
              <div className="vj-result">
                <p className="vj-afterword">{result.afterword}</p>
                <button className="vj-logs-link" onClick={() => router.push("/logs")}>
                  きろくを見る →
                </button>
              </div>
            )}
          </div>

          {!isRecording && !isSilence && !isAnalyzing && !result && (
            <button className="vj-memo-link" onClick={() => router.push("/memo")}>
              今は話せない？ <span className="vj-memo-accent">→ メモだけ残す</span>
            </button>
          )}

        </div>
      </div>
    </>
  );
}