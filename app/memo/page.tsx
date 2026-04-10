"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase";
import { useRouter } from "next/navigation";

export default function MemoPage() {
  const [memo, setMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSave = async () => {
  if (!memo.trim()) return;
  setIsSaving(true);
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) { router.push("/login"); return; }

    // AI分析を先に実行
    const res = await fetch("/api/reanalyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: memo }),
    });
    const data = await res.json();

    await supabase.from("journals").insert({
      user_id: user.id,
      emotion: data.emotion || "穏やか",
      transcript: memo,
      summary: memo,
      message: data.message || "",
      nuance: data.nuance || "",
      emotion_trigger: data.trigger || "その他",
      input_type: "text",
    });

    setSaved(true);
    setTimeout(() => router.push("/"), 1200);
  } catch (e) {
    console.error(e);
  } finally {
    setIsSaving(false);
  }
};
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');
        .memo-root {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: #0a0e1a; font-family: 'Noto Sans JP', sans-serif;
          padding: 40px 24px;
        }
        .memo-content { width: 100%; max-width: 380px; }
        .memo-label { font-family: 'Zen Old Mincho', serif; font-size: 11px; letter-spacing: 0.4em; color: rgba(167,139,250,0.45); margin: 0 0 16px 0; }
        .memo-title { font-size: 20px; font-weight: 300; color: rgba(255,255,255,0.78); margin: 0 0 32px 0; line-height: 1.7; letter-spacing: 0.03em; }
        .memo-textarea {
          width: 100%; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(139,92,246,0.25); border-radius: 12px;
          padding: 14px 16px; font-size: 14px; color: rgba(255,255,255,0.8);
          outline: none; resize: none; font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.03em; line-height: 1.8; box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .memo-textarea:focus { border-color: rgba(139,92,246,0.5); }
        .memo-textarea::placeholder { color: rgba(255,255,255,0.15); }
        .memo-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
        .memo-back { font-size: 11px; color: rgba(255,255,255,0.18); background: none; border: none; cursor: pointer; letter-spacing: 0.1em; font-family: 'Noto Sans JP', sans-serif; transition: color 0.2s; }
        .memo-back:hover { color: rgba(255,255,255,0.4); }
        .memo-save { font-size: 12px; color: rgba(167,139,250,0.9); background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.3); border-radius: 20px; padding: 10px 24px; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.1em; transition: all 0.2s; }
        .memo-save:hover { background: rgba(139,92,246,0.2); }
        .memo-save:disabled { opacity: 0.4; cursor: not-allowed; }
        .memo-saved { font-size: 12px; color: rgba(139,92,246,0.7); letter-spacing: 0.1em; }
      `}</style>

      <div className="memo-root">
        <div className="memo-content">
          <p className="memo-label">YORU</p>
          <h1 className="memo-title">今の気持ちを<br />書いてみて</h1>
          <textarea
            className="memo-textarea"
            rows={6}
            placeholder="話せなくても、ここに置いておいていいよ"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <div className="memo-footer">
            <button className="memo-back" onClick={() => router.back()}>← もどる</button>
            {saved ? (
              <span className="memo-saved">保存したよ</span>
            ) : (
              <button className="memo-save" onClick={handleSave} disabled={isSaving || !memo.trim()}>
                {isSaving ? "保存中..." : "保存する"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}