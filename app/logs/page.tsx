"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "../lib/supabase";
import { readJson } from "../lib/http";
import { useRouter } from "next/navigation";

type SessionMessage = { role: "user" | "yoru"; content: string };

type Journal = {
  id: number;
  created_at: string;
  emotion: string;
  transcript: string;
  summary?: string;
  nuance?: string;
  insight?: string;
  emotion_trigger?: string;
  message?: string;
  source?: string;
  linked_journal_id?: number;
  messages?: SessionMessage[] | null;
  session_status?: string;
};

// セッション行の往復を発話者つきで描画する。messages が無ければ transcript を素朴に表示。
function SessionDialogue({ journal }: { journal: Journal }) {
  const msgs = Array.isArray(journal.messages) ? journal.messages : [];
  if (msgs.length === 0) {
    return <p className="detail-transcript" style={{ whiteSpace: "pre-wrap" }}>{journal.transcript}</p>;
  }
  return (
    <div className="session-dialogue">
      {msgs.map((m, i) => (
        <div key={i} className={`session-turn session-turn--${m.role}`}>
          <span className="session-turn-who">{m.role === "yoru" ? "YORU" : "あなた"}</span>
          <p className="session-turn-text">{m.content}</p>
        </div>
      ))}
    </div>
  );
}

type InsightMemo = {
  id: number;
  content: string;
  created_at: string;
};

type TimeCapsule = {
  journal: Journal;
  label: string;
};

type CapsuleReply = {
  transcript: string;
  message: string;
  emotion: string;
};

const PERIODS = [
  { label: "7日",  days: 7 },
  { label: "30日", days: 30 },
  { label: "90日", days: 90 },
];

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatDateLabel(str: string): string {
  const d = new Date(str);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const wd = `(${weekdays[d.getDay()]})`;
  if (formatDateKey(d) === formatDateKey(today)) return `${d.getMonth()+1}月${d.getDate()}日 ${wd}`;
  if (formatDateKey(d) === formatDateKey(yesterday)) return `昨日 ${d.getMonth()+1}月${d.getDate()}日 ${wd}`;
  return `${d.getMonth()+1}月${d.getDate()}日 ${wd}`;
}

function formatCapsuleDate(str: string) {
  const d = new Date(str);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function JournalCard({ journal }: { journal: Journal }) {
  const [expanded, setExpanded] = useState(false);
  const isSession = journal.source === "session";
  const isTextMemo = journal.transcript === journal.summary;
  const hasTranscript = journal.transcript && journal.transcript.length > 0 && !isTextMemo;
  const isLong = (journal.transcript?.length ?? 0) > 60;

  if (isSession) {
    const turnCount = Array.isArray(journal.messages) ? journal.messages.length : 0;
    return (
      <div className="jcard">
        <p className="jcard-time">
          {new Date(journal.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          <span className="jcard-session-tag">対話</span>
        </p>
        {journal.nuance && <p className="jcard-nuance">{journal.nuance}</p>}
        {turnCount > 0 && (
          <div className="jcard-transcript-wrap">
            {expanded ? (
              <>
                <SessionDialogue journal={journal} />
                <button className="jcard-expand-btn" onClick={() => setExpanded(false)}>▲ 閉じる</button>
              </>
            ) : (
              <button className="jcard-expand-btn" onClick={() => setExpanded(true)}>
                やりとりを見る ▼
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="jcard">
      <p className="jcard-time">
        {new Date(journal.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
      </p>
      {journal.nuance && <p className="jcard-nuance">{journal.nuance}</p>}
      {hasTranscript && (
        <div className="jcard-transcript-wrap">
          {expanded ? (
            <>
              <p className="jcard-transcript">{journal.transcript}</p>
              <button className="jcard-expand-btn" onClick={() => setExpanded(false)}>▲ 閉じる</button>
            </>
          ) : (
            <button className="jcard-expand-btn" onClick={() => setExpanded(true)}>
              {isLong ? `"${journal.transcript.slice(0, 30)}..." ▼ もっと見る` : `"${journal.transcript}" ▼`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function JournalDetailModal({ journal, onClose, onBack }: { journal: Journal; onClose: () => void; onBack: () => void; }) {
  const d = new Date(journal.created_at);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(${weekdays[d.getDay()]}) ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <p className="detail-date">{dateStr}</p>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>
        {journal.nuance && (
          <div className="detail-section">
            <p className="detail-label">この記録</p>
            <p className="detail-nuance">{journal.nuance}</p>
          </div>
        )}
        {journal.source === "session" ? (
          <div className="detail-section">
            <p className="detail-label">この日のやりとり</p>
            <SessionDialogue journal={journal} />
          </div>
        ) : journal.transcript ? (
          <div className="detail-section">
            <p className="detail-label">元の発言</p>
            <p className="detail-transcript">{journal.transcript}</p>
          </div>
        ) : null}
        <button className="detail-close-btn" onClick={onBack}>← 戻る</button>
      </div>
    </div>
  );
}

function CalendarModal({ allJournals, onSelect, onClose, initialDate }: {
  allJournals: Journal[];
  onSelect: (journal: Journal) => void;
  onClose: () => void;
  initialDate?: string | null;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null);

  const candidates = allJournals.filter((j) => j.source !== "timecapsule");
  const dateMap: { [key: string]: Journal[] } = {};
  candidates.forEach((j) => {
    const key = formatDateKey(new Date(j.created_at));
    if (!dateMap[key]) dateMap[key] = [];
    dateMap[key].push(j);
  });

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const selectedJournals = selectedDate ? (dateMap[selectedDate] || []) : [];

  return (
    <div className="cal-overlay" onClick={onClose}>
      <div className="cal-card" onClick={(e) => e.stopPropagation()}>
        {selectedDate && selectedJournals.length > 0 ? (
          <div className="cal-list">
            <div className="cal-list-header">
              <button className="cal-list-back" onClick={() => setSelectedDate(null)}>← 戻る</button>
              <p className="cal-list-date">{selectedDate.replace(/-/g, "/")}</p>
            </div>
            {selectedJournals.map((j) => (
              <div key={j.id} className="cal-list-item" onClick={() => onSelect(j)}>
                <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", margin: "0 0 6px 0" }}>{formatCapsuleDate(j.created_at)}</p>
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: "1.6", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {j.nuance || j.transcript || "（記録なし）"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="cal-header">
              <button className="cal-nav" onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }}>‹</button>
              <p className="cal-month">{viewYear}年{viewMonth+1}月</p>
              <button className="cal-nav" onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }}>›</button>
            </div>
            <div className="cal-weekdays">
              {["日","月","火","水","木","金","土"].map((d) => <span key={d} className="cal-weekday">{d}</span>)}
            </div>
            <div className="cal-grid">
              {weeks.map((week, wi) =>
                week.map((day, di) => {
                  if (!day) return <div key={`${wi}-${di}`} />;
                  const key = formatDateKey(new Date(viewYear, viewMonth, day));
                  const hasRecord = (dateMap[key] || []).length > 0;
                  const isToday = key === formatDateKey(today);
                  return (
                    <div key={`${wi}-${di}`} className={`cal-day ${hasRecord ? "has-record" : ""} ${isToday ? "is-today" : ""}`} onClick={() => hasRecord && setSelectedDate(key)}>
                      <span className="cal-day-num">{day}</span>
                      {hasRecord && <span className="cal-dot-single" />}
                    </div>
                  );
                })
              )}
            </div>
            <p className="cal-hint">記録のある日をタップ</p>
          </>
        )}
      </div>
    </div>
  );
}

function RecordingModal({ capsule, onClose, onSaved }: { capsule: TimeCapsule; onClose: () => void; onSaved: (reply: CapsuleReply) => void; }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CapsuleReply | null>(null);
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
      const data = (await readJson<{ transcript?: string; emotion?: string }>(res)) ?? {};
      await supabase.from("journals").insert({
        user_id: userData.user.id,
        transcript: data.transcript || "",
        emotion: data.emotion || "穏やか",
        message: "",
        source: "timecapsule",
        linked_journal_id: capsule.journal.id,
      });
      const reply: CapsuleReply = { transcript: data.transcript || "", message: "", emotion: data.emotion || "穏やか" };
      setResult(reply);
      onSaved(reply);
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
        <p className="modal-past-quote">「{capsule.journal.transcript?.slice(0, 60)}...」</p>
        <div className="modal-divider" />
        {isProcessing ? (
          <p className="modal-prompt" style={{ animation: "logs-fade 2s ease-in-out infinite" }}>よみとり中...</p>
        ) : result ? (
          <div className="modal-result">
            <p className="modal-result-label">今のあなた</p>
            <p className="modal-result-transcript">「{result.transcript}」</p>
            <p className="modal-saved-line">🌙 その言葉、過去のあなたにちゃんと届いてるよ</p>
            <button className="modal-close-btn" onClick={onClose}>閉じる</button>
          </div>
        ) : (
          <>
            <p className="modal-prompt">今の気持ちを話してみて</p>
            <div className="modal-rec-area">
              <button className={`modal-rec-btn ${isRecording ? "recording" : ""}`} onClick={isRecording ? stopRecording : startRecording}>
                {isRecording ? <><span className="rec-dot" /><span>止める</span></> : <><span>🎙</span><span>話す</span></>}
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
  const [capsuleReply, setCapsuleReply] = useState<CapsuleReply | null>(null);
  const [capsuleClosed, setCapsuleClosed] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [showFullPast, setShowFullPast] = useState(false);
  const [calendarInitialDate, setCalendarInitialDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"record" | "insight" | "review">("record");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Journal[] | null>(null);
  const [insightMemos, setInsightMemos] = useState<InsightMemo[]>([]);
  const [memoInput, setMemoInput] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchJournals = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.push("/login"); return; }
      const { data } = await supabase.from("journals").select("*").order("created_at", { ascending: false });
      const allData = data || [];
      setJournals(allData);

      const now = Date.now();
      const window2d = 2 * 24 * 60 * 60 * 1000;
      const candidates = allData.filter((j: Journal) => j.source !== "timecapsule");
      const findNear = (ms: number): Journal | undefined =>
        candidates.find((j: Journal) => Math.abs(now - new Date(j.created_at).getTime() - ms) < window2d);
      const makeCapsule = (j: Journal): TimeCapsule => {
        const diffDays = Math.round((now - new Date(j.created_at).getTime()) / (24 * 60 * 60 * 1000));
        const label = diffDays >= 330 ? "1年前" : diffDays >= 25 ? "1ヶ月前" : `${diffDays}日前`;
        return { journal: j, label };
      };
      const oldestDate = candidates.length > 0 ? new Date(candidates[candidates.length - 1].created_at).getTime() : now;
      const totalDays = (now - oldestDate) / (24 * 60 * 60 * 1000);
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      const capsule: TimeCapsule | null =
        totalDays >= 330 && findNear(oneYear) ? makeCapsule(findNear(oneYear)!) :
        totalDays >= 25 && findNear(oneMonth) ? makeCapsule(findNear(oneMonth)!) :
        totalDays >= 5 && findNear(oneWeek) ? makeCapsule(findNear(oneWeek)!) : null;

      if (capsule) {
        setTimeCapsule(capsule);
        const replied = allData.find((j: Journal) => j.source === "timecapsule" && j.linked_journal_id === capsule.journal.id);
        if (replied) {
          setCapsuleReply({ transcript: replied.transcript, message: replied.message || "", emotion: replied.emotion || "穏やか" });
          setCapsuleClosed(true);
        }
      }
      setLoading(false);
    };
    fetchJournals();
  }, []);

  useEffect(() => {
    const fetchMemos = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("insight_memos")
        .select("*")
        .order("created_at", { ascending: false });
      setInsightMemos(data || []);
    };
    fetchMemos();
  }, []);

  const handleSaveMemo = async () => {
    if (!memoInput.trim()) return;
    setMemoSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("insight_memos")
        .insert({ user_id: userData.user.id, content: memoInput.trim() })
        .select()
        .single();
      if (data) {
        setInsightMemos((prev) => [data, ...prev]);
        setMemoInput("");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMemoSaving(false);
    }
  };

  const handleDeleteMemo = async (id: number) => {
    await supabase.from("insight_memos").delete().eq("id", id);
    setInsightMemos((prev) => prev.filter((m) => m.id !== id));
  };

  useEffect(() => {
    if (journals.length === 0) return;
    const targetJournals = journals
      .filter((j) => new Date(j.created_at).getTime() > Date.now() - period * 24 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    generateSummary(targetJournals);
  }, [period, journals]);

  const generateSummary = async (targetJournals: Journal[]) => {
    if (targetJournals.length === 0) { setWeeklySummary(null); return; }
    setIsGenerating(true);
    setWeeklySummary(null);
    try {
      // user_id は送らない。サーバーがCookieのセッションから取る。
      const res = await fetch("/api/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journals: targetJournals, period }),
      });
      const data = await readJson<{ summary?: string | null }>(res);
      setWeeklySummary(data?.summary ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCalendarSelect = (journal: Journal) => {
    const now = Date.now();
    const diffDays = (now - new Date(journal.created_at).getTime()) / (24 * 60 * 60 * 1000);
    const label = diffDays >= 330 ? "1年前" : diffDays >= 25 ? "1ヶ月前" : `${Math.round(diffDays)}日前`;
    setTimeCapsule({ journal, label });
    setCapsuleReply(null);
    setCapsuleClosed(false);
    setShowFullPast(false);
    setShowCalendar(false);
    const replied = journals.find((j) => j.source === "timecapsule" && j.linked_journal_id === journal.id);
    if (replied) {
      setCapsuleReply({ transcript: replied.transcript, message: replied.message || "", emotion: replied.emotion || "穏やか" });
      setCapsuleClosed(true);
    }
  };

  const mainJournals = journals.filter((j) => j.source !== "timecapsule");
  const dateMap: { [key: string]: Journal[] } = {};
  mainJournals.forEach((j) => {
    const key = formatDateKey(new Date(j.created_at));
    if (!dateMap[key]) dateMap[key] = [];
    dateMap[key].push(j);
  });
  const sortedDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));
  const todayKey = formatDateKey(new Date());
  const todayJournals = dateMap[todayKey] || [];
  const cutoff = Date.now() - period * 24 * 60 * 60 * 1000;
  const periodDates = sortedDates.filter((key) => new Date(key).getTime() > cutoff);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      const q = searchQuery.trim().toLowerCase();
      const results = mainJournals
        .filter((j) => {
          const t = (j.transcript || "").toLowerCase();
          const s = (j.summary || "").toLowerCase();
          const n = (j.nuance || "").toLowerCase();
          return t.includes(q) || s.includes(q) || n.includes(q);
        })
        .sort((a, b) => {
          const aT = (a.transcript || "").toLowerCase().includes(q) ? 0 : 1;
          const bT = (b.transcript || "").toLowerCase().includes(q) ? 0 : 1;
          return aT - bT;
        });
      setSearchResults(results);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, mainJournals]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .logs-root { min-height: 100vh; background: #0a0e1a; font-family: 'Noto Sans JP', sans-serif; padding-bottom: 100px; }
        .logs-star { position: fixed; width: 2px; height: 2px; border-radius: 50%; background: rgba(255,255,255,0.5); top: 14%; right: 18%; box-shadow: 0 0 5px rgba(255,255,255,0.25); pointer-events: none; z-index: 0; animation: logs-twinkle 6s ease-in-out infinite; }
        @keyframes logs-twinkle { 0%,100%{opacity:0.5} 50%{opacity:0.12} }
        .logs-glow { position: fixed; top: -100px; left: 50%; transform: translateX(-50%); width: 500px; height: 260px; background: radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%); pointer-events: none; z-index: 0; }

        .logs-header { position: sticky; top: 0; z-index: 10; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; background: rgba(10,14,26,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.04); }
        .logs-header-left { display: flex; align-items: center; gap: 16px; }
        .logs-title { font-family: 'Zen Old Mincho', serif; font-size: 14px; font-weight: 400; color: rgba(255,255,255,0.55); letter-spacing: 0.18em; margin: 0; }
        .logs-back { font-size: 11px; color: rgba(139,92,246,0.45); background: none; border: none; cursor: pointer; letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; }
        .logs-back:hover { color: rgba(139,92,246,0.9); }
        .logs-logout { font-size: 10px; color: rgba(255,255,255,0.08); background: none; border: none; cursor: pointer; letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; text-decoration: underline; text-underline-offset: 3px; }
        .logs-logout:hover { color: rgba(255,100,100,0.4); }

        .tab-bar { position: sticky; top: 61px; z-index: 9; display: flex; background: rgba(10,14,26,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.04); padding: 0 20px; }
        .tab-btn { flex: 1; padding: 14px 0; background: none; border: none; border-bottom: 2px solid transparent; color: rgba(255,255,255,0.25); font-size: 12px; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.12em; cursor: pointer; transition: all 0.2s; }
        .tab-btn:hover { color: rgba(255,255,255,0.5); }
        .tab-btn--active { color: rgba(167,139,250,0.9); border-bottom-color: rgba(139,92,246,0.6); }

        .logs-body { position: relative; z-index: 1; max-width: 460px; margin: 0 auto; padding: 36px 20px 0; }
        .logs-section-label { font-family: 'Zen Old Mincho', serif; font-size: 11px; letter-spacing: 0.3em; color: rgba(255,255,255,0.35); margin: 0 0 16px 2px; }

        .jcard { padding: 20px 20px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); margin-bottom: 10px; transition: border-color 0.2s; animation: card-in 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes card-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .jcard:hover { border-color: rgba(139,92,246,0.2); }
        .jcard-time { font-size: 10px; color: rgba(255,255,255,0.18); letter-spacing: 0.08em; margin: 0 0 10px 0; }
        .jcard-nuance { font-size: 16px; font-weight: 500; color: rgba(255,255,255,0.88); letter-spacing: 0.04em; line-height: 1.5; margin: 0 0 10px 0; font-family: 'Zen Old Mincho', serif; }
        .jcard-transcript-wrap { margin-top: 4px; }
        .jcard-expand-btn { font-size: 11px; color: rgba(139,92,246,0.4); background: none; border: none; cursor: pointer; letter-spacing: 0.04em; font-family: 'Noto Sans JP', sans-serif; padding: 0; transition: color 0.2s; text-align: left; line-height: 1.6; }
        .jcard-expand-btn:hover { color: rgba(139,92,246,0.8); }
        .jcard-transcript { font-size: 12px; color: rgba(255,255,255,0.28); line-height: 1.75; letter-spacing: 0.03em; margin: 0 0 6px 0; padding: 10px 12px; background: rgba(255,255,255,0.02); border-radius: 8px; border-left: 2px solid rgba(139,92,246,0.15); }
        .jcard-session-tag { display: inline-block; margin-left: 10px; font-size: 9px; color: rgba(167,139,250,0.7); background: rgba(139,92,246,0.12); border-radius: 10px; padding: 2px 8px; letter-spacing: 0.1em; vertical-align: middle; }

        .session-dialogue { display: flex; flex-direction: column; gap: 12px; margin: 4px 0 10px; }
        .session-turn { display: flex; flex-direction: column; gap: 4px; }
        .session-turn-who { font-size: 9px; letter-spacing: 0.14em; color: rgba(255,255,255,0.28); }
        .session-turn--yoru .session-turn-who { color: rgba(167,139,250,0.7); }
        .session-turn-text { font-size: 13px; line-height: 1.85; letter-spacing: 0.02em; margin: 0; padding: 8px 12px; border-radius: 10px; white-space: pre-wrap; }
        .session-turn--yoru .session-turn-text { color: rgba(255,255,255,0.72); background: rgba(139,92,246,0.06); border-left: 2px solid rgba(139,92,246,0.3); font-family: 'Zen Old Mincho', serif; }
        .session-turn--user .session-turn-text { color: rgba(255,255,255,0.45); background: rgba(255,255,255,0.02); }

        .today-empty { font-size: 13px; color: rgba(255,255,255,0.18); letter-spacing: 0.06em; padding: 12px 0 20px; }
        .timeline-wrap { margin-top: 44px; }

        .search-wrap { position: relative; margin-bottom: 16px; }
        .search-input { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 12px 40px 12px 16px; font-size: 13px; color: rgba(255,255,255,0.7); outline: none; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.04em; box-sizing: border-box; transition: border-color 0.2s; }
        .search-input:focus { border-color: rgba(139,92,246,0.45); }
        .search-input::placeholder { color: rgba(255,255,255,0.18); }
        .search-clear { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: rgba(255,255,255,0.2); font-size: 12px; cursor: pointer; transition: color 0.2s; padding: 0; }
        .search-clear:hover { color: rgba(255,255,255,0.5); }
        .search-result-item { padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); margin-bottom: 8px; cursor: pointer; transition: border-color 0.2s; animation: card-in 0.3s cubic-bezier(0.16,1,0.3,1) both; }
        .search-result-item:hover { border-color: rgba(139,92,246,0.3); }
        .search-result-date { font-size: 10px; color: rgba(255,255,255,0.2); letter-spacing: 0.06em; margin: 0 0 6px 0; }
        .search-result-nuance { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.82); letter-spacing: 0.04em; margin: 0; font-family: 'Zen Old Mincho', serif; line-height: 1.5; }

        .summary-section { margin-top: 44px; }
        .summary-card { border-radius: 14px; border: 1px solid rgba(139,92,246,0.15); background: rgba(139,92,246,0.03); padding: 22px 24px; min-height: 72px; display: flex; align-items: flex-start; }
        .summary-text { font-size: 14px; color: rgba(255,255,255,0.58); line-height: 2; letter-spacing: 0.04em; margin: 0; animation: card-in 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .summary-loading { font-size: 12px; color: rgba(255,255,255,0.15); letter-spacing: 0.12em; margin: 0; animation: logs-fade 2s ease-in-out infinite; align-self: center; }
        @keyframes logs-fade { 0%,100%{opacity:0.3} 50%{opacity:1} }

        .period-tabs-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
        .period-tabs { display: flex; gap: 4px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 3px; }
        .period-tab { font-size: 11px; color: rgba(255,255,255,0.25); background: none; border: none; border-radius: 16px; padding: 5px 12px; cursor: pointer; transition: all 0.2s; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.06em; }
        .period-tab:hover { color: rgba(255,255,255,0.5); }
        .period-tab--active { background: rgba(139,92,246,0.2); color: rgba(167,139,250,0.9); }

        .capsule-wrap { margin-top: 52px; animation: card-in 0.6s cubic-bezier(0.16,1,0.3,1) both; animation-delay: 0.15s; opacity: 0; }
        .capsule-card { border-radius: 16px; border: 1px solid rgba(139,92,246,0.2); background: rgba(139,92,246,0.04); padding: 24px 22px; position: relative; overflow: hidden; }
        .capsule-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(139,92,246,0.35), transparent); }
        .capsule-header { display: flex; align-items: center; margin-bottom: 18px; }
        .capsule-header-left { display: flex; align-items: center; gap: 8px; }
        .capsule-moon { font-size: 14px; }
        .capsule-invite { font-size: 11px; letter-spacing: 0.2em; color: rgba(167,139,250,0.6); font-family: 'Zen Old Mincho', serif; }
        .capsule-past-label { font-size: 11px; color: rgba(255,255,255,0.28); letter-spacing: 0.1em; margin: 0 0 10px 0; }
        .capsule-quote { font-size: 14px; color: rgba(255,255,255,0.62); line-height: 1.85; letter-spacing: 0.03em; margin: 0 0 4px 0; padding-left: 12px; border-left: 2px solid rgba(139,92,246,0.25); font-style: italic; }
        .capsule-quote-full-btn { font-size: 10px; color: rgba(139,92,246,0.4); background: none; border: none; cursor: pointer; letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif; padding: 0 0 16px 14px; display: block; transition: color 0.2s; }
        .capsule-quote-full-btn:hover { color: rgba(139,92,246,0.8); }
        .capsule-arrow { text-align: center; font-size: 11px; color: rgba(255,255,255,0.12); letter-spacing: 0.15em; margin-bottom: 16px; }
        .capsule-prompt { font-size: 12px; color: rgba(255,255,255,0.32); letter-spacing: 0.08em; margin: 0 0 20px 0; }
        .capsule-btns { display: flex; flex-direction: column; gap: 8px; }
        .capsule-btn-talk { width: 100%; padding: 13px; border-radius: 10px; border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.1); color: rgba(167,139,250,0.9); font-size: 13px; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em; cursor: pointer; transition: all 0.2s; }
        .capsule-btn-talk:hover { background: rgba(139,92,246,0.18); }
        .capsule-btn-close { width: 100%; padding: 10px; border-radius: 10px; border: none; background: none; color: rgba(255,255,255,0.18); font-size: 12px; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em; cursor: pointer; transition: color 0.2s; }
        .capsule-btn-close:hover { color: rgba(255,255,255,0.38); }
        .capsule-reply-label { font-size: 11px; color: rgba(255,255,255,0.28); letter-spacing: 0.1em; margin: 0 0 8px 0; }
        .capsule-reply-quote { font-size: 14px; color: rgba(255,255,255,0.62); line-height: 1.85; letter-spacing: 0.03em; margin: 0 0 12px 0; padding-left: 12px; border-left: 2px solid rgba(167,139,250,0.3); font-style: italic; }
        .capsule-closed-msg { font-size: 12px; color: rgba(255,255,255,0.22); text-align: center; letter-spacing: 0.08em; padding: 8px 0; line-height: 1.8; }

        .logs-empty { text-align: center; padding: 80px 0; }
        .logs-empty-icon { font-size: 36px; opacity: 0.3; margin-bottom: 16px; }
        .logs-empty-text { font-size: 13px; color: rgba(255,255,255,0.2); line-height: 2; margin: 0; }
        .logs-loading { display:flex; align-items:center; justify-content:center; min-height:40vh; }
        .logs-loading-text { font-size:12px; color:rgba(255,255,255,0.18); letter-spacing:0.12em; animation:logs-fade 2s ease-in-out infinite; }
        .logs-total { font-size: 11px; color: rgba(255,255,255,0.2); text-align: center; margin-top: 44px; letter-spacing: 0.1em; }

        .talk-btn-wrap { margin-top: 52px; text-align: center; }
        .talk-btn { font-size: 13px; color: rgba(167,139,250,0.8); background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.22); border-radius: 24px; padding: 14px 36px; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.12em; transition: all 0.2s; }
        .talk-btn:hover { background: rgba(139,92,246,0.15); border-color: rgba(139,92,246,0.38); }

        .past-action-btn { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid rgba(139,92,246,0.2); background: rgba(139,92,246,0.05); color: rgba(167,139,250,0.7); font-size: 12px; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.08em; cursor: pointer; transition: all 0.2s; }
        .past-action-btn:hover { background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.35); }

        .cal-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
        @keyframes overlay-in { from{opacity:0} to{opacity:1} }
        .cal-card { width: 90%; max-width: 380px; background: #0f1324; border: 1px solid rgba(139,92,246,0.2); border-radius: 20px; padding: 28px 24px 32px; animation: modal-up 0.35s cubic-bezier(0.16,1,0.3,1); max-height: 80vh; overflow-y: auto; }
        @keyframes modal-up { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .cal-nav { font-size: 20px; color: rgba(139,92,246,0.5); background: none; border: none; cursor: pointer; padding: 4px 12px; transition: color 0.2s; }
        .cal-nav:hover { color: rgba(139,92,246,0.9); }
        .cal-month { font-family: 'Zen Old Mincho', serif; font-size: 14px; color: rgba(255,255,255,0.6); letter-spacing: 0.15em; margin: 0; }
        .cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 8px; }
        .cal-weekday { text-align: center; font-size: 10px; color: rgba(255,255,255,0.2); padding: 4px 0; }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 16px; }
        .cal-day { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 40px; border-radius: 8px; padding: 4px 2px; transition: background 0.15s; }
        .cal-day.has-record { cursor: pointer; }
        .cal-day.has-record:hover { background: rgba(139,92,246,0.1); }
        .cal-day.is-today .cal-day-num { color: rgba(167,139,250,0.9); font-weight: 500; }
        .cal-day-num { font-size: 12px; color: rgba(255,255,255,0.25); line-height: 1; margin-bottom: 3px; }
        .cal-day.has-record .cal-day-num { color: rgba(255,255,255,0.75); }
        .cal-dot-single { width: 4px; height: 4px; border-radius: 50%; background: rgba(139,92,246,0.6); }
        .cal-hint { font-size: 10px; color: rgba(255,255,255,0.15); text-align: center; margin: 0; }
        .cal-list-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .cal-list-back { font-size: 11px; color: rgba(139,92,246,0.45); background: none; border: none; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; padding: 0; }
        .cal-list-back:hover { color: rgba(139,92,246,0.9); }
        .cal-list-date { font-size: 13px; color: rgba(255,255,255,0.4); margin: 0; }
        .cal-list-item { padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); margin-bottom: 8px; cursor: pointer; transition: border-color 0.2s; }
        .cal-list-item:hover { border-color: rgba(139,92,246,0.3); }

        .modal-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: flex; align-items: flex-end; justify-content: center; animation: overlay-in 0.2s ease; }
        .modal-card { width: 100%; max-width: 460px; background: #0f1324; border: 1px solid rgba(139,92,246,0.2); border-bottom: none; border-radius: 20px 20px 0 0; padding: 28px 24px 40px; animation: modal-up 0.35s cubic-bezier(0.16,1,0.3,1); }
        .modal-past-label { font-size: 11px; color: rgba(255,255,255,0.28); letter-spacing: 0.15em; margin-bottom: 8px; }
        .modal-past-quote { font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.75; letter-spacing: 0.03em; margin: 0 0 16px 0; padding-left: 10px; border-left: 2px solid rgba(139,92,246,0.2); font-style: italic; }
        .modal-divider { border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 16px 0; }
        .modal-prompt { font-size: 14px; color: rgba(255,255,255,0.62); letter-spacing: 0.06em; text-align: center; margin: 0 0 24px 0; font-family: 'Zen Old Mincho', serif; }
        .modal-rec-area { display: flex; justify-content: center; margin-bottom: 16px; }
        .modal-rec-btn { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 80px; height: 80px; border-radius: 50%; border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.08); color: rgba(167,139,250,0.9); font-size: 12px; font-family: 'Noto Sans JP', sans-serif; cursor: pointer; transition: all 0.2s; }
        .modal-rec-btn.recording { border-color: rgba(244,132,106,0.5); background: rgba(244,132,106,0.08); color: rgba(244,132,106,0.9); animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,132,106,0.2)} 50%{box-shadow:0 0 0 8px rgba(244,132,106,0)} }
        .rec-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(244,132,106,0.9); }
        .modal-close-btn { display: block; width: 100%; padding: 10px; border: none; background: none; color: rgba(255,255,255,0.18); font-size: 12px; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em; cursor: pointer; transition: color 0.2s; text-align: center; }
        .modal-close-btn:hover { color: rgba(255,255,255,0.38); }
        .modal-result { padding: 8px 0; animation: card-in 0.5s ease forwards; }
        .modal-result-label { font-size: 11px; color: rgba(255,255,255,0.28); letter-spacing: 0.1em; margin-bottom: 8px; }
        .modal-result-transcript { font-size: 13px; color: rgba(255,255,255,0.62); line-height: 1.75; margin: 0 0 12px 0; font-style: italic; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; }
        .modal-saved-line { font-size: 12px; color: rgba(255,255,255,0.28); letter-spacing: 0.06em; margin: 0 0 20px 0; text-align: center; }

        .detail-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
        .detail-card { width: 90%; max-width: 400px; background: #0f1324; border: 1px solid rgba(139,92,246,0.25); border-radius: 20px; padding: 28px 24px 24px; max-height: 80vh; overflow-y: auto; animation: modal-up 0.35s cubic-bezier(0.16,1,0.3,1); }
        .detail-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .detail-date { font-size: 11px; color: rgba(255,255,255,0.28); letter-spacing: 0.08em; margin: 0; }
        .detail-close { font-size: 14px; color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; transition: color 0.2s; padding: 0; }
        .detail-close:hover { color: rgba(255,255,255,0.5); }
        .detail-section { margin-bottom: 20px; }
        .detail-label { font-size: 10px; color: rgba(255,255,255,0.25); letter-spacing: 0.2em; margin: 0 0 8px 0; font-family: 'Zen Old Mincho', serif; }
        .detail-nuance { font-size: 18px; font-weight: 500; color: rgba(255,255,255,0.88); letter-spacing: 0.04em; line-height: 1.5; margin: 0; font-family: 'Zen Old Mincho', serif; }
        .detail-transcript { font-size: 12px; color: rgba(255,255,255,0.32); line-height: 1.8; letter-spacing: 0.03em; margin: 0; padding: 12px 14px; background: rgba(255,255,255,0.02); border-radius: 10px; border-left: 2px solid rgba(139,92,246,0.15); }
        .detail-close-btn { display: block; width: 100%; padding: 12px; border: none; background: none; color: rgba(255,255,255,0.18); font-size: 12px; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em; cursor: pointer; transition: color 0.2s; text-align: center; margin-top: 4px; }
        .detail-close-btn:hover { color: rgba(255,255,255,0.38); }

        /* 気づきメモ */
        .memo-input-wrap { margin-bottom: 28px; }
        .memo-textarea { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.2); border-radius: 14px; padding: 16px; font-size: 14px; color: rgba(255,255,255,0.75); outline: none; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.04em; line-height: 1.8; resize: none; box-sizing: border-box; transition: border-color 0.2s; min-height: 100px; }
        .memo-textarea:focus { border-color: rgba(139,92,246,0.45); }
        .memo-textarea::placeholder { color: rgba(255,255,255,0.18); }
        .memo-save-btn { width: 100%; margin-top: 10px; padding: 13px; border-radius: 12px; border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.1); color: rgba(167,139,250,0.9); font-size: 13px; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em; cursor: pointer; transition: all 0.2s; }
        .memo-save-btn:hover { background: rgba(139,92,246,0.18); }
        .memo-save-btn:disabled { opacity: 0.4; cursor: default; }
        .memo-list { margin-top: 8px; }
        .memo-card { padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); margin-bottom: 10px; animation: card-in 0.4s cubic-bezier(0.16,1,0.3,1) both; position: relative; }
        .memo-card-date { font-size: 10px; color: rgba(255,255,255,0.18); letter-spacing: 0.08em; margin: 0 0 8px 0; }
        .memo-card-content { font-size: 14px; color: rgba(255,255,255,0.78); line-height: 1.8; letter-spacing: 0.03em; margin: 0; white-space: pre-wrap; }
        .memo-delete-btn { position: absolute; top: 14px; right: 14px; background: none; border: none; color: rgba(255,255,255,0.1); font-size: 12px; cursor: pointer; transition: color 0.2s; padding: 0; }
        .memo-delete-btn:hover { color: rgba(255,100,100,0.4); }
        .memo-empty { text-align: center; padding: 48px 0; }
        .memo-empty-text { font-size: 13px; color: rgba(255,255,255,0.18); line-height: 2; margin: 0; letter-spacing: 0.06em; }
      `}</style>

      <div className="logs-root">
        <div className="logs-star" />
        <div className="logs-glow" />

        <header className="logs-header">
          <div className="logs-header-left">
            <h1 className="logs-title">きろく</h1>
            <button className="logs-back" onClick={() => router.push("/")}>← 話す</button>
          </div>
          <button className="logs-logout" onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}>ログアウト</button>
        </header>

        <div className="tab-bar">
          <button className={`tab-btn ${activeTab === "record" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("record")}>きろく</button>
          <button className={`tab-btn ${activeTab === "insight" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("insight")}>気づき</button>
          <button className={`tab-btn ${activeTab === "review" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("review")}>ふりかえり</button>
        </div>

        <div className="logs-body">
          {loading ? (
            <div className="logs-loading"><p className="logs-loading-text">よみこみ中...</p></div>
          ) : (
            <>
              {activeTab === "record" && (
                <>
                  {mainJournals.length === 0 ? (
                    <div className="logs-empty">
                      <div className="logs-empty-icon">🌙</div>
                      <p className="logs-empty-text">まだきろくがないよ<br />何か話してみて</p>
                    </div>
                  ) : (
                    <>
                      <p className="logs-section-label">今日の記録 — {formatDateLabel(todayKey)}</p>
                      {todayJournals.length === 0 ? (
                        <p className="today-empty">今日はまだ話してないよ</p>
                      ) : (
                        todayJournals.map((j, i) => (
                          <div key={j.id} style={{ animationDelay: `${i * 0.05}s` }}>
                            <JournalCard journal={j} />
                          </div>
                        ))
                      )}

                      <div className="timeline-wrap">
                        <p className="logs-section-label">過去の記録</p>
                        <div className="search-wrap">
                          <input
                            className="search-input"
                            type="text"
                            placeholder="キーワードで探す..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          {searchQuery && (
                            <button className="search-clear" onClick={() => setSearchQuery("")}>✕</button>
                          )}
                        </div>

                        {searchQuery.trim() ? (
                          searchResults === null ? (
                            <p className="today-empty">検索中...</p>
                          ) : searchResults.length === 0 ? (
                            <p className="today-empty">「{searchQuery}」に一致する記録はないよ</p>
                          ) : (
                            <>
                              <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", margin: "0 0 12px 0" }}>
                                {searchResults.length}件見つかったよ
                              </p>
                              {searchResults.map((j) => (
                                <div key={j.id} className="search-result-item" onClick={() => setSelectedJournal(j)}>
                                  <p className="search-result-date">
                                    {formatDateLabel(formatDateKey(new Date(j.created_at)))} {new Date(j.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                  {j.nuance && <p className="search-result-nuance">{j.nuance}</p>}
                                </div>
                              ))}
                            </>
                          )
                        ) : (
                          <button className="past-action-btn" onClick={() => setShowCalendar(true)}>
                            📅 カレンダーで見る
                          </button>
                        )}
                      </div>

                      <div className="talk-btn-wrap">
                        <button className="talk-btn" onClick={() => router.push("/")}>今の気持ちを話す</button>
                      </div>
                    </>
                  )}
                </>
              )}

              {activeTab === "insight" && (
                <>
                  <p className="logs-section-label">気づきのメモ</p>
                  <div className="memo-input-wrap">
                    <textarea
                      className="memo-textarea"
                      placeholder="話していて気づいたこと、ふと思ったこと..."
                      value={memoInput}
                      onChange={(e) => setMemoInput(e.target.value)}
                    />
                    <button
                      className="memo-save-btn"
                      onClick={handleSaveMemo}
                      disabled={memoSaving || !memoInput.trim()}
                    >
                      {memoSaving ? "保存中..." : "書き留める"}
                    </button>
                  </div>

                  <div className="memo-list">
                    {insightMemos.length === 0 ? (
                      <div className="memo-empty">
                        <p className="memo-empty-text">気づいたことを<br />ここに書き留めてみて</p>
                      </div>
                    ) : (
                      insightMemos.map((memo) => (
                        <div key={memo.id} className="memo-card">
                          <p className="memo-card-date">
                            {formatDateLabel(formatDateKey(new Date(memo.created_at)))} {new Date(memo.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <p className="memo-card-content">{memo.content}</p>
                          <button className="memo-delete-btn" onClick={() => handleDeleteMemo(memo.id)}>✕</button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {activeTab === "review" && (
                <>
                  <div className="period-tabs-wrap">
                    <div className="period-tabs">
                      {PERIODS.map((p) => (
                        <button key={p.days} className={`period-tab ${period === p.days ? "period-tab--active" : ""}`} onClick={() => setPeriod(p.days)}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="summary-section">
                    <p className="logs-section-label">この{period}日のふりかえり</p>
                    <div className="summary-card">
                      {isGenerating ? (
                        <p className="summary-loading">よみとり中...</p>
                      ) : weeklySummary ? (
                        <p className="summary-text">{weeklySummary}</p>
                      ) : periodDates.length < 3 ? (
                        <p className="summary-loading">記録が3件以上になると振り返りが見えてくるよ</p>
                      ) : (
                        <p className="summary-loading">振り返りを生成できなかったよ</p>
                      )}
                    </div>
                  </div>

                  {timeCapsule ? (
                    <div className="capsule-wrap">
                      <p className="logs-section-label">過去のあなたへ</p>
                      <div className="capsule-card">
                        <div className="capsule-header">
                          <div className="capsule-header-left">
                            <span className="capsule-moon">🌙</span>
                            <span className="capsule-invite">{timeCapsule.label}のあなたに、会ってみる？</span>
                          </div>
                        </div>
                        <p className="capsule-past-label">{timeCapsule.label} — {formatCapsuleDate(timeCapsule.journal.created_at)}</p>
                        <p className="capsule-quote">
                          「{showFullPast ? timeCapsule.journal.transcript : timeCapsule.journal.transcript?.slice(0, 80) + ((timeCapsule.journal.transcript?.length ?? 0) > 80 ? "..." : "")}」
                        </p>
                        {(timeCapsule.journal.transcript?.length ?? 0) > 80 && (
                          <button className="capsule-quote-full-btn" onClick={() => setShowFullPast(!showFullPast)}>
                            {showFullPast ? "▲ 閉じる" : "▼ 全文を見る"}
                          </button>
                        )}
                        <div className="capsule-arrow">↓</div>
                        {capsuleReply ? (
                          <div>
                            <p className="capsule-reply-label">今のあなた</p>
                            <p className="capsule-reply-quote">「{capsuleReply.transcript}」</p>
                            <p className="capsule-closed-msg">また話したくなったら、<br />いつでもここにきてね</p>
                          </div>
                        ) : capsuleClosed ? (
                          <p className="capsule-closed-msg">また話したくなったら、<br />いつでもここにきてね</p>
                        ) : (
                          <>
                            <p className="capsule-prompt">今のあなたはどう感じる？</p>
                            <div className="capsule-btns">
                              <button className="capsule-btn-talk" onClick={() => setShowRecordModal(true)}>今の気持ちを話す</button>
                              <button className="capsule-btn-close" onClick={() => setCapsuleClosed(true)}>そっと閉じる</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="capsule-wrap">
                      <p className="logs-section-label">過去のあなたへ</p>
                      <div className="capsule-card" style={{ textAlign: "center" }}>
                        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.28)", margin: "0", lineHeight: "1.8" }}>
                          記録が増えると<br />過去のあなたに会えるよ
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="logs-total">合計 {mainJournals.length} 件のきろく</p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showCalendar && (
        <CalendarModal
          allJournals={journals}
          initialDate={calendarInitialDate}
          onSelect={(journal) => {
            setCalendarInitialDate(formatDateKey(new Date(journal.created_at)));
            setShowCalendar(false);
            setSelectedJournal(journal);
          }}
          onClose={() => {
            setShowCalendar(false);
            setCalendarInitialDate(null);
          }}
        />
      )}

      {showRecordModal && timeCapsule && (
        <RecordingModal
          capsule={timeCapsule}
          onClose={() => setShowRecordModal(false)}
          onSaved={(reply) => { setCapsuleReply(reply); setCapsuleClosed(true); setShowRecordModal(false); }}
        />
      )}

      {selectedJournal && (
        <JournalDetailModal
          journal={selectedJournal}
          onClose={() => {
            setSelectedJournal(null);
            setCalendarInitialDate(null);
          }}
          onBack={() => {
            setSelectedJournal(null);
            setShowCalendar(true);
          }}
        />
      )}
    </>
  );
}
