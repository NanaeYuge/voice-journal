"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "./lib/supabase";
import { readJson } from "./lib/http";
import { useRouter } from "next/navigation";

type Role = "user" | "yoru";
type Message = { role: Role; content: string };
type ChatResponse = { reply: string; state: "continue" | "close"; crisis?: boolean; error?: string };

// 器側フェイルセーフ：ユーザー発話がこの数に達したら強制的に締める
// （プロンプトが延々 continue を返す事故の保険。深掘り最大3問はプロンプト側で担保）
const MAX_USER_TURNS = 6;

// [3] 声の録音が実質無音/短すぎるかの判定用（幻聴対策）。値はチューニング前提。
const MIN_RECORDING_MS = 800;
const MIN_BLOB_BYTES = 1600;
// 無音時に Whisper が返しがちな定番フレーズ。ほぼこの語だけの短い出力のみ破棄する（保守的）。
const HALLUCINATION_PHRASES = [
  "ご視聴ありがとうございました", "ご視聴ありがとうございます",
  "チャンネル登録お願いします", "最後までご視聴いただきありがとうございました",
];
function isLikelyHallucination(text: string): boolean {
  const t = text.trim();
  return HALLUCINATION_PHRASES.some((p) => t === p || (t.length <= p.length + 4 && t.includes(p)));
}

function buildTranscript(messages: Message[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "あなた" : "YORU"}：${m.content}`)
    .join("\n\n");
}

export default function Home() {
  const [phase, setPhase] = useState<"entry" | "chat" | "closed">("entry");
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [pendingEdit, setPendingEdit] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recordStartRef = useRef<number>(0);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) { router.push("/login"); return; }
    };
    checkUser();
  }, [router, supabase]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  // ---- 保存（開始時insert＋毎ターンupdate） ----
  const startSession = async (msgs: Message[]): Promise<number | null> => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { router.push("/login"); return null; }
    const { data } = await supabase
      .from("journals")
      .insert({
        user_id: userData.user.id,
        source: "session",
        session_status: "open",
        emotion: "穏やか", // finalize で上書き
        message: "",
        transcript: buildTranscript(msgs),
        messages: msgs,
      })
      .select("id")
      .single();
    return data?.id ?? null;
  };

  const persist = async (sid: number, msgs: Message[], status: "open" | "closed") => {
    await supabase
      .from("journals")
      .update({
        messages: msgs,
        transcript: buildTranscript(msgs),
        session_status: status,
      })
      .eq("id", sid);
  };

  // 締め時：ユーザー発話だけをまとめてタイトル・感情・テーマを導出（旧画面互換）
  const finalize = async (sid: number, msgs: Message[]) => {
    try {
      const userText = msgs.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      const res = await fetch("/api/reanalyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: userText }),
      });
      const data = await readJson<{ nuance?: string; emotion?: string; trigger?: string }>(res);
      // 異常応答（HTML/空/504 等）なら data は null。タイトル・感情の更新は
      // 諦め、セッション本体（messages/transcript）は保存済みなので静かに抜ける。
      if (!data) return;
      await supabase
        .from("journals")
        .update({
          nuance: data.nuance || "",
          emotion: data.emotion || "穏やか",
          emotion_trigger: data.trigger || "その他",
        })
        .eq("id", sid);
    } catch (e) {
      console.error("[finalize] error", e);
    }
  };

  // ---- 1ターンの生成（履歴の末尾がユーザー発話。新規送信・編集再生成で共用）----
  const runYoruTurn = async (history: Message[]) => {
    setMessages(history);        // 編集再生成では「切り詰めた履歴」が即反映される
    setCrisis(false);           // 危機判定もやり直す
    setPhase("chat");           // closed から編集した場合もチャット表示へ戻す
    setIsThinking(true);

    // 保存：初回は insert、以降は update（再生成では切り詰めた履歴で上書き）
    let sid = sessionIdRef.current;
    if (sid == null) {
      sid = await startSession(history);
      sessionIdRef.current = sid;
    } else {
      await persist(sid, history, "open");
    }

    const fallbackReply: ChatResponse = {
      reply: "うまく言葉を返せなかったみたい。でも、話してくれたことはちゃんとここにあるよ。",
      state: "close",
    };
    let data: ChatResponse;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const parsed = await readJson<ChatResponse>(res);
      data = parsed && typeof parsed.reply === "string" ? parsed : fallbackReply;
    } catch {
      data = fallbackReply;
    }

    const yoruMsg: Message = { role: "yoru", content: data.reply };
    const afterYoru = [...history, yoruMsg];
    setMessages(afterYoru);
    if (data.crisis) setCrisis(true);

    const userTurns = afterYoru.filter((m) => m.role === "user").length;
    const shouldClose = data.state === "close" || data.crisis === true || userTurns >= MAX_USER_TURNS;

    if (sid != null) await persist(sid, afterYoru, shouldClose ? "closed" : "open");

    if (shouldClose) {
      setPhase("closed");
      if (sid != null) finalize(sid, afterYoru);   // 会話が変わったので締めタイトルも作り直す
    } else {
      setPhase("chat");           // continue に戻ったら closed→open 相当
    }
    setIsThinking(false);
  };

  // ---- 1ターン処理（新規送信）----
  const submitUserTurn = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isThinking) return;
    setMicError(null);
    setTextInput("");
    const userMsg: Message = { role: "user", content: text };
    await runYoruTurn([...messages, userMsg]);
  };

  // ---- 送信済みの自分の発言を編集（[2]）----
  // ChatGPT方式：保存すると編集地点より後を削除し、そこから会話を作り直す。
  const startEdit = (i: number) => {
    if (isThinking) return;
    setEditingIndex(i);
    setEditingText(messages[i]?.content ?? "");
    setPendingEdit(false);
  };
  const cancelEdit = () => { setEditingIndex(null); setEditingText(""); setPendingEdit(false); };
  // 保存押下：後続の会話が消える場合だけ、やさしく1回確認する
  const requestSave = () => {
    if (editingIndex === null || !editingText.trim()) return;
    const hasAfter = editingIndex < messages.length - 1;
    if (hasAfter) setPendingEdit(true);
    else doRegenerate();
  };
  // 確認後：編集地点までで切り詰め、そこから再生成
  const doRegenerate = async () => {
    if (editingIndex === null) return;
    const text = editingText.trim();
    if (!text) return;
    const editedMsg: Message = { role: "user", content: text };
    const truncated = [...messages.slice(0, editingIndex), editedMsg];
    setEditingIndex(null);
    setEditingText("");
    setPendingEdit(false);
    await runYoruTurn(truncated);
  };

  // ---- 録音（入口・各ターン共通） ----
  const startRecording = async () => {
    setMicError(null);
    // マイクが使えない環境（非セキュアコンテキスト / mediaDevices 非対応）を先に弾く
    if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMicError("この画面ではマイクが使えないみたい。https か localhost で開いてね。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      mimeTypeRef.current = mimeType;
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { chunksRef.current.push(e.data); };
      mediaRecorder.onstart = () => { recordStartRef.current = performance.now(); };
      mediaRecorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const durationMs = performance.now() - recordStartRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        await transcribeAndSend(blob, durationMs);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      setIsRecording(false);
      const name = (e as { name?: string })?.name || "";
      console.error("[startRecording] getUserMedia failed:", name, e);
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicError("マイクの使用が許可されていないみたい。ブラウザの設定でマイクを許可してから、もう一度話しかけてね。");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMicError("マイクが見つからなかったよ。つながっているか確かめて、もう一度試してね。");
      } else {
        setMicError("うまくマイクを準備できなかったみたい。もう一度試すか、テキストで話してね。");
      }
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setIsTranscribing(true);
  };

  const transcribeAndSend = async (blob: Blob, durationMs: number) => {
    // [3] 実質無音/短すぎる録音は文字起こしせず破棄（幻聴防止）
    if (durationMs < MIN_RECORDING_MS || blob.size < MIN_BLOB_BYTES) {
      setIsTranscribing(false);
      setMicError("うまく聞き取れなかったみたい。もう一度、話しかけてね。");
      return;
    }
    try {
      const ext = mimeTypeRef.current.includes("mp4") ? "m4a" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await readJson<{ transcript?: string }>(res);
      const transcript = (data?.transcript || "").trim();
      setIsTranscribing(false);
      if (!transcript) return;
      // [3] 定番の幻聴フレーズだけなら破棄（会話を始めない）
      if (isLikelyHallucination(transcript)) {
        setMicError("うまく聞き取れなかったみたい。もう一度、話しかけてね。");
        return;
      }
      // [1] 声はそのまま自動送信（打ちかけがあれば前に足して保持）
      const draft = textInput.trim();
      setTextInput("");
      await submitUserTurn(draft ? draft + " " + transcript : transcript);
    } catch {
      setIsTranscribing(false);
    }
  };

  const busy = isThinking || isTranscribing || isRecording;
  const dateStr = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .vj-root {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; background: #0a0e1a; font-family: 'Noto Sans JP', sans-serif;
          position: relative; overflow: hidden;
        }
        .vj-star { position: fixed; border-radius: 50%; background: rgba(255,255,255,0.55); pointer-events: none; z-index: 0; }
        .vj-star-1 { width: 2px; height: 2px; top: 18%; left: 72%; box-shadow: 0 0 6px rgba(255,255,255,0.3); animation: vj-star-twinkle 5s ease-in-out infinite; }
        .vj-star-2 { width: 1.5px; height: 1.5px; top: 31%; left: 20%; box-shadow: 0 0 4px rgba(255,255,255,0.2); animation: vj-star-twinkle 7s ease-in-out infinite; animation-delay: 2s; }
        @keyframes vj-star-twinkle { 0%,100%{opacity:0.55} 50%{opacity:0.15} }
        .vj-glow { position: fixed; top: -120px; left: 50%; transform: translateX(-50%); width: 600px; height: 300px; background: radial-gradient(ellipse, rgba(139,92,246,0.07) 0%, transparent 70%); pointer-events: none; z-index: 0; }

        .vj-nav { position: fixed; top: 22px; right: 22px; z-index: 20; display: flex; gap: 8px; }
        .vj-nav-btn { font-size: 11px; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.22); border-radius: 20px; padding: 7px 18px; cursor: pointer; letter-spacing: 0.1em; transition: all 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-nav-btn:hover { color: rgba(255,255,255,0.95); border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.1); }

        .vj-content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 420px; flex: 1; padding: 0 24px; }

        /* ---- 入口 ---- */
        .vj-entry { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; width: 100%; padding: 40px 0; }
        .vj-header { text-align: center; margin-bottom: 48px; }
        .vj-label { font-family: 'Zen Old Mincho', serif; font-size: 44px; font-weight: 600; letter-spacing: 0.1em; color: #e8d5a0; text-shadow: 0 0 24px rgba(232,213,160,0.1); margin: 0 0 14px 0; }
        .vj-date { font-size: 11px; color: rgba(255,255,255,0.65); letter-spacing: 0.12em; margin: 0 0 18px 0; }
        .vj-title { font-size: 21px; font-weight: 300; color: rgba(255,255,255,0.9); margin: 0; line-height: 1.7; letter-spacing: 0.03em; }

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
        .vj-btn-analyzing { background: #131929; box-shadow: 0 4px 20px rgba(0,0,0,0.4); cursor: not-allowed; }
        .vj-btn-icon { font-size: 22px; line-height: 1; color: rgba(255,255,255,0.9); }
        .vj-btn-label { font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.75); letter-spacing: 0.15em; }

        .vj-dots { display: flex; gap: 6px; align-items: center; }
        .vj-dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(139,92,246,0.5); animation: vj-dot-float 2s ease-in-out infinite; }
        .vj-dot:nth-child(2) { animation-delay: 0.25s; }
        .vj-dot:nth-child(3) { animation-delay: 0.5s; }
        @keyframes vj-dot-float { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-5px);opacity:1} }

        .vj-entry-hint { margin-top: 26px; font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 0.08em; }
        .vj-mic-error { margin-top: 14px; max-width: 320px; font-size: 12px; line-height: 1.7; color: rgba(244,180,150,0.9); letter-spacing: 0.03em; text-align: center; }
        .vj-or { margin: 22px 0 14px; font-size: 11px; color: rgba(255,255,255,0.28); letter-spacing: 0.2em; }
        .vj-entry-textwrap { width: 100%; max-width: 340px; }
        .vj-memo-link { margin-top: 28px; font-size: 11px; color: rgba(255,255,255,0.5); background: none; border: none; cursor: pointer; letter-spacing: 0.1em; transition: color 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-memo-link:hover { color: rgba(139,92,246,0.6); }
        .vj-memo-link .vj-memo-accent { color: rgba(167,139,250,0.9); text-decoration: underline; text-underline-offset: 3px; }

        /* ---- 対話 ---- */
        .vj-chat-header { width: 100%; text-align: center; padding: 26px 0 16px; }
        .vj-chat-label { font-family: 'Zen Old Mincho', serif; font-size: 20px; font-weight: 600; letter-spacing: 0.14em; color: #e8d5a0; margin: 0; }
        .vj-chat-date { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 0.12em; margin: 6px 0 0; }

        .vj-thread { width: 100%; flex: 1; overflow-y: auto; padding: 8px 2px 20px; display: flex; flex-direction: column; gap: 18px; }
        .vj-msg { max-width: 82%; line-height: 1.9; letter-spacing: 0.03em; animation: vj-emerge 0.9s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes vj-emerge { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .vj-msg-yoru { align-self: flex-start; font-family: 'Zen Old Mincho', serif; font-size: 16px; color: rgba(255,255,255,0.82); padding-left: 14px; border-left: 2px solid rgba(139,92,246,0.35); }
        .vj-msg-user { align-self: flex-end; font-size: 14px; color: rgba(255,255,255,0.62); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px 14px 4px 14px; padding: 12px 15px; }
        .vj-msg-editable { cursor: pointer; transition: border-color 0.2s, background 0.2s; }
        .vj-msg-editable:hover { border-color: rgba(139,92,246,0.35); background: rgba(139,92,246,0.06); }
        .vj-msg-edit { align-self: flex-end; max-width: 82%; display: flex; flex-direction: column; gap: 8px; }
        .vj-edit-area { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(139,92,246,0.4); border-radius: 12px; padding: 10px 12px; font-size: 15px; color: rgba(255,255,255,0.94); line-height: 1.7; outline: none; resize: none; font-family: 'Noto Sans JP', sans-serif; box-sizing: border-box; }
        .vj-edit-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .vj-edit-confirm { display: flex; flex-direction: column; gap: 8px; }
        .vj-edit-confirm-text { font-size: 12px; color: rgba(255,255,255,0.55); line-height: 1.7; letter-spacing: 0.02em; margin: 0; }
        .vj-edit-cancel { font-size: 12px; color: rgba(255,255,255,0.4); background: none; border: none; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; padding: 6px 10px; }
        .vj-edit-save { font-size: 12px; color: rgba(167,139,250,0.95); background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 6px 16px; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; }
        .vj-edit-save:disabled { opacity: 0.4; cursor: not-allowed; }
        .vj-thinking { align-self: flex-start; padding-left: 14px; }

        /* ---- 入力バー（各ターン） ---- */
        .vj-inputbar { width: 100%; padding: 12px 0 26px; display: flex; align-items: flex-end; gap: 10px; }
        .vj-textarea { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(139,92,246,0.25); border-radius: 14px; padding: 14px 16px; font-size: 16px; color: rgba(255,255,255,0.94); outline: none; resize: none; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.03em; line-height: 1.85; box-sizing: border-box; transition: border-color 0.2s; max-height: 180px; }
        .vj-textarea:focus { border-color: rgba(139,92,246,0.5); }
        .vj-textarea::placeholder { color: rgba(255,255,255,0.2); }
        .vj-textarea:disabled { opacity: 0.5; }
        .vj-mic { flex-shrink: 0; width: 46px; height: 46px; border-radius: 50%; border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.1); color: rgba(167,139,250,0.95); font-size: 18px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
        .vj-mic:hover:not(:disabled) { background: rgba(139,92,246,0.2); }
        .vj-mic:disabled { opacity: 0.4; cursor: not-allowed; }
        .vj-mic-recording { border-color: rgba(244,132,106,0.55); background: rgba(244,132,106,0.12); color: rgba(244,132,106,0.95); animation: vj-pulse 1.5s ease-in-out infinite; }
        @keyframes vj-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,132,106,0.25)} 50%{box-shadow:0 0 0 8px rgba(244,132,106,0)} }
        .vj-send { flex-shrink: 0; width: 46px; height: 46px; border-radius: 50%; border: none; background: linear-gradient(150deg, #5b21b6 0%, #8b5cf6 100%); color: #fff; font-size: 16px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(91,33,182,0.4); }
        .vj-send:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
        .vj-input-status { width: 100%; text-align: center; font-size: 11px; color: rgba(255,255,255,0.32); letter-spacing: 0.1em; padding-bottom: 10px; animation: vj-fade 2s ease-in-out infinite; }
        @keyframes vj-fade { 0%,100%{opacity:0.4} 50%{opacity:1} }

        /* ---- 締め ---- */
        .vj-closed { width: 100%; padding: 16px 0 40px; display: flex; flex-direction: column; align-items: center; animation: vj-emerge 1.2s cubic-bezier(0.16,1,0.3,1) both; }
        .vj-closed-note { font-family: 'Zen Old Mincho', serif; font-size: 13px; color: rgba(255,255,255,0.45); letter-spacing: 0.08em; margin: 0 0 24px; }
        .vj-logs-link { font-size: 12px; color: rgba(167,139,250,0.75); background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.22); border-radius: 24px; padding: 12px 30px; cursor: pointer; letter-spacing: 0.12em; transition: all 0.2s; font-family: 'Noto Sans JP', sans-serif; }
        .vj-logs-link:hover { background: rgba(139,92,246,0.16); }

        /* ---- 危機フッター ---- */
        .vj-crisis { width: 100%; margin: 18px 0 8px; padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(244,132,106,0.3); background: rgba(244,132,106,0.06); }
        .vj-crisis-title { font-size: 12px; color: rgba(244,160,140,0.95); letter-spacing: 0.06em; margin: 0 0 8px; font-weight: 500; }
        .vj-crisis-text { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.85; letter-spacing: 0.02em; margin: 0; }
        .vj-crisis-text a { color: rgba(167,139,250,0.95); text-decoration: underline; text-underline-offset: 2px; }
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
          {phase === "entry" ? (
            <div className="vj-entry">
              <div className="vj-header">
                <p className="vj-label">YORU</p>
                <p className="vj-date">{dateStr}</p>
                <h1 className="vj-title">今日、どんな一日だった？</h1>
              </div>

              <div className="vj-btn-wrap">
                {!isRecording && !isTranscribing && (
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
                  className={`vj-btn ${isRecording ? "vj-btn-recording" : isTranscribing ? "vj-btn-analyzing" : "vj-btn-idle"}`}
                  onClick={isRecording ? stopRecording : isTranscribing ? undefined : startRecording}
                  disabled={isTranscribing}
                >
                  {isTranscribing ? (
                    <div className="vj-dots"><div className="vj-dot" /><div className="vj-dot" /><div className="vj-dot" /></div>
                  ) : (
                    <>
                      <span className="vj-btn-icon">{isRecording ? "■" : "●"}</span>
                      <span className="vj-btn-label">{isRecording ? "やめる" : "話す"}</span>
                    </>
                  )}
                </button>
              </div>

              <p className="vj-entry-hint">
                {isRecording ? "聴いてるよ" : isTranscribing ? "よみとってるよ..." : "ボタンを押して話しかけてね"}
              </p>
              {micError && <p className="vj-mic-error">{micError}</p>}

              <p className="vj-or">または</p>
              <div className="vj-entry-textwrap">
                <textarea
                  className="vj-textarea"
                  rows={4}
                  ref={inputRef}
                  placeholder="声を出せないときは、ここに書いてね"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitUserTurn(textInput); }
                  }}
                  style={{ width: "100%" }}
                />
                <button
                  className="vj-logs-link"
                  style={{ marginTop: 10, width: "100%" }}
                  onClick={() => submitUserTurn(textInput)}
                  disabled={busy || !textInput.trim()}
                >
                  話しはじめる
                </button>
              </div>

              <button className="vj-memo-link" onClick={() => router.push("/memo")}>
                今日はそっとしておきたい？ <span className="vj-memo-accent">→ メモだけ残す</span>
              </button>
            </div>
          ) : (
            <>
              <div className="vj-chat-header">
                <p className="vj-chat-label">YORU</p>
                <p className="vj-chat-date">{dateStr}</p>
              </div>

              <div className="vj-thread" ref={scrollRef}>
                {messages.map((m, i) => (
                  m.role === "user" && editingIndex === i ? (
                    <div key={i} className="vj-msg vj-msg-edit">
                      <textarea
                        className="vj-edit-area"
                        rows={2}
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        disabled={pendingEdit}
                      />
                      {pendingEdit ? (
                        <div className="vj-edit-confirm">
                          <p className="vj-edit-confirm-text">ここから先の会話は消えて、ここから新しく続きになるよ。いい？</p>
                          <div className="vj-edit-actions">
                            <button className="vj-edit-cancel" onClick={cancelEdit}>やめておく</button>
                            <button className="vj-edit-save" onClick={doRegenerate}>うん、続ける</button>
                          </div>
                        </div>
                      ) : (
                        <div className="vj-edit-actions">
                          <button className="vj-edit-cancel" onClick={cancelEdit}>やめる</button>
                          <button className="vj-edit-save" onClick={requestSave} disabled={!editingText.trim()}>保存</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={`vj-msg ${m.role === "yoru" ? "vj-msg-yoru" : "vj-msg-user vj-msg-editable"}`}
                      onClick={m.role === "user" && !isThinking ? () => startEdit(i) : undefined}
                      title={m.role === "user" ? "タップで直せるよ" : undefined}
                    >
                      {m.content}
                    </div>
                  )
                ))}
                {isThinking && (
                  <div className="vj-thinking">
                    <div className="vj-dots"><div className="vj-dot" /><div className="vj-dot" /><div className="vj-dot" /></div>
                  </div>
                )}

                {phase === "closed" && crisis && (
                  <div className="vj-crisis">
                    <p className="vj-crisis-title">ひとりで抱えないで</p>
                    <p className="vj-crisis-text">
                      いま、つらい気持ちを話してくれてありがとう。<br />
                      その気持ちは、信頼できる人や専門の窓口に頼っていいものだよ。<br />
                      よりそいホットライン <a href="tel:0120279338">0120-279-338</a>（24時間・無料）<br />
                      いのちの電話 <a href="tel:0570783556">0570-783-556</a>
                    </p>
                  </div>
                )}

                {phase === "closed" && (
                  <div className="vj-closed">
                    <p className="vj-closed-note">今日のこと、ちゃんとここに残ってるよ。</p>
                    <button className="vj-logs-link" onClick={() => router.push("/logs")}>
                      きろくを見る →
                    </button>
                  </div>
                )}
              </div>

              {phase === "chat" && (
                <>
                  {isTranscribing && <p className="vj-input-status">よみとってるよ...</p>}
                  {micError && <p className="vj-mic-error">{micError}</p>}
                  <div className="vj-inputbar">
                    <textarea
                      className="vj-textarea"
                      rows={2}
                      ref={inputRef}
                      placeholder={isRecording ? "聴いてるよ" : "返事をする。\nまたは右のマイクで話す。"}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitUserTurn(textInput); }
                      }}
                    />
                    <button
                      className={`vj-mic ${isRecording ? "vj-mic-recording" : ""}`}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isThinking || isTranscribing}
                      title={isRecording ? "やめる" : "声で答える"}
                    >
                      {isRecording ? "■" : "🎙"}
                    </button>
                    <button
                      className="vj-send"
                      onClick={() => submitUserTurn(textInput)}
                      disabled={busy || !textInput.trim()}
                      title="送る"
                    >
                      ↑
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
