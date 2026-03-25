"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "../lib/supabase";
import { useRouter } from "next/navigation";

type Journal = {
  id: number;
  created_at: string;
  emotion: string;
  transcript: string;
  emotion_trigger?: string;
  source?: string;
  linked_journal_id?: number;
};

type TimeCapsule = {
  journal: Journal;
  label: string;
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

function RecordingModal({
  capsule,
  onClose,
  onSaved,
}: {
  capsule: TimeCapsule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ transcript: string; message: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const supabase = createClient();

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());
      await handleSave(blob);
    };
    mediaRecorderRef.current = mr;
    mr.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setIsProcessing(true);
  };

  const handleSave = async (blob: Blob) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();

      await supabase.from("journals").insert({
        user_id: userData.user.id,
        transcript: data.transcript || "",
        emotion: data.emotion || "穏やか",
        message: data.message || "",
        source: "timecapsule",
        linked_journal_id: capsule.journal.id,
      });

      setResult({ transcript: data.transcript || "", message: data.message || "" });
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={!result ? onClose : undefined}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-past-label">{capsule.label}のあなた</div>
        <p className="modal-past-quote">
          「{capsule.journal.transcript?.slice(0, 60)}...」
        </p>
        <div className="modal-divider" />

        {isProcessing ? (
          <p className="modal-prompt" style={{ animation: "logs-fade 2s ease-in-out infinite" }}>
            よみとり中...
          </p>
        ) : result ? (
          <div className="modal-result">
            <p className="modal-result-transcript">「{result.transcript}」</p>
            <p className="modal-result-message">{result.message}</p>
            <p className="modal-saved-line">🌙 その言葉、過去のあなたにちゃんと届いてるよ</p>
            <button className="modal-close-btn" onClick={onClose}>閉じる</button>
          </div>
        ) : (
          <>
            <p className="modal-prompt">今の気持ちを話してみて</p>
            <div className="modal-rec-area">
              <button
                className={`modal-rec-btn ${isRecording ? "recording" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <><span className="rec-dot" /><span>止める</span></>
                ) : (
                  <><span>🎙</span><span>話す</span></>
                )}
              </button>
            </div>
            <button className="modal-close-btn" onClick={onClose}>そっと閉じる</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LogsPage() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [timeCapsule, setTimeCapsule] = useState<TimeCapsule | null>(null);
  const [capsuleAI, setCapsuleAI] = useState<string | null>(null);
  const [capsuleClosed, setCapsuleClosed] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
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
      const allData = data || [];
      setJournals(allData);

      const now = Date.now();
      const oneYear  = 365 * 24 * 60 * 60 * 1000;
      const oneMonth =  30 * 24 * 60 * 60 * 1000;
      const oneWeek  =   7 * 24 * 60 * 60 * 1000;
      const window3d =   5 * 24 * 60 * 60 * 1000;

      // timecapsule由来の記録は候補から除外
      const candidates = allData.filter((j: Journal) => j.source !== "timecapsule");

      const findNear = (ms: number): Journal | undefined =>
        candidates.find((j: Journal) => {
          const diff = now - new Date(j.created_at).getTime();
          return Math.abs(diff - ms) < window3d;
        });

      const yearMatch  = findNear(oneYear);
      const monthMatch = findNear(oneMonth);
      const weekMatch  = findNear(oneWeek);

      const capsule: TimeCapsule | null = yearMatch
        ? { journal: yearMatch,  label: "1年前" }
        : monthMatch
        ? { journal: monthMatch, label: "1ヶ月前" }
        : weekMatch
        ? { journal: weekMatch,  label: "1週間前" }
        : null;

      if (capsule) {
        // すでにこの記録に対して録音済みかチェック
        const alreadyRecorded = allData.some(
          (j: Journal) => j.source === "timecapsule" && j.linked_journal_id === capsule.journal.id
        );
        if (alreadyRecorded) setCapsuleClosed(true);

        setTimeCapsule(capsule);

        try {
          const aiRes = await fetch("/api/timecapsule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: capsule.journal.transcript }),
          });
          const aiData = await aiRes.json();
          setCapsuleAI(aiData.message ?? null);
        } catch (e) {
          console.error(e);
        }
      }

      setLoading(false);
    };
    fetchJournals();
  }, []);

  useEffect(() => {
    if (journals.length === 0) return;
    const targetJournals = journals.filter(
      (j) => new Date(j.created_at).getTime() > Date.now() - period * 24 * 60 * 60 * 1000
    );
    generateSummary(targetJournals);
  }, [period, journals]);

  const generateSummary = async (targetJournals: Journal[]) => {
    if (targetJournals.length === 0) { setWeeklySummary(null); return; }
    setIsGenerating(true);
    setWeeklySummary(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const res = await fetch("/api/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journals: targetJournals, period, userId: userData.user?.id }),
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
    if (j.emotion_trigger) triggerMap[j.emotion_trigger] = (triggerMap[j.emotion_trigger] || 0) + 1;
  });
  const sortedTriggers = Object.entries(triggerMap).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .logs-root {
          min-height: 100vh; background: #0a0e1a;
          font-family: 'Noto Sans JP', sans-serif; padding-bottom: 80px;
        }
        .logs-star {
          position: fixed; width: 2px; height: 2px; border-radius: 50%;
          background: rgba(255,255,255,0.5); top: 14%; right: 18%;
          box-shadow: 0 0 5px rgba(255,255,255,0.25);
          pointer-events: none; z-index: 0;
          animation: logs-twinkle 6s ease-in-out infinite;
        }
        @keyframes logs-twinkle { 0%,100%{opacity:0.5} 50%{opacity:0.12} }
        .logs-glow {
          position: fixed; top: -100px; left: 50%; transform: translateX(-50%);
          width: 500px; height: 260px;
          background: radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }
        .logs-header {
          position: sticky; top: 0; z-index: 10; padding: 20px 24px;
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(10,14,26,0.9); backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .logs-header-left { display: flex; align-items: center; gap: 16px; }
        .logs-title {
          font-family: 'Zen Old Mincho', serif; font-size: 14px; font-weight: 400;
          color: rgba(255,255,255,0.55); letter-spacing: 0.18em; margin: 0;
        }
        .logs-back {
          font-size: 11px; color: rgba(139,92,246,0.45);
          background: none; border: none; cursor: pointer;
          letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s;
        }
        .logs-back:hover { color: rgba(139,92,246,0.9); }
        .logs-logout {
          font-size: 11px; color: rgba(255,255,255,0.12);
          background: none; border: none; cursor: pointer;
          letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s;
        }
        .logs-logout:hover { color: rgba(255,100,100,0.5); }
        .period-tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
          border-radius: 20px; padding: 3px;
        }
        .period-tab {
          font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.25);
          background: none; border: none; border-radius: 16px; padding: 5px 12px;
          cursor: pointer; transition: all 0.2s;
          font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.06em;
        }
        .period-tab:hover { color: rgba(255,255,255,0.5); }
        .period-tab--active { background: rgba(139,92,246,0.2); color: rgba(167,139,250,0.9); }
        .logs-body {
          position: relative; z-index: 1;
          max-width: 460px; margin: 0 auto; padding: 32px 20px 0;
        }
        .logs-section-label {
          font-family: 'Zen Old Mincho', serif; font-size: 11px; letter-spacing: 0.3em;
          color: rgba(255,255,255,0.4); margin: 0 0 20px 2px;
        }
        .emotion-room {
          display: flex; align-items: center; gap: 14px;
          border-radius: 14px; padding: 18px 20px; margin-bottom: 8px;
          border: 1px solid rgba(255,255,255,0.05); cursor: pointer;
          transition: border-color 0.2s, transform 0.2s;
          animation: room-in 0.5s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes room-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .emotion-room:hover { border-color: rgba(255,255,255,0.1); transform: translateY(-1px); }
        .emotion-room-emoji { font-size: 24px; flex-shrink: 0; line-height: 1; }
        .emotion-room-main { flex: 1; min-width: 0; }
        .emotion-room-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .emotion-room-name { font-size: 15px; font-weight: 400; }
        .emotion-room-spark-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .emotion-room-spark-label { font-size: 9px; color: rgba(255,255,255,0.55); letter-spacing: 0.1em; }
        .emotion-room-spark { font-size: 12px; letter-spacing: 0.12em; opacity: 0.8; }
        .emotion-room-bottom { display: flex; align-items: baseline; gap: 10px; }
        .emotion-room-count { font-size: 13px; font-weight: 300; color: rgba(255,255,255,0.55); flex-shrink: 0; }
        .emotion-room-whisper { font-size: 11px; color: rgba(255,255,255,0.55); letter-spacing: 0.04em; margin: 0; }
        .emotion-room-arrow { font-size: 12px; color: rgba(255,255,255,0.1); flex-shrink: 0; }
        .logs-empty { text-align: center; padding: 80px 0; }
        .logs-empty-icon { font-size: 36px; opacity: 0.3; margin-bottom: 16px; }
        .logs-empty-text { font-size: 13px; color: rgba(255,255,255,0.2); line-height: 2; margin: 0; }
        .logs-loading { display:flex; align-items:center; justify-content:center; min-height:40vh; }
        .logs-loading-text { font-size:12px; color:rgba(255,255,255,0.18); letter-spacing:0.12em; animation:logs-fade 2s ease-in-out infinite; }
        @keyframes logs-fade { 0%,100%{opacity:0.3} 50%{opacity:1} }
        .logs-total { font-size: 11px; color: rgba(255,255,255,0.3); text-align: center; margin-top: 40px; letter-spacing: 0.1em; }
        .summary-emerge { animation: summary-in 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes summary-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

        /* タイムカプセル */
        .capsule-wrap {
          margin-top: 48px;
          animation: room-in 0.6s cubic-bezier(0.16,1,0.3,1) both;
          animation-delay: 0.2s; opacity: 0;
        }
        .capsule-card {
          border-radius: 16px; border: 1px solid rgba(139,92,246,0.2);
          background: rgba(139,92,246,0.04); padding: 24px 22px;
          position: relative; overflow: hidden;
        }
        .capsule-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent);
        }
        .capsule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .capsule-moon { font-size: 14px; }
        .capsule-invite {
          font-size: 11px; letter-spacing: 0.2em; color: rgba(167,139,250,0.6);
          font-family: 'Zen Old Mincho', serif;
        }
        .capsule-past-label { font-size: 11px; color: rgba(255,255,255,0.3); letter-spacing: 0.1em; margin-bottom: 10px; }
        .capsule-quote {
          font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.85;
          letter-spacing: 0.03em; margin: 0 0 20px 0; padding-left: 12px;
          border-left: 2px solid rgba(139,92,246,0.25); font-style: italic;
        }
        .capsule-arrow { text-align: center; font-size: 11px; color: rgba(255,255,255,0.15); letter-spacing: 0.15em; margin-bottom: 16px; }
        .capsule-ai { font-size: 13px; color: rgba(167,139,250,0.75); line-height: 1.85; letter-spacing: 0.03em; margin: 0 0 8px 0; }
        .capsule-ai-loading { font-size: 12px; color: rgba(255,255,255,0.18); letter-spacing: 0.1em; animation: logs-fade 2s ease-in-out infinite; margin-bottom: 8px; }
        .capsule-prompt { font-size: 12px; color: rgba(255,255,255,0.35); letter-spacing: 0.08em; margin: 0 0 20px 0; }
        .capsule-btns { display: flex; flex-direction: column; gap: 8px; }
        .capsule-btn-talk {
          width: 100%; padding: 13px; border-radius: 10px;
          border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.1);
          color: rgba(167,139,250,0.9); font-size: 13px;
          font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em;
          cursor: pointer; transition: all 0.2s;
        }
        .capsule-btn-talk:hover { background: rgba(139,92,246,0.18); border-color: rgba(139,92,246,0.5); }
        .capsule-btn-close {
          width: 100%; padding: 10px; border-radius: 10px; border: none; background: none;
          color: rgba(255,255,255,0.2); font-size: 12px;
          font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em; cursor: pointer; transition: color 0.2s;
        }
        .capsule-btn-close:hover { color: rgba(255,255,255,0.4); }
        .capsule-closed-msg { font-size: 12px; color: rgba(255,255,255,0.25); text-align: center; letter-spacing: 0.08em; padding: 8px 0; line-height: 1.8; }

        /* 録音モーダル */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px); display: flex; align-items: flex-end; justify-content: center;
          animation: overlay-in 0.2s ease;
        }
        @keyframes overlay-in { from{opacity:0} to{opacity:1} }
        .modal-card {
          width: 100%; max-width: 460px; background: #0f1324;
          border: 1px solid rgba(139,92,246,0.2); border-bottom: none;
          border-radius: 20px 20px 0 0; padding: 28px 24px 40px;
          animation: modal-up 0.35s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes modal-up { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .modal-past-label { font-size: 11px; color: rgba(255,255,255,0.3); letter-spacing: 0.15em; margin-bottom: 8px; }
        .modal-past-quote {
          font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.75; letter-spacing: 0.03em;
          margin: 0 0 16px 0; padding-left: 10px; border-left: 2px solid rgba(139,92,246,0.2); font-style: italic;
        }
        .modal-divider { border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 16px 0; }
        .modal-prompt {
          font-size: 14px; color: rgba(255,255,255,0.65); letter-spacing: 0.06em;
          text-align: center; margin: 0 0 24px 0; font-family: 'Zen Old Mincho', serif;
        }
        .modal-rec-area { display: flex; justify-content: center; margin-bottom: 16px; }
        .modal-rec-btn {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          width: 80px; height: 80px; border-radius: 50%;
          border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.08);
          color: rgba(167,139,250,0.9); font-size: 12px; font-family: 'Noto Sans JP', sans-serif;
          cursor: pointer; transition: all 0.2s;
        }
        .modal-rec-btn.recording {
          border-color: rgba(244,132,106,0.5); background: rgba(244,132,106,0.08);
          color: rgba(244,132,106,0.9); animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,132,106,0.2)} 50%{box-shadow:0 0 0 8px rgba(244,132,106,0)} }
        .rec-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(244,132,106,0.9); }
        .modal-close-btn {
          display: block; width: 100%; padding: 10px; border: none; background: none;
          color: rgba(255,255,255,0.2); font-size: 12px;
          font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em;
          cursor: pointer; transition: color 0.2s; text-align: center;
        }
        .modal-close-btn:hover { color: rgba(255,255,255,0.4); }
        .modal-result { text-align: left; padding: 8px 0; animation: summary-in 0.5s ease forwards; }
        .modal-result-transcript {
          font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.75; letter-spacing: 0.03em;
          margin: 0 0 16px 0; font-style: italic; padding: 12px;
          background: rgba(255,255,255,0.03); border-radius: 10px;
        }
        .modal-result-message {
          font-size: 14px; color: rgba(167,139,250,0.85); line-height: 1.85;
          letter-spacing: 0.03em; margin: 0 0 20px 0;
        }
        .modal-saved-line {
          font-size: 12px; color: rgba(255,255,255,0.3); letter-spacing: 0.06em;
          margin: 0 0 20px 0; text-align: center;
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
                const cfg = emotionConfig[emotion] || { emoji: "💭", color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.03)", whisper: "" };
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
                  <div style={{ borderRadius: "14px", border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden" }}>
                    {sortedTriggers.map(([trigger, count], i) => {
                      const ratio = count / sortedTriggers[0][1];
                      return (
                        <div key={trigger} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 18px", borderBottom: i < sortedTriggers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: "rgba(255,255,255,0.015)" }}>
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", width: "16px", textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                          <span style={{ flex: 1, fontSize: "13px", color: "rgba(255,255,255,0.65)", letterSpacing: "0.04em" }}>{trigger}</span>
                          <div style={{ width: "72px", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                            <div style={{ width: `${ratio * 100}%`, height: "100%", borderRadius: "2px", background: "rgba(139,92,246,0.6)" }} />
                          </div>
                          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", flexShrink: 0, width: "24px", textAlign: "right" }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ふりかえり */}
              <div style={{ marginTop: "40px" }}>
                <p className="logs-section-label">この{period}日のふりかえり</p>
                <div style={{ borderRadius: "14px", border: "1px solid rgba(139,92,246,0.15)", background: "rgba(139,92,246,0.04)", padding: "20px 22px", minHeight: "64px", display: "flex", alignItems: "center" }}>
                  {isGenerating ? (
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.18)", letterSpacing: "0.12em", margin: 0, animation: "logs-fade 2s ease-in-out infinite" }}>よみとり中...</p>
                  ) : weeklySummary ? (
                    <p className="summary-emerge" style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", lineHeight: "1.9", letterSpacing: "0.04em", margin: 0 }}>{weeklySummary}</p>
                  ) : null}
                </div>
              </div>

              {/* タイムカプセル */}
              {timeCapsule && (
                <div className="capsule-wrap">
                  <p className="logs-section-label">過去のあなたへ</p>
                  <div className="capsule-card">
                    <div className="capsule-header">
                      <span className="capsule-moon">🌙</span>
                      <span className="capsule-invite">今日、会ってみる？</span>
                    </div>
                    <p className="capsule-past-label">{timeCapsule.label}のあなた</p>
                    <p className="capsule-quote">
                      「{timeCapsule.journal.transcript?.slice(0, 80)}
                      {(timeCapsule.journal.transcript?.length ?? 0) > 80 ? "..." : ""}」
                    </p>
                    <div className="capsule-arrow">↓</div>
                    {capsuleAI ? (
                      <p className="capsule-ai">{capsuleAI}</p>
                    ) : (
                      <p className="capsule-ai-loading">よみとり中...</p>
                    )}

                    {capsuleClosed ? (
                      <p className="capsule-closed-msg">また話したくなったら、<br />いつでもここにあるよ</p>
                    ) : (
                      <>
                        <p className="capsule-prompt">今のあなたはどう感じる？</p>
                        <div className="capsule-btns">
                          <button className="capsule-btn-talk" onClick={() => setShowRecordModal(true)}>
                            今の気持ちを話す
                          </button>
                          <button className="capsule-btn-close" onClick={() => setCapsuleClosed(true)}>
                            そっと閉じる
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <p className="logs-total">合計 {filtered.length} 件のきろく</p>
            </>
          )}
        </div>
      </div>

      {showRecordModal && timeCapsule && (
        <RecordingModal
          capsule={timeCapsule}
          onClose={() => setShowRecordModal(false)}
          onSaved={() => {
            setCapsuleClosed(true);
            setShowRecordModal(false);
          }}
        />
      )}
    </>
  );
}
